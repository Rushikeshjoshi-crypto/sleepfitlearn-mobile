import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { ModernButton } from "../ModernButton";
import { VitalsConsentModal } from "../vitals/VitalsConsentModal";
import { getCurrentUserId } from "../../lib/aws/cognito";
import { openHealthConnectInPlayStore } from "../../lib/native/healthConnect";
import { openWatchApp } from "../../lib/native/watchApps";
import { checkVitalsAccess } from "../../lib/vitals/eligibility";
import { getVitalsState, giveVitalsConsent } from "../../lib/vitals/preference";
import type { Checkup, CheckupStep } from "../../lib/watch/checkup";
import { connectWatch } from "../../lib/watch/connect";
import { WATCH_GUIDE_STEPS } from "../../lib/watch/guide";
import { watchAppName } from "../../lib/watch/knownApps";
import { loadCheckup } from "../../lib/watch/loadCheckup";

// "Connect your watch": one button (consent if heart rate / BP is allowed,
// then ONE Health Connect permission screen for everything), then a checkup
// that says what's still missing — each with one action. Re-checks when the
// user comes back from the watch app or Health Connect.
export function WatchConnectCard({ onChanged }: { onChanged?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Watch");
  const [checkup, setCheckup] = useState<Checkup | null>(null);
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const refresh = useCallback(async () => {
    setCheckup(await loadCheckup());
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  async function runConnect() {
    setBusy(true);
    try {
      await connectWatch();
    } finally {
      await refresh();
      setBusy(false);
      onChanged?.();
    }
  }

  // Heart rate / BP need their consent screen first (once).
  async function onConnect() {
    const [userId, access] = await Promise.all([getCurrentUserId(), checkVitalsAccess()]);
    if (access.allowed && userId && !(await getVitalsState(userId)).consent) {
      setConsentOpen(true);
      return;
    }
    await runConnect();
  }

  async function onAgree() {
    setConsentOpen(false);
    const userId = await getCurrentUserId();
    if (userId) await giveVitalsConsent(userId);
    await runConnect();
  }

  async function onOpenApp(pkg: string) {
    if (!(await openWatchApp(pkg))) Alert.alert(t("title"), t("couldntOpen"));
  }

  const apps = (list: string[]) => list.map(watchAppName).join(", ");

  function stepLine(step: CheckupStep) {
    const ok = step.status === "ok";
    let text = "";
    let action: { label: string; run: () => void } | null = null;
    switch (step.id) {
      case "healthConnect":
        text = ok ? t("hcOk") : t("hcMissing");
        if (!ok) action = { label: t("install"), run: openHealthConnectInPlayStore };
        break;
      case "permission":
        text = ok ? t("permissionOk") : t("permissionTodo");
        if (!ok) action = { label: t("allow"), run: onConnect };
        break;
      case "watchApp":
        text = ok ? t("watchAppFound", { apps: apps(step.apps) }) : t("noWatchApp");
        break;
      case "data":
        if (ok) text = t("dataOk", { apps: apps(step.writers) });
        else if (step.app) {
          const app = step.app;
          text = t("dataTodo", { app: watchAppName(app) }) + (step.mayNotShare ? `\n${t("mayNotShare")}` : "");
          action = { label: t("openApp", { app: watchAppName(app) }), run: () => onOpenApp(app) };
        } else text = t("noDataYet");
        break;
    }
    return (
      <View key={step.id} style={styles.step}>
        <Text style={[styles.mark, ok ? styles.markOk : styles.markTodo]}>{ok ? "✓" : "•"}</Text>
        <View style={styles.stepBody}>
          <Text style={styles.stepText}>{text}</Text>
          {action && <ModernButton title={action.label} onPress={action.run} variant="outline" disabled={busy} />}
        </View>
      </View>
    );
  }

  const permissionStep = checkup?.steps.find((s) => s.id === "permission");
  const showConnect = !!permissionStep && permissionStep.status !== "ok";

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("title")}</Text>
      <Text style={styles.subtitle}>{checkup?.ready ? t("connected") : t("subtitle")}</Text>

      {/* Step-by-step guide, folded; opens on tap. */}
      <Pressable onPress={() => setGuideOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: guideOpen }} style={styles.guideToggle}>
        <Text style={styles.guideToggleText}>{t("guideToggle")}</Text>
        <Text style={styles.guideToggleText}>{guideOpen ? "▴" : "▾"}</Text>
      </Pressable>
      {guideOpen && (
        <View style={styles.guide}>
          {WATCH_GUIDE_STEPS.map((k, i) => (
            <View key={k} style={styles.step}>
              <View style={styles.guideNum}>
                <Text style={styles.guideNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, styles.stepBody]}>{t(k)}</Text>
            </View>
          ))}
          <Text style={styles.subtitle}>{t("guideNote")}</Text>
        </View>
      )}

      {!checkup || busy ? (
        <ActivityIndicator color={colors.navTint} />
      ) : (
        <>
          {showConnect && <ModernButton title={t("connect")} onPress={onConnect} />}
          {checkup.steps.map(stepLine)}
          <ModernButton title={t("checkAgain")} onPress={refresh} variant="secondary" />
        </>
      )}

      <VitalsConsentModal visible={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 12 },
    title: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    subtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    step: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    mark: { fontSize: typography.body.fontSize, fontWeight: "700", width: 18 },
    markOk: { color: colors.primary },
    markTodo: { color: colors.mutedForeground },
    stepBody: { flex: 1, gap: 8 },
    stepText: { fontSize: typography.body.fontSize, color: colors.foreground, lineHeight: 21 },
    guideToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
    guideToggleText: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.navTint },
    guide: { gap: 10, backgroundColor: colors.background, borderRadius: 16, padding: 14 },
    guideNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.navTint, alignItems: "center", justifyContent: "center" },
    guideNumText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  });
}
