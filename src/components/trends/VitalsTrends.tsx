import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { format, parseISO, subDays } from "date-fns";
import { listPersonalEntries, METRIC_META, type PersonalEntry, type SimpleMetricType } from "../../lib/api/fitness";
import { checkVitalsAccess } from "../../lib/vitals/eligibility";
import { hideSyncedVitals } from "../../lib/vitals/display";
import { getUserProfile } from "../../lib/api/users";
import { loadErrorText } from "../../lib/api/gateErrors";
import { yesterdayISO } from "../../lib/trends/activityAggregation";
import { buildBpSeries, buildHeartRateSeries, buildSimpleSeries, buildWeightBmiSeries } from "../../lib/trends/personalSeries";
import { useTheme } from "../../theme/ThemeContext";
import { makeStyles } from "./ActivityTrends";
import { ChartCard } from "./ChartCard";
import { TrendBarChart } from "./TrendBarChart";
import { TrendLineChart, type RefLineDef } from "./TrendLineChart";

// Mobile port of the web app's src/components/trends/VitalsTrends.tsx — same
// all-time listPersonalEntries fetch and series builders (personalSeries.ts);
// every body metric is its own chart card (stacked on a phone) with its latest
// value, change vs 30 days earlier and its guide lines.
const ALL_TIME_FROM = "2018-01-01";

const xTickFormatter = (date: string) => date.slice(5);

// Latest point vs the latest one at least 30 days older (null without one).
export function changeVs30Days(points: { date: string; value: number | null | undefined }[]): number | null {
  const withValue = points
    .filter((p): p is { date: string; value: number } => typeof p.value === "number")
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = withValue[0];
  if (!latest) return null;
  const cutoff = format(subDays(parseISO(latest.date), 30), "yyyy-MM-dd");
  const older = withValue.find((p) => p.date <= cutoff);
  return older ? Math.round((latest.value - older.value) * 10) / 10 : null;
}

