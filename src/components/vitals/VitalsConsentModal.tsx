import { useMemo } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { ModernButton } from "../ModernButton";

// Shown before Health Connect is ever asked for heart rate / BP: what is read,
// why, where it goes, and that it's wellness only. Agreeing is stored with
// the consent version (lib/vitals/preference.ts).
export function VitalsConsentModal({
  visible,
  onAgree,
  onClose,
}: {
  visible: boolean;
  onAgree: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Vitals");

  const sections: [string, string][] = [
    [t("consentWhatTitle"), t("consentWhat")],
    [t("consentWhyTitle"), t("consentWhy")],
    [t("consentWhereTitle"), t("consentWhere")],
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t("consentTitle")}</Text>
            {sections.map(([title, body]) => (
              <View key={title} style={styles.section}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.body}>{body}</Text>
              </View>
            ))}
            <Text style={styles.disclaimer}>{t("disclaimer")}</Text>
            <ModernButton title={t("consentAgree")} onPress={onAgree} />
            <ModernButton title={t("consentNotNow")} onPress={onClose} variant="outline" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { maxHeight: "90%", backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    content: { padding: 20, gap: 14 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", color: colors.foreground },
    section: { gap: 4 },
    sectionTitle: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground, lineHeight: 21 },
    disclaimer: { fontSize: typography.bodySmall.fontSize, color: colors.foreground, fontWeight: "600" },
  });
}
