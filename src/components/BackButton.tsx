import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";

// Custom header-left back control — used in place of native-stack's default
// chevron so every pushed screen's back affordance gets the same press
// feedback (AnimatedPressable) as the rest of the app, and a guaranteed
// minimum 44pt touch target. This only replaces the visual element; Android
// hardware back and swipe-back gestures are still handled natively by
// @react-navigation/native-stack, untouched.
export function BackButton() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <AnimatedPressable
      style={styles.button}
      onPress={() => navigation.goBack()}
      borderless
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Text style={styles.arrow}>←</Text>
    </AnimatedPressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    button: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
    arrow: { fontSize: 22, color: colors.navTint, fontWeight: "600" },
  });
}