// Header of a chart card: the latest value and its change vs 30 days earlier.
function Latest({
  value,
  unit,
  delta,
  styles,
}: {
  value: string | null;
  unit?: string;
  delta: number | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation("Trends");
  if (value === null) return null;
  return (
    <View style={styles.latestWrap}>
      <Text style={styles.latestValue}>
        {value}
        {unit ? <Text style={styles.latestUnit}> {unit}</Text> : null}
      </Text>
      {delta !== null && delta !== 0 ? (
        <Text style={styles.latestDelta}>
          {delta > 0 ? "▲" : "▼"} {t("change30d", { change: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}${unit ? ` ${unit}` : ""}` })}
        </Text>
      ) : null}
    </View>
  );
}

export function VitalsTrends({ reloadKey }: { reloadKey: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Trends");

  const [entries, setEntries] = useState<PersonalEntry[]>([]);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listPersonalEntries({ from: ALL_TIME_FROM, to: yesterdayISO() }), getUserProfile(), checkVitalsAccess()])
      .then(([data, profile, access]) => {
        if (cancelled) return;
        // Synced HR/BP only for accounts allowed to see it (fails closed).
        setEntries(access.allowed ? data : hideSyncedVitals(data));
        setHeightCm(profile.height_cm);
      })
      .catch((err) => {
        if (!cancelled) setError(loadErrorText(err, t("loadVitalsError")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  const weightPoints = buildWeightBmiSeries(entries, heightCm);
  const bmiPoints = weightPoints.filter((p) => p.bmi !== undefined);
  const lastWeight = weightPoints.at(-1);
  const lastBmi = bmiPoints.at(-1);
  const heartRatePoints = buildHeartRateSeries(entries);
  const lastHr = heartRatePoints.at(-1);
  const lastHrValue = lastHr?.hcAvg ?? lastHr?.manual;
  const bpPoints = buildBpSeries(entries);
  const lastBp = bpPoints.at(-1);

  function simpleChart(kind: SimpleMetricType, label: string, bars = false) {
    const meta = METRIC_META[kind];
    const points = buildSimpleSeries(entries, kind);
    const unit = meta.unit === "/ 5" ? undefined : meta.unit;
    const last = points.at(-1);
    return (
      <ChartCard
        key={kind}
        title={label}
        isLoading={loading}
        isEmpty={!loading && points.length === 0}
        headerRight={<Latest styles={styles} value={last ? String(last.value) : null} unit={unit} delta={changeVs30Days(points)} />}
      >
        {bars ? (
          // Strength metrics are sessions: bars, like the Personal page.
          <TrendBarChart
            data={points.map((p) => ({ key: p.date, label: xTickFormatter(p.date), value: p.value ?? 0 }))}
            seriesLabel={label}
            color={colors.orange}
          />
        ) : (
          <TrendLineChart data={points} xKey="date" xTickFormatter={xTickFormatter} series={[{ key: "value", label, color: colors.orange }]} />
        )}
      </ChartCard>
    );
  }

  const bmiRefLines: RefLineDef[] = [
    { value: 18.5, label: t("underweight") },
    { value: 21.75, label: t("optimal") },
    { value: 25, label: t("overweight") },
    { value: 30, label: t("obese") },
  ];

  return (
    <View style={styles.wrap}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ChartCard
        title={t("weightTitle")}
        isLoading={loading}
        isEmpty={!loading && weightPoints.length === 0}
        headerRight={
          <Latest
            styles={styles}
            value={lastWeight ? String(lastWeight.weight) : null}
            unit="kg"
            delta={changeVs30Days(weightPoints.map((p) => ({ date: p.date, value: p.weight })))}
          />
        }
      >
        <TrendLineChart data={weightPoints} xKey="date" xTickFormatter={xTickFormatter} series={[{ key: "weight", label: t("weightTitle"), color: colors.orange }]} />
      </ChartCard>

      <ChartCard
        title={t("bmiTitle")}
        isLoading={loading}
        isEmpty={!loading && bmiPoints.length === 0}
        emptyMessage={heightCm ? t("noWeightEntries") : t("logHeightHint")}
        headerRight={
          <Latest
            styles={styles}
            value={lastBmi?.bmi !== undefined ? String(lastBmi.bmi) : null}
            delta={changeVs30Days(bmiPoints.map((p) => ({ date: p.date, value: p.bmi })))}
          />
        }
      >
        <TrendLineChart data={bmiPoints} xKey="date" xTickFormatter={xTickFormatter} series={[{ key: "bmi", label: t("bmiTitle"), color: colors.orange }]} refLines={bmiRefLines} />
      </ChartCard>

      {/* Health Connect's daily average and manual spot readings are two
          series, never joined into one line. */}
      <ChartCard
        title={t("heartRateLabel")}
        isLoading={loading}
        isEmpty={!loading && heartRatePoints.length === 0}
        headerRight={
          <Latest
            styles={styles}
            value={lastHrValue !== undefined ? String(lastHrValue) : null}
            unit="bpm"
            delta={changeVs30Days(heartRatePoints.map((p) => ({ date: p.date, value: p.hcAvg ?? p.manual })))}
          />
        }
      >
        <TrendLineChart
          data={heartRatePoints}
          xKey="date"
          xTickFormatter={xTickFormatter}
          series={[
            { key: "hcAvg", label: t("hcDailyAvg"), color: colors.orange },
            { key: "manual", label: t("manualReading"), color: colors.bar },
          ]}
          refLines={[
            { value: 60, label: t("normalLow") },
            { value: 100, label: t("normalHigh") },
          ]}
        />
      </ChartCard>

      <ChartCard
        title={t("bloodPressureLabel")}
        isLoading={loading}
        isEmpty={!loading && bpPoints.length === 0}
        headerRight={<Latest styles={styles} value={lastBp ? `${lastBp.systolic ?? "—"} / ${lastBp.diastolic ?? "—"}` : null} unit="mmHg" delta={null} />}
      >
        <TrendLineChart
          data={bpPoints}
          xKey="date"
          xTickFormatter={xTickFormatter}
          series={[
            { key: "systolic", label: t("systolic"), color: colors.orange },
            { key: "diastolic", label: t("diastolic"), color: colors.bar },
          ]}
          refLines={[
            { value: 120, label: t("systolicHigh") },
            { value: 80, label: t("diastolicHigh") },
          ]}
        />
      </ChartCard>

      {simpleChart("waist_cm", t("waistLabel"))}
      {simpleChart("chin_ups", t("chinUpsLabel"), true)}
      {simpleChart("bench_press", t("benchPressLabel"), true)}
    </View>
  );
}
