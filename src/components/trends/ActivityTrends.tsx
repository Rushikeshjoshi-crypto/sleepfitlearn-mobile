import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
  type DailyPreset,
  type Period,
} from "../../lib/trends/activityAggregation";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import CalendarModal from "../CalendarModal";
import { ChartCard } from "./ChartCard";
import { TrendBarChart } from "./TrendBarChart";

type Domain = "sleep" | "exercise" | "study";
const DOMAIN_GLYPH: Record<Domain, string> = { sleep: "🌙", exercise: "🏋️", study: "📚" };

// Mobile port of the web app's src/components/trends/ActivityTrends.tsx —
// same API calls (list*Entries over the effective range), same aggregation
// (activityAggregation.ts: avg for sleep, sum for exercise/study), same period
// caps and daily presets.
export function ActivityTrends({ reloadKey }: { reloadKey: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Trends");
  const dateFnsLocale = getDateFnsLocale(i18n.language);

  const [domain, setDomain] = useState<Domain>("sleep");
  const [period, setPeriod] = useState<Period>("daily");
  const [dailyFrom, setDailyFrom] = useState(() => format(subDays(parseISO(yesterdayISO()), 6), "yyyy-MM-dd"));
  const [dailyTo, setDailyTo] = useState(() => yesterdayISO());
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const [rows, setRows] = useState<SleepEntry[] | ExerciseEntry[] | StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = getEffectiveRange(period, { from: dailyFrom, to: dailyTo });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load =
      domain === "sleep" ? listSleepEntries(range) : domain === "exercise" ? listExerciseEntries(range) : listStudySessions(range);
    load
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(loadErrorText(err, t("loadRangeError")));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // range is derived from these; reloadKey is pull-to-refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, range.from, range.to, reloadKey, t]);

  let view: { points: { key: string; label: string; value: number }[]; unit: string; primaryLabel: string; primaryValue: string; secondaryLabel: string; secondaryValue: string; seriesLabel: string };
  if (domain === "sleep") {
    const data = rows as SleepEntry[];
    const valueFn = (r: SleepEntry) => r.duration_hours;
    const kpis = computeKpis(data, valueFn);
    view = {
      points: aggregate(data, (r) => r.sleep_date, valueFn, period, "avg", dateFnsLocale),
      unit: t("hoursUnit"),
      primaryLabel: t("nightlyAverage"),
      primaryValue: t("hoursValue", { value: kpis.average.toFixed(1) }),
      secondaryLabel: t("nightsLogged"),
      secondaryValue: String(kpis.count),
      seriesLabel: t("avgHours"),
    };
  } else {
    const data = rows as (ExerciseEntry | StudySession)[];
    const valueFn = (r: ExerciseEntry | StudySession) => r.duration_minutes;
    const dateFn = (r: ExerciseEntry | StudySession) => ("event_date" in r ? r.event_date : r.session_date);
    const kpis = computeKpis(data, valueFn);
    view = {
      points: aggregate(data, dateFn, valueFn, period, "sum", dateFnsLocale),
      unit: t("minutesUnit"),
      primaryLabel: t("totalMinutes"),
      primaryValue: t("minutesValue", { value: Math.round(kpis.total) }),
      secondaryLabel: t("sessionsLogged"),
      secondaryValue: String(kpis.count),
      seriesLabel: t("totalMinutes"),
    };
  }

  const DOMAIN_OPTIONS: { value: Domain; label: string }[] = [
    { value: "sleep", label: t("sleepLabel") },
    { value: "exercise", label: t("exerciseLabel") },
    { value: "study", label: t("studyLabel") },
  ];
  const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: "daily", label: t("dailyLabel") },
    { value: "weekly", label: t("weeklyLabel") },
    { value: "monthly", label: t("monthlyLabel") },
    { value: "yearly", label: t("yearlyLabel") },
  ];
  const DAILY_PRESETS: { value: DailyPreset; label: string }[] = [
    { value: "last3", label: t("last3Days") },
    { value: "week", label: t("lastWeek") },
    { value: "month", label: t("lastMonth") },
  ];

  function applyPreset(preset: DailyPreset) {
    const r = getDailyPresetRange(preset);
    setDailyFrom(r.from);
    setDailyTo(r.to);
  }

  // Same bounds as web's date inputs: from ≤ to ≤ yesterday.
  function onPickDate(iso: string | null) {
    if (!iso) return;
    if (picking === "from") setDailyFrom(iso > dailyTo ? dailyTo : iso);
    if (picking === "to") {
      const capped = iso > yesterdayISO() ? yesterdayISO() : iso;
      setDailyTo(capped < dailyFrom ? dailyFrom : capped);
    }
  }

  const fmt = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: dateFnsLocale });

  return (
    <View style={styles.wrap}>
      <Text style={styles.groupLabel}>{t("domainLabel")}</Text>
      <View style={styles.pillRow}>
        {DOMAIN_OPTIONS.map((o) => (
          <Pill key={o.value} label={`${DOMAIN_GLYPH[o.value]} ${o.label}`} active={domain === o.value} onPress={() => setDomain(o.value)} styles={styles} />
        ))}
      </View>

      <Text style={styles.groupLabel}>{t("periodLabel")}</Text>
      <View style={styles.pillRow}>
        {PERIOD_OPTIONS.map((o) => (
          <Pill key={o.value} label={o.label} active={period === o.value} onPress={() => setPeriod(o.value)} styles={styles} />
        ))}
      </View>

      {period === "daily" && (
        <View style={styles.dailyBox}>
          <View style={styles.pillRow}>
            {DAILY_PRESETS.map((p) => (
              <AnimatedPressable key={p.value} style={styles.presetChip} onPress={() => applyPreset(p.value)}>
                <Text style={styles.presetText}>{p.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
          <View style={styles.dateRow}>
            <AnimatedPressable style={styles.dateButton} onPress={() => setPicking("from")}>
              <Text style={styles.dateText}>{fmt(dailyFrom)}</Text>
            </AnimatedPressable>
            <Text style={styles.toText}>{t("dateRangeTo")}</Text>
            <AnimatedPressable style={styles.dateButton} onPress={() => setPicking("to")}>
              <Text style={styles.dateText}>{fmt(dailyTo)}</Text>
            </AnimatedPressable>
          </View>
        </View>
      )}

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiGlyph}>{DOMAIN_GLYPH[domain]}</Text>
          <Text style={styles.kpiLabel}>{view.primaryLabel}</Text>
          <Text style={styles.kpiValue}>{view.primaryValue}</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardSoft]}>
          <Text style={styles.kpiLabel}>{view.secondaryLabel}</Text>
          <Text style={styles.kpiValue}>{view.secondaryValue}</Text>
        </View>
      </View>

      <ChartCard
        title={t("domainTrend", { label: DOMAIN_OPTIONS.find((d) => d.value === domain)!.label })}
        unit={view.unit}
        isLoading={loading}
        isEmpty={!loading && view.points.length === 0}
        emptyMessage={t("noEntriesInRange")}
      >
        <TrendBarChart data={view.points} seriesLabel={view.seriesLabel} color={colors.navTint} />
      </ChartCard>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <CalendarModal
        visible={picking != null}
        selectedDate={picking === "from" ? dailyFrom : dailyTo}
        onSelect={onPickDate}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <AnimatedPressable style={[styles.pill, active && styles.pillActive]} onPress={onPress} accessibilityState={{ selected: active }}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

export function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    groupLabel: {
      fontSize: typography.label.fontSize,
      fontWeight: "600",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.muted, minHeight: 36, justifyContent: "center" },
    pillActive: { backgroundColor: colors.primary },
    pillText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    pillTextActive: { color: colors.primaryForeground },
    dailyBox: { gap: 8 },
    presetChip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, justifyContent: "center" },
    presetText: { fontSize: 12, color: colors.foreground },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dateButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 40, justifyContent: "center" },
    dateText: { fontSize: 13, color: colors.foreground },
    toText: { fontSize: 12, color: colors.mutedForeground },
    kpiRow: { flexDirection: "row", gap: 10 },
    kpiCard: { flex: 1, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
    kpiCardSoft: { backgroundColor: colors.muted },
    kpiGlyph: { fontSize: 18 },
    kpiLabel: { fontSize: 12, color: colors.mutedForeground },
    kpiValue: { fontSize: 22, fontWeight: "600", color: colors.foreground },
    errorText: { fontSize: 13, color: colors.destructive },
  });
}
