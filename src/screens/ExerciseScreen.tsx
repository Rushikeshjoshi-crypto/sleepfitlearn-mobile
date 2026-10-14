import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import {
  deleteCustomActivity,
  deleteExerciseEntry,
  listActivityTypes,
  listCustomActivities,
  listExerciseEntries,
  upsertCustomActivity,
  type ActivityType,
  type CustomActivity,
  type ExerciseEntry,
} from "../lib/api/fitness";
import ExerciseComposer from "../components/composers/ExerciseComposer";
import BarChart from "../components/BarChart";
import TextPromptModal from "../components/TextPromptModal";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { localizedName } from "../lib/i18n/localizedName";
import { formatIcuPlural } from "../lib/i18n/icuPlural";
import { isoDaysAgo, todayISO } from "../lib/dateRange";
import { groupByDate, dateGroupLabel } from "../lib/groupByDate";
import { HistoryCard } from "../components/history/HistoryCard";
import { HistoryDateGroup } from "../components/history/HistoryDateGroup";
import { HistoryEntryRow } from "../components/history/HistoryEntryRow";
import SelectModal, { type SelectSection } from "../components/SelectModal";
import { loadErrorText } from "../lib/api/gateErrors";
import { format } from "date-fns";
import { getDateFnsLocale } from "../lib/i18n/dateFnsLocale";
import { computeStreak } from "../lib/exercise/streak";
import { activityGroupKeys, activityLabel, groupEntriesByActivity, type ActivityLookups } from "../lib/exercise/activityNames";
import { exerciseParts } from "../lib/exercise/combine";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SLOT_NUMBERS = [1, 2, 3, 4, 5];
// Monday-first short weekday names in the app language (2024-01-01 was a Monday).
function weekdayLabels(language: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(new Date(2024, 0, 1 + i), "EEE", { locale: getDateFnsLocale(language) }),
  );
}

