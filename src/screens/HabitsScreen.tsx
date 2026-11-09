import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { effectiveScreenTimeEvents } from "../lib/habits/screenTimeAverage";
import { mondayOf } from "../lib/habits/habitDays";
import { errorReason } from "../lib/habits/errorReason";
import {
  listContextEvents,
  deleteContextEvent,
  type ContextEvent,
  type ContextEventType,
  prepareHabitHistory,
} from "../lib/api/context";
import {
  createRoutineTask,
  deleteRoutineTask,
  listRoutineTasks,
  type RoutineTask,
} from "../lib/api/routineTasks";
import { todayISO } from "../lib/dateRange";
import { formatMinutes } from "../lib/formatMinutes";
import { useTheme } from "../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { AppHeader } from "../components/AppHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import TextPromptModal from "../components/TextPromptModal";
import { HabitEventEditModal } from "../components/habits/HabitEventEditModal";
import { HabitsTodayCard } from "../components/habits/HabitsTodayCard";
import { HabitsWeekCard } from "../components/habits/HabitsWeekCard";
import { HabitsMonthCard } from "../components/habits/HabitsMonthCard";
import { MostUsedAppsCard } from "../components/habits/MostUsedAppsCard";
import { HabitHistoryCard } from "../components/habits/HabitHistoryCard";
import { loadErrorText } from "../lib/api/gateErrors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REFRESH_INTERVAL_MS = 30_000;

type Filter = "all" | ContextEventType;

