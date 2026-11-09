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
import ExerciseWeekCard from "../components/exercise/ExerciseWeekCard";
import ExerciseTimeline from "../components/exercise/ExerciseTimeline";
import TextPromptModal from "../components/TextPromptModal";
import { useTheme } from "../theme/ThemeContext";
import { radius, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { localizedName } from "../lib/i18n/localizedName";
import { todayISO } from "../lib/dateRange";
import SelectModal, { type SelectSection } from "../components/SelectModal";
import { loadErrorText } from "../lib/api/gateErrors";
import { activityGroupKeys, activityLabel, groupEntriesByActivity, type ActivityLookups } from "../lib/exercise/activityNames";
import { exerciseParts } from "../lib/exercise/combine";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SLOT_NUMBERS = [1, 2, 3, 4, 5];

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
  const [manageOpen, setManageOpen] = useState(false);

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

  const slotFor = (slot: number) => customActivities.find((a) => a.slot === slot);
  const today = todayISO();

  // A combined row matches each of its activities.
  const filteredEntries =
    activityFilter === "all" ? entries : entries.filter((e) => activityGroupKeys(e).includes(activityFilter));
  // Total entries per activity (over the whole history, not just the tab).
  const totals = new Map(groupEntriesByActivity(entries, activityDisplayName).map((g) => [g.key, g.items.length]));

  // Tabs: All + one per named custom activity slot (share a value with the filter).
  const tabs = customActivities
    .filter((c) => (c.name ?? "").trim())
    .sort((a, b) => a.slot - b.slot)
    .map((c) => ({ key: `id:${c.id}`, name: (c.name ?? "").trim() }));

  // "My Activities" (named custom slots) first, then each activity type's
  // own category — mirrors web's useActivities() grouping.
  // name can be null/blank (older/other clients) — those can't be picked by name.
  const namedCustom = customActivities.filter((c) => (c.name ?? "").trim());
  const activityFilterSections: SelectSection[] = [
    { title: "", data: [{ label: t("Exercise:allActivities"), value: "all" }] },
    ...(namedCustom.length
      ? [{ title: t("Exercise:myActivities"), data: namedCustom.map((c) => ({ label: c.name, value: `id:${c.id}` })) }]
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
      <ExerciseWeekCard entries={entries} today={today} />

      <ExerciseComposer
        editingEntry={editingEntry}
        onSaved={() => {
          setEditingEntry(null);
          refresh();
        }}
        onCancelEdit={() => setEditingEntry(null)}
      />

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>{t("Exercise:historyTitle")}</Text>
        <View style={styles.controls}>
          <AnimatedPressable
            style={[styles.control, styles.filterControl]}
            onPress={() => setActivityFilterPickerOpen(true)}
            accessibilityLabel={t("Exercise:filterByActivity")}
          >
            <Text style={styles.controlText} numberOfLines={1}>
              {activityFilterLabel}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.control}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setManageOpen((v) => !v);
            }}
            accessibilityState={{ expanded: manageOpen }}
          >
            <Text style={styles.controlText} numberOfLines={1}>
              {t("Exercise:manageActivities")}
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      {manageOpen && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("Exercise:myActivitiesTitle")}</Text>
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
      )}

      {activitiesError && <Text style={styles.loadErrorText}>{activitiesError}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {[{ key: "all", name: t("Exercise:allActivities") }, ...tabs].map((tab) => {
          const on = activityFilter === tab.key;
          return (
            <AnimatedPressable
              key={tab.key}
              style={[styles.tab, on && styles.tabActive]}
              onPress={() => setActivityFilter(tab.key)}
              accessibilityState={{ selected: on }}
              scaleTo={0.98}
            >
              <Text style={[styles.tabText, on && styles.tabTextActive]} numberOfLines={1}>
                {tab.name}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.navTint} />
      ) : filteredEntries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {error ?? (activityFilter === "all" ? t("Exercise:noWorkoutsTitle") : t("Exercise:noWorkoutsForActivity"))}
          </Text>
          {!error && activityFilter === "all" && <Text style={styles.body}>{t("Exercise:noWorkoutsSubtitle")}</Text>}
        </View>
      ) : (
        // key: a new tab starts again from the first 10 sessions.
        <ExerciseTimeline
          key={activityFilter}
          entries={filteredEntries}
          today={today}
          titleFor={entryTitle}
          totalFor={(entry) => totals.get(activityGroupKeys(entry)[0]) ?? 1}
          onEdit={(entry) => setEditingEntry(entry)}
          onDelete={onDelete}
        />
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
    container: { padding: 16, gap: 12, paddingBottom: 40 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    cardTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    historyHeader: { gap: 10, marginTop: 8 },
    historyTitle: { fontSize: 22, fontWeight: "800", color: colors.foreground },
    controls: { flexDirection: "row", gap: 8 },
    control: {
      minHeight: 40,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    filterControl: { flex: 1 },
    controlText: { fontSize: 13, fontWeight: "700", color: colors.foreground },
    tabsScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabs: { gap: 20 },
    tab: { minHeight: 44, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.orange },
    tabText: { fontSize: 14, fontWeight: "500", color: colors.mutedForeground },
    tabTextActive: { fontWeight: "800", color: colors.primary },
    empty: { gap: 4, paddingTop: 8 },
    emptyTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground },
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
    removeText: { color: colors.destructive, fontSize: 13, fontWeight: "600" },
  });
}
