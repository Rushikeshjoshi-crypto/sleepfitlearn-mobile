import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { Correlation, DailyRecord, MetricKey } from "../../lib/api/insights";
import { METRIC_LOG_TARGET, MIN_OVERLAP_DAYS } from "../../lib/insights/coverage";
import { metricLabel } from "../../lib/insights/metrics";
import { buildingPairs } from "../../lib/insights/patternPoints";
import type { AppStackParamList } from "../../navigation/AppNavigator";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import type { CoveragePair } from "./PairDetailModal";

const FIRST = 3;

// Building patterns: every pair without a pattern yet, closest to the minimum
// overlap first, with progress and a "Log ..." link for the side that has fewer
// days. Tapping a pair opens its details. Hidden when all are found.
export function CoverageStrip({
  correlations,
  daily,
  onOpenPair,
}: {
  correlations: Correlation[];
  daily: DailyRecord[];
  onOpenPair: (pair: CoveragePair) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Insights");
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [showAll, setShowAll] = useState(false);
  const pairs = buildingPairs(daily, correlations);
  if (pairs.length === 0) return null;
  const shown = showAll ? pairs : pairs.slice(0, FIRST);

  // The side logged on fewer days is the one to log.
  const toLog = (p: { metric_a: MetricKey; metric_b: MetricKey }): MetricKey => {
    const count = (m: MetricKey) => daily.filter((r) => r[m] != null).length;
    return count(p.metric_a) <= count(p.metric_b) ? p.metric_a : p.metric_b;
  };

  function goLog(metric: MetricKey) {
    const target = METRIC_LOG_TARGET[metric];
    if ("tab" in target) navigation.navigate("Tabs", { screen: target.tab } as never);
    else navigation.navigate(target.screen);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t("buildingPatterns")}</Text>
      <Text style={styles.hint}>{t("buildingHint", { min: MIN_OVERLAP_DAYS })}</Text>

      {shown.map((p) => {
        const a = metricLabel(p.metric_a, t);
        const b = metricLabel(p.metric_b, t);
        const log = toLog(p);
        return (
          <View key={`${p.metric_a}-${p.metric_b}-${p.lag_days}`} style={styles.row}>
            <AnimatedPressable
              onPress={() => onOpenPair(p)}
              accessibilityRole="button"
              accessibilityLabel={t("pairDetail.openPairAria", { a, b })}
              style={styles.pairButton}
            >
              <Text style={styles.pairText}>
                {a} → {b}
              </Text>
            </AnimatedPressable>
            <View style={styles.progressRow}>
              <View
                style={styles.track}
                accessibilityRole="progressbar"
                accessibilityLabel={t("pairDetail.progress", { count: p.overlap, min: MIN_OVERLAP_DAYS })}
                accessibilityValue={{ min: 0, max: MIN_OVERLAP_DAYS, now: Math.min(p.overlap, MIN_OVERLAP_DAYS) }}
              >
                <View style={[styles.fill, { width: `${p.pct}%` }]} />
              </View>
              <Text style={styles.progressText}>{t("progressShort", { count: Math.min(p.overlap, MIN_OVERLAP_DAYS), min: MIN_OVERLAP_DAYS })}</Text>
            </View>
            <AnimatedPressable style={styles.logButton} onPress={() => goLog(log)} accessibilityRole="button">
              <Text style={styles.logText}>{t("pairDetail.logMetric", { metric: metricLabel(log, t) })}</Text>
            </AnimatedPressable>
          </View>
        );
      })}

      {pairs.length > FIRST && (
        <AnimatedPressable style={styles.toggle} onPress={() => setShowAll((v) => !v)} accessibilityState={{ expanded: showAll }}>
          <Text style={styles.toggleText}>{showAll ? t("showFewer") : t("showAll", { count: pairs.length })}</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 },
    label: { fontSize: 12, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    hint: { fontSize: 13, color: colors.mutedForeground, marginBottom: 4 },
    row: { gap: 8, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    pairButton: { minHeight: 32, justifyContent: "center" },
    pairText: { fontSize: 14, fontWeight: "800", color: colors.foreground },
    progressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    track: { flex: 1, height: 8, borderRadius: radius.sm, backgroundColor: colors.track, overflow: "hidden" },
    fill: { height: "100%", borderRadius: radius.sm, backgroundColor: colors.orange },
    progressText: { fontSize: 12, color: colors.mutedForeground },
    logButton: {
      alignSelf: "flex-start",
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    logText: { fontSize: 13, fontWeight: "600", color: colors.primary },
    toggle: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center" },
    toggleText: { fontSize: 14, fontWeight: "600", color: colors.primary },
  });
}
