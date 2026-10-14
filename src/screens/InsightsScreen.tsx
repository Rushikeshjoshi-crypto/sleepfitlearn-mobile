import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { getInsights, type Correlation, type DailyRecord } from "../lib/api/insights";
import { ApiError } from "../lib/api/client";
import { getUserProfile, updateUserProfile, type UserProfile } from "../lib/api/users";
import { formatIcuPlural } from "../lib/i18n/icuPlural";
import {
  METRIC_COLOR,
  METRIC_GLYPH,
  POSSIBLE_PAIRS,
  describeCorrelation,
  metricLabel,
  pairKey,
  strengthLabel,
} from "../lib/insights/metrics";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { SegmentedControl } from "../components/SegmentedControl";
import { isoDaysAgo } from "../lib/dateRange";
import { InsightsConsentGate } from "../components/insights/InsightsConsentGate";
import { PairDetailModal, type CoveragePair } from "../components/insights/PairDetailModal";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { loadErrorText } from "../lib/api/gateErrors";

type RangePreset = "30d" | "90d";
const RANGE_PRESET_DAYS: Record<RangePreset, number> = { "30d": 30, "90d": 90 };

const STRENGTH_TONE: Record<Correlation["strength"], (colors: ColorPalette) => string> = {
  negligible: (colors) => colors.mutedForeground,
  weak: (colors) => colors.mutedForeground,
  moderate: (colors) => colors.accent,
  strong: (colors) => colors.primary,
};

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Insights");
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

  const foundPairKeys = new Set(correlations.map((c) => pairKey(c)));
  // Strongest association first, same as web.
  const sortedCorrelations = [...correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

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

      {!error && (
        <View style={styles.coverageCard}>
          <Text style={styles.coverageTitle}>{t("patternCoverage")}</Text>
          <View style={styles.coverageWrap}>
            {POSSIBLE_PAIRS.map((pair) => {
              const matched = foundPairKeys.has(pairKey(pair));
              return (
                <AnimatedPressable
                  key={pairKey(pair)}
                  style={[styles.coverageChip, matched ? styles.coverageChipMatched : styles.coverageChipUnmatched]}
                  onPress={() => setOpenPair(pair)}
                  accessibilityRole="button"
                  accessibilityLabel={t("pairDetail.openPairAria", {
                    a: metricLabel(pair.metric_a, t),
                    b: metricLabel(pair.metric_b, t),
                  })}
                >
                  <Text style={styles.coverageGlyph}>{METRIC_GLYPH[pair.metric_a]}</Text>
                  <Text style={styles.coverageLabel}>
                    {metricLabel(pair.metric_a, t)}
                  </Text>
                  <Text style={styles.coverageArrow}>→</Text>
                  <Text style={styles.coverageLabel}>
                    {metricLabel(pair.metric_b, t)}
                  </Text>
                  <Text style={styles.coverageGlyph}>{METRIC_GLYPH[pair.metric_b]}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
          <Text style={styles.coverageHint}>{t("dashedPairsHint")}</Text>
        </View>
      )}

      {correlations.length === 0 && !error ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>{t("keepLoggingTitle")}</Text>
          <Text style={styles.body}>{t("keepLoggingDescription")}</Text>
        </View>
      ) : (
        sortedCorrelations.map((c, index) => {
          const magnitudePct = Math.round(Math.min(1, Math.abs(c.r)) * 100);
          const barColor = STRENGTH_TONE[c.strength](colors);
          return (
            <View key={`${c.metric_a}-${c.metric_b}-${index}`} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.metricIconsRow}>
                  <View style={[styles.metricBadge, { backgroundColor: `${METRIC_COLOR[c.metric_a]}22` }]}>
                    <Text style={styles.metricGlyph}>{METRIC_GLYPH[c.metric_a]}</Text>
                  </View>
                  <Text style={styles.arrow}>→</Text>
                  <View style={[styles.metricBadge, { backgroundColor: `${METRIC_COLOR[c.metric_b]}22` }]}>
                    <Text style={styles.metricGlyph}>{METRIC_GLYPH[c.metric_b]}</Text>
                  </View>
                </View>
                <View style={[styles.strengthBadge, { backgroundColor: `${barColor}22` }]}>
                  <Text style={[styles.strengthBadgeText, { color: barColor }]}>
                    {strengthLabel(c.strength, t)} {t("associationSuffix")}
                  </Text>
                </View>
              </View>

              <Text style={styles.body}>{describeCorrelation(c, t)}</Text>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${magnitudePct}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={styles.basedOnDays}>{formatIcuPlural(t("basedOnDays"), c.n, i18n.language)}</Text>
            </View>
          );
        })
      )}

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
  title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
  subtitle: { fontSize: 14, color: colors.mutedForeground, marginBottom: 4 },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rangeSpinner: { marginLeft: 4 },
  turnOffButton: { marginLeft: "auto", minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  turnOffText: { fontSize: 13, color: colors.mutedForeground },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  disclaimer: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  metricIconsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  metricGlyph: { fontSize: 16 },
  arrow: { fontSize: 13, color: colors.mutedForeground },
  strengthBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  strengthBadgeText: { fontSize: 11, fontWeight: "600" },
  body: { fontSize: 14, color: colors.mutedForeground },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: colors.muted, overflow: "hidden", marginTop: 4 },
  progressFill: { height: "100%", borderRadius: 999 },
  basedOnDays: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructiveBorder,
    backgroundColor: colors.destructiveBg,
    borderRadius: 20,
    padding: 12,
  },
  errorText: { color: colors.destructive },
  coverageCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  coverageTitle: {
    fontSize: typography.label.fontSize,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  coverageWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coverageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  coverageChipMatched: { borderColor: `${colors.primary}55`, backgroundColor: `${colors.primary}0D` },
  coverageChipUnmatched: { borderColor: colors.border, borderStyle: "dashed" },
  coverageGlyph: { fontSize: 13 },
  coverageLabel: { fontSize: 12, fontWeight: "500", color: colors.foreground },
  coverageArrow: { fontSize: 11, color: colors.mutedForeground },
  coverageHint: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
  });
}
