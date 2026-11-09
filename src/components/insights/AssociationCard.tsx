import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Correlation, DailyRecord } from "../../lib/api/insights";
import { METRIC_GLYPH, describeCorrelation, strengthLabel } from "../../lib/insights/metrics";
import { STRENGTH_DOTS } from "../../lib/insights/patternPoints";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { PatternScatter } from "./PatternScatter";

// Strength as 4 dots (filled = strength) plus the word.
export function StrengthMeter({ strength }: { strength: Correlation["strength"] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Insights");
  const filled = STRENGTH_DOTS[strength] ?? 1;
  return (
    <View style={styles.meter}>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dot, i <= filled ? styles.dotOn : styles.dotOff]} />
        ))}
      </View>
      <Text style={styles.meterText}>{strengthLabel(strength, t)}</Text>
    </View>
  );
}

// The two metrics as small badges with an arrow (a metric this build doesn't
// know gets a generic glyph instead of rendering `undefined`).
export function PairIcons({ correlation }: { correlation: Pick<Correlation, "metric_a" | "metric_b"> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.pair} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.badge}>
        <Text style={styles.glyph}>{METRIC_GLYPH[correlation.metric_a] ?? "📈"}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
      <View style={styles.badge}>
        <Text style={styles.glyph}>{METRIC_GLYPH[correlation.metric_b] ?? "📈"}</Text>
      </View>
    </View>
  );
}

// The strongest pattern, large: its sentence, strength, days, and a scatter of
// the real days behind it.
export function AssociationCard({ correlation, daily = [] }: { correlation: Correlation; daily?: DailyRecord[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Insights");
  return (
    <View style={styles.card}>
      <Text style={styles.label}>
        {t("topPattern")}
        {correlation.lag_days > 0 ? ` · ${t("nextDayTag")}` : ""}
      </Text>
      <PairIcons correlation={correlation} />
      <Text style={styles.sentence}>{describeCorrelation(correlation, t)}</Text>
      <View style={styles.meta}>
        <StrengthMeter strength={correlation.strength} />
        <Text style={styles.muted}>{formatIcuPlural(t("basedOnDays"), correlation.n, i18n.language)}</Text>
      </View>
      <PatternScatter daily={daily} pair={correlation} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
    label: { fontSize: 12, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.6 },
    sentence: { fontSize: 22, fontWeight: "800", lineHeight: 28, color: colors.foreground, letterSpacing: -0.3 },
    meta: { gap: 4 },
    muted: { fontSize: 13, color: colors.mutedForeground },
    meter: { flexDirection: "row", alignItems: "center", gap: 8 },
    dots: { flexDirection: "row", gap: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotOn: { backgroundColor: colors.orange },
    dotOff: { borderWidth: 1, borderColor: colors.border },
    meterText: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    pair: { flexDirection: "row", alignItems: "center", gap: 6 },
    badge: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
    glyph: { fontSize: 16 },
    arrow: { fontSize: 13, color: colors.mutedForeground },
  });
}
