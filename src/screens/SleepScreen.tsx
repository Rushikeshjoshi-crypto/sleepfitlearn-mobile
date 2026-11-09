import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
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
import SleepCalendar from "../components/sleep/SleepCalendar";
import SleepDayCard from "../components/sleep/SleepDayCard";
import { useTheme } from "../theme/ThemeContext";
import { radius, type ColorPalette } from "../theme/palettes";
import { AppHeader } from "../components/AppHeader";
import DateRangeFilterBar from "../components/DateRangeFilterBar";
import { isWithinDateRange, type DateFilterValue } from "../lib/dateRangeFilter";
import { isoDaysAgo, todayISO } from "../lib/dateRange";
import { monthOf, monthRange, shiftMonth } from "../lib/sleep/stats";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Same as the web app's SleepView: a month calendar where each night is a
// coloured tile, the selected night's details and the log card. Each month
// loads its own nights; the range pills highlight the nights in range and
// limit the month summary to them.
export default function SleepScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Sleep", "Common"]);
  const today = todayISO();
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<SleepEntry | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
  const [month, setMonth] = useState(() => monthOf(isoDaysAgo(1)));
  const [selected, setSelected] = useState<string | null>(() => isoDaysAgo(1));
  const [logRequest, setLogRequest] = useState<{ date: string; n: number } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const composerY = useRef(0);

  const refresh = useCallback(() => {
    listSleepEntries(monthRange(month))
      .then((data) => {
        setEntries([...data].sort((a, b) => b.sleep_date.localeCompare(a.sleep_date)));
        setError(null);
      })
      .catch((err) => setError(loadErrorText(err, t("Sleep:loadError"))))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [month, t]);

  function onPullRefresh() {
    setRefreshing(true);
    refresh();
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Re-fetch whenever the month changes, not only on focus.
  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function onDateFilterChange(next: DateFilterValue | null) {
    setDateFilter(next);
    if (next) {
      setMonth(monthOf(next.to));
      setSelected(null);
    }
  }

  const inRange = (date: string) => !dateFilter || isWithinDateRange(date, dateFilter);
  // Only this month's nights.
  const monthEntries = entries.filter((e) => isWithinDateRange(e.sleep_date, monthRange(month)));
  const selectedEntry = selected ? monthEntries.find((e) => e.sleep_date === selected) : undefined;

  function scrollToComposer() {
    scrollRef.current?.scrollTo({ y: Math.max(0, composerY.current - 8), animated: true });
  }

  function onSelectDay(date: string, entry: SleepEntry | undefined) {
    setSelected(date);
    if (!entry) {
      setEditingEntry(null);
      setLogRequest((r) => ({ date, n: (r?.n ?? 0) + 1 }));
      scrollToComposer();
    }
  }

  function onMonthChange(by: number) {
    setMonth((m) => shiftMonth(m, by));
    setSelected(null);
  }

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
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <AppHeader title={t("Sleep:pageTitle")} />

      <DateRangeFilterBar value={dateFilter} onChange={onDateFilterChange} />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.navTint} />
      ) : (
        <SleepCalendar
          month={month}
          today={today}
          entries={monthEntries}
          selected={selected}
          inRange={inRange}
          onSelect={onSelectDay}
          onMonthChange={onMonthChange}
        />
      )}

      <SleepDayCard
        date={selected}
        entry={selectedEntry}
        onEdit={(entry) => {
          setEditingEntry(entry);
          scrollToComposer();
        }}
        onDelete={(entry) => onDelete(entry.sk)}
      />

      <View onLayout={(e) => (composerY.current = e.nativeEvent.layout.y)}>
        <SleepComposer
          editingEntry={editingEntry}
          request={logRequest}
          onSaved={(savedDate) => {
            setEditingEntry(null);
            if (savedDate) {
              setSelected(savedDate);
              setMonth(monthOf(savedDate));
            }
            refresh();
          }}
          onCancelEdit={() => setEditingEntry(null)}
        />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 16, gap: 12, paddingBottom: 40 },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      backgroundColor: colors.destructiveBg,
      borderRadius: radius.lg,
      padding: 12,
    },
    errorText: { color: colors.destructive },
  });
}
