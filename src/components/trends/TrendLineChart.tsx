import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "../../theme/ThemeContext";
import type { ColorPalette } from "../../theme/palettes";
import { CHART_HEIGHT, PAD, formatTick, xLabelIndexes, yScale } from "./chartScale";

export type LineSeriesDef = { key: string; label: string; color: string };
export type RefLineDef = { value: number; label: string };

// Mobile counterpart of the web app's src/components/trends/charts/TrendLineChart.tsx
// (recharts): dashed grid, Y from 0, lines that connect across missing values
// (connectNulls), dots, dashed reference lines with a pill label — shown only
// when they fall inside the Y range, like recharts' default "discard" — and a
// legend when there's more than one series. Tap the chart to read a point
// (web's hover tooltip).
export function TrendLineChart({
  data,
  xKey,
  series,
  refLines = [],
  xTickFormatter,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: LineSeriesDef[];
  refLines?: RefLineDef[];
  xTickFormatter?: (value: string) => string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const numeric = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const dataMax = Math.max(0, ...data.flatMap((row) => series.map((s) => numeric(row[s.key]) ?? 0)));
  const { max, ticks } = yScale(dataMax);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? plotW / 2 : (i * plotW) / (data.length - 1));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  function pathFor(key: string): string {
    const pts = data
      .map((row, i) => ({ i, v: numeric(row[key]) }))
      .filter((p): p is { i: number; v: number } => p.v != null);
    return pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  }

  function onPress(e: GestureResponderEvent) {
    if (data.length === 0 || plotW <= 0) return;
    const rel = (e.nativeEvent.locationX - PAD.left) / plotW;
    const i = Math.round(Math.min(1, Math.max(0, rel)) * (data.length - 1));
    setSelected((prev) => (prev === i ? null : i));
  }

  const visibleRefLines = refLines.filter((r) => r.value >= 0 && r.value <= max);
  const labelIdx = xLabelIndexes(data.length, 4);
  const sel = selected != null && selected < data.length ? data[selected] : null;

  return (
    <View>
      <Pressable onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} onPress={onPress}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            {ticks.map((tk) => (
              <G key={`t-${tk}`}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(tk)} y2={y(tk)} stroke={colors.border} strokeDasharray="3 3" strokeOpacity={0.5} />
                <SvgText x={PAD.left - 6} y={y(tk) + 4} fontSize={11} fill={colors.mutedForeground} textAnchor="end">
                  {formatTick(tk)}
                </SvgText>
              </G>
            ))}

            {visibleRefLines.map((r) => {
              const labelW = r.label.length * 5.6 + 12;
              const lx = width - PAD.right - labelW - 2;
              const ly = y(r.value) - 17;
              return (
                <G key={`r-${r.label}`}>
                  <Line x1={PAD.left} x2={width - PAD.right} y1={y(r.value)} y2={y(r.value)} stroke={colors.border} strokeDasharray="4 4" strokeOpacity={0.8} />
                  <Rect x={lx} y={ly} width={labelW} height={15} rx={7.5} fill={colors.card} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={lx + labelW / 2} y={ly + 11} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">
                    {r.label}
                  </SvgText>
                </G>
              );
            })}

            {sel && <Line x1={x(selected!)} x2={x(selected!)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.border} strokeDasharray="3 3" />}

            {series.map((s) => (
              <G key={s.key}>
                <Path d={pathFor(s.key)} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                {data.map((row, i) => {
                  const v = numeric(row[s.key]);
                  if (v == null) return null;
                  return (
                    <Circle
                      key={`${s.key}-${i}`}
                      cx={x(i)}
                      cy={y(v)}
                      r={selected === i ? 5.5 : 3}
                      fill={selected === i ? s.color : colors.card}
                      stroke={s.color}
                      strokeWidth={selected === i ? 0 : 2}
                    />
                  );
                })}
              </G>
            ))}

            {labelIdx.map((i) => {
              const raw = String(data[i]?.[xKey] ?? "");
              return (
                <SvgText key={`x-${i}`} x={x(i)} y={CHART_HEIGHT - 6} fontSize={11} fill={colors.mutedForeground} textAnchor="middle">
                  {xTickFormatter ? xTickFormatter(raw) : raw}
                </SvgText>
              );
            })}
          </Svg>
        )}
      </Pressable>

      {sel && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{xTickFormatter ? xTickFormatter(String(sel[xKey])) : String(sel[xKey])}</Text>
          {series.map((s) => {
            const v = numeric(sel[s.key]);
            return v == null ? null : (
              <Text key={s.key} style={styles.tooltipRow}>
                <Text style={{ color: s.color }}>● </Text>
                {s.label}: {formatTick(v)}
              </Text>
            );
          })}
        </View>
      )}

      {series.length > 1 && (
        <View style={styles.legend}>
          {series.map((s) => (
            <Text key={s.key} style={styles.legendItem}>
              <Text style={{ color: s.color }}>● </Text>
              {s.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    tooltip: {
      marginTop: 6,
      alignSelf: "flex-start",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 2,
    },
    tooltipTitle: { fontSize: 12, fontWeight: "600", color: colors.foreground },
    tooltipRow: { fontSize: 12, color: colors.mutedForeground },
    legend: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 6 },
    legendItem: { fontSize: 12, color: colors.mutedForeground },
  });
}
