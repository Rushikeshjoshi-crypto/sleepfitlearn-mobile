import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";

// Exact visual clone of HabitsScreen.tsx's historyGroup/historyGroupLabel styles.
export function HistoryDateGroup({ label, children }: { label: string; children?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.historyGroup}>
      <Text style={styles.historyGroupLabel}>{label}</Text>
      {children}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    historyGroup: { marginTop: 8 },
    historyGroupLabel: {
      fontSize: typography.label.fontSize,
      fontWeight: "600",
      color: colors.mutedForeground,
      marginBottom: 4,
    },
  });
}
