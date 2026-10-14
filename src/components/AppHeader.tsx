import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { HamburgerMenu } from "./HamburgerMenu";
import { useScriptFontFamily } from "../lib/i18n/scriptFont";

// Shared top-of-screen header row for the bottom-tab root screens (Home,
// Sleep, Habits, Trends) — a title plus an optional right-side accessory
// slot (e.g. ThemeToggle on Home), replacing each screen's own bare
// `<Text style={styles.title}>` with one consistent layout. The hamburger
// menu (Insights/Settings/Study/Exercise/Personal — formerly the "More"
// tab) is always shown here so every tab root reaches it the same way.
export function AppHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scriptFontFamily = useScriptFontFamily();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, scriptFontFamily && { fontFamily: scriptFontFamily }]}>{title}</Text>
      <View style={styles.rightGroup}>
        {right}
        <HamburgerMenu />
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    rightGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
  });
}
