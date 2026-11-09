import { useMemo } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import type { PersonalEntry } from "../../lib/api/fitness";
import { FOCUS_KINDS, type MetricKey } from "../../lib/personal/metricStats";
import { AnimatedPressable } from "../AnimatedPressable";

export function latestDisplay(entry: PersonalEntry): string {
  if (entry.kind === "bp") return `${entry.systolic ?? "—"} / ${entry.diastolic ?? "—"}`;
  return String(entry.value);
}

// Mobile port of the web app's VitalsGrid: one chip per metric with its latest
// value; the selected one is filled. Scrolls sideways.
export function MetricChips({
  entries,
  selected,
  onSelect,
  label,
  metricLabel,
}: {
  entries: PersonalEntry[];
  selected: MetricKey;
  onSelect: (kind: MetricKey) => void;
  label: string;
  metricLabel: (kind: MetricKey) => string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={label}
      style={styles.scroll}
    >
      {FOCUS_KINDS.map((kind) => {
        const latest = entries.find((e) => e.kind === kind);
        const on = kind === selected;
        return (
          <AnimatedPressable
            key={kind}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect(kind)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{metricLabel(kind)}</Text>
            {latest ? <Text style={[styles.chipValue, on && styles.chipValueOn]}>{latestDisplay(latest)}</Text> : null}
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    scroll: { flexGrow: 0 },
    row: { gap: 8, paddingVertical: 2 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipLabel: { fontSize: 14, fontWeight: "800", color: colors.foreground },
    chipLabelOn: { color: colors.primaryForeground },
    chipValue: { fontSize: 13, color: colors.mutedForeground },
    chipValueOn: { color: colors.primaryForeground, opacity: 0.85 },
  });
}
