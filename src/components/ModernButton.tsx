import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";

export type ModernButtonVariant = "primary" | "secondary" | "outline" | "destructive";

// Shared pill button — same shape every "Save"/"Log entry"/"Sign out" button
// in the app already used ad hoc (backgroundColor + borderRadius: 999 +
// paddingVertical), now with variants and a consistent loading/disabled state
// instead of every screen hand-rolling its own ActivityIndicator swap.
export function ModernButton({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ModernButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDark = variant === "primary" || variant === "destructive";

  return (
    <AnimatedPressable
      style={[styles.base, styles.variants[variant], style, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isDark ? colors.primaryForeground : colors.primary} />
      ) : (
        <Text style={[styles.text, styles.variantTexts[variant]]}>{title}</Text>
      )}
    </AnimatedPressable>
  );
}

function makeStyles(colors: ColorPalette) {
  const variants: Record<ModernButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.muted },
    outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
    destructive: { backgroundColor: colors.destructive },
  };
  const variantTexts = {
    primary: { color: colors.primaryForeground },
    secondary: { color: colors.foreground },
    outline: { color: colors.foreground },
    destructive: { color: colors.primaryForeground },
  } as const;

  return {
    ...StyleSheet.create({
      base: {
        borderRadius: 999,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 44,
      },
      disabled: { opacity: 0.5 },
      text: { fontSize: typography.body.fontSize, fontWeight: "600" },
    }),
    variants,
    variantTexts,
  };
}
