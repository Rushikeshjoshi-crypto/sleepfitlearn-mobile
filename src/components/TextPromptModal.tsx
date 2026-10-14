import { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AnimatedPressable } from "./AnimatedPressable";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";

// Alert.prompt is iOS-only in RN — this is the Android-compatible equivalent
// for the one place free-text entry is needed (naming a custom activity slot).
export default function TextPromptModal({
  visible,
  title,
  initialValue = "",
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Common");
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            autoFocus
            placeholder={t("namePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
          />
          <View style={styles.actions}>
            <AnimatedPressable style={styles.actionButton} onPress={onClose}>
              <Text style={styles.cancelText}>{t("cancel")}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.actionButton}
              onPress={() => {
                onSubmit(value.trim());
                onClose();
              }}
            >
              <Text style={styles.saveText}>{t("save")}</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 16 },
    title: { fontSize: 16, fontWeight: "600", color: colors.foreground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.foreground,
    },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 20 },
    actionButton: { paddingVertical: 6, paddingHorizontal: 4 },
    cancelText: { color: colors.mutedForeground, fontWeight: "500" },
    saveText: { color: colors.navTint, fontWeight: "600" },
  });
}
