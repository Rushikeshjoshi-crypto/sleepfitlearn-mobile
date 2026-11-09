import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ContextEvent } from "../../lib/api/context";
import { mondayOf, shiftDate, weekDates } from "../../lib/habits/habitDays";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { HabitEventRow } from "./HabitEventRow";

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

// "Today" card: the week's day strip (Monday to Sunday, previous / next week)
// and the entries logged on the selected day. Future days can be viewed.
export function HabitsTodayCard({
  events,
  today,
  selected,
  weekStart,
  onSelect,
  onWeekChange,
  onEdit,
  onDelete,
}: {
  events: ContextEvent[];
  today: string;
  selected: string;
  weekStart: string;
  onSelect: (date: string) => void;
  onWeekChange: (monday: string) => void;
  onEdit: (events: ContextEvent[]) => void;
  onDelete: (events: ContextEvent[]) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Habits", "Common"]);
  const days = weekDates(weekStart);
  const isCurrentWeek = weekStart === mondayOf(today);

  // Several screen time syncs on one day show as one row.
  const dayEvents = events.filter((e) => e.event_date === selected);
  const screenTime = dayEvents.filter((e) => e.event_type === "screen_time");
  const rows = [
    ...(screenTime.length ? [screenTime] : []),
    ...dayEvents.filter((e) => e.event_type !== "screen_time").map((e) => [e]),
  ];

  const selectedLabel =
    selected === today
      ? t("Common:today")
      : parse(selected).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "short" });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.label}>{selectedLabel}</Text>
          <Text style={styles.month}>
            {parse(weekStart).toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}
          </Text>
        </View>
        <AnimatedPressable
          style={styles.navBtn}
          onPress={() => onWeekChange(shiftDate(weekStart, -7))}
          accessibilityRole="button"
          accessibilityLabel={t("Habits:previousWeek")}
        >
          <Text style={styles.navGlyph}>‹</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.navBtn, isCurrentWeek && styles.navDisabled]}
          disabled={isCurrentWeek}
          onPress={() => onWeekChange(shiftDate(weekStart, 7))}
          accessibilityRole="button"
          accessibilityLabel={t("Habits:nextWeek")}
        >
          <Text style={styles.navGlyph}>›</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.strip} accessibilityLabel={t("Habits:pickADay")}>
        {days.map((date) => {
          const on = date === selected;
          const isToday = date === today;
          const d = parse(date);
          return (
            <AnimatedPressable
              key={date}
              style={[styles.day, on && styles.dayOn]}
              onPress={() => onSelect(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={d.toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" })}
            >
              <Text style={[styles.dayName, on && styles.dayOnText]}>
                {d.toLocaleDateString(i18n.language, { weekday: "short" })}
              </Text>
              <Text style={[styles.dayNum, on && styles.dayOnText]}>{d.getDate()}</Text>
              <View style={[styles.dot, isToday && !on && { backgroundColor: colors.orange }]} />
            </AnimatedPressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {rows.length > 0 ? (
          rows.map((group) => (
            <HabitEventRow key={group[0].sk} events={group} onEdit={onEdit} onDelete={onDelete} />
          ))
        ) : (
          <Text style={styles.muted}>{selected > today ? t("Habits:futureDay") : t("Habits:nothingLoggedDay")}</Text>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
    head: { flexDirection: "row", alignItems: "center", gap: 4 },
    label: { fontSize: typography.label.fontSize, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
    month: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    navBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
    },
    navDisabled: { opacity: 0.35 },
    navGlyph: { fontSize: 22, lineHeight: 26, color: colors.foreground },
    strip: { flexDirection: "row", gap: 4 },
    day: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radius.md },
    dayOn: { backgroundColor: colors.orange },
    dayOnText: { color: colors.orangeForeground },
    dayName: { fontSize: 11, color: colors.mutedForeground },
    dayNum: { fontSize: typography.body.fontSize, fontWeight: "800", color: colors.foreground },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" },
    body: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, paddingVertical: 12 },
  });
}
