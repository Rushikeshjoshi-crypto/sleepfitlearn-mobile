import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { getWeeklySnapshot, getTimeline, type WeeklySnapshot, type Timeline } from "../lib/api/dashboard";
import { loadErrorText } from "../lib/api/gateErrors";
import BarChart from "../components/BarChart";
import LogTodayModal from "../components/LogTodayModal";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ThemeToggle } from "../components/ThemeToggle";
import { HamburgerMenu } from "../components/HamburgerMenu";
import { Reveal } from "../components/Reveal";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import {
  getEnergyInsight,
  getPatternInsight,
  getStudyGapMinutes,
  type InsightCard,
} from "../lib/insights/insightEngine";
// getWeeklySnapshot() fills in missing sections/arrays; buildDailyLogs is
// unit-tested (lib/dashboard/series.ts).
import { buildDailyLogs } from "../lib/dashboard/series";
import type { LogTab } from "../lib/logTodayTab";

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Dashboard");
  const [snapshot, setSnapshot] = useState<WeeklySnapshot | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalTab, setLogModalTab] = useState<LogTab>("sleep");
  const openLogModal = (tab: LogTab) => {
    setLogModalTab(tab);
    setLogModalOpen(true);
  };

  const refresh = useCallback(() => {
    Promise.all([getWeeklySnapshot(), getTimeline()])
      .then(([snap, tl]) => {
        setSnapshot(snap);
        setTimeline(tl);
      })
      .catch((err) => setError(loadErrorText(err, t("loadError"))))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [t]);

  function onPullRefresh() {
    setRefreshing(true);
    refresh();
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // Both insight cards are computed client-side from the raw series above —
  // see src/lib/insights/insightEngine.ts. No separate insights API call.
  let insights: InsightCard[] = [];
  if (snapshot) {
    const dailyLogs = buildDailyLogs(snapshot);
    const todayLog = dailyLogs[dailyLogs.length - 1];
    const studyGapMinutes = getStudyGapMinutes(snapshot.study?.last_logged_at ?? null);
    insights = [getEnergyInsight({ ...todayLog, studyGapMinutes }), getPatternInsight(dailyLogs)];
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <View style={styles.brandRow}>
        <View style={styles.brandLeft}>
          <View style={styles.brandDot} />
          <Text style={styles.brandText}>
            SleepFit<Text style={styles.brandTextAccent}>Learn</Text>
          </Text>
        </View>
        <View style={styles.brandRight}>
          <ThemeToggle />
          <HamburgerMenu />
        </View>
      </View>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{t("title")}</Text>
          <Text style={styles.subtitle}>{t("subtitle")}</Text>
        </View>
        <AnimatedPressable style={styles.logButton} onPress={() => openLogModal("sleep")}>
          <Text style={styles.logButtonText}>{t("logTodaysData")}</Text>
        </AnimatedPressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {snapshot && (
        <>
          <Reveal delay={0}>
            <View style={styles.card}>
              <View style={styles.statHeader}>
                <Text style={styles.sectionTitle}>{t("sleep")}</Text>
                <Text style={styles.statValue}>
                  {snapshot.sleep.avg_hours.toFixed(1)}h {t("avg")}
                </Text>
              </View>
              <BarChart data={snapshot.sleep.daily.map((d) => ({ label: d.day_label, value: d.hours }))} />
            </View>
          </Reveal>

          <Reveal delay={60}>
            <View style={styles.card}>
              <View style={styles.statHeader}>
                <Text style={styles.sectionTitle}>{t("fitness")}</Text>
                <Text style={styles.statValue}>
                  {snapshot.fitness.workout_days} {t("days")}
                </Text>
              </View>
              <BarChart
                color={colors.accent}
                data={snapshot.fitness.daily.map((d) => ({ label: d.day_label, value: d.worked_out ? 1 : 0 }))}
              />
            </View>
          </Reveal>

          <Reveal delay={120}>
            <View style={styles.card}>
              <View style={styles.statHeader}>
                <Text style={styles.sectionTitle}>{t("study")}</Text>
                <Text style={styles.statValue}>
                  {snapshot.study.total_hours.toFixed(1)}h {t("total")}
                </Text>
              </View>
              <BarChart
                color={colors.accent}
                data={snapshot.study.daily.map((d) => ({ label: d.day_label, value: d.minutes }))}
              />
            </View>
          </Reveal>

          {insights.length > 0 && (
            <Reveal delay={180}>
              <View style={styles.card}>
                {/* insightEngine.ts (same file as web) returns a message key +
                    params; the text is in the InsightCards namespace. */}
                <Text style={styles.sectionTitle}>{t("energyMoodTitle")}</Text>
                {insights.map((insight) => (
                  <View key={insight.key} style={styles.insightRow}>
                    <Text style={styles.insightTitle}>{t(`InsightCards:${insight.messageKey}.title`)}</Text>
                    <Text style={styles.body}>{t(`InsightCards:${insight.messageKey}.body`, insight.params)}</Text>
                  </View>
                ))}
              </View>
            </Reveal>
          )}
        </>
      )}

      {timeline && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("timelineTitle")}</Text>

          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>{t("sleep")}</Text>
            {timeline.sleep ? (
              <Text style={styles.body}>{timeline.sleep.duration_hours ?? "?"} h</Text>
            ) : (
              <Text style={styles.placeholderText}>{t("lastNightSleepNotLogged")}</Text>
            )}
          </View>

          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>{t("workout")}</Text>
            {timeline.workouts.length > 0 ? (
              <Text style={styles.body}>
                {timeline.workouts
                  .map((w) => `${w.custom_activity_name ?? t("workoutFallbackName")} (${w.duration_minutes}m)`)
                  .join(", ")}
              </Text>
            ) : (
              <Text style={styles.placeholderText}>{t("noWorkoutToday")}</Text>
            )}
          </View>

          <View style={styles.timelineRow}>
            <Text style={styles.timelineLabel}>{t("studyReading")}</Text>
            {timeline.study ? (
              <Text style={styles.body}>
                {timeline.study.duration_minutes}m {timeline.study.session_type ?? ""}
              </Text>
            ) : (
              <View style={styles.emptyStudy}>
                <Text style={styles.placeholderText}>{t("notLoggedToday")}</Text>
                {/* Same as web: opens the Log popup straight on the Study tab. */}
                <AnimatedPressable
                  style={styles.logItNowButton}
                  onPress={() => openLogModal("study")}
                  accessibilityRole="button"
                >
                  <Text style={styles.logItNowText}>{t("logItNow")}</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>
        </View>
      )}

      <LogTodayModal
        visible={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        onSaved={refresh}
        initialTab={logModalTab}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brandLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    brandRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    brandDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.navTint },
    brandText: { fontSize: 16, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
    brandTextAccent: { fontStyle: "italic", color: colors.navTint },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.mutedForeground },
    logButton: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
    logButtonText: { color: colors.primaryForeground, fontSize: typography.bodySmall.fontSize, fontWeight: "600" },
    emptyStudy: { flexShrink: 1, alignItems: "flex-end", gap: 6 },
    logItNowButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
    logItNowText: { color: colors.primary, fontSize: typography.bodySmall.fontSize, fontWeight: "600" },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 4,
    },
    statHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    statValue: { fontSize: typography.bodySmall.fontSize, fontWeight: "500", color: colors.mutedForeground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      backgroundColor: colors.destructiveBg,
      borderRadius: 20,
      padding: 12,
    },
    errorText: { color: colors.destructive },
    insightRow: { paddingVertical: 6 },
    insightTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    timelineRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    timelineLabel: { fontSize: typography.body.fontSize, fontWeight: "500", color: colors.foreground },
    placeholderText: { fontSize: 14, color: colors.mutedForeground, fontStyle: "italic", flexShrink: 1, textAlign: "right" },
  });
}
