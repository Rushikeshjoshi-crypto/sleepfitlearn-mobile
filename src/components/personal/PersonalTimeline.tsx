import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { BP_META, METRIC_META, WEIGHT_META, type PersonalEntry } from "../../lib/api/fitness";
import type { RangeBand } from "../../lib/vitals/ranges";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { RangeDot } from "../vitals/RangeDot";

const PAGE_SIZE = 10;

export type TimelineInfo = { subtitle?: string; band: RangeBand; value?: string };

function entryDisplay(entry: PersonalEntry): string {
  if (entry.kind === "bp") return `${entry.systolic ?? "—"} / ${entry.diastolic ?? "—"} ${BP_META.unit}`;
  // The stored unit: older energy rows were typed in on a 1-5 scale.
  const unit = entry.unit || (entry.kind === "weight" ? WEIGHT_META.unit : METRIC_META[entry.kind].unit);
  return `${entry.value} ${unit}`;
}

// The history of one metric (entries arrive newest-first, already narrowed to
// the chosen metric): grouped by month, 10 rows at a time, then "Load earlier
// entries" fetches the next 90 days. Mobile port of the web's PersonalTimeline.
export function PersonalTimeline({
  entries,
  loading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  vitalsInfo,
  isReadOnly,
  onEdit,
  onDelete,
}: {
  entries: PersonalEntry[];
  loading: boolean;
  error: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  vitalsInfo: (entry: PersonalEntry) => TimelineInfo;
  // Calculated metrics (energy level) are read-only here.
  isReadOnly: (entry: PersonalEntry) => boolean;
  // Tapping a row: edit it (or explain why a synced row can't be).
  onEdit: (entry: PersonalEntry) => void;
  onDelete: (entry: PersonalEntry) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Personal", "Common"]);
  const dateFnsLocale = getDateFnsLocale(i18n.language);
  const [shown, setShown] = useState(PAGE_SIZE);

  if (loading) return <ActivityIndicator color={colors.orange} style={styles.loader} />;
  if (error && entries.length === 0) return <Text style={styles.error}>{error}</Text>;

  const visible = entries.slice(0, shown);
  const months: { key: string; label: string; entries: PersonalEntry[] }[] = [];
  for (const entry of visible) {
    const key = entry.date.slice(0, 7);
    const month = months.find((m) => m.key === key);
    if (month) month.entries.push(entry);
    else months.push({ key, label: format(parseISO(entry.date), "LLLL yyyy", { locale: dateFnsLocale }), entries: [entry] });
  }
  const remaining = entries.length - shown;

  return (
    <View>
      {entries.length === 0 ? (
        <Text style={styles.empty}>{t("Personal:noEntriesYetHistory")}</Text>
      ) : (
        months.map((month) => (
          <View key={month.key}>
            <Text style={styles.month}>{month.label}</Text>
            {month.entries.map((entry, i) => {
              const date = parseISO(entry.date);
              const dateLabel = isToday(date)
                ? t("Common:today")
                : isYesterday(date)
                  ? t("Common:yesterday")
                  : format(date, "EEE, d MMM", { locale: dateFnsLocale });
              const info = vitalsInfo(entry);
              const readOnly = isReadOnly(entry);
              const lines = info.subtitle ? info.subtitle.split("\n") : [];
              return (
                <AnimatedPressable
                  key={`${entry.kind}-${entry.date}-${i}`}
                  style={styles.row}
                  onPress={readOnly ? undefined : () => onEdit(entry)}
                  onLongPress={readOnly || entry.vitals ? undefined : () => onDelete(entry)}
                  disabled={readOnly}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowDate} numberOfLines={1}>
                      {dateLabel}
                    </Text>
                    {lines.map((line) => (
                      <Text key={line} style={styles.rowLine} numberOfLines={2}>
                        {line}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.valueWrap}>
                    <Text style={styles.value} numberOfLines={1}>
                      {info.value ?? entryDisplay(entry)}
                    </Text>
                    <RangeDot band={info.band} />
                  </View>
                  {!readOnly && !entry.vitals && (
                    <AnimatedPressable style={styles.trash} onPress={() => onDelete(entry)} accessibilityRole="button" accessibilityLabel={t("Common:deleteEntry")}>
                      <Text style={styles.trashText}>🗑</Text>
                    </AnimatedPressable>
                  )}
                </AnimatedPressable>
              );
            })}
          </View>
        ))
      )}

      <View style={styles.footer}>
        {remaining > 0 ? (
          <AnimatedPressable style={styles.moreButton} onPress={() => setShown((n) => n + PAGE_SIZE)}>
            <Text style={styles.moreText}>{t("Personal:showMore", { count: Math.min(PAGE_SIZE, remaining) })}</Text>
          </AnimatedPressable>
        ) : hasNextPage ? (
          <AnimatedPressable style={styles.moreButton} onPress={onLoadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <ActivityIndicator color={colors.orange} /> : <Text style={styles.moreText}>{t("Personal:loadEarlierEntries")}</Text>}
          </AnimatedPressable>
        ) : entries.length > 0 ? (
          <Text style={styles.end}>{t("Personal:reachedBeginning")}</Text>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    loader: { paddingVertical: 24 },
    error: { fontSize: 13, color: colors.destructive, paddingVertical: 12 },
    empty: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 24 },
    month: { fontSize: 12, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 12, paddingBottom: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    rowMain: { flex: 1, gap: 1 },
    rowDate: { fontSize: 14, fontWeight: "800", color: colors.foreground },
    rowLine: { fontSize: 12, color: colors.mutedForeground },
    valueWrap: { flexDirection: "row", alignItems: "center", flexShrink: 0, maxWidth: "45%" },
    value: { fontSize: 15, fontWeight: "800", color: colors.foreground },
    trash: { minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
    trashText: { fontSize: 16 },
    footer: { marginTop: 12 },
    moreButton: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    moreText: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    end: { fontSize: 12, color: colors.mutedForeground, textAlign: "center", paddingVertical: 4 },
  });
}
