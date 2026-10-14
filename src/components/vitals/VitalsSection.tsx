import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { getCurrentUserId } from "../../lib/aws/cognito";
import { checkVitalsAccess } from "../../lib/vitals/eligibility";
import { healthConnectVitals } from "../../lib/vitals/healthConnectSource";
import { getVitalsState, giveVitalsConsent, setVitalsEnabled, type VitalsState } from "../../lib/vitals/preference";
import { deleteSyncedVitals, syncVitals } from "../../lib/vitals/sync";
import { ModernButton } from "../ModernButton";
import { VitalsConsentModal } from "./VitalsConsentModal";

type Loaded = { userId: string; allowed: boolean; available: boolean; state: VitalsState };

// "Heart rate & blood pressure" in the Habits → Health Connect tab: its own
// consent + permission request, separate from Sleep / Exercise / Weight.
// Hidden behind "not available" for accounts that may not share health data
// (13–17 while minor_data_enabled is off, under-13, or status unknown).
export function VitalsSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Vitals");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const load = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const [access, available, state] = await Promise.all([
      checkVitalsAccess(),
      healthConnectVitals.isAvailable().catch(() => false),
      getVitalsState(userId),
    ]);
    setLoaded({ userId, allowed: access.allowed, available, state });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-checks the account first: the age band / flag may have changed.
  async function connect(userId: string) {
    if (!(await checkVitalsAccess()).allowed) return;
    const granted = await healthConnectVitals.requestPermissions();
    if (granted.size === 0) {
      Alert.alert(t("title"), t("permissionDenied"));
      return;
    }
    await setVitalsEnabled(userId, true);
    await syncVitals();
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      await load();
      setBusy(false);
    }
  }

  function onToggle(next: boolean) {
    if (!loaded) return;
    if (!next) {
      run(() => setVitalsEnabled(loaded.userId, false));
    } else if (!loaded.state.consent) {
      setConsentOpen(true);
    } else {
      run(() => connect(loaded.userId));
    }
  }

  function onAgree() {
    if (!loaded) return;
    setConsentOpen(false);
    run(async () => {
      await giveVitalsConsent(loaded.userId);
      await connect(loaded.userId);
    });
  }

  function onDelete() {
    if (!loaded) return;
    Alert.alert(t("deleteTitle"), t("deleteBody"), [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: () =>
          run(async () => {
            try {
              const count = await deleteSyncedVitals(loaded.userId);
              Alert.alert(t("title"), t("deleted", { count }));
            } catch {
              Alert.alert(t("title"), t("deleteError"));
            }
          }),
      },
    ]);
  }

  const on = !!loaded?.state.enabled && !!loaded?.state.consent;

  return (
    <View style={styles.section}>
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text style={styles.toggleTitle}>{t("title")}</Text>
          <Text style={styles.toggleSubtitle}>{t("subtitle")}</Text>
        </View>
        {!loaded || busy ? (
          <ActivityIndicator color={colors.navTint} />
        ) : loaded.allowed && loaded.available ? (
          <Switch
            value={on}
            onValueChange={onToggle}
            trackColor={{ true: colors.navTint, false: colors.border }}
            thumbColor={colors.card}
            accessibilityLabel={t("title")}
          />
        ) : null}
      </View>

      {loaded && !loaded.allowed && <Text style={styles.body}>{t("notAllowed")}</Text>}
      {loaded && loaded.allowed && !loaded.available && <Text style={styles.body}>{t("notInstalled")}</Text>}

      {loaded?.allowed && on && loaded.state.lastSyncAt && (
        <Text style={styles.hint}>{t("lastSynced", { time: new Date(loaded.state.lastSyncAt).toLocaleString() })}</Text>
      )}
      {loaded?.allowed && on && (
        <Pressable onPress={() => healthConnectVitals.openSettings()} accessibilityRole="link">
          <Text style={styles.link}>{t("openSettings")}</Text>
        </Pressable>
      )}
      {loaded?.state.consent && (
        <ModernButton title={t("deleteButton")} onPress={onDelete} variant="outline" disabled={busy} />
      )}
      <Text style={styles.hint}>{t("disclaimer")}</Text>

      <VitalsConsentModal visible={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    section: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    toggleLabel: { flex: 1 },
    toggleTitle: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    toggleSubtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    hint: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
    link: { fontSize: typography.bodySmall.fontSize, color: colors.navTint, fontWeight: "600" },
  });
}
