import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useTranslation } from "react-i18next";
import { getTodaySummary, isTracking, type ScreenTimeTodaySummary } from "../lib/native/screenTime";
import { getSyncEnabled as getHealthConnectSyncEnabled } from "../lib/healthConnect/preference";
import { averageDailyScreenTime, effectiveScreenTimeEvents } from "../lib/habits/screenTimeAverage";
import {
  listContextEvents,
  deleteContextEvent,
  type ContextEvent,
  type ContextEventType,
  prepareHabitHistory,
  topApps as sumAppsByPackage,
} from "../lib/api/context";
import {
  createRoutineTask,
  deleteRoutineTask,
  listRoutineTasks,
  type RoutineTask,
} from "../lib/api/routineTasks";
import { groupByDate } from "../lib/groupByDate";
import { isoDaysAgo } from "../lib/dateRange";
import { formatMinutes } from "../lib/formatMinutes";
import { formatIcuPlural } from "../lib/i18n/icuPlural";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { AppHeader } from "../components/AppHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import TextPromptModal from "../components/TextPromptModal";
import { HabitEventEditModal } from "../components/habits/HabitEventEditModal";
import { loadErrorText } from "../lib/api/gateErrors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REFRESH_INTERVAL_MS = 30_000;

// No icon library on mobile — small glyphs stand in for the website's
// per-type icons (habitMeta.ts: Smartphone / ListChecks).
const EVENT_TYPE_GLYPH: Record<ContextEventType, string> = {
  screen_time: "📱",
  routine: "✅",
};

function eventValueLabel(event: ContextEvent): string {
  if (event.event_type === "screen_time") {
    return formatMinutes(event.metadata?.minutes ?? 0);
  }
  return `${event.metadata?.adherence_pct ?? 0}%`;
}


type Tab = "screenTime" | "routine";

