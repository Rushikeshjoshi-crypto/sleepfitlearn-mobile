import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COUNTRY_CODES, type CountryCodeOption } from "../lib/data/countryCodes";
import { useTheme } from "../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../theme/palettes";

type Props = {
  value: string; // ISO alpha-2 code
  onChange: (code: string) => void;
  // Override the theme palette (auth pages are always dark).
  colors?: ColorPalette;
};

// Compact trigger + slide-up list, no picker dependency needed for a
// 10-country list — mirrors the shadcn Select used on the web app's
// register page (Frontend-Next-SleepFitLearn/src/components/auth/SignUpForm.tsx).
export function CountryCodeField({ value, onChange, colors: colorsProp }: Props) {
  const theme = useTheme();
  const colors = colorsProp ?? theme.colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("UI");
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0];

  function select(country: CountryCodeOption) {
    onChange(country.code);
    setOpen(false);
  }

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText}>
          {selected.flag} {selected.dialCode}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} transparent>
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select country code</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={styles.closeText}>{t("close")}</Text>
              </Pressable>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.row, item.code === value && styles.rowSelected]}
                  onPress={() => select(item)}
                >
                  <Text style={styles.rowText}>
                    {item.flag} {item.name}
                  </Text>
                  <Text style={styles.rowDialCode}>{item.dialCode}</Text>
                </Pressable>
              )}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    trigger: {
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: colors.background,
      justifyContent: "center",
    },
    triggerText: { fontSize: 16, color: colors.foreground },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      maxHeight: "70%",
    },
    sheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    closeText: { fontSize: 14, color: colors.primary, fontWeight: "700" },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    rowSelected: { backgroundColor: colors.primary + "1A" },
    rowText: { fontSize: typography.body.fontSize, color: colors.foreground },
    rowDialCode: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
  });
}