export default function HabitsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Habits", "Common", "Nav"]);
  const EVENT_TYPE_LABEL: Record<ContextEventType, string> = {
    screen_time: t("Habits:eventTypes.screen_time"),
    routine: t("Habits:eventTypes.routine"),
  };

  // The All habits filter narrows the dashboard (week ring, consistency,
  // apps chart, routine checklist, history tabs) to one habit type.
  const [filter, setFilter] = useState<Filter>("all");
  const [historyTab, setHistoryTab] = useState<ContextEventType>("screen_time");
  const today = todayISO();
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [enabled, setEnabled] = useState(false);
  const [summary, setSummary] = useState<ScreenTimeTodaySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<ContextEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
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
    const [tracking, todaySummary] = await Promise.all([isTracking(), getTodaySummary()]);
    setEnabled(tracking);
    setSummary(todaySummary);
  }, []);

  const refreshHistory = useCallback(() => {
    return listContextEvents()
      // Events without a real event_date are skipped (a null one used to make
      // the whole history fail to load); see prepareHabitHistory.
      // A screen time day with a snapshot is shown from it alone (its old delta rows would double-count).
      .then((events) => {
        setHistory(prepareHabitHistory(effectiveScreenTimeEvents(events)));
        setHistoryError(null);
      })
      .catch((err) => setHistoryError(loadErrorText(err, t("Habits:loadHistoryError"))))
      .finally(() => setHistoryLoading(false));
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

  // Confirms first, shows a loading state on the row, shows the server's own
  // reason when it fails and re-reads the list so it matches the server.
  function onDeleteTask(task: RoutineTask) {
    Alert.alert(t("Habits:deleteTaskTitle"), `"${task.text}"\n${t("Habits:deleteTaskBody")}`, [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          setDeletingTaskId(task.id);
          try {
            await deleteRoutineTask(task.id);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setRoutineTasks((prev) => prev.filter((x) => x.id !== task.id));
            setCheckedTaskIds((prev) => {
              if (!prev.has(task.id)) return prev;
              const next = new Set(prev);
              next.delete(task.id);
              return next;
            });
          } catch (err) {
            Alert.alert(
              t("Habits:deleteTaskErrorTitle"),
              t("Habits:deleteFailedWithReason", { reason: errorReason(err, t("Habits:networkErrorReason")) }),
            );
            await refreshRoutineTasks();
          } finally {
            setDeletingTaskId(null);
          }
        },
      },
    ]);
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

  function onSelectDay(date: string) {
    setSelectedDay(date);
    setWeekStart(mondayOf(date));
  }

  const showScreenTime = filter !== "routine";
  const showRoutine = filter !== "screen_time";

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
          { value: "all" as const, label: t("Habits:allHabits") },
          { value: "screen_time" as const, label: t("Habits:eventTypes.screen_time") },
          { value: "routine" as const, label: t("Habits:eventTypes.routine") },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {showScreenTime && !enabled && (
        <AnimatedPressable style={styles.card} onPress={() => navigation.navigate("Connections")} accessibilityRole="button">
          <Text style={styles.body}>{t("Habits:turnOnInConnections")}</Text>
        </AnimatedPressable>
      )}

      <HabitsTodayCard
        events={history.filter((e) => filter === "all" || e.event_type === filter)}
        today={today}
        selected={selectedDay}
        weekStart={weekStart}
        onSelect={setSelectedDay}
        onWeekChange={setWeekStart}
        onEdit={setEditingEvents}
        onDelete={confirmDeleteEvents}
      />

      {showScreenTime && (
        <View style={styles.card}>
          <Text style={styles.label}>{t("Common:today")}</Text>
          <Text style={styles.bigValue}>
            {formatMinutes(summary?.totalMinutes ?? 0)}{" "}
            <Text style={styles.bigCaption}>{t("Habits:screenTimeEmptyLabel")}</Text>
          </Text>
          {!summary || summary.apps.length === 0 ? (
            <Text style={styles.body}>{t("Habits:noAppUsageToday")}</Text>
          ) : (
            [...summary.apps]
              .sort((a, b) => b.minutesUsed - a.minutesUsed)
              .map((item) => (
                <View key={item.packageName} style={styles.appRow}>
                  <Text style={styles.appName}>{item.appName}</Text>
                  <Text style={styles.appMinutes}>{formatMinutes(item.minutesUsed)}</Text>
                </View>
              ))
          )}
        </View>
      )}

      <HabitsWeekCard events={history} filter={filter} />

      <HabitsMonthCard events={history} today={today} filter={filter} selected={selectedDay} onSelect={onSelectDay} />

      {showScreenTime && <MostUsedAppsCard events={history} today={today} />}

      {showRoutine && (
        <View style={styles.card}>
          <Text style={styles.title}>{t("Habits:eventTypes.routine")}</Text>

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
              <Pressable
                onPress={() => {
                  setRoutineLoading(true);
                  refreshRoutineTasks();
                }}
              >
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
                onLongPress={() => onDeleteTask(task)}
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

      <HabitHistoryCard
        events={history}
        filter={filter}
        tab={historyTab}
        onTabChange={setHistoryTab}
        loading={historyLoading}
        error={historyError}
        onEdit={setEditingEvents}
        onDelete={confirmDeleteEvents}
      />

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
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 16, gap: 12, paddingBottom: 40 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    connectionsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    chevron: { fontSize: 24, color: colors.mutedForeground },
    toggleLabel: { flex: 1, gap: 2 },
    toggleTitle: { fontSize: typography.body.fontSize, fontWeight: "700", color: colors.foreground },
    toggleSubtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    label: { fontSize: typography.label.fontSize, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
    title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    bigValue: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8, color: colors.orange },
    bigCaption: { fontSize: typography.bodySmall.fontSize, fontWeight: "400", letterSpacing: 0, color: colors.mutedForeground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    appRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    appName: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    appMinutes: { fontSize: typography.body.fontSize, fontWeight: "800", color: colors.foreground },
    errorText: { color: colors.destructive },
    addTaskButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    addTaskButtonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "700" },
    retryText: { color: colors.navTint, fontWeight: "600", marginTop: 4 },
    taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, minHeight: 44 },
    checkGlyph: { fontSize: 18, color: colors.orange },
    taskText: { flex: 1, fontSize: typography.body.fontSize, color: colors.foreground },
    hintText: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 4 },
  });
}
