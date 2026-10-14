import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { METRIC_GLYPH, POSSIBLE_PAIRS, metricLabel } from "../../lib/insights/metrics";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { ModernButton } from "../ModernButton";

const UNIQUE_METRICS = Array.from(new Set(POSSIBLE_PAIRS.flatMap((p) => [p.metric_a, p.metric_b])));

// Mobile port of the web app's src/components/insights/ConsentGate.tsx:
// insights stay off until the user opts in (privacy_settings.insights_enabled).
export function InsightsConsentGate({ onEnable, isEnabling }: { onEnable: () => void; isEnabling: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Insights");

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("noticePatterns")}</Text>
      <Text style={styles.body}>{t("consentDescription")}</Text>

      {[t("offByDefault"), t("statisticalOnly"), t("turnOffAnyTime")].map((line) => (
        <View key={line} style={styles.bulletRow}>
          <Text style={styles.bulletIcon}>✓</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}

      <ModernButton title={t("turnOnInsights")} onPress={onEnable} loading={isEnabling} />

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>{t("whatGetsCompared")}</Text>
      <View style={styles.metricGrid}>
        {UNIQUE_METRICS.map((key) => (
          <View key={key} style={styles.metricChip}>
            <Text>{METRIC_GLYPH[key]}</Text>
            <Text style={styles.metricText} numberOfLines={1}>
              {metricLabel(key, t)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>{t("patternsSurfaceHint")}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 12,
    },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground, lineHeight: 21 },
    bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    bulletIcon: { color: colors.primary, fontWeight: "700" },
    bulletText: { flex: 1, fontSize: typography.body.fontSize, color: colors.mutedForeground },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
    sectionLabel: {
      fontSize: typography.label.fontSize,
      fontWeight: "600",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    metricChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      maxWidth: "48%",
    },
    metricText: { fontSize: 13, color: colors.foreground, flexShrink: 1 },
    hint: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
  });
}
