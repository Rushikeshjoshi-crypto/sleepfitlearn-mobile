import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";

// Quick-access theme switch for the Home header — reuses the exact same
// ThemeContext/useTheme() the Settings screen's Light/Dark/System control
// uses (no separate theme state). Tapping flips between light and dark
// directly; the fuller System option still lives in Settings for anyone who
// wants "follow the OS" specifically.
export function ThemeToggle() {
  const { colors, resolvedScheme, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function toggle() {
    setMode(resolvedScheme === "dark" ? "light" : "dark");
  }

  return (
    <AnimatedPressable
      style={styles.button}
      onPress={toggle}
      borderless
      accessibilityRole="button"
      accessibilityLabel={resolvedScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Text style={styles.icon}>{resolvedScheme === "dark" ? "☀️" : "🌙"}</Text>
    </AnimatedPressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    icon: { fontSize: 18 },
  });
}
