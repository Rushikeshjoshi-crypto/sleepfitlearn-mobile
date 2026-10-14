import { useMemo, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";

// Shared "card that's also a button" — the raised bordered surface used
// everywhere (log rows, list entries, menu rows) combined with the
// standard press feedback, so every card-shaped tappable in the app looks
// and feels the same instead of each screen rebuilding the same box.
export function PressableCard({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={[styles.card, style]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      scaleTo={0.98}
    >
      {children}
    </AnimatedPressable>
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
    },
  });
}
