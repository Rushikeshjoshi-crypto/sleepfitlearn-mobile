import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, PermissionsAndroid, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import {
  getTodaySummary,
  hasUsageAccessPermission,
  isTracking,
  openUsageAccessSettings,
  requestIgnoreBatteryOptimizations,
  startTracking,
  stopTracking,
} from "../lib/native/screenTime";
import {
  isAvailable as isHealthConnectAvailable,
  hasPermissions as hasHealthConnectPermissions,
  openHealthConnectInPlayStore,
  readDailySteps,
  readExerciseSessions,
  readSleepSessions,
  readWeights,
  requestPermissions as requestHealthConnectPermissions,
} from "../lib/native/healthConnect";
import { checkStepsAllowed } from "../lib/steps/access";
import { isoDaysAgo, todayISO } from "../lib/dateRange";
import { getSyncEnabled as getHealthConnectSyncEnabled, setSyncEnabled as setHealthConnectSyncEnabled } from "../lib/healthConnect/preference";
import { syncHealthConnect } from "../lib/healthConnect/sync";
import { VitalsSection } from "../components/vitals/VitalsSection";
import { WatchConnectCard } from "../components/watch/WatchConnectCard";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";

// Connections & permissions, opened from the Habits page: screen time
// tracking (Usage Access + notification + battery prompt), the watch card,
// and Health Connect (+ heart rate / BP). Moved here from HabitsScreen so
// Habits only shows the data; the permission flows are unchanged.
export default function ConnectionsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Habits", "Common"]);

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const awaitingUsageAccess = useRef(false);

  const [hcAvailable, setHcAvailable] = useState<boolean | null>(null);
  const [hcPermissionGranted, setHcPermissionGranted] = useState(false);
  const [hcSyncOn, setHcSyncOn] = useState(false);
  const [hcBusy, setHcBusy] = useState(false);
  const [hcLastSyncAt, setHcLastSyncAt] = useState<number | null>(null);
  const [hcHasData, setHcHasData] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const [tracking, today] = await Promise.all([isTracking(), getTodaySummary()]);
    setEnabled(tracking);
    setLastSyncAt(today?.lastSyncAt ?? null);
  }, []);

  // Split out of refreshHealthConnect below so the post-grant path in
  // onToggleHealthConnect can skip re-querying hasPermissions() immediately
  // after requestPermissions() just returned true — Health Connect has a
  // brief eventual-consistency window right after a grant where
  // getGrantedPermissions() can still read back stale (empty) results, which
  // was making the just-connected state show neither data nor the
  // empty-state message.
  // Each type is read on its own (a type that isn't granted throws and
  // counts as nothing), so a user who granted only Steps isn't told "no data".
  // Steps only for accounts that may use them.
  const refreshHealthConnectDataPreview = useCallback(async () => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const none = () => [] as unknown[];
    const [sleep, exercise, weight, steps] = await Promise.all([
      readSleepSessions(from, to).catch(none),
      readExerciseSessions(from, to).catch(none),
      readWeights(from, to).catch(none),
      checkStepsAllowed().then((ok) => (ok ? readDailySteps(isoDaysAgo(7), todayISO()).catch(none) : [])),
    ]);
    setHcHasData(sleep.length + exercise.length + weight.length + steps.length > 0);
  }, []);

  const refreshHealthConnect = useCallback(async () => {
    const available = await isHealthConnectAvailable();
    setHcAvailable(available);
    if (!available) return;

    const [granted, syncOn] = await Promise.all([hasHealthConnectPermissions(), getHealthConnectSyncEnabled()]);
    setHcPermissionGranted(granted);
    setHcSyncOn(syncOn);
    if (!granted) return;

    await refreshHealthConnectDataPreview();
  }, [refreshHealthConnectDataPreview]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshHealthConnect();
    }, [refresh, refreshHealthConnect]),
  );

  async function onToggleHealthConnect(next: boolean) {
    if (!next) {
      await setHealthConnectSyncEnabled(false);
      setHcSyncOn(false);
      return;
    }

    if (hcAvailable === false) {
      Alert.alert(
        t("Habits:hcNotInstalledTitle"),
        t("Habits:hcNotInstalledBody"),
        [
          { text: t("Common:cancel"), style: "cancel" },
          { text: t("Habits:openPlayStore"), onPress: () => openHealthConnectInPlayStore() },
        ],
      );
      return;
    }

    async function finishConnecting() {
      setHcBusy(true);
      try {
        await setHealthConnectSyncEnabled(true);
        setHcSyncOn(true);
        setHcPermissionGranted(true);
        await syncHealthConnect();
        setHcLastSyncAt(Date.now());
        await refreshHealthConnectDataPreview();
      } finally {
        setHcBusy(false);
      }
    }

    if (hcPermissionGranted) {
      await finishConnecting();
      return;
    }

    Alert.alert(
      t("Habits:hcConnectTitle"),
      t("Habits:hcConnectBody"),
      [
        { text: t("Common:cancel"), style: "cancel" },
        {
          text: t("Habits:continue"),
          onPress: async () => {
            setHcBusy(true);
            // Steps only when the account may use them (checked live, fails closed).
            const granted = await requestHealthConnectPermissions(await checkStepsAllowed());
            setHcBusy(false);
            if (granted) {
              await finishConnecting();
            } else {
              Alert.alert(
                t("Habits:hcPermissionDeniedTitle"),
                t("Habits:hcPermissionDeniedBody"),
              );
            }
          },
        },
      ],
    );
  }

  // Resuming after the user manually flips Usage Access in system Settings —
  // that permission has no runtime dialog/callback, so this is how we detect it.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state === "active" && awaitingUsageAccess.current) {
        awaitingUsageAccess.current = false;
        const granted = await hasUsageAccessPermission();
        if (granted) {
          await finishEnabling();
        } else {
          Alert.alert(
            t("Habits:usageNotGrantedTitle"),
            t("Habits:usageNotGrantedBody"),
          );
        }
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen-time tracking (this function through onToggle below) is a
  // native-only feature with no web equivalent — none of its permission
  // dialogs, toggle copy, or "One more thing" battery-optimization prompt
  // have a source key to port from src/messages/*.json.
  async function requestNotificationPermission() {
    if (Platform.OS !== "android" || Platform.Version < 33) return;
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
  }

  async function finishEnabling() {
    setBusy(true);
    try {
      await requestNotificationPermission();
      startTracking();
      await refresh();
      Alert.alert(
        t("Habits:batteryTitle"),
        t("Habits:batteryBody"),
        [
          { text: t("Habits:skip"), style: "cancel" },
          { text: t("Habits:openSettings"), onPress: () => requestIgnoreBatteryOptimizations() },
        ],
      );
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(next: boolean) {
    if (!next) {
      stopTracking();
      setEnabled(false);
      return;
    }

    Alert.alert(
      t("Habits:trackTitle"),
      t("Habits:trackBody"),
      [
        { text: t("Common:cancel"), style: "cancel" },
        {
          text: t("Habits:continue"),
          onPress: async () => {
            setBusy(true);
            const granted = await hasUsageAccessPermission();
            if (granted) {
              await finishEnabling();
              setBusy(false);
              return;
            }
            setBusy(false);
            Alert.alert(
              t("Habits:usageNeededTitle"),
              t("Habits:usageNeededBody"),
              [
                { text: t("Common:cancel"), style: "cancel" },
                {
                  text: t("Habits:openSettings"),
                  onPress: () => {
                    awaitingUsageAccess.current = true;
                    openUsageAccessSettings();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  const lastSyncedLabel = lastSyncAt && lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleTimeString() : t("Habits:notYet");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>{t("Habits:connectionsSubtitle")}</Text>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.toggleTitle}>{t("Habits:trackTitle")}</Text>
            <Text style={styles.toggleSubtitle}>{t("Habits:trackSubtitle")}</Text>
          </View>
          {busy ? (
            <ActivityIndicator color={colors.navTint} />
          ) : (
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ true: colors.navTint, false: colors.border }}
              thumbColor={colors.card}
            />
          )}
        </View>
        {enabled && <Text style={styles.syncedAt}>{t("Habits:lastSynced", { time: lastSyncedLabel })}</Text>}
        {/* Day totals are backfilled from Android's own usage record (lib/screenTime/sync.ts). */}
        <Text style={styles.syncedAt}>{t("Habits:androidUsageNote")}</Text>
      </View>

      {/* One-tap "Connect your watch" + checkup; the detailed switches stay below. */}
      <WatchConnectCard onChanged={refreshHealthConnect} />

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.toggleTitle}>{t("Habits:hcConnectTitle")}</Text>
            <Text style={styles.toggleSubtitle}>{t("Habits:hcCardSubtitle")}</Text>
          </View>
          {hcBusy ? (
            <ActivityIndicator color={colors.navTint} />
          ) : (
            <Switch
              value={hcSyncOn}
              onValueChange={onToggleHealthConnect}
              trackColor={{ true: colors.navTint, false: colors.border }}
              thumbColor={colors.card}
            />
          )}
        </View>
        {hcSyncOn && hcLastSyncAt && (
          <Text style={styles.syncedAt}>{t("Habits:lastSynced", { time: new Date(hcLastSyncAt).toLocaleTimeString() })}</Text>
        )}
        {hcAvailable === false && <Text style={styles.body}>{t("Habits:hcNotInstalledHint")}</Text>}
        {hcSyncOn && hcPermissionGranted && hcHasData === false && <Text style={styles.body}>{t("Habits:hcNoDataHint")}</Text>}
        <VitalsSection />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    subtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    card: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 8 },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    toggleLabel: { flex: 1, gap: 2 },
    toggleTitle: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    toggleSubtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    syncedAt: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 4 },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
  });
}
