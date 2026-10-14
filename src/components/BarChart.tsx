import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";

// Handcrafted proportional-height bars — same technique the website uses for
// its Weekly Snapshot bars (no charting library dependency).
const BAR_MAX_HEIGHT = 64;

export default function BarChart({
  data,
  color,
  highlightIndex,
}: {
  data: { label: string; value: number }[];
  color?: string;
  // When set, only this bar renders at full color; the rest render dimmed
  // (matches the website's today-highlighted weekly chart).
  highlightIndex?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resolvedColor = color ?? colors.navTint;
  const max = Math.max(1, ...data.map((d) => d.value));

  // One Animated.Value per bar, grown from 0 to its target height whenever
  // the underlying data changes (new day range, tab switch, refresh) instead
  // of snapping straight to the final heights.
  const animations = useRef<Animated.Value[]>([]).current;
  while (animations.length < data.length) animations.push(new Animated.Value(0));

  useEffect(() => {
    const targets = data.map((d) => Math.max(4, (d.value / max) * BAR_MAX_HEIGHT));
    Animated.stagger(
      24,
      targets.map((target, i) =>
        Animated.timing(animations[i], { toValue: target, duration: 320, useNativeDriver: false }),
      ),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data)]);

  return (
    <View style={styles.row}>
      {data.map((d, i) => {
        const barColor =
          highlightIndex === undefined ? resolvedColor : i === highlightIndex ? resolvedColor : `${resolvedColor}66`;
        return (
          <View key={i} style={styles.column}>
            <Animated.View style={[styles.bar, { height: animations[i] ?? 4, backgroundColor: barColor }]} />
            <Text style={[styles.label, highlightIndex === i && styles.labelActive]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      height: BAR_MAX_HEIGHT + 20,
      marginTop: 8,
    },
    column: { alignItems: "center", flex: 1, gap: 4 },
    bar: { width: 14, borderRadius: 4 },
    label: { fontSize: 10, color: colors.mutedForeground },
    labelActive: { color: colors.foreground, fontWeight: "600" },
  });
}
