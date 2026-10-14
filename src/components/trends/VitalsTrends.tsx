import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { listPersonalEntries, METRIC_META, type PersonalEntry, type SimpleMetricType } from "../../lib/api/fitness";
import { checkVitalsAccess } from "../../lib/vitals/eligibility";
import { hideSyncedVitals } from "../../lib/vitals/display";
import { getUserProfile } from "../../lib/api/users";
import { loadErrorText } from "../../lib/api/gateErrors";
import { yesterdayISO } from "../../lib/trends/activityAggregation";
import { buildBpSeries, buildHeartRateSeries, buildSimpleSeries, buildWeightBmiSeries } from "../../lib/trends/personalSeries";
import { useTheme } from "../../theme/ThemeContext";
import { AnimatedPressable } from "../AnimatedPressable";
import { makeStyles } from "./ActivityTrends";
import { ChartCard } from "./ChartCard";
import { TrendLineChart, type RefLineDef } from "./TrendLineChart";

// Mobile port of the web app's src/components/trends/VitalsTrends.tsx — same
// all-time listPersonalEntries fetch, same Health/Strength chip groups and
// defaults, same series builders (personalSeries.ts) and reference lines.
const ALL_TIME_FROM = "2018-01-01";

type ChipKey = "weightBmi" | "heart_rate" | "bp" | "waist_cm" | "chin_ups" | "bench_press";
type Category = "health" | "strength";

const CATEGORY_CHIPS: Record<Category, ChipKey[]> = {
  health: ["weightBmi", "heart_rate", "bp", "waist_cm"],
  strength: ["chin_ups", "bench_press"],
};
const CATEGORY_DEFAULT_CHIP: Record<Category, ChipKey> = { health: "weightBmi", strength: "chin_ups" };
const CHIP_GLYPH: Record<ChipKey, string> = { weightBmi: "⚖️", heart_rate: "❤️", bp: "🩺", waist_cm: "📏", chin_ups: "📈", bench_press: "🏋️" };

const xTickFormatter = (date: string) => date.slice(5);

