import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { StudySession } from "../../lib/api/study";
import { barHeight, BAR_MAX, studyWeek } from "../../lib/study/week";
import { formatMinutes } from "../../lib/study/formatMinutes";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

// "This week" card: total studied, a 7-day bar strip (today in orange, other
// days grey), the top subject and an optional per-category breakdown.
export function StudyWeekCard({
  sessions,
  nameFor,
  categoryFor,
}: {
  sessions: StudySession[];
  nameFor: (id: string | null) => string;
  categoryFor: (id: string | null) => string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Study", "Common"]);
  const [open, setOpen] = useState(false);

  const { days, total, count, thisWeek } = studyWeek(sessions);
  const busiest = Math.max(0, ...days.map((d) => d.minutes));
  const dayLabel = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString(i18n.language, { weekday: "short" });
  };

  const bySubject = new Map<string, { name: string; category: string; minutes: number }>();
  for (const s of thisWeek) {
    const key = s.subject_id ?? "__unspecified";
    const entry = bySubject.get(key) ?? { name: nameFor(s.subject_id), category: categoryFor(s.subject_id), minutes: 0 };
    entry.minutes += s.duration_minutes ?? 0;
    bySubject.set(key, entry);
  }
  const byCategory = new Map<string, { minutes: number; subjects: { name: string; minutes: number }[] }>();
  for (const { name, category, minutes } of bySubject.values()) {
    const entry = byCategory.get(category) ?? { minutes: 0, subjects: [] };
    entry.minutes += minutes;
    entry.subjects.push({ name, minutes });
    byCategory.set(category, entry);
  }
  const breakdown = [...byCategory.entries()]
    .map(([category, { minutes, subjects }]) => ({
      category,
      minutes,
      pct: total ? (minutes / total) * 100 : 0,
      subjects: subjects.sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
  const top = [...bySubject.values()].sort((a, b) => b.minutes - a.minutes)[0];
  const topPct = top && total ? Math.round((top.minutes / total) * 100) : 0;
  const segmentColors = [colors.orange, colors.bar, colors.primary, colors.mutedForeground];

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{t("Study:thisWeek")}</Text>
        <Text style={styles.muted}>{formatIcuPlural(t("Study:sessionCount"), count, i18n.language)}</Text>
      </View>
      <Text style={styles.big}>{formatMinutes(total)}</Text>
      {count === 0 && <Text style={styles.muted}>{t("Study:noSessionsThisWeek")}</Text>}

      <View style={styles.strip}>
        {days.map((d) => (
          <View
            key={d.date}
            style={styles.dayCol}
            accessible
            accessibilityLabel={
              d.minutes > 0
                ? t("Study:dayStudyTime", { day: dayLabel(d.date), time: formatMinutes(d.minutes) })
                : t("Study:dayNoStudy", { day: dayLabel(d.date) })
            }
          >
            <View style={styles.barBox}>
              <View
                style={[
                  styles.bar,
                  { height: barHeight(d.minutes, busiest) },
                  d.minutes === 0 ? { backgroundColor: colors.track } : { backgroundColor: d.isToday ? colors.orange : colors.bar },
                ]}
              />
            </View>
            <Text style={[styles.dayText, d.isToday && styles.dayTextToday]}>{dayLabel(d.date)}</Text>
          </View>
        ))}
      </View>

      {total > 0 && top && (
        <>
          <Text style={styles.muted}>
            <Text style={styles.strong}>{top.name}</Text> {t("Study:ledTheWeek")} {t("Study:percentOfYourTime", { pct: topPct })}
          </Text>
          <View style={styles.segmentBar}>
            {breakdown.map((b, i) => (
              <View key={b.category} style={{ width: `${b.pct}%`, backgroundColor: segmentColors[i % segmentColors.length] }} />
            ))}
          </View>
          <AnimatedPressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>
              {open ? t("Study:hideBreakdown") : t("Study:seeBreakdown")} {open ? "▴" : "▾"}
            </Text>
          </AnimatedPressable>
          {open &&
            breakdown.map((b, i) => (
              <View key={b.category} style={styles.catBlock}>
                <View style={styles.rowBetween}>
                  <View style={styles.catName}>
                    <View style={[styles.dot, { backgroundColor: segmentColors[i % segmentColors.length] }]} />
                    <Text style={[styles.strong, styles.capitalize]}>{b.category}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {formatMinutes(b.minutes)} · {Math.round(b.pct)}%
                  </Text>
                </View>
                {b.subjects.map((sub) => (
                  <View key={sub.name} style={[styles.rowBetween, styles.subRow]}>
                    <Text style={styles.muted}>{sub.name}</Text>
                    <Text style={styles.muted}>
                      {formatMinutes(sub.minutes)} · {total ? Math.round((sub.minutes / total) * 100) : 0}%
                    </Text>
                  </View>
                ))}
              </View>
            ))}
        </>
      )}
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
      gap: 8,
    },
    headRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
    label: { fontSize: typography.label.fontSize, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    strong: { fontWeight: "700", color: colors.foreground },
    capitalize: { textTransform: "capitalize" },
    big: { fontSize: 40, fontWeight: "800", letterSpacing: -1, color: colors.orange },
    strip: { flexDirection: "row", gap: 8, marginTop: 8 },
    dayCol: { flex: 1, alignItems: "center", gap: 6 },
    barBox: { height: BAR_MAX, width: "100%", justifyContent: "flex-end", alignItems: "center" },
    bar: { width: "100%", maxWidth: 28, borderRadius: radius.sm },
    dayText: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
    dayTextToday: { color: colors.primary, fontWeight: "800" },
    segmentBar: { flexDirection: "row", height: 8, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.track },
    toggle: { minHeight: 40, justifyContent: "center" },
    toggleText: { fontSize: typography.bodySmall.fontSize, fontWeight: "700", color: colors.primary },
    catBlock: { gap: 2, marginTop: 4 },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    catName: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    subRow: { marginLeft: 14 },
  });
}
