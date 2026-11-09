import { useMemo } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

export type SettingsSectionId = "profile" | "body" | "preferences" | "family";

export const SETTINGS_SECTIONS: { id: SettingsSectionId; key: string }[] = [
  { id: "profile", key: "Settings:sectionProfile" },
  { id: "body", key: "Settings:sectionBody" },
  { id: "preferences", key: "Settings:sectionPreferences" },
  { id: "family", key: "Settings:sectionFamily" },
];

// The web's section rail, as a horizontal chip row on a phone: tap to jump,
// the section in view is filled orange.
export function SettingsRail({
  active,
  onSelect,
  t,
  label,
}: {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  t: (key: string) => string;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
      accessibilityLabel={label}
    >
      {SETTINGS_SECTIONS.map((s) => {
        const on = s.id === active;
        return (
          <AnimatedPressable
            key={s.id}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect(s.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(s.key)}</Text>
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bar: { backgroundColor: colors.background, flexGrow: 0 },
    row: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    chip: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: "center",
    },
    chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
    chipText: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.orangeForeground, fontWeight: "800" },
  });
}