export function VitalsTrends({ reloadKey }: { reloadKey: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Trends");

  const [category, setCategory] = useState<Category>("health");
  const [active, setActive] = useState<Set<ChipKey>>(() => new Set<ChipKey>([CATEGORY_DEFAULT_CHIP.health]));
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

  const CHIPS: { key: ChipKey; label: string }[] = [
    { key: "weightBmi", label: t("weightBmiLabel") },
    { key: "heart_rate", label: t("heartRateLabel") },
    { key: "bp", label: t("bloodPressureLabel") },
    { key: "waist_cm", label: t("waistLabel") },
    { key: "chin_ups", label: t("chinUpsLabel") },
    { key: "bench_press", label: t("benchPressLabel") },
  ];
  const chipLabel = (key: ChipKey) => CHIPS.find((c) => c.key === key)!.label;

  function toggleChip(key: ChipKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Switching category swaps to that group's default chip (same as web).
  function selectCategory(next: Category) {
    setCategory(next);
    setActive(new Set([CATEGORY_DEFAULT_CHIP[next]]));
  }

  const weightPoints = buildWeightBmiSeries(entries, heightCm);
  const bmiPoints = weightPoints.filter((p) => p.bmi !== undefined);
  const heartRatePoints = buildHeartRateSeries(entries);

  function simpleChart(kind: SimpleMetricType, refLines: RefLineDef[] = []) {
    const meta = METRIC_META[kind];
    const points = buildSimpleSeries(entries, kind);
    const label = chipLabel(kind as ChipKey);
    return (
      <ChartCard key={kind} title={label} unit={meta.unit === "/ 5" ? undefined : meta.unit} isLoading={loading} isEmpty={!loading && points.length === 0}>
        <TrendLineChart data={points} xKey="date" xTickFormatter={xTickFormatter} series={[{ key: "value", label, color: colors.navTint }]} refLines={refLines} />
      </ChartCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.pillRow}>
        {(["health", "strength"] as const).map((c) => (
          <AnimatedPressable key={c} style={[styles.pill, category === c && styles.pillActive]} onPress={() => selectCategory(c)}>
            <Text style={[styles.pillText, category === c && styles.pillTextActive]}>
              {c === "health" ? t("healthCategoryLabel") : t("strengthCategoryLabel")}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={styles.groupLabel}>{t("metricsLabel")}</Text>
      <View style={styles.pillRow}>
        {CHIPS.filter((c) => CATEGORY_CHIPS[category].includes(c.key)).map((chip) => (
          <AnimatedPressable
            key={chip.key}
            style={[styles.pill, active.has(chip.key) && styles.pillActive]}
            onPress={() => toggleChip(chip.key)}
            accessibilityState={{ selected: active.has(chip.key) }}
          >
            <Text style={[styles.pillText, active.has(chip.key) && styles.pillTextActive]}>
              {CHIP_GLYPH[chip.key]} {chip.label}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {active.has("weightBmi") && (
        <>
          <ChartCard title={t("weightTitle")} unit="kg" isLoading={loading} isEmpty={!loading && weightPoints.length === 0}>
            <TrendLineChart data={weightPoints} xKey="date" xTickFormatter={xTickFormatter} series={[{ key: "weight", label: t("weightTitle"), color: colors.navTint }]} />
          </ChartCard>
          <ChartCard
            title={t("bmiTitle")}
            isLoading={loading}
            isEmpty={!loading && bmiPoints.length === 0}
            emptyMessage={heightCm ? t("noWeightEntries") : t("logHeightHint")}
          >
            <TrendLineChart
              data={bmiPoints}
              xKey="date"
              xTickFormatter={xTickFormatter}
              series={[{ key: "bmi", label: t("bmiTitle"), color: colors.navTint }]}
              refLines={[
                { value: 18.5, label: t("underweight") },
                { value: 21.75, label: t("optimal") },
                { value: 25, label: t("overweight") },
                { value: 30, label: t("obese") },
              ]}
            />
          </ChartCard>
        </>
      )}

      {active.has("heart_rate") && (
        // Health Connect's daily average and manual spot readings are two
        // series — never joined into one line.
        <ChartCard title={t("heartRateLabel")} unit="bpm" isLoading={loading} isEmpty={!loading && heartRatePoints.length === 0}>
          <TrendLineChart
            data={heartRatePoints}
            xKey="date"
            xTickFormatter={xTickFormatter}
            series={[
              { key: "hcAvg", label: t("hcDailyAvg"), color: colors.navTint },
              { key: "manual", label: t("manualReading"), color: colors.accent },
            ]}
            refLines={[
              { value: 60, label: t("normalLow") },
              { value: 100, label: t("normalHigh") },
            ]}
          />
        </ChartCard>
      )}

      {active.has("bp") && (
        <ChartCard title={t("bloodPressureLabel")} unit="mmHg" isLoading={loading} isEmpty={!loading && buildBpSeries(entries).length === 0}>
          <TrendLineChart
            data={buildBpSeries(entries)}
            xKey="date"
            xTickFormatter={xTickFormatter}
            series={[
              { key: "systolic", label: t("systolic"), color: colors.navTint },
              { key: "diastolic", label: t("diastolic"), color: colors.accent },
            ]}
            refLines={[
              { value: 120, label: t("systolicHigh") },
              { value: 80, label: t("diastolicHigh") },
            ]}
          />
        </ChartCard>
      )}

      {active.has("waist_cm") && simpleChart("waist_cm")}
      {active.has("chin_ups") && simpleChart("chin_ups")}
      {active.has("bench_press") && simpleChart("bench_press")}

      {active.size === 0 && (
        <View style={[styles.kpiCard, styles.kpiCardSoft]}>
          <Text style={styles.kpiLabel}>{t("pickMetricHint")}</Text>
        </View>
      )}
    </View>
  );
}
