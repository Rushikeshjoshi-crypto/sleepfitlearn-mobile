import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { format, parseISO, subDays } from "date-fns";
import { listSleepEntries, type SleepEntry } from "../../lib/api/sleep";
import { listExerciseEntries, type ExerciseEntry } from "../../lib/api/fitness";
import { listStudySessions, type StudySession } from "../../lib/api/study";
import { loadErrorText } from "../../lib/api/gateErrors";
import {
  aggregate,
  computeKpis,
  getDailyPresetRange,
  getEffectiveRange,
  yesterdayISO,
  type AggregatedPoint,
  type Period,
} from "../../lib/trends/activityAggregation";
import { best, change, inRange, previousRange, sparkHeights, type DateRange } from "../../lib/trends/trendStats";
import { formatMinutes } from "../../lib/formatMinutes";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import CalendarModal from "../CalendarModal";
import { ChartCard } from "./ChartCard";
import { TrendBarChart } from "./TrendBarChart";

type Domain = "sleep" | "exercise" | "study";
// 7 / 30 days are daily ranges ending yesterday; weeks / months / years are
// the fixed lookbacks (12 weeks, 12 months, 10 years); custom = own dates.
type RangeKey = "7d" | "30d" | "weekly" | "monthly" | "yearly" | "custom";
const DOMAIN_GLYPH: Record<Domain, string> = { sleep: "🌙", exercise: "🏋️", study: "📚" };

type DomainView = {
  domain: Domain;
  label: string;
  points: AggregatedPoint[];
  count: number;
  delta: number | null;
  valueLabel: string;
  countLabel: string;
  unit: string;
  seriesLabel: string;
};

