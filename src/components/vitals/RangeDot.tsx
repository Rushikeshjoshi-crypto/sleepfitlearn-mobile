import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import type { RangeBand } from "../../lib/vitals/ranges";

// The light colour hint next to a heart rate / BP value (lib/vitals/ranges.ts).
// Neutral readings get no dot at all. Uses the health status tokens, kept apart
// from the brand orange (same as the web RangeDot).
export function RangeDot({ band }: { band: RangeBand }) {
  const { colors } = useTheme();
  if (band === "neutral") return null;
  const backgroundColor = band === "good" ? colors.statusGood : band === "watch" ? colors.statusWatch : colors.statusHigh;
  return <View style={[styles.dot, { backgroundColor }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6, alignSelf: "center" },
});
