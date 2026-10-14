import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { Correlation, DailyRecord, MetricKey } from "../../lib/api/insights";
import { METRIC_LOG_TARGET, MIN_OVERLAP_DAYS, daysLogged, overlapDays } from "../../lib/insights/coverage";
import { describeCorrelation, metricLabel, strengthLabel } from "../../lib/insights/metrics";
import type { AppStackParamList } from "../../navigation/AppNavigator";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { ModernButton } from "../ModernButton";

export type CoveragePair = { metric_a: MetricKey; metric_b: MetricKey; lag_days: number };

// Mobile counterpart of the web app's src/components/insights/PairDetailDialog.tsx:
// opened by tapping a Pattern Coverage chip — what the pair compares, how close
// it is to becoming a pattern, and where to log each side.
export function PairDetailModal({
  pair,
  match,
  daily,
  onClose,
}: {
  pair: CoveragePair | null;
  match: Correlation | undefined;
  daily: DailyRecord[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Insights");
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  if (!pair) return null;

  const a = metricLabel(pair.metric_a, t);
  const b = metricLabel(pair.metric_b, t);
  const overlap = overlapDays(daily, pair);
  const pct = Math.min(100, Math.round((overlap / MIN_OVERLAP_DAYS) * 100));
  const question = pair.lag_days > 0 ? "pairDetail.nextDayQuestion" : "pairDetail.sameDayQuestion";

  function goLog(metric: MetricKey) {
    onClose();
    const target = METRIC_LOG_TARGET[metric];
    if ("tab" in target) navigation.navigate("Tabs", { screen: target.tab } as never);
    else navigation.navigate(target.screen);
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>
              {a} → {b}
            </Text>
            <Text style={styles.body}>{t(question, { a: a.toLowerCase(), b: b.toLowerCase() })}</Text>

            {match ? (
              <View style={[styles.box, styles.boxFound]}>
                <Text style={styles.boxTitle}>
                  {t("pairDetail.foundTitle")} · {strengthLabel(match.strength, t)} {t("associationSuffix")}
                </Text>
                <Text style={styles.body}>{describeCorrelation(match, t)}</Text>
                <Text style={styles.small}>{t("pairDetail.foundBasedOn", { n: match.n })}</Text>
              </View>
            ) : (
              <View style={[styles.box, styles.boxPending]}>
                <Text style={styles.boxTitle}>{t("pairDetail.notFoundTitle")}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%` }]} />
                </View>
                <Text style={styles.body}>{t("pairDetail.progress", { count: overlap, min: MIN_OVERLAP_DAYS })}</Text>
                <Text style={styles.small}>
                  {overlap >= MIN_OVERLAP_DAYS
                    ? t("pairDetail.noVariation")
                    : t("pairDetail.progressHint", { min: MIN_OVERLAP_DAYS })}
                </Text>
              </View>
            )}

            {[pair.metric_a, pair.metric_b].map((m) => (
              <Text key={m} style={styles.body}>
                {t("pairDetail.metricLogged", { metric: metricLabel(m, t), count: daysLogged(daily, m), total: daily.length })}
              </Text>
            ))}

            <View style={styles.buttons}>
              {[pair.metric_a, pair.metric_b].map((m) => (
                <ModernButton
                  key={m}
                  style={styles.flexButton}
                  variant="outline"
                  title={t("pairDetail.logMetric", { metric: metricLabel(m, t) })}
                  onPress={() => goLog(m)}
                />
              ))}
            </View>
            <ModernButton title={t("pairDetail.close")} variant="secondary" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
    card: { backgroundColor: colors.card, borderRadius: 24, maxHeight: "85%" },
    content: { padding: 20, gap: 12 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", color: colors.foreground },
    body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20 },
    small: { fontSize: 12, color: colors.mutedForeground },
    box: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 8 },
    boxFound: { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}0D` },
    boxPending: { borderColor: colors.border, borderStyle: "dashed" },
    boxTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground },
    track: { height: 8, borderRadius: 999, backgroundColor: colors.muted, overflow: "hidden" },
    fill: { height: "100%", borderRadius: 999, backgroundColor: colors.navTint },
    buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    flexButton: { flexGrow: 1 },
  });
}