// Mobile port of the web app's src/components/trends/ActivityTrends.tsx: a
// summary tile per domain (this period, change vs the previous period of the
// same length, sparkline) and the chosen tile's chart below with its average /
// best / logged. Each domain is fetched once over both periods.
export function ActivityTrends({ reloadKey }: { reloadKey: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Trends");
  const dateFnsLocale = getDateFnsLocale(i18n.language);

  const [domain, setDomain] = useState<Domain>("sleep");
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [customFrom, setCustomFrom] = useState(() => format(subDays(parseISO(yesterdayISO()), 6), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(() => yesterdayISO());
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const [sleepRows, setSleepRows] = useState<SleepEntry[]>([]);
  const [exerciseRows, setExerciseRows] = useState<ExerciseEntry[]>([]);
  const [studyRows, setStudyRows] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period: Period = rangeKey === "weekly" || rangeKey === "monthly" || rangeKey === "yearly" ? rangeKey : "daily";
  const dailyRange =
    rangeKey === "7d" ? getDailyPresetRange("week") : rangeKey === "30d" ? getDailyPresetRange("month") : { from: customFrom, to: customTo };
  const range: DateRange = getEffectiveRange(period, dailyRange);
  const prev = previousRange(range);
  const fetchRange = { from: prev.from, to: range.to };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listSleepEntries(fetchRange), listExerciseEntries(fetchRange), listStudySessions(fetchRange)])
      .then(([sleep, exercise, study]) => {
        if (cancelled) return;
        setSleepRows(sleep);
        setExerciseRows(exercise);
        setStudyRows(study);
      })
      .catch((err) => {
        if (cancelled) return;
        setSleepRows([]);
        setExerciseRows([]);
        setStudyRows([]);
        setError(loadErrorText(err, t("loadRangeError")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // fetchRange is derived from these; reloadKey is pull-to-refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRange.from, fetchRange.to, reloadKey, t]);

  const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
    { value: "7d", label: t("range7Days") },
    { value: "30d", label: t("range30Days") },
    { value: "weekly", label: t("rangeWeeks") },
    { value: "monthly", label: t("rangeMonths") },
    { value: "yearly", label: t("rangeYears") },
    { value: "custom", label: t("rangeCustom") },
  ];
  const labelOf: Record<Domain, string> = { sleep: t("sleepLabel"), exercise: t("exerciseLabel"), study: t("studyLabel") };

  const hours = (v: number) => `${v.toFixed(1)} h`;
  const minutes = (v: number) => formatMinutes(Math.round(v));
  const fmtOf: Record<Domain, (v: number) => string> = { sleep: hours, exercise: minutes, study: minutes };
  const tileLabel: Record<Domain, string> = { sleep: t("nightlyAverage"), exercise: t("totalMinutes"), study: t("totalMinutes") };

  function build<T>(
    d: Domain,
    rows: T[],
    dateFn: (r: T) => string,
    valueFn: (r: T) => number | null | undefined,
    agg: "avg" | "sum",
    countLabel: string,
    unit: string,
    seriesLabel: string,
  ): DomainView {
    const cur = inRange(rows, dateFn, range);
    const before = inRange(rows, dateFn, prev);
    const k = computeKpis(cur, valueFn);
    const p = computeKpis(before, valueFn);
    const value = agg === "avg" ? k.average : k.total;
    return {
      domain: d,
      label: labelOf[d],
      points: aggregate(cur, dateFn, valueFn, period, agg, dateFnsLocale),
      count: k.count,
      delta: change(value, agg === "avg" ? p.average : p.total, p.count),
      valueLabel: k.count ? fmtOf[d](value) : "—",
      countLabel,
      unit,
      seriesLabel,
    };
  }

  const views: DomainView[] = [
    build("sleep", sleepRows, (r) => r.sleep_date, (r) => r.duration_hours, "avg", t("nightsLogged"), t("unitHours"), t("avgHours")),
    build("exercise", exerciseRows, (r) => r.event_date, (r) => r.duration_minutes, "sum", t("sessionsLogged"), t("unitMinutes"), t("totalMinutes")),
    build("study", studyRows, (r) => r.session_date, (r) => r.duration_minutes, "sum", t("sessionsLogged"), t("unitMinutes"), t("totalMinutes")),
  ];
  const view = views.find((v) => v.domain === domain)!;
  const top = best(view.points);
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === rangeKey)!.label;
  const fmt = fmtOf[domain];

  function deltaText(v: DomainView): string | null {
    if (v.delta === null || v.delta === 0) return null;
    return `${v.delta > 0 ? "+" : "−"}${fmtOf[v.domain](Math.abs(v.delta))}`;
  }

  // The chart's dashed line: the average of the shown buckets.
  const referenceLine =
    view.points.length > 1 ? { y: view.points.reduce((s, p) => s + p.value, 0) / view.points.length, label: t("avgLine") } : undefined;

  // Same bounds as web's date inputs: from <= to <= yesterday.
  function onPickDate(iso: string | null) {
    if (!iso) return;
    if (picking === "from") setCustomFrom(iso > customTo ? customTo : iso);
    if (picking === "to") {
      const capped = iso > yesterdayISO() ? yesterdayISO() : iso;
      setCustomTo(capped < customFrom ? customFrom : capped);
    }
  }
  const fmtDate = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: dateFnsLocale });

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow} accessibilityLabel={t("periodLabel")}>
        {RANGE_OPTIONS.map((o) => {
          const on = rangeKey === o.value;
          return (
            <AnimatedPressable key={o.value} style={[styles.rangeChip, on && styles.rangeChipOn]} onPress={() => setRangeKey(o.value)} accessibilityState={{ selected: on }}>
              <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{o.label}</Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      {rangeKey === "custom" && (
        <View style={styles.dateRow}>
          <AnimatedPressable style={styles.dateButton} onPress={() => setPicking("from")} accessibilityLabel={t("fromLabel")}>
            <Text style={styles.dateText}>{fmtDate(customFrom)}</Text>
          </AnimatedPressable>
          <Text style={styles.toText}>–</Text>
          <AnimatedPressable style={styles.dateButton} onPress={() => setPicking("to")} accessibilityLabel={t("toLabel")}>
            <Text style={styles.dateText}>{fmtDate(customTo)}</Text>
          </AnimatedPressable>
        </View>
      )}

      <View style={styles.tileRow} accessibilityLabel={t("domainLabel")}>
        {views.map((v) => {
          const on = v.domain === domain;
          const d = deltaText(v);
          const bars = sparkHeights(v.points.map((p) => p.value));
          return (
            <AnimatedPressable key={v.domain} style={[styles.tile, on && styles.tileOn]} onPress={() => setDomain(v.domain)} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={styles.tileGlyph}>{DOMAIN_GLYPH[v.domain]}</Text>
              <Text style={styles.tileName} numberOfLines={1}>{v.label}</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{loading ? "…" : v.valueLabel}</Text>
              <Text style={styles.tileDelta} numberOfLines={1}>
                {d ? `${v.delta! > 0 ? "▲" : "▼"} ${d}` : loading ? "" : "—"}
              </Text>
              <View style={styles.spark}>
                {bars.map((pct, i) => (
                  <View key={i} style={[styles.sparkBar, { height: `${pct}%`, backgroundColor: on ? colors.orange : colors.bar }]} />
                ))}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      <ChartCard
        title={t("domainRangeTitle", { label: view.label, range: rangeLabel })}
        unit={view.unit}
        isLoading={loading}
        isEmpty={!loading && view.points.length === 0}
        emptyMessage={t("noEntriesInRange")}
      >
        <TrendBarChart data={view.points} seriesLabel={view.seriesLabel} color={colors.orange} referenceLine={referenceLine} />
      </ChartCard>

      <View style={styles.statsCard}>
        <Stat styles={styles} label={tileLabel[domain]} value={view.valueLabel} />
        <Stat styles={styles} label={t("statBest")} value={top ? fmt(top.value) : "—"} sub={top?.label} />
        <Stat styles={styles} label={view.countLabel} value={String(view.count)} />
        <Stat styles={styles} label={t("vsPreviousLabel")} value={deltaText(view) ?? "—"} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <CalendarModal
        visible={picking != null}
        selectedDate={picking === "from" ? customFrom : customTo}
        onSelect={onPickDate}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

function Stat({ styles, label, value, sub }: { styles: ReturnType<typeof makeStyles>; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {sub ? <Text style={styles.statSub}> {sub}</Text> : null}
      </Text>
    </View>
  );
}

export function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    groupLabel: {
      fontSize: typography.label.fontSize,
      fontWeight: "800",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    rangeRow: { gap: 6, paddingVertical: 2 },
    rangeChip: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      minHeight: 40,
      justifyContent: "center",
    },
    rangeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    rangeText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    rangeTextOn: { color: colors.primaryForeground },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dateButton: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 10, minHeight: 40, justifyContent: "center" },
    dateText: { fontSize: 13, color: colors.foreground },
    toText: { fontSize: 12, color: colors.mutedForeground },
    tileRow: { flexDirection: "row", gap: 8 },
    tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 2 },
    tileOn: { borderColor: colors.orange, borderWidth: 2, padding: 9 },
    tileGlyph: { fontSize: 16 },
    tileName: { fontSize: 12, fontWeight: "600", color: colors.foreground },
    tileValue: { fontSize: 20, fontWeight: "800", color: colors.foreground, marginTop: 4 },
    tileDelta: { fontSize: 11, color: colors.mutedForeground, minHeight: 15 },
    spark: { height: 28, flexDirection: "row", alignItems: "flex-end", gap: 2, marginTop: 6 },
    sparkBar: { flex: 1, borderRadius: 1 },
    statsCard: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, rowGap: 14 },
    stat: { width: "50%", gap: 2, paddingRight: 8 },
    statLabel: { fontSize: 11, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    statValue: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    statSub: { fontSize: 12, fontWeight: "500", color: colors.mutedForeground },
    errorText: { fontSize: 13, color: colors.destructive },
    // VitalsTrends shares this sheet
    latestWrap: { alignItems: "flex-end" },
    latestValue: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    latestUnit: { fontSize: 12, fontWeight: "500", color: colors.mutedForeground },
    latestDelta: { fontSize: 11, color: colors.mutedForeground },
    emptyCard: { backgroundColor: colors.soft, borderRadius: radius.lg, padding: 14 },
    emptyHint: { fontSize: 13, color: colors.mutedForeground },
  });
}
