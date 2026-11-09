import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { avatarPickerHtml, parseAvatarMessage, type AvatarPickError } from "../../lib/settings/avatarPicker";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (dataUrl: string) => void;
  onError: (error: AvatarPickError) => void;
};

// Bottom sheet holding the file-chooser WebView (see lib/settings/avatarPicker).
export function AvatarPickerModal({ visible, onClose, onPicked, onError }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Settings", "Common"]);
  const html = useMemo(
    () =>
      avatarPickerHtml({
        label: t("Settings:uploadPhoto"),
        background: colors.card,
        accent: colors.orange,
        accentText: colors.orangeForeground,
      }),
    [colors, t],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("Settings:uploadPhoto")}</Text>
          <Text style={styles.hint}>{t("Settings:photoHint")}</Text>
          <View style={styles.web}>
            <WebView
              originWhitelist={["*"]}
              source={{ html }}
              javaScriptEnabled
              allowFileAccess
              style={{ backgroundColor: colors.card }}
              onMessage={(e) => {
                const m = parseAvatarMessage(e.nativeEvent.data);
                if (!m) return;
                if ("dataUrl" in m) onPicked(m.dataUrl);
                else onError(m.error);
              }}
            />
          </View>
          <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>{t("Common:cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: 20,
      gap: 8,
    },
    title: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    hint: { fontSize: 13, color: colors.mutedForeground },
    web: { height: 110, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
    cancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
    cancelText: { fontSize: 15, fontWeight: "700", color: colors.primary },
  });
}
