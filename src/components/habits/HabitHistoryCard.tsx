import { useMemo, useState } from "react";
import { ActivityIndicator, LayoutAnimation, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ContextEvent, ContextEventType } from "../../lib/api/context";
import { dateGroupLabel } from "../../lib/groupByDate";
import { isoDaysAgo } from "../../lib/dateRange";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { HISTORY_PAGE_SIZE, historyRows, initialCount } from "../../lib/habits/habitDays";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { HabitEventRow, habitValueLabel } from "./HabitEventRow";

const HABIT_TYPES: ContextEventType[] = ["screen_time", "routine"];

function HistoryList({
  rows,
  onEdit,
  onDelete,
}: {
  rows: ContextEvent[][];
  onEdit: (events: ContextEvent[]) => void;
  onDelete: (events: ContextEvent[]) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Habits");
  const [shown, setShown] = useState(() => initialCount(rows, isoDaysAgo(6)));

  if (rows.length === 0) return <Text style={styles.empty}>{t("noEntriesLoggedYet")}</Text>;

  const months: { key: string; label: string; rows: ContextEvent[][] }[] = [];
  for (const row of rows.slice(0, shown)) {
    const key = row[0].event_date.slice(0, 7);
    const month = months.find((m) => m.key === key);
    if (month) month.rows.push(row);
    else {
      const [y, m] = key.split("-").map(Number);
      months.push({
        key,
        label: new Date(y, m - 1, 1, 12).toLocaleDateString(i18n.language, { month: "long", year: "numeric" }),
        rows: [row],
      });
    }
  }
  const remaining = rows.length - shown;

  return (
    <View>
      {months.map((month) => (
        <View key={month.key}>
          <Text style={styles.monthLabel}>{month.label}</Text>
          {month.rows.map((row) => (
            <HabitEventRow key={row[0].sk} events={row} showDate onEdit={onEdit} onDelete={onDelete} />
          ))}
        </View>
      ))}
      {remaining > 0 && (
        <AnimatedPressable
          style={styles.more}
          accessibilityRole="button"
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShown((n) => n + HISTORY_PAGE_SIZE);
          }}
        >
          <Text style={styles.moreText}>{t("showMore", { count: Math.min(HISTORY_PAGE_SIZE, remaining) })}</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

// History: one card, a tab per habit type (the All habits filter narrows the
// tabs), a one-line summary, then the active type's entries grouped by month,
// the last 7 days first and 10 more per "Show more".
export function HabitHistoryCard({
  events,
  filter,
  tab,
  onTabChange,
  loading,
  error,
  onEdit,
  onDelete,
}: {
  events: ContextEvent[];
  filter: string;
  tab: ContextEventType;
  onTabChange: (tab: ContextEventType) => void;
  loading: boolean;
  error: string | null;
  onEdit: (events: ContextEvent[]) => void;
  onDelete: (events: ContextEvent[]) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Habits", "Common"]);

  const types = filter === "all" ? HABIT_TYPES : HABIT_TYPES.filter((x) => x === filter);
  const active = types.includes(tab) ? tab : types[0];
  const rows = historyRows(events, active);

  let line: string | null = null;
  if (rows.length > 0) {
    const count = rows.reduce((n, r) => n + r.length, 0);
    line = `${formatIcuPlural(t("Habits:entryCount"), count, i18n.language)} · ${t("Habits:latestEntryPreview", {
      value: habitValueLabel(rows[0]),
      date: dateGroupLabel(rows[0][0].event_date),
    })}`;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("Habits:historyTitle")}</Text>
      {loading ? (
        <ActivityIndicator color={colors.navTint} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <View style={styles.tabs} accessibilityLabel={t("Habits:historyTabsLabel")}>
            {types.map((type) => (
              <AnimatedPressable
                key={type}
                style={[styles.tab, active === type && styles.tabOn]}
                onPress={() => onTabChange(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: active === type }}
              >
                <Text style={[styles.tabText, active === type && styles.tabTextOn]}>{t(`Habits:eventTypes.${type}`)}</Text>
              </AnimatedPressable>
            ))}
          </View>
          {line && <Text style={styles.muted}>{line}</Text>}
          {/* key: changing the tab or the filter starts again from the first page. */}
          <HistoryList key={`${active}-${filter}`} rows={rows} onEdit={onEdit} onDelete={onDelete} />
        </>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
    title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    error: { fontSize: typography.bodySmall.fontSize, color: colors.destructive },
    empty: { fontSize: typography.body.fontSize, color: colors.mutedForeground, paddingVertical: 16, textAlign: "center" },
    tabs: { flexDirection: "row", gap: 6, backgroundColor: colors.soft, borderRadius: radius.md, padding: 4 },
    tab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
    tabOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.orange },
    tabText: { fontSize: typography.bodySmall.fontSize, fontWeight: "600", color: colors.mutedForeground },
    tabTextOn: { color: colors.primary, fontWeight: "800" },
    monthLabel: {
      fontSize: typography.label.fontSize,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.mutedForeground,
      paddingTop: 10,
      paddingBottom: 2,
    },
    more: { marginTop: 12, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
    moreText: { fontSize: typography.bodySmall.fontSize, fontWeight: "700", color: colors.foreground },
  });
}