export default function HabitsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Habits", "Common", "Nav"]);
  const EVENT_TYPE_LABEL: Record<ContextEventType, string> = {
    screen_time: t("Habits:eventTypes.screen_time"),
    routine: t("Habits:eventTypes.routine"),
  };

  // Same segmented-tab pattern as StudyScreen (Study Sessions / Exam Logs) —
  // Screen Time and Daily Routine each render fully expanded, so splitting
  // them into tabs (instead of stacking both) keeps the screen from growing
  // to 4 full cards' worth of scroll.
  const [tab, setTab] = useState<Tab>("screenTime");
  const [enabled, setEnabled] = useState(false);
  const [summary, setSummary] = useState<ScreenTimeTodaySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<ContextEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [expandedAppGroups, setExpandedAppGroups] = useState<Set<string>>(new Set());
  // Events being edited (one day's merged screen_time rows, or one routine row).
  const [editingEvents, setEditingEvents] = useState<ContextEvent[] | null>(null);

  // Only for the "Connections & permissions" row's On / Off line; the
  // switches and permission flows are on ConnectionsScreen.
  const [hcSyncOn, setHcSyncOn] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const [routineTasks, setRoutineTasks] = useState<RoutineTask[]>([]);
  const [routineLoading, setRoutineLoading] = useState(true);
  const [routineError, setRoutineError] = useState<string | null>(null);
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(new Set());
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [tracking, today] = await Promise.all([isTracking(), getTodaySummary()]);
    setEnabled(tracking);
    setSummary(today);
  }, []);

  const refreshHistory = useCallback(() => {
    return listContextEvents()
      // Events without a real event_date are skipped (a null one used to make
      // the whole history fail to load); see prepareHabitHistory.
      // A screen time day with a snapshot is shown from it alone (its old delta rows would double-count).
      .then((events) => setHistory(prepareHabitHistory(effectiveScreenTimeEvents(events))))
      .catch((err) => setHistoryError(loadErrorText(err, t("Habits:loadHistoryError"))));
  }, [t]);

  const refreshHealthConnect = useCallback(async () => {
    setHcSyncOn(await getHealthConnectSyncEnabled());
  }, []);

  const refreshRoutineTasks = useCallback(() => {
    return listRoutineTasks()
      .then((tasks) => {
        setRoutineTasks(tasks);
        setRoutineError(null);
      })
      .catch((err) => setRoutineError(loadErrorText(err, t("Habits:couldntLoadChecklist"))))
      .finally(() => setRoutineLoading(false));
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [refresh]),
  );

  useFocusEffect(
    useCallback(() => {
      refreshHistory();
      refreshRoutineTasks();
      refreshHealthConnect();
    }, [refreshHistory, refreshRoutineTasks, refreshHealthConnect]),
  );

  function onPullRefresh() {
    setRefreshing(true);
    Promise.all([refresh(), refreshHistory(), refreshRoutineTasks(), refreshHealthConnect()]).finally(() =>
      setRefreshing(false),
    );
  }

  function toggleTaskChecked(id: string) {
    setCheckedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onAddTask(text: string) {
    if (!text.trim()) return;
    setAddingTask(true);
    try {
      const task = await createRoutineTask({ text: text.trim() });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRoutineTasks((prev) => [...prev, task]);
    } catch (err) {
      Alert.alert(t("Habits:addTaskErrorTitle"), err instanceof Error ? err.message : t("Habits:tryAgainShort"));
    } finally {
      setAddingTask(false);
    }
  }

  function onDeleteTask(id: string) {
    Alert.alert(t("Habits:deleteTaskTitle"), t("Habits:deleteTaskBody"), [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          setDeletingTaskId(id);
          try {
            await deleteRoutineTask(id);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setRoutineTasks((prev) => prev.filter((t) => t.id !== id));
            setCheckedTaskIds((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          } catch (err) {
            Alert.alert(t("Habits:deleteTaskErrorTitle"), err instanceof Error ? err.message : t("Habits:tryAgainShort"));
          } finally {
            setDeletingTaskId(null);
          }
        },
      },
    ]);
  }


  const groups = groupByDate(history, (e) => e.event_date);

  // Collapsed-by-default summary line, matching the web app's
  // HabitHistoryBox — mobile has one combined history list (not two
  // separate boxes per event type, since its data model never split
  // screen_time/routine into separate feeds), so this summarizes across
  // whichever event is actually newest overall.
  let historySummaryText: string | null = null;
  if (historyError) {
    historySummaryText = historyError;
  } else if (history.length === 0) {
    historySummaryText = t("Habits:noEntriesLoggedYet");
  } else {
    const entryCountText = formatIcuPlural(t("Habits:entryCount"), history.length, i18n.language);
    const latest = history[0];
    const latestDateLabel = groups[0]?.label ?? "";
    historySummaryText = `${entryCountText} · ${t("Habits:latestEntryPreview", {
      value: eventValueLabel(latest),
      date: latestDateLabel,
    })}`;
  }

  // Same as web's HabitEventRow delete: a merged screen-time day deletes every
  // underlying row; a routine row deletes just itself.
  function confirmDeleteEvents(events: ContextEvent[]) {
    const [first] = events;
    Alert.alert(
      t("Common:deleteThisEntry"),
      t("Habits:deleteEntryDescription", {
        label: EVENT_TYPE_LABEL[first.event_type].toLowerCase(),
        date: first.event_date,
      }),
      [
        { text: t("Common:cancel"), style: "cancel" },
        {
          text: t("Common:delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await Promise.all(events.map((e) => deleteContextEvent(e.sk)));
              const deleted = new Set(events.map((e) => e.sk));
              setHistory((prev) => prev.filter((e) => !deleted.has(e.sk)));
              Alert.alert(events.length > 1 ? t("Habits:entriesDeleted") : t("Common:entryDeleted"));
            } catch {
              Alert.alert(t("Common:couldntDeleteEntry"));
            }
          },
        },
      ],
    );
  }

  function renderEventActions(events: ContextEvent[]) {
    return (
      <View style={styles.eventActions}>
        <AnimatedPressable
          style={styles.eventActionButton}
          onPress={() => setEditingEvents(events)}
          accessibilityRole="button"
          accessibilityLabel={t("Common:editEntry")}
        >
          <Text style={styles.eventActionGlyph}>✎</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.eventActionButton}
          onPress={() => confirmDeleteEvents(events)}
          accessibilityRole="button"
          accessibilityLabel={t("Common:deleteEntry")}
        >
          <Text style={[styles.eventActionGlyph, styles.eventDeleteGlyph]}>🗑</Text>
        </AnimatedPressable>
      </View>
    );
  }

  function toggleHistoryExpanded() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHistoryExpanded((v) => !v);
  }

  function toggleAppGroup(label: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedAppGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // "This Week" + "Most used app" both read the same trailing-7-day slice of
  // history (mirrors the website's HabitsStatsStrip weekStart calculation).
  const weekStart = isoDaysAgo(6);
  const thisWeekEvents = history.filter((e) => e.event_date >= weekStart);
  const thisWeekScreenTime = thisWeekEvents.filter((e) => e.event_type === "screen_time");
  const thisWeekRoutine = thisWeekEvents.filter((e) => e.event_type === "routine");
  // Per day (a day's sync rows added up first) — lib/habits/screenTimeAverage, same as web.
  const avgDailyMinutes = averageDailyScreenTime(thisWeekScreenTime);
  const avgAdherence = thisWeekRoutine.length
    ? Math.round(thisWeekRoutine.reduce((sum, e) => sum + (e.metadata?.adherence_pct ?? 0), 0) / thisWeekRoutine.length)
    : null;

  const mostUsedApps = sumAppsByPackage(thisWeekScreenTime);
  const topApp = mostUsedApps[0] ?? null;
  const topApps = mostUsedApps.slice(0, 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <AppHeader title={t("Nav:habits")} />

      {/* Screen time / Health Connect / watch switches + permissions live on their own screen. */}
      <AnimatedPressable
        style={[styles.card, styles.connectionsRow]}
        onPress={() => navigation.navigate("Connections")}
        accessibilityRole="button"
        accessibilityLabel={t("Habits:connectionsTitle")}
      >
        <View style={styles.toggleLabel}>
          <Text style={styles.toggleTitle}>🔗 {t("Habits:connectionsTitle")}</Text>
          <Text style={styles.toggleSubtitle}>
            {t("Habits:eventTypes.screen_time")}: {enabled ? t("Habits:statusOn") : t("Habits:statusOff")} · {t("Habits:healthConnectTab")}:{" "}
            {hcSyncOn ? t("Habits:statusOn") : t("Habits:statusOff")}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </AnimatedPressable>

      <SegmentedControl
        options={[
          { value: "screenTime" as const, label: t("Habits:eventTypes.screen_time") },
          { value: "routine" as const, label: t("Habits:eventTypes.routine") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "screenTime" && (
        <>
          {!enabled && (
            <AnimatedPressable style={styles.card} onPress={() => navigation.navigate("Connections")} accessibilityRole="button">
              <Text style={styles.body}>{t("Habits:turnOnInConnections")}</Text>
            </AnimatedPressable>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Common:today")}</Text>
            <Text style={styles.totalMinutes}>
              {formatMinutes(summary?.totalMinutes ?? 0)} {t("Habits:screenTimeEmptyLabel")}
            </Text>

            {!summary || summary.apps.length === 0 ? (
              <Text style={styles.body}>{t("Habits:noAppUsageToday")}</Text>
            ) : (
              <FlatList
                data={[...summary.apps].sort((a, b) => b.minutesUsed - a.minutesUsed)}
                keyExtractor={(item) => item.packageName}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.appRow}>
                    <Text style={styles.appName}>{item.appName}</Text>
                    <Text style={styles.body}>{formatMinutes(item.minutesUsed)}</Text>
                  </View>
                )}
              />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.thisWeekLabel}>{t("Habits:thisWeek")}</Text>
            {avgDailyMinutes === null && avgAdherence === null ? (
              <Text style={styles.body}>{t("Habits:noEntriesThisWeek")}</Text>
            ) : (
              <View style={styles.thisWeekRow}>
                <View style={styles.thisWeekStat}>
                  <Text style={styles.thisWeekValue}>
                    {avgDailyMinutes !== null ? formatMinutes(avgDailyMinutes) : "—"}
                  </Text>
                  <Text style={styles.thisWeekCaption}>
                    {t("Habits:avgDailyScreenTime")} ·{" "}
                    {formatIcuPlural(t("Habits:entryCount"), thisWeekScreenTime.length, i18n.language)}
                  </Text>
                </View>
                <View style={styles.thisWeekStat}>
                  <Text style={styles.thisWeekValue}>{avgAdherence !== null ? `${avgAdherence}%` : "—"}</Text>
                  <Text style={styles.thisWeekCaption}>
                    {t("Habits:avgRoutineAdherence")} ·{" "}
                    {formatIcuPlural(t("Habits:entryCount"), thisWeekRoutine.length, i18n.language)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Habits:mostUsedAppTitle")}</Text>
            <Text style={styles.thisWeekCaption}>{t("Habits:mostUsedAppPeriod")}</Text>

            {!topApp ? (
              <Text style={styles.body}>{t("Habits:noAppUsageThisWeek")}</Text>
            ) : (
              <>
                <View style={styles.topAppRow}>
                  <Text style={styles.topAppGlyph}>{EVENT_TYPE_GLYPH.screen_time}</Text>
                  <View style={styles.topAppInfo}>
                    <Text style={styles.topAppName}>{topApp.app_name}</Text>
                    <Text style={styles.topAppMinutes}>{formatMinutes(topApp.minutes_used)}</Text>
                  </View>
                </View>
                {topApps.map((app, index) => (
                  <View key={app.package_name} style={styles.appRow}>
                    <Text style={styles.appName}>
                      {index + 1}. {app.app_name}
                    </Text>
                    <Text style={styles.body}>{formatMinutes(app.minutes_used)}</Text>
                  </View>
                ))}
              </>
            )}
          </View>

          <View style={styles.card}>
            <AnimatedPressable
              style={styles.historyHeaderRow}
              onPress={toggleHistoryExpanded}
              accessibilityRole="button"
              accessibilityState={{ expanded: historyExpanded }}
              accessibilityLabel={
                historyExpanded
                  ? t("Habits:collapseHistory", { title: t("Habits:historyTitle") })
                  : t("Habits:expandHistory", { title: t("Habits:historyTitle") })
              }
            >
              <Text style={styles.sectionTitle}>{t("Habits:historyTitle")}</Text>
              {historySummaryText && <Text style={styles.historySummary}>{historySummaryText}</Text>}
            </AnimatedPressable>

            {historyExpanded && (
              groups.map((group) => {
                // The tracker syncs every ~20-30 min, so one day can have many
                // screen_time rows — collapse those into a single daily total
                // instead of listing every sync interval separately.
                const screenTimeEvents = group.items.filter((e) => e.event_type === "screen_time");
                const screenTimeTotal = screenTimeEvents.reduce((sum, e) => sum + (e.metadata?.minutes ?? 0), 0);
                const otherEvents = group.items.filter((e) => e.event_type !== "screen_time");
                const groupApps = sumAppsByPackage(screenTimeEvents);
                const groupExpanded = expandedAppGroups.has(group.label);

                return (
                  <View key={group.label} style={styles.historyGroup}>
                    <Text style={styles.historyGroupLabel}>{group.label}</Text>
                    {screenTimeTotal > 0 && (
                      groupApps.length > 0 ? (
                        <>
                          <AnimatedPressable
                            style={styles.appRow}
                            onPress={() => toggleAppGroup(group.label)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: groupExpanded }}
                            accessibilityLabel={
                              groupExpanded ? t("Habits:hideAppBreakdown") : t("Habits:showAppBreakdown")
                            }
                          >
                            <Text style={styles.appName}>
                              {EVENT_TYPE_GLYPH.screen_time} {EVENT_TYPE_LABEL.screen_time}{" "}
                              {groupExpanded ? "▾" : "▸"}
                            </Text>
                            <Text style={styles.body}>{formatMinutes(screenTimeTotal)}</Text>
                            {renderEventActions(screenTimeEvents)}
                          </AnimatedPressable>
                          {groupExpanded &&
                            groupApps.map((app) => (
                              <View key={app.package_name} style={styles.subAppRow}>
                                <Text style={styles.body}>{app.app_name}</Text>
                                <Text style={styles.body}>{formatMinutes(app.minutes_used)}</Text>
                              </View>
                            ))}
                        </>
                      ) : (
                        <View style={styles.appRow}>
                          <Text style={styles.appName}>
                            {EVENT_TYPE_GLYPH.screen_time} {EVENT_TYPE_LABEL.screen_time}
                          </Text>
                          <Text style={styles.body}>{formatMinutes(screenTimeTotal)}</Text>
                          {renderEventActions(screenTimeEvents)}
                        </View>
                      )
                    )}
                    {otherEvents.map((event) => (
                      <View key={event.sk} style={styles.appRow}>
                        <Text style={styles.appName}>
                          {EVENT_TYPE_GLYPH[event.event_type]} {EVENT_TYPE_LABEL[event.event_type]}
                        </Text>
                        <Text style={styles.body}>{eventValueLabel(event)}</Text>
                        {renderEventActions([event])}
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      {tab === "routine" && (
        <View style={styles.card}>
          <View style={styles.routineHeaderRow}>
            <Text style={styles.sectionTitle}>{t("Habits:eventTypes.routine")}</Text>
          </View>

          <AnimatedPressable style={styles.addTaskButton} onPress={() => setAddTaskModalOpen(true)} disabled={addingTask}>
            {addingTask ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.addTaskButtonText}>{t("Habits:addTaskButton")}</Text>
            )}
          </AnimatedPressable>

          {routineLoading ? (
            <ActivityIndicator color={colors.navTint} />
          ) : routineError ? (
            <View>
              <Text style={styles.errorText}>{routineError}</Text>
              <Pressable onPress={() => { setRoutineLoading(true); refreshRoutineTasks(); }}>
                <Text style={styles.retryText}>{t("Habits:tryAgain")}</Text>
              </Pressable>
            </View>
          ) : routineTasks.length === 0 ? (
            <Text style={styles.body}>{t("Habits:noTasksInRoutine")}</Text>
          ) : (
            routineTasks.map((task) => (
              <AnimatedPressable
                key={task.id}
                style={styles.taskRow}
                onPress={() => toggleTaskChecked(task.id)}
                onLongPress={() => onDeleteTask(task.id)}
                disabled={deletingTaskId === task.id}
              >
                <Text style={styles.checkGlyph}>{checkedTaskIds.has(task.id) ? "☑" : "☐"}</Text>
                <Text style={styles.taskText}>{task.text}</Text>
                {deletingTaskId === task.id && <ActivityIndicator color={colors.mutedForeground} size="small" />}
              </AnimatedPressable>
            ))
          )}
          <Text style={styles.hintText}>{t("Habits:taskHint")}</Text>
        </View>
      )}

      <HabitEventEditModal
        events={editingEvents}
        onClose={() => setEditingEvents(null)}
        onSaved={() => {
          setEditingEvents(null);
          refreshHistory();
        }}
      />

      <TextPromptModal
        visible={addTaskModalOpen}
        title={t("Habits:addTaskTitle")}
        onSubmit={onAddTask}
        onClose={() => setAddTaskModalOpen(false)}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    eventActions: { flexDirection: "row", alignItems: "center", marginLeft: 4 },
    eventActionButton: { minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
    eventActionGlyph: { fontSize: 15, color: colors.mutedForeground },
    eventDeleteGlyph: { color: colors.destructive },
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 8,
    },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    connectionsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    chevron: { fontSize: 24, color: colors.mutedForeground },
    toggleLabel: { flex: 1, gap: 2 },
    toggleTitle: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    toggleSubtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    syncedAt: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 4 },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    totalMinutes: { fontSize: 28, fontWeight: "700", color: colors.navTint, marginBottom: 4 },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    appRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    appName: { fontSize: typography.body.fontSize, fontWeight: "500", color: colors.foreground },
    subAppRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      paddingLeft: 16,
    },
    thisWeekLabel: {
      fontSize: typography.label.fontSize,
      fontWeight: "600",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    thisWeekRow: { flexDirection: "row", gap: 16, marginTop: 4 },
    thisWeekStat: { flex: 1, gap: 2 },
    thisWeekValue: { fontSize: 24, fontWeight: "700", color: colors.foreground },
    thisWeekCaption: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
    topAppRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 4 },
    topAppGlyph: { fontSize: 32 },
    topAppInfo: { flex: 1, gap: 2 },
    topAppName: { fontSize: typography.sectionTitle.fontSize, fontWeight: "700", color: colors.foreground },
    topAppMinutes: { fontSize: typography.body.fontSize, color: colors.navTint, fontWeight: "600" },
    historyHeaderRow: { gap: 2 },
    historySummary: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    historyGroup: { marginTop: 8 },
    historyGroupLabel: { fontSize: typography.label.fontSize, fontWeight: "600", color: colors.mutedForeground, marginBottom: 4 },
    errorText: { color: colors.destructive },
    routineHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    addTaskButton: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    addTaskButtonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
    retryText: { color: colors.navTint, fontWeight: "600", marginTop: 4 },
    taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, minHeight: 44 },
    checkGlyph: { fontSize: 18, color: colors.navTint },
    taskText: { flex: 1, fontSize: typography.body.fontSize, color: colors.foreground },
    hintText: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 4 },
  });
}