// Mon=0 ... Sun=6, fixed regardless of today (matches the website's weekly chart).
function mondayIndex(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return (day + 6) % 7;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ExerciseScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Exercise", "Common"]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [customActivities, setCustomActivities] = useState<CustomActivity[]>([]);
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  // Both lookups loaded OK — only then can an unresolved id be called "Deleted".
  const [listsReady, setListsReady] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExerciseEntry | null>(null);
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [activityFilter, setActivityFilter] = useState("all");
  const [activityFilterPickerOpen, setActivityFilterPickerOpen] = useState(false);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  const refreshActivities = useCallback(() => {
    const onFail = (err: unknown) => setActivitiesError(loadErrorText(err, t("Exercise:activitiesLoadError")));
    setActivitiesError(null);
    setListsReady(false);
    const types = listActivityTypes().then(setActivityTypes);
    const custom = listCustomActivities().then(setCustomActivities);
    types.catch(onFail);
    custom.catch(onFail);
    Promise.allSettled([types, custom]).then((r) => setListsReady(r.every((x) => x.status === "fulfilled")));
  }, [t]);

  const refresh = useCallback(() => {
    listExerciseEntries()
      .then((data) => setEntries([...data].sort((a, b) => b.event_date.localeCompare(a.event_date))))
      .catch((err) => setError(loadErrorText(err, t("Exercise:loadError"))))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [t]);

  function onPullRefresh() {
    setRefreshing(true);
    refresh();
    refreshActivities();
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshActivities();
    }, [refresh, refreshActivities]),
  );

  // Names and group keys come from lib/exercise/activityNames (same rules as
  // the web app): keys are prefixed (id:/name:/__unknown__) and a title is
  // never a raw UUID or blank — "Unnamed / Deleted / Unknown activity".
  const lookups: ActivityLookups = { activityTypes, customActivities, language: i18n.language, listsReady };
  const fallbackLabels = {
    unnamed: t("Exercise:unnamedActivity"),
    deleted: t("Exercise:deletedActivity"),
    unknown: t("Exercise:unknownActivity"),
  };
  // "Cycling 30 min + Running 45 min" for a row combining 2+ activities;
  // otherwise the activity's name, as before.
  function entryTitle(entry: ExerciseEntry): string {
    const parts = exerciseParts(entry);
    if (parts.length < 2) return activityLabel(entry.activity_type_id, entry.custom_activity_name, lookups, fallbackLabels);
    return parts
      .map((p) => `${activityLabel(p.activity_type_id, p.custom_activity_name, lookups, fallbackLabels)} ${t("Exercise:minutesShort", { count: p.minutes })}`)
      .join(" + ");
  }
  // Title for a group key (also used by the activity filter).
  function activityDisplayName(key: string): string {
    if (key.startsWith("name:")) return key.slice("name:".length);
    if (key.startsWith("id:")) {
      const id = key.slice("id:".length);
      const sample = entries.find((e) => e.activity_type_id === id);
      return activityLabel(id, sample?.custom_activity_name, lookups, fallbackLabels);
    }
    return fallbackLabels.unknown;
  }

  function onDelete(sk: string) {
    Alert.alert(t("Common:deleteThisEntry"), undefined, [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteExerciseEntry(sk);
            if (editingEntry?.sk === sk) setEditingEntry(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            refresh();
          } catch (err) {
            Alert.alert(t("Common:couldntDeleteEntry"), err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  }

  async function onSaveSlotName(slot: number, name: string) {
    if (!name) return;
    try {
      await upsertCustomActivity(slot, name);
      refreshActivities();
    } catch (err) {
      Alert.alert(t("Exercise:saveActivityError"), err instanceof Error ? err.message : undefined);
    }
  }

  function onClearSlot(slot: number) {
    // Mobile-only confirm copy — web's deleteActivityDescription key covers a
    // longer, more detailed version of this same warning; kept as-is here
    // rather than substituting a much longer string into a native Alert.
    Alert.alert(t("Exercise:removeActivityTitle"), t("Exercise:removeActivityBody"), [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Exercise:remove"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCustomActivity(slot);
            refreshActivities();
          } catch (err) {
            Alert.alert(t("Exercise:deleteActivityError"), err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  }

  function entryValueLabel(entry: ExerciseEntry): string {
    return t("Exercise:minutesShort", { count: entry.duration_minutes ?? 0 });
  }

  function toggleActivityExpanded(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const slotFor = (slot: number) => customActivities.find((a) => a.slot === slot);

  const weekStart = isoDaysAgo(6);
  const weekEntries = entries.filter((e) => e.event_date >= weekStart);
  const weekTotalMinutes = weekEntries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  for (const e of weekEntries) byDay[mondayIndex(e.event_date)] += e.duration_minutes ?? 0;
  const chartData = weekdayLabels(i18n.language).map((label, i) => ({ label, value: byDay[i] }));
  const todayIdx = mondayIndex(todayISO());
  const streak = computeStreak(entries);

  // A combined row matches / is grouped under each of its activities.
  const filteredEntries =
    activityFilter === "all" ? entries : entries.filter((e) => activityGroupKeys(e).includes(activityFilter));
  const activityGroups = groupEntriesByActivity(filteredEntries, activityDisplayName);

  // The latest row's minutes for THIS activity (a combined row's share).
  function groupSummary(group: { items: ExerciseEntry[]; minutes: Map<string, number> }): string {
    const { items } = group;
    const countText = formatIcuPlural(t("Common:entryCount"), items.length, i18n.language);
    return `${countText} · ${t("Common:latestEntryPreview", {
      value: t("Exercise:minutesShort", { count: group.minutes.get(items[0].sk) ?? 0 }),
      date: dateGroupLabel(items[0].event_date),
    })}`;
  }

  // "My Activities" (named custom slots) first, then each activity type's
  // own category — mirrors web's useActivities() grouping.
  // name can be null/blank (older/other clients) — those can't be picked by name.
  const namedCustom = customActivities.filter((c) => (c.name ?? "").trim());
  const activityFilterSections: SelectSection[] = [
    { title: "", data: [{ label: t("Exercise:allActivities"), value: "all" }] },
    ...(namedCustom.length
      ? [{ title: "My Activities", data: namedCustom.map((c) => ({ label: c.name, value: `id:${c.id}` })) }]
      : []),
    ...Object.entries(
      activityTypes.reduce<Record<string, ActivityType[]>>((acc, a) => {
        (acc[a.category] ??= []).push(a);
        return acc;
      }, {}),
    ).map(([category, list]) => ({
      title: category,
      data: list.map((a) => ({ label: localizedName(a.name_i18n, i18n.language), value: `id:${a.id}` })),
    })),
  ];
  const activityFilterLabel =
    activityFilter === "all" ? t("Exercise:allActivities") : activityDisplayName(activityFilter);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <View style={styles.card}>
        <View style={styles.statHeader}>
          <View>
            <Text style={styles.statLabel}>{t("Exercise:thisWeek").toUpperCase()}</Text>
            <Text style={styles.statValue}>{weekTotalMinutes}m</Text>
            <Text style={styles.body}>{formatIcuPlural(t("Exercise:sessionCount"), weekEntries.length, i18n.language)}</Text>
          </View>
          {streak > 0 && (
            <Text style={styles.streakBadge}>
              🔥 {formatIcuPlural(t("Exercise:streakDays"), streak, i18n.language)}
            </Text>
          )}
        </View>
        <BarChart data={chartData} highlightIndex={todayIdx} />
      </View>

      <ExerciseComposer
        editingEntry={editingEntry}
        onSaved={() => {
          setEditingEntry(null);
          refresh();
        }}
        onCancelEdit={() => setEditingEntry(null)}
      />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("Exercise:myActivitiesTitle")}</Text>
        <Text style={styles.body}>{t("Exercise:myActivitiesSubtitle")}</Text>
        {SLOT_NUMBERS.map((slot) => {
          const activity = slotFor(slot);
          return (
            <View key={slot} style={styles.slotRow}>
              <AnimatedPressable style={{ flex: 1 }} onPress={() => setRenamingSlot(slot)}>
                <Text style={activity ? styles.inputText : styles.inputPlaceholder}>
                  {activity ? (activity.name ?? "").trim() || t("Exercise:unnamedActivity") : `Slot ${slot} — tap to add`}
                </Text>
              </AnimatedPressable>
              {activity && (
                <AnimatedPressable onPress={() => onClearSlot(slot)}>
                  <Text style={styles.removeText}>{t("Exercise:remove")}</Text>
                </AnimatedPressable>
              )}
            </View>
          );
        })}
      </View>

      {activitiesError && <Text style={styles.loadErrorText}>{activitiesError}</Text>}

      <View style={styles.filterRow}>
        <Text style={styles.sectionTitle}>{t("Exercise:historyTitle")}</Text>
        <AnimatedPressable style={styles.filterTrigger} onPress={() => setActivityFilterPickerOpen(true)}>
          <Text style={styles.filterTriggerText} numberOfLines={1}>
            {activityFilterLabel}
          </Text>
        </AnimatedPressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.navTint} />
      ) : activityGroups.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>{error ?? t("Exercise:noWorkoutsTitle")}</Text>
        </View>
      ) : (
        activityGroups.map((group) => {
          const dateGroups = groupByDate(group.items, (e) => e.event_date);
          const expanded = expandedActivities.has(group.key);
          return (
            <HistoryCard
              key={group.key}
              title={group.name}
              summaryText={groupSummary(group)}
              expanded={expanded}
              onToggle={() => toggleActivityExpanded(group.key)}
              expandLabel={t("Common:expandHistory", { title: group.name })}
              collapseLabel={t("Common:collapseHistory", { title: group.name })}
            >
              {dateGroups.map((dateGroup) => (
                <HistoryDateGroup key={dateGroup.label} label={dateGroup.label}>
                  {dateGroup.items.map((entry) => (
                    <HistoryEntryRow
                      key={entry.sk}
                      title={entryTitle(entry)}
                      subtitle={entry.intensity ? capitalize(entry.intensity) : undefined}
                      value={entryValueLabel(entry)}
                      onPress={() => setEditingEntry(entry)}
                      onLongPress={() => onDelete(entry.sk)}
                    />
                  ))}
                </HistoryDateGroup>
              ))}
            </HistoryCard>
          );
        })
      )}

      <TextPromptModal
        visible={renamingSlot !== null}
        title={`Name for slot ${renamingSlot ?? ""}`}
        initialValue={renamingSlot ? (slotFor(renamingSlot)?.name ?? "") : ""}
        onSubmit={(name) => renamingSlot && onSaveSlotName(renamingSlot, name)}
        onClose={() => setRenamingSlot(null)}
      />

      <SelectModal
        visible={activityFilterPickerOpen}
        title={t("Exercise:allActivities")}
        sections={activityFilterSections}
        onSelect={setActivityFilter}
        onClose={() => setActivityFilterPickerOpen(false)}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 10,
    },
    statHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    statLabel: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground, letterSpacing: 0.5 },
    statValue: { fontSize: 28, fontWeight: "700", color: colors.foreground },
    streakBadge: { fontSize: typography.bodySmall.fontSize, fontWeight: "600", color: colors.foreground },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    filterTrigger: {
      maxWidth: 160,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    filterTriggerText: { fontSize: typography.bodySmall.fontSize, color: colors.foreground, fontWeight: "500" },
    inputText: { color: colors.foreground },
    inputPlaceholder: { color: colors.mutedForeground },
    body: { fontSize: 14, color: colors.mutedForeground },
    loadErrorText: { fontSize: 14, color: colors.destructive },
    slotRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    removeText: { color: colors.destructive, fontSize: typography.bodySmall.fontSize, fontWeight: "500" },
  });
}
