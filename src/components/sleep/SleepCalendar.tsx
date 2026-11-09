import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { useTranslation } from "react-i18next";
import type { SleepEntry } from "../../lib/api/sleep";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { formatHours, sleepTone, sleepZone, type SleepTone } from "../../lib/sleep/quality";
import { canGoToNextMonth, monthCells, sleepSummary, splitHours } from "../../lib/sleep/stats";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

// "A bit short" tiles: a lighter orange (same value as the web's --sl-good).
const GOOD_BG = "#F2A27C";
const GOOD_FG = "#4A1800";

function toneColors(colors: ColorPalette, tone: SleepTone | "empty"): { bg: string; fg: string } {
  if (tone === "great") return { bg: colors.orange, fg: colors.orangeForeground };
  if (tone === "good") return { bg: GOOD_BG, fg: GOOD_FG };
  if (tone === "short") return { bg: colors.destructive, fg: "#FFFFFF" };
  return { bg: colors.soft, fg: colors.mutedForeground };
}

// Month heatmap: each night is a tile coloured by sleep quality with the
// hours as text. Today has a dashed orange border; future days are inert;
// nights outside the active range filter are dimmed.
export default function SleepCalendar({
  month,
  today,
  entries,
  selected,
  inRange,
  onSelect,
  onMonthChange,
}: {
  month: string; // "yyyy-MM"
  today: string;
  entries: SleepEntry[];
  selected: string | null;
  inRange: (date: string) => boolean;
  onSelect: (date: string, entry: SleepEntry | undefined) => void;
  onMonthChange: (by: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Sleep", "Common"]);
  const locale = getDateFnsLocale(i18n.language);
  const cells = monthCells(month);
  const byDate = new Map(entries.map((e) => [e.sleep_date, e]));
  const days = cells.filter((d): d is string => !!d);
  const summary = sleepSummary(days.filter(inRange).map((d) => byDate.get(d)).filter((e): e is SleepEntry => !!e));
  const avg = summary.averageHours != null ? splitHours(summary.averageHours) : null;
  const weekStart = startOfWeek(new Date(2026, 0, 5), { weekStartsOn: 1 });
  const weekdays = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "EEE", { locale }));
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const canNext = canGoToNextMonth(month, today);

  const legend: [SleepTone | "empty", string][] = [
    ["short", t("Sleep:durationZones.tooLittle")],
    ["good", t("Sleep:durationZones.aBitShort")],
    ["great", `${t("Sleep:durationZones.greatRange")} · ${t("Sleep:durationZones.longNight")}`],
    ["empty", t("Sleep:notLogged")],
  ];

  return (
    <View style={styles.card}>
      <View style={styles.navRow}>
        <AnimatedPressable
          style={styles.navButton}
          onPress={() => onMonthChange(-1)}
          accessibilityRole="button"
          accessibilityLabel={t("Sleep:previousMonth")}
        >
          <Text style={styles.navGlyph}>‹</Text>
        </AnimatedPressable>
        <Text style={styles.monthTitle} accessibilityLiveRegion="polite">
          {format(parseISO(`${month}-01`), "LLLL yyyy", { locale })}
        </Text>
        <AnimatedPressable
          style={[styles.navButton, !canNext && styles.navDisabled]}
          onPress={() => onMonthChange(1)}
          disabled={!canNext}
          accessibilityRole="button"
          accessibilityLabel={t("Sleep:nextMonth")}
        >
          <Text style={styles.navGlyph}>›</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.summaryRow}>
        <Text style={[styles.summaryText, styles.summaryBold]}>
          {formatIcuPlural(t("Sleep:monthNights"), summary.nights, i18n.language)}
        </Text>
        {avg && <Text style={styles.summaryText}>{t("Sleep:monthAverage", { value: t("Sleep:hoursMinutes", avg) })}</Text>}
        {summary.bestHours != null && (
          <Text style={styles.summaryText}>{t("Sleep:monthBest", { value: formatHours(summary.bestHours) })}</Text>
        )}
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((w) => (
          <Text key={w} style={styles.weekday} numberOfLines={1}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((date, ci) => {
              if (!date) return <View key={`b-${ri}-${ci}`} style={styles.cellSlot} />;
              const entry = byDate.get(date);
              const hours = entry?.duration_hours;
              const zone = typeof hours === "number" ? sleepZone(hours) : null;
              const future = date > today;
              const isToday = date === today;
              const isSelected = selected === date;
              const c = toneColors(colors, zone ? sleepTone(zone) : "empty");
              const tileStyle = isToday ? [styles.tile, styles.tileToday] : [styles.tile, { backgroundColor: c.bg }];
              const fg = isToday ? colors.primary : c.fg;
              const label =
                typeof hours === "number" && zone
                  ? t("Sleep:dayWithEntry", {
                      date: format(parseISO(date), "MMM d", { locale }),
                      hours,
                      quality: t(`Sleep:durationZones.${zone}`),
                    })
                  : t("Sleep:dayNotLogged", { date: format(parseISO(date), "MMM d", { locale }) });
              const inner = (
                <>
                  <Text style={[styles.dayNum, { color: fg }]}>{format(parseISO(date), "d")}</Text>
                  <Text style={[styles.dayHours, { color: fg }]} numberOfLines={1}>
                    {typeof hours === "number" ? formatHours(hours) : ""}
                  </Text>
                </>
              );
              return (
                <View key={date} style={styles.cellSlot}>
                  {future ? (
                    <View style={[...tileStyle, styles.tileFuture]}>{inner}</View>
                  ) : (
                    <AnimatedPressable
                      style={[...tileStyle, !inRange(date) && styles.tileDim, isSelected && styles.tileSelected]}
                      onPress={() => onSelect(date, entry)}
                      scaleTo={0.94}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isSelected }}
                    >
                      {inner}
                    </AnimatedPressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        {legend.map(([tone, text]) => (
          <View key={tone} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: toneColors(colors, tone).bg }]} />
            <Text style={styles.legendText}>{text}</Text>
          </View>
        ))}
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
      padding: 12,
      gap: 10,
    },
    navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    navButton: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    navDisabled: { opacity: 0.4 },
    navGlyph: { fontSize: 22, lineHeight: 24, color: colors.foreground, fontWeight: "700" },
    monthTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    summaryRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2, justifyContent: "center" },
    summaryText: { fontSize: 12, color: colors.mutedForeground },
    summaryBold: { fontWeight: "800", color: colors.foreground },
    weekRow: { flexDirection: "row", gap: 4 },
    weekday: {
      flex: 1,
      textAlign: "center",
      fontSize: 10,
      fontWeight: "700",
      color: colors.mutedForeground,
      textTransform: "uppercase",
    },
    grid: { gap: 4 },
    gridRow: { flexDirection: "row", gap: 4 },
    cellSlot: { flex: 1, aspectRatio: 0.85 },
    tile: {
      flex: 1,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: "transparent",
      padding: 4,
      justifyContent: "space-between",
    },
    tileToday: { backgroundColor: colors.card, borderColor: colors.orange, borderStyle: "dashed" },
    tileFuture: { opacity: 0.45 },
    tileDim: { opacity: 0.5 },
    tileSelected: { borderColor: colors.foreground, borderStyle: "solid" },
    dayNum: { fontSize: 12, fontWeight: "800" },
    dayHours: { fontSize: 10, fontWeight: "800" },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    swatch: { width: 12, height: 12, borderRadius: radius.sm },
    legendText: { fontSize: 11, color: colors.mutedForeground },
  });
}
