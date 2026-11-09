import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { getInsights, type Correlation, type DailyRecord } from "../lib/api/insights";
import { ApiError } from "../lib/api/client";
import { getUserProfile, updateUserProfile, type UserProfile } from "../lib/api/users";
import { describeCorrelation, metricLabel, pairKey } from "../lib/insights/metrics";
import { useTheme } from "../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../theme/palettes";
import { SegmentedControl } from "../components/SegmentedControl";
import { isoDaysAgo } from "../lib/dateRange";
import { InsightsConsentGate } from "../components/insights/InsightsConsentGate";
import { PairDetailModal, type CoveragePair } from "../components/insights/PairDetailModal";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { AssociationCard, PairIcons, StrengthMeter } from "../components/insights/AssociationCard";
import { CoverageStrip } from "../components/insights/CoverageStrip";
import { loadErrorText } from "../lib/api/gateErrors";

type RangePreset = "30d" | "90d";
const RANGE_PRESET_DAYS: Record<RangePreset, number> = { "30d": 30, "90d": 90 };

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Insights");
  const { t: tc } = useTranslation("Common");

  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  // Pattern Coverage chip tapped → PairDetailModal.
  const [openPair, setOpenPair] = useState<CoveragePair | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingRange, setSwitchingRange] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>("30d");
  // Consent (privacy_settings.insights_enabled) — same opt-in as the web app's
  // InsightsView: nothing is fetched until the user turns insights on.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const insightsEnabled = profile?.privacy_settings?.insights_enabled === true;

  const load = useCallback(
    async (p: RangePreset) => {
      try {
        const me = await getUserProfile();
        setProfile(me);
        if (me.privacy_settings?.insights_enabled !== true) {
          setError(null);
          return;
        }
        const res = await getInsights({ from: isoDaysAgo(RANGE_PRESET_DAYS[p]), to: isoDaysAgo(0) });
        setCorrelations(res.correlations);
        setDaily(res.daily);
        setError(null);
      } catch (err) {
        // The insights Lambda answers 403 "insights_not_enabled" when consent
        // is off server-side (e.g. turned off on the web) — show the opt-in.
        if (err instanceof ApiError && err.status === 403 && err.message === "insights_not_enabled") {
          setProfile((prev) =>
            prev ? { ...prev, privacy_settings: { ...prev.privacy_settings, insights_enabled: false } } : prev,
          );
          setError(null);
        } else {
          setError(loadErrorText(err, t("loadError")));
        }
      } finally {
        setLoading(false);
        setSwitchingRange(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  async function setInsightsEnabled(enabled: boolean) {
    if (!profile) return;
    const setBusy = enabled ? setEnabling : setDisabling;
    setBusy(true);
    try {
      const updated = await updateUserProfile({
        privacy_settings: { ...profile.privacy_settings, insights_enabled: enabled },
      });
      setProfile(updated);
      Alert.alert(enabled ? t("insightsTurnedOn") : t("insightsTurnedOff"));
      if (enabled) {
        setLoading(true);
        await load(preset);
      } else {
        setCorrelations([]);
      }
    } catch {
      Alert.alert(enabled ? t("couldntTurnOn") : t("couldntTurnOff"));
    } finally {
      setBusy(false);
    }
  }

  function confirmTurnOff() {
    Alert.alert(t("turnOffInsightsTitle"), t("turnOffInsightsDescription"), [
      { text: tc("cancel"), style: "cancel" },
      { text: t("turnOff"), style: "destructive", onPress: () => setInsightsEnabled(false) },
    ]);
  }

  useFocusEffect(
    useCallback(() => {
      load(preset);
      // Only re-run on focus, not on every preset change — onRangeChange below
      // handles refetching while the screen stays focused.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  function onPullRefresh() {
    setRefreshing(true);
    load(preset);
  }

  function onRangeChange(next: RangePreset) {
    setPreset(next);
    setSwitchingRange(true);
    load(next);
  }

  // Strongest association first (shown large), the rest as a list - same as web.
  const sortedCorrelations = [...correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const [top, ...rest] = sortedCorrelations;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (profile && !insightsEnabled && !error) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <InsightsConsentGate onEnable={() => setInsightsEnabled(true)} isEnabling={enabling} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <View style={styles.rangeRow}>
        <SegmentedControl
          options={[
            { value: "30d" as const, label: t("last30Days") },
            { value: "90d" as const, label: t("last90Days") },
          ]}
          value={preset}
          onChange={onRangeChange}
        />
        {switchingRange && <ActivityIndicator style={styles.rangeSpinner} color={colors.navTint} />}
        {insightsEnabled && (
          <AnimatedPressable style={styles.turnOffButton} onPress={confirmTurnOff} disabled={disabling}>
            {disabling ? (
              <ActivityIndicator color={colors.mutedForeground} />
            ) : (
              <Text style={styles.turnOffText}>{t("turnOffInsights")}</Text>
            )}
          </AnimatedPressable>
        )}
      </View>

      <Text style={styles.subtitle}>{t("pageDescription")}</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!error && correlations.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("keepLoggingTitle")}</Text>
          <Text style={styles.body}>{t("keepLoggingDescription")}</Text>
        </View>
      ) : null}

      {!error && top ? <AssociationCard correlation={top} daily={daily} /> : null}

      {!error && rest.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t("morePatterns")}</Text>
          {rest.map((c) => (
            <AnimatedPressable
              key={pairKey(c)}
              style={styles.patternRow}
              onPress={() => setOpenPair(c)}
              accessibilityRole="button"
              accessibilityLabel={t("pairDetail.openPairAria", { a: metricLabel(c.metric_a, t), b: metricLabel(c.metric_b, t) })}
            >
              <PairIcons correlation={c} />
              <View style={styles.patternText}>
                <Text style={styles.patternSentence}>{describeCorrelation(c, t)}</Text>
                <StrengthMeter strength={c.strength} />
              </View>
              <Text style={styles.chevron}>›</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      {!error && <CoverageStrip correlations={correlations} daily={daily} onOpenPair={setOpenPair} />}

      {!error && <Text style={styles.disclaimer}>{t("disclaimer")}</Text>}

      <PairDetailModal
        pair={openPair}
        match={openPair ? correlations.find((c) => pairKey(c) === pairKey(openPair)) : undefined}
        daily={daily}
        onClose={() => setOpenPair(null)}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: typography.title.fontSize, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
  subtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 4 },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rangeSpinner: { marginLeft: 4 },
  turnOffButton: { marginLeft: "auto", minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  turnOffText: { fontSize: 13, color: colors.mutedForeground },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
  disclaimer: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 4,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 8,
    alignItems: "center",
  },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  patternRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  patternText: { flex: 1, gap: 6 },
  patternSentence: { fontSize: 14, color: colors.foreground },
  chevron: { fontSize: 22, color: colors.mutedForeground },
  body: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructiveBorder,
    backgroundColor: colors.destructiveBg,
    borderRadius: radius.lg,
    padding: 12,
  },
  errorText: { color: colors.destructive },
  });
}
