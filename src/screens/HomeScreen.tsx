import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getWeeklySnapshot, getTimeline, type WeeklySnapshot, type Timeline } from "../lib/api/dashboard";
import { loadErrorText } from "../lib/api/gateErrors";
import LogTodayModal from "../components/LogTodayModal";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ThemeToggle } from "../components/ThemeToggle";
import { HamburgerMenu } from "../components/HamburgerMenu";
import { Reveal } from "../components/Reveal";
import {
  FEED_ICON,
  FeedCard,
  FeedCardHeader,
  FeedStat,
  GettingStartedCard,
  ProfileCard,
  StepsFeedCard,
  ThisWeekCard,
  WeekBars,
} from "../components/home/HomeCards";
import { useTheme } from "../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../theme/palettes";
import { getUserProfile, type UserProfile } from "../lib/api/users";
import { useStepsAllowed } from "../lib/steps/useStepsAllowed";
import { stepGoal } from "../lib/steps/display";
import type { AppStackParamList } from "../navigation/AppNavigator";
import {
  getEnergyInsight,
  getPatternInsight,
  getStudyGapMinutes,
  type InsightCard,
} from "../lib/insights/insightEngine";
// getWeeklySnapshot() fills in missing sections/arrays; buildDailyLogs is
// unit-tested (lib/dashboard/series.ts).
import { buildDailyLogs } from "../lib/dashboard/series";
import {
  formatWeekRange,
  gettingStartedItems,
  profileStats,
  showGettingStarted,
  stepsToday,
  weekSeries,
  type StartItem,
  type WeekTab,
} from "../lib/dashboard/home";
import type { LogTab } from "../lib/logTodayTab";

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Dashboard");
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  // Steps follow the synced HR/BP rule: false until the check answers, and
  // for 13-17 with the flag off / under-13.
  const stepsAllowed = useStepsAllowed();
  const [snapshot, setSnapshot] = useState<WeeklySnapshot | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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
    // The profile (nickname, photo, step goal) only decorates the page; a
    // failure never blocks the dashboard.
    getUserProfile()
      .then(setProfile)
      .catch(() => {});
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
        <ActivityIndicator color={colors.orange} />
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

  const rangeText = formatWeekRange(snapshot?.range?.from, snapshot?.range?.to);
  const stats = snapshot ? profileStats(snapshot, stepsAllowed) : [];
  const startItems = snapshot ? gettingStartedItems({ snapshot, timeline, profile, stepsAllowed }) : [];
  const showStart = showGettingStarted(startItems);
  const onStartAction = (key: StartItem["key"]) => {
    if (key === "sleep") openLogModal("sleep");
    else if (key === "study") openLogModal("study");
    else if (key === "stepGoal") navigation.navigate("Settings");
    else navigation.navigate("Connections");
  };
  const bars = (tab: WeekTab) => (snapshot ? weekSeries(snapshot, tab).bars : []);

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
        <View style={styles.headerText}>
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
            <ProfileCard
              nickname={profile?.nickname}
              avatar={(profile as { avatar?: string | null } | null)?.avatar}
              stats={stats}
              onSettings={() => navigation.navigate("Settings")}
            />
          </Reveal>

          {showStart && (
            <Reveal delay={40}>
              <GettingStartedCard items={startItems} onAction={onStartAction} />
            </Reveal>
          )}

          <Reveal delay={80}>
            <ThisWeekCard snapshot={snapshot} stepsAllowed={stepsAllowed} />
          </Reveal>

          <Reveal delay={120}>
            <FeedCard>
              <FeedCardHeader icon={FEED_ICON.sleep} title={t("sleep")} range={rangeText} />
              <FeedStat value={`${snapshot.sleep.avg_hours}h`} label={t("avg")} />
              <WeekBars bars={bars("sleep")} />
            </FeedCard>
          </Reveal>

          <Reveal delay={160}>
            <FeedCard>
              <FeedCardHeader icon={FEED_ICON.fitness} title={t("fitness")} range={rangeText} />
              <FeedStat value={String(snapshot.fitness.workout_days)} label={t("days")} />
              <WeekBars bars={bars("fitness")} />
            </FeedCard>
          </Reveal>

          <Reveal delay={200}>
            <FeedCard>
              <FeedCardHeader icon={FEED_ICON.study} title={t("study")} range={rangeText} />
              <FeedStat value={`${snapshot.study.total_hours}h`} label={t("total")} />
              <WeekBars bars={bars("study")} />
            </FeedCard>
          </Reveal>

          {stepsAllowed && (
            <Reveal delay={240}>
              <StepsFeedCard steps={stepsToday(snapshot)} goal={stepGoal(profile)} range={rangeText} bars={bars("steps")} />
            </Reveal>
          )}

          {insights.length > 0 && (
            <Reveal delay={280}>
              <FeedCard>
                {/* insightEngine.ts (same file as web) returns a message key +
                    params; the text is in the InsightCards namespace. */}
                <Text style={styles.sectionTitle}>{t("energyMoodTitle")}</Text>
                <Text style={styles.sectionSubtitle}>{t("energyMoodSubtitle")}</Text>
                {insights.map((insight, i) => (
                  <View key={insight.key} style={[styles.insightRow, i > 0 && styles.insightBorder]}>
                    <Text style={styles.insightTitle}>{t(`InsightCards:${insight.messageKey}.title`)}</Text>
                    <Text style={styles.body}>{t(`InsightCards:${insight.messageKey}.body`, insight.params)}</Text>
                  </View>
                ))}
              </FeedCard>
            </Reveal>
          )}
        </>
      )}

      {timeline && (
        <FeedCard>
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
        </FeedCard>
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
    container: { padding: 16, gap: 16, paddingBottom: 40 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brandLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    brandRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    brandDot: { width: 18, height: 18, borderRadius: radius.sm, backgroundColor: colors.orange },
    brandText: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    brandTextAccent: { color: colors.primary },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: typography.title.fontSize, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.mutedForeground },
    logButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14 },
    logButtonText: { color: colors.primaryForeground, fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
    emptyStudy: { flexShrink: 1, alignItems: "flex-end", gap: 6 },
    logItNowButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 12 },
    logItNowText: { color: colors.primary, fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    sectionSubtitle: { marginTop: 2, fontSize: 13, color: colors.mutedForeground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      backgroundColor: colors.destructiveBg,
      borderRadius: radius.lg,
      padding: 12,
    },
    errorText: { color: colors.destructive },
    insightRow: { paddingVertical: 10 },
    insightBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    insightTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground },
    timelineRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    timelineLabel: { fontSize: typography.body.fontSize, fontWeight: "700", color: colors.foreground },
    placeholderText: { fontSize: 14, color: colors.mutedForeground, flexShrink: 1, textAlign: "right" },
  });
}
