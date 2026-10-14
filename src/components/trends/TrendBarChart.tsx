import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { useTheme } from "../../theme/ThemeContext";
import type { ColorPalette } from "../../theme/palettes";
import { CHART_HEIGHT, PAD, formatTick, xLabelIndexes, yScale } from "./chartScale";

// Mobile counterpart of the web app's src/components/trends/charts/TrendBarChart.tsx:
// dashed grid, Y from 0, gradient bars with rounded tops (max 40px wide).
// Tap a bar to read its value (web's hover tooltip).
export function TrendBarChart({
  data,
  seriesLabel,
  color,
}: {
  data: { key: string; label: string; value: number }[];
  seriesLabel: string;
  color: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const { max, ticks } = yScale(Math.max(0, ...data.map((d) => d.value)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const slot = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.min(40, slot * 0.7);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelIdx = xLabelIndexes(data.length, 5);

  function barPath(i: number, v: number): string {
    const left = PAD.left + i * slot + (slot - barW) / 2;
    const top = y(v);
    const bottom = PAD.top + plotH;
    const r = Math.min(8, barW / 2, Math.max(0, bottom - top));
    return `M${left},${bottom} L${left},${top + r} Q${left},${top} ${left + r},${top} L${left + barW - r},${top} Q${left + barW},${top} ${left + barW},${top + r} L${left + barW},${bottom} Z`;
  }

  function onPress(e: GestureResponderEvent) {
    if (data.length === 0 || slot <= 0) return;
    const i = Math.floor((e.nativeEvent.locationX - PAD.left) / slot);
    if (i < 0 || i >= data.length) return;
    setSelected((prev) => (prev === i ? null : i));
  }

  const sel = selected != null && selected < data.length ? data[selected] : null;

  return (
    <View>
      <Pressable onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} onPress={onPress}>
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="trendBarFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity={0.95} />
                <Stop offset="100%" stopColor={color} stopOpacity={0.55} />
              </LinearGradient>
            </Defs>
            {ticks.map((tk) => (
              <G key={`t-${tk}`}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(tk)} y2={y(tk)} stroke={colors.border} strokeDasharray="3 3" strokeOpacity={0.5} />
                <SvgText x={PAD.left - 6} y={y(tk) + 4} fontSize={11} fill={colors.mutedForeground} textAnchor="end">
                  {formatTick(tk)}
                </SvgText>
              </G>
            ))}
            {selected != null && sel && (
              <Rect x={PAD.left + selected * slot} y={PAD.top} width={slot} height={plotH} rx={6} fill={colors.muted} opacity={0.4} />
            )}
            {data.map((d, i) => (d.value > 0 ? <Path key={d.key} d={barPath(i, d.value)} fill="url(#trendBarFill)" /> : null))}
            {labelIdx.map((i) => (
              <SvgText
                key={`x-${i}`}
                x={PAD.left + i * slot + slot / 2}
                y={CHART_HEIGHT - 6}
                fontSize={11}
                fill={colors.mutedForeground}
                textAnchor="middle"
              >
                {data[i].label}
              </SvgText>
            ))}
          </Svg>
        )}
      </Pressable>
      {sel && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{sel.label}</Text>
          <Text style={styles.tooltipRow}>
            <Text style={{ color }}>● </Text>
            {seriesLabel}: {formatTick(sel.value)}
          </Text>
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
  });
}
