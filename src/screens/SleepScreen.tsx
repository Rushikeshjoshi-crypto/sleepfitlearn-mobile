import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { deleteSleepEntry, listSleepEntries, type SleepEntry } from "../lib/api/sleep";
import { loadErrorText } from "../lib/api/gateErrors";
import SleepComposer from "../components/composers/SleepComposer";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { AppHeader } from "../components/AppHeader";
import DateRangeFilterBar from "../components/DateRangeFilterBar";
import type { DateFilterValue } from "../lib/dateRangeFilter";
import { isoDaysAgo } from "../lib/dateRange";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Same as the web app's SleepView: a 30-day rolling window by default, grown
// 30 days at a time by "Load earlier nights"; history counts as exhausted once
// a bigger window returns no more nights than the previous one.
const WINDOW_DAYS = 30;

export default function SleepScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Sleep", "Common"]);
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<SleepEntry | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
  const [rangeDays, setRangeDays] = useState(WINDOW_DAYS);
  const [exhausted, setExhausted] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const previousCount = useRef<number | null>(null);
  // Only a "Load earlier" fetch can prove the start of history was reached —
  // a focus/pull/save refresh of the same window returns the same count.
  const growing = useRef(false);

  // While a filter is active, fetch exactly its range; otherwise the rolling
  // window above. Matches web's SleepView.
  const refresh = useCallback(() => {
    listSleepEntries(dateFilter ? { from: dateFilter.from, to: dateFilter.to } : { from: isoDaysAgo(rangeDays), to: isoDaysAgo(0) })
      .then((data) => {
        setEntries([...data].sort((a, b) => b.sleep_date.localeCompare(a.sleep_date)));
        setError(null);
        if (!dateFilter) {
          if (growing.current && previousCount.current !== null && data.length <= previousCount.current) setExhausted(true);
          previousCount.current = data.length;
        }
        growing.current = false;
      })
      .catch((err) => setError(loadErrorText(err, t("Sleep:loadError"))))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
        setLoadingEarlier(false);
      });
  }, [dateFilter, rangeDays, t]);

  function loadEarlier() {
    growing.current = true;
    setLoadingEarlier(true);
    setRangeDays((d) => d + WINDOW_DAYS);
  }

  function backToRecent() {
    setRangeDays(WINDOW_DAYS);
    setExhausted(false);
    previousCount.current = null;
  }

  function onDateFilterChange(next: DateFilterValue | null) {
    setDateFilter(next);
    setExhausted(false);
    previousCount.current = null;
  }

  function onPullRefresh() {
    setRefreshing(true);
    refresh();
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Re-fetch whenever the active date filter changes, not only on focus.
  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter]);

  // "Load earlier" / "Back to recent" change the window without a spinner reset.
  useEffect(() => {
    if (!dateFilter) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  function onDelete(sk: string) {
    Alert.alert(t("Common:deleteThisEntry"), undefined, [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSleepEntry(sk);
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <AppHeader title={t("Sleep:pageTitle")} />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SleepComposer
        editingEntry={editingEntry}
        onSaved={() => {
          setEditingEntry(null);
          refresh();
        }}
        onCancelEdit={() => setEditingEntry(null)}
      />

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>{t("Sleep:recentNights")}</Text>
          {!dateFilter && rangeDays > WINDOW_DAYS && (
            <AnimatedPressable style={styles.linkButton} onPress={backToRecent}>
              <Text style={styles.linkText}>↑ {t("Sleep:backToRecent")}</Text>
            </AnimatedPressable>
          )}
        </View>
        <DateRangeFilterBar value={dateFilter} onChange={onDateFilterChange} />
        {loading ? (
          <ActivityIndicator color={colors.navTint} />
        ) : entries.length === 0 ? (
          <Text style={styles.body}>
            {dateFilter ? t("Common:dateFilter.noResultsForRange") : t("Sleep:noNightsTitle")}
          </Text>
        ) : (
          entries.map((entry) => (
            <AnimatedPressable
              key={entry.sk}
              style={styles.entryRow}
              onLongPress={() => onDelete(entry.sk)}
              onPress={() => setEditingEntry(entry)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.entryDate}>{entry.sleep_date}</Text>
                {(entry.bedtime || entry.wake_time) && (
                  <Text style={styles.body}>
                    {entry.bedtime ?? "?"} → {entry.wake_time ?? "?"}
                  </Text>
                )}
              </View>
              <Text style={styles.body}>{entry.duration_hours ?? "?"} h</Text>
              <AnimatedPressable
                style={styles.deleteButton}
                onPress={() => onDelete(entry.sk)}
                accessibilityRole="button"
                accessibilityLabel={t("Common:deleteEntry")}
              >
                <Text style={styles.deleteGlyph}>🗑</Text>
              </AnimatedPressable>
            </AnimatedPressable>
          ))
        )}
        {!loading && !dateFilter && (
          <View style={styles.moreRow}>
            {exhausted ? (
              <Text style={styles.moreHint}>{t("Sleep:reachedBeginning")}</Text>
            ) : (
              <AnimatedPressable style={styles.moreButton} onPress={loadEarlier} disabled={loadingEarlier}>
                {loadingEarlier ? (
                  <ActivityIndicator color={colors.navTint} />
                ) : (
                  <Text style={styles.moreText}>{t("Sleep:loadEarlierNights")}</Text>
                )}
              </AnimatedPressable>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    linkButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 4 },
    linkText: { fontSize: 13, color: colors.navTint },
    deleteButton: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center", marginLeft: 4 },
    deleteGlyph: { fontSize: 15, color: colors.destructive },
    moreRow: { alignItems: "center", paddingTop: 10 },
    moreButton: {
      minHeight: 40,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    moreText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    moreHint: { fontSize: 12, color: colors.mutedForeground },
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 4,
    },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      backgroundColor: colors.destructiveBg,
      borderRadius: 20,
      padding: 12,
    },
    errorText: { color: colors.destructive },
    entryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    entryDate: { fontSize: typography.body.fontSize, fontWeight: "500", color: colors.foreground },
  });
}
