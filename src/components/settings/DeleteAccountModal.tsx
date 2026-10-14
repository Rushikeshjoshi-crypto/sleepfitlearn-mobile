import { useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { ModernButton } from "../ModernButton";
import { DELETE_CONFIRMATION_WORD, isDeleteConfirmation } from "../../lib/account/deleteConfirmation";

// "Delete my account" — UI only. Account deletion isn't built yet
// (docs/account-deletion-design.md), so confirming makes NO backend call,
// deletes nothing in Cognito or any table, and just says "coming soon".
export function DeleteAccountModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Settings");
  const [typed, setTyped] = useState("");

  function close() {
    setTyped("");
    onClose();
  }

  function onConfirm() {
    if (!isDeleteConfirmation(typed)) return;
    close();
    Alert.alert(t("deleteAccount.comingSoonTitle"), t("deleteAccount.comingSoonBody"));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{t("deleteAccount.title")}</Text>
            <Text style={styles.body}>{t("deleteAccount.intro")}</Text>
            {[t("deleteAccount.item1"), t("deleteAccount.item2"), t("deleteAccount.item3")].map((line) => (
              <Text key={line} style={styles.body}>
                • {line}
              </Text>
            ))}
            <Text style={styles.warning}>{t("deleteAccount.noUndo")}</Text>
            <Text style={styles.label}>{t("deleteAccount.typePrompt", { word: DELETE_CONFIRMATION_WORD })}</Text>
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={DELETE_CONFIRMATION_WORD}
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel={t("deleteAccount.typePrompt", { word: DELETE_CONFIRMATION_WORD })}
            />
            <ModernButton
              title={t("deleteAccount.confirm")}
              onPress={onConfirm}
              variant="destructive"
              disabled={!isDeleteConfirmation(typed)}
            />
            <ModernButton title={t("deleteAccount.cancel")} onPress={close} variant="outline" />
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
    content: { padding: 20, gap: 12 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", color: colors.foreground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground, lineHeight: 21 },
    warning: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.destructive },
    label: { fontSize: typography.bodySmall.fontSize, fontWeight: "600", color: colors.foreground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: typography.body.fontSize,
      color: colors.foreground,
    },
  });
}
