import { useMemo, useState } from "react";
import { LayoutAnimation, StyleSheet, Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import type { ExerciseEntry } from "../../lib/api/fitness";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { formatMinutes } from "../../lib/formatMinutes";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

// The timeline shows this many sessions, then "Load more" adds the next batch.
export const TIMELINE_PAGE_SIZE = 10;

// Entries newest first -> months newest first, each with its entries in order.
export function groupByMonth(entries: ExerciseEntry[]): { month: string; entries: ExerciseEntry[] }[] {
  const months: { month: string; entries: ExerciseEntry[] }[] = [];
  for (const entry of entries) {
    const month = entry.event_date.slice(0, 7);
    const last = months.at(-1);
    if (last?.month === month) last.entries.push(entry);
    else months.push({ month, entries: [entry] });
  }
  return months;
}

// History as a timeline: one item per logged session, grouped by month,
// newest first. Tapping an item opens it with Edit / Delete.
export default function ExerciseTimeline({
  entries,
  today,
  titleFor,
  totalFor,
  onEdit,
  onDelete,
}: {
  entries: ExerciseEntry[];
  today: string;
  titleFor: (entry: ExerciseEntry) => string;
  // How many entries the entry's activity has in total.
  totalFor: (entry: ExerciseEntry) => number;
  onEdit: (entry: ExerciseEntry) => void;
  onDelete: (sk: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Exercise", "Common", "Sleep"]);
  const locale = getDateFnsLocale(i18n.language);
  const [visible, setVisible] = useState(TIMELINE_PAGE_SIZE);
  const [openSk, setOpenSk] = useState<string | null>(null);

  function toggle(sk: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSk((cur) => (cur === sk ? null : sk));
  }

  return (
    <View>
      {groupByMonth(entries.slice(0, visible)).map(({ month, entries: monthEntries }) => (
        <View key={month} style={styles.month}>
          <Text style={styles.monthTitle}>
            {format(parseISO(`${month}-01`), "LLLL yyyy", { locale }).toUpperCase()}
          </Text>
          <View style={styles.rail}>
            {monthEntries.map((entry) => {
              const isToday = entry.event_date === today;
              const day = format(parseISO(entry.event_date), "EEEE, d MMM", { locale });
              const isOpen = openSk === entry.sk;
              return (
                <View key={entry.sk}>
                  <View style={styles.dot} />
                  <AnimatedPressable
                    style={styles.item}
                    onPress={() => toggle(entry.sk)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    scaleTo={0.985}
                  >
                    <View style={styles.itemText}>
                      <Text style={[styles.day, isToday && styles.dayToday]}>
                        {isToday ? `${t("Common:today")} · ${day}` : day}
                      </Text>
                      <Text style={styles.title}>{titleFor(entry)}</Text>
                      <Text style={styles.day}>
                        {formatIcuPlural(t("Exercise:timelineEntryCount"), totalFor(entry), i18n.language)}
                      </Text>
                    </View>
                    <Text style={styles.value}>{formatMinutes(entry.duration_minutes ?? 0)}</Text>
                  </AnimatedPressable>
                  {isOpen && (
                    <View style={styles.details}>
                      {entry.intensity ? (
                        <Text style={styles.detailText}>
                          {t("Exercise:intensityLabel")}: {t(`Exercise:intensityLevels.${entry.intensity}`, { defaultValue: entry.intensity })}
                        </Text>
                      ) : null}
                      {entry.notes ? <Text style={styles.detailText}>{entry.notes}</Text> : null}
                      <View style={styles.actions}>
                        <AnimatedPressable style={styles.actionButton} onPress={() => onEdit(entry)}>
                          <Text style={styles.actionText}>{t("Sleep:edit")}</Text>
                        </AnimatedPressable>
                        <AnimatedPressable style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete(entry.sk)}>
                          <Text style={[styles.actionText, { color: colors.destructive }]}>{t("Common:delete")}</Text>
                        </AnimatedPressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {entries.length > visible && (
        <AnimatedPressable style={styles.loadMore} onPress={() => setVisible((v) => v + TIMELINE_PAGE_SIZE)}>
          <Text style={styles.loadMoreText}>
            {t("Exercise:loadMore", { count: Math.min(TIMELINE_PAGE_SIZE, entries.length - visible) })}
          </Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    month: { marginTop: 16 },
    monthTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.mutedForeground },
    rail: { marginTop: 6, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 20, marginLeft: 6 },
    dot: {
      position: "absolute",
      left: -28,
      top: 24,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.orange,
      backgroundColor: colors.background,
    },
    item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 12 },
    itemText: { flex: 1, minWidth: 0 },
    day: { fontSize: 12, color: colors.mutedForeground },
    dayToday: { fontWeight: "800", color: colors.primary },
    title: { fontSize: 16, fontWeight: "800", color: colors.foreground, marginVertical: 2 },
    value: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    details: { gap: 6, paddingBottom: 12 },
    detailText: { fontSize: 13, color: colors.mutedForeground },
    actions: { flexDirection: "row", gap: 10, marginTop: 4 },
    actionButton: {
      flex: 1,
      minHeight: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteButton: { borderColor: colors.destructiveBorder },
    actionText: { fontSize: 13, fontWeight: "700", color: colors.foreground },
    loadMore: {
      marginTop: 16,
      minHeight: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    loadMoreText: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  });
}
