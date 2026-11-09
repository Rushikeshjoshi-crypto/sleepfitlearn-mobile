import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import type { PersonalEntry, SimpleMetricType } from "../../lib/api/fitness";
import { buildBpSeries, buildHeartRateSeries, buildSimpleSeries } from "../../lib/trends/personalSeries";
import { BAR_KINDS, RANGES, changeVs30Days, rangeStats, valueOf, type MetricKey, type RangeKey } from "../../lib/personal/metricStats";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { ModernButton } from "../ModernButton";
import { SegmentedControl } from "../SegmentedControl";
import { TrendBarChart } from "../trends/TrendBarChart";
import { TrendLineChart } from "../trends/TrendLineChart";
import { latestDisplay } from "./MetricChips";

const tick = (date: string) => String(date ?? "").slice(5);

// The selected metric up close — mobile port of the web's MetricFocus: latest
// value, change vs 30 days earlier, a chart for the chosen range, then the
// latest entry and the range's low / high / average (stacked on a phone).
export function MetricFocus({
  kind,
  label,
  fallbackUnit,
  entries,
  inRange,
  range,
  onRangeChange,
  canLog,
  onLog,
  detailsLabel,
  onDetails,
}: {
  kind: MetricKey;
  label: string;
  fallbackUnit: string;
  // Every loaded entry of this metric, newest first.
  entries: PersonalEntry[];
  // The same, limited to the chosen range.
  inRange: PersonalEntry[];
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  canLog: boolean;
  onLog: () => void;
  // Mobile-only: opens the Heart rate & BP / Energy popup for this metric.
  detailsLabel?: string;
  onDetails?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Personal", "Trends", "HeartCamera"]);
  const dateFnsLocale = getDateFnsLocale(i18n.language);
  const latest = entries[0];
  const change = changeVs30Days(entries);
  // Older energy rows were stored on a 1-5 scale; their own unit says which.
  const unit = (latest && latest.kind !== "bp" ? latest.unit : undefined) || fallbackUnit;

  const values = inRange.map(valueOf).filter((v): v is number => v !== null);
  const stats = rangeStats(values);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
  const bpAvg =
    kind === "bp"
      ? {
          sys: avg(inRange.flatMap((e) => (e.kind === "bp" && e.systolic != null ? [e.systolic] : []))),
          dia: avg(inRange.flatMap((e) => (e.kind === "bp" && e.diastolic != null ? [e.diastolic] : []))),
        }
      : null;

  let chart = null;
  if (inRange.length > 0) {
    if (kind === "bp") {
      chart = (
        <TrendLineChart
          data={buildBpSeries(inRange)}
          xKey="date"
          xTickFormatter={tick}
          series={[
            { key: "systolic", label: t("Trends:systolic"), color: colors.orange },
            { key: "diastolic", label: t("Trends:diastolic"), color: colors.bar },
          ]}
        />
      );
    } else if (kind === "heart_rate") {
      chart = (
        <TrendLineChart
          data={buildHeartRateSeries(inRange)}
          xKey="date"
          xTickFormatter={tick}
          series={[
            { key: "hcAvg", label: t("Trends:hcDailyAvg"), color: colors.orange },
            { key: "manual", label: t("Trends:manualReading"), color: colors.bar },
          ]}
        />
      );
    } else if (BAR_KINDS.includes(kind)) {
      chart = (
        <TrendBarChart
          data={buildSimpleSeries(inRange, kind as SimpleMetricType).map((p) => ({ key: p.date, label: tick(p.date), value: p.value ?? 0 }))}
          seriesLabel={label}
          color={colors.orange}
        />
      );
    } else {
      const data = [...inRange]
        .filter((e) => e.kind !== "bp")
        .map((e) => ({ date: e.date, value: valueOf(e) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      chart = <TrendLineChart data={data} xKey="date" xTickFormatter={tick} series={[{ key: "value", label, color: colors.orange }]} />;
    }
  }

  const rangeLabel: Record<RangeKey, string> = {
    "7d": t("Personal:range7d"),
    "30d": t("Personal:range30d"),
    "90d": t("Personal:range90d"),
    "1y": t("Personal:range1y"),
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>{label}</Text>
        <SegmentedControl options={RANGES.map((r) => ({ value: r, label: rangeLabel[r] }))} value={range} onChange={onRangeChange} />

        {latest ? (
          <View style={styles.bigRow}>
            <Text style={styles.big}>
              {latestDisplay(latest)}
              <Text style={styles.bigUnit}> {unit}</Text>
            </Text>
            {change !== null && change !== 0 && (
              <Text style={styles.change}>
                {change > 0 ? "▲" : "▼"} {t("Personal:changeVs30Days", { change: `${change > 0 ? "+" : "−"}${Math.abs(change)} ${unit}` })}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.muted}>{t("Personal:noEntriesYet")}</Text>
        )}

        {chart ?? (
          <View style={styles.emptyChart}>
            <Text style={styles.muted}>{t("Personal:noEntriesInRange")}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("Personal:latestLabel")}</Text>
        {latest ? (
          <>
            <Text style={styles.latestValue}>
              {latestDisplay(latest)} <Text style={styles.latestUnit}>{unit}</Text>
            </Text>
            <Text style={styles.muted}>
              {format(parseISO(latest.date), "EEE, d MMM", { locale: dateFnsLocale })}
              {latest.kind === "heart_rate" && latest.camera ? `  📷 ${t("HeartCamera:sourceLabel")}` : ""}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>{t("Personal:noEntriesYet")}</Text>
        )}
        <View style={styles.actions}>
          {canLog && <ModernButton title={`+ ${t("Personal:addNewEntry")}`} variant="outline" onPress={onLog} style={styles.action} />}
          {onDetails && detailsLabel ? <ModernButton title={detailsLabel} variant="outline" onPress={onDetails} style={styles.action} /> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("Personal:rangeStatsLabel", { range: rangeLabel[range] })}</Text>
        {bpAvg && (bpAvg.sys !== null || bpAvg.dia !== null) ? (
          <View>
            <Text style={styles.statName}>{t("Personal:statAvg")}</Text>
            <Text style={styles.statValue}>
              {bpAvg.sys ?? "—"} / {bpAvg.dia ?? "—"} <Text style={styles.latestUnit}>{unit}</Text>
            </Text>
          </View>
        ) : stats ? (
          <View style={styles.statsRow}>
            {[
              [t("Personal:statLow"), stats.low],
              [t("Personal:statHigh"), stats.high],
              [t("Personal:statAvg"), stats.avg],
            ].map(([name, value]) => (
              <View key={name as string} style={styles.stat}>
                <Text style={styles.statName}>{name}</Text>
                <Text style={styles.statValue}>{value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>{t("Personal:noEntriesInRange")}</Text>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
    label: { fontSize: 12, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    bigRow: { gap: 2 },
    big: { fontSize: 36, fontWeight: "800", color: colors.foreground, letterSpacing: -0.5 },
    bigUnit: { fontSize: 15, fontWeight: "500", color: colors.mutedForeground },
    change: { fontSize: 13, color: colors.mutedForeground },
    muted: { fontSize: 13, color: colors.mutedForeground },
    emptyChart: { height: 140, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
    latestValue: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    latestUnit: { fontSize: 14, fontWeight: "500", color: colors.mutedForeground },
    actions: { gap: 8, marginTop: 4 },
    action: { alignSelf: "flex-start" },
    statsRow: { flexDirection: "row", gap: 12 },
    stat: { flex: 1 },
    statName: { fontSize: 12, color: colors.mutedForeground },
    statValue: { fontSize: 20, fontWeight: "800", color: colors.foreground },
  });
}
