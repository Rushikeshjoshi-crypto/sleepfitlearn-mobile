import { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import { useTranslation } from "react-i18next";
import type { DailyRecord, MetricKey } from "../../lib/api/insights";
import { metricLabel } from "../../lib/insights/metrics";
import { scatterPoints } from "../../lib/insights/patternPoints";
import { formatTick } from "../trends/chartScale";
import { useTheme } from "../../theme/ThemeContext";
import type { ColorPalette } from "../../theme/palettes";

const HEIGHT = 220;
const PAD = { top: 10, right: 10, bottom: 28, left: 40 };

// Evenly spaced tick values across [min, max].
function ticksFor(min: number, max: number, count = 4): number[] {
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

// One dot per comparable day: x = the first metric, y = the second (same day
// or next day). The honest picture of an association, no fitted line. Mobile
// port of the web's PatternScatter.
export function PatternScatter({
  daily,
  pair,
}: {
  daily: DailyRecord[];
  pair: { metric_a: MetricKey; metric_b: MetricKey; lag_days: number };
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Insights");
  const [width, setWidth] = useState(0);

  const points = scatterPoints(daily, pair);
  if (points.length === 0) return null;
  const a = metricLabel(pair.metric_a, t);
  const b = metricLabel(pair.metric_b, t);

  const span = (vals: number[]) => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = hi === lo ? Math.max(1, Math.abs(hi) * 0.1) : (hi - lo) * 0.08;
    return { min: lo - pad, max: hi + pad };
  };
  const xd = span(points.map((p) => p.x));
  const yd = span(points.map((p) => p.y));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const px = (v: number) => PAD.left + ((v - xd.min) / (xd.max - xd.min)) * plotW;
  const py = (v: number) => PAD.top + plotH - ((v - yd.min) / (yd.max - yd.min)) * plotH;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t("scatterAria", { a, b, count: points.length })}>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {ticksFor(yd.min, yd.max).map((v) => (
              <G key={`y-${v}`}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={py(v)} y2={py(v)} stroke={colors.border} strokeDasharray="3 3" strokeOpacity={0.5} />
                <SvgText x={PAD.left - 6} y={py(v) + 4} fontSize={11} fill={colors.mutedForeground} textAnchor="end">
                  {formatTick(v)}
                </SvgText>
              </G>
            ))}
            {ticksFor(xd.min, xd.max).map((v) => (
              <SvgText key={`x-${v}`} x={px(v)} y={HEIGHT - 12} fontSize={11} fill={colors.mutedForeground} textAnchor="middle">
                {formatTick(v)}
              </SvgText>
            ))}
            {points.map((p) => (
              <Circle key={p.date} cx={px(p.x)} cy={py(p.y)} r={4} fill={colors.orange} fillOpacity={0.7} />
            ))}
          </Svg>
        )}
      </View>
      <Text style={styles.caption}>{t("scatterCaption", { a, b })}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    caption: { marginTop: 2, fontSize: 12, color: colors.mutedForeground },
  });
}
