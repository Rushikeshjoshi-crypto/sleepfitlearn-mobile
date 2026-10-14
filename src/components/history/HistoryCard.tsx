import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

// Exact visual clone of HabitsScreen.tsx's history card (card/historyHeaderRow/
// historySummary styles) — pixel values copied on purpose rather than
// importing Habits' own styles, so this has no runtime dependency on that
// screen. Habits itself is NOT migrated to this component yet.
export function HistoryCard({
  title,
  summaryText,
  expanded,
  onToggle,
  expandLabel,
  collapseLabel,
  children,
}: {
  title: string;
  summaryText: string | null;
  expanded: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <AnimatedPressable
        style={styles.historyHeaderRow}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? collapseLabel : expandLabel}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        {summaryText && <Text style={styles.historySummary}>{summaryText}</Text>}
      </AnimatedPressable>

      {expanded && children}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 8,
    },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    historyHeaderRow: { gap: 2 },
    historySummary: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
  });
}
