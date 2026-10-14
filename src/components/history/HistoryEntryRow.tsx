import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

// Exact visual clone of HabitsScreen.tsx's appRow/appName/body row styles —
// the left side (title + optional subtitle) mirrors Habits' single-line
// "{glyph} {label}" text, and the right side mirrors its plain value text.
// `valueNode` is an escape hatch for a non-text value (e.g. Study's
// color-coded exam score badge), which isn't a Habits-history concept at all.
export function HistoryEntryRow({
  title,
  subtitle,
  value,
  valueNode,
  onPress,
  onLongPress,
  hideDivider = false,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  valueNode?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  // For a row that's visually part of a larger block below it (e.g. Study's
  // exam row + guidance panel) — Habits' history never composes a row with
  // extra content underneath, so there's no Habits equivalent to match here.
  hideDivider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <AnimatedPressable
      style={[styles.appRow, hideDivider && styles.appRowNoDivider]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.titleWrap}>
        <Text style={styles.appName}>{title}</Text>
        {subtitle && <Text style={styles.body}>{subtitle}</Text>}
      </View>
      {valueNode ?? <Text style={styles.body}>{value}</Text>}
    </AnimatedPressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    appRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    appRowNoDivider: { borderBottomWidth: 0, paddingBottom: 0 },
    titleWrap: { flex: 1 },
    appName: { fontSize: typography.body.fontSize, fontWeight: "500", color: colors.foreground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
  });
}
