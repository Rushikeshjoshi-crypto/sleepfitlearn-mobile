import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ExerciseEntry } from "../../lib/api/fitness";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { barHeights, currentWeek, streakDays } from "../../lib/exercise/week";
import { formatMinutes } from "../../lib/formatMinutes";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// This week's summary: total time + sessions (Monday to Sunday) and seven
// mini bars — height by that day's time (longest = 60px), today orange, past
// days grey, no workouts = a short stub.
export default function ExerciseWeekCard({ entries, today }: { entries: ExerciseEntry[]; today: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Exercise");
  const week = currentWeek(entries, today);
  const heights = barHeights(week.days.map((d) => d.minutes));
  const streak = streakDays(entries, today);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t("thisWeek").toUpperCase()}</Text>
      <Text style={styles.total}>{formatMinutes(week.totalMinutes)}</Text>
      <Text style={styles.muted}>{formatIcuPlural(t("sessionCount"), week.sessions, i18n.language)}</Text>
      {streak > 0 && <Text style={styles.muted}>{formatIcuPlural(t("streakDays"), streak, i18n.language)}</Text>}

      <View style={styles.bars}>
        {week.days.map((day, i) => {
          const name = t(`dayLabels.${DAY_KEYS[i]}`);
          const color = day.minutes ? (day.isToday ? colors.orange : colors.bar) : colors.track;
          return (
            <View
              key={day.date}
              style={styles.barCol}
              accessible
              accessibilityLabel={`${name}: ${day.minutes ? formatMinutes(day.minutes) : t("restDay")}`}
            >
              <View style={[styles.bar, { height: heights[i], backgroundColor: color }]} />
              <Text style={[styles.dayLetter, day.isToday && styles.dayLetterToday]}>{name.charAt(0)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 2,
    },
    label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.primary },
    total: { fontSize: 44, lineHeight: 50, fontWeight: "800", color: colors.orange, marginTop: 2 },
    muted: { fontSize: 13, color: colors.mutedForeground },
    bars: { flexDirection: "row", gap: 8, alignItems: "flex-end", height: 84, marginTop: 14 },
    barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
    bar: { width: "100%", borderRadius: radius.sm },
    dayLetter: { fontSize: 11, color: colors.mutedForeground },
    dayLetterToday: { fontWeight: "800", color: colors.primary },
  });
}
