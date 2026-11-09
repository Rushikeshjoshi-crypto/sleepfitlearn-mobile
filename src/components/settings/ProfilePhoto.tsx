import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { updateAvatar, type UserProfile } from "../../lib/api/users";
import type { AvatarPickError } from "../../lib/settings/avatarPicker";
import { AvatarPickerModal } from "./AvatarPickerModal";

type Props = {
  avatar: string | null | undefined;
  initial: string;
  name: string;
  onSaved: (profile: UserProfile) => void;
};

// Profile photo: shows the saved photo (or the initial), upload / change /
// remove. Picking goes through a WebView file chooser (no native picker lib).
export function ProfilePhoto({ avatar, initial, name, onSaved }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Settings", "Common"]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null, doneKey: "photoUpdated" | "photoRemoved") {
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateAvatar(next));
      Alert.alert(t(`Settings:${doneKey}`));
    } catch {
      setError(t("Settings:photoSaveError"));
    } finally {
      setBusy(false);
    }
  }

  function onPickError(code: AvatarPickError) {
    setPickerOpen(false);
    setError(t(code === "type" ? "Settings:photoTypeError" : code === "size" ? "Settings:photoSizeError" : "Settings:photoReadError"));
  }

  function confirmRemove() {
    Alert.alert(t("Settings:removePhotoTitle"), t("Settings:removePhotoDescription"), [
      { text: t("Common:cancel"), style: "cancel" },
      { text: t("Settings:removePhoto"), style: "destructive", onPress: () => save(null, "photoRemoved") },
    ]);
  }

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.image} accessibilityLabel={t("Settings:photoAlt", { name })} />
        ) : (
          <Text style={styles.initial}>{initial}</Text>
        )}
      </View>
      <View style={styles.actions}>
        <View style={styles.buttons}>
          <AnimatedPressable style={styles.primaryBtn} onPress={() => setPickerOpen(true)} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.orangeForeground} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>{avatar ? t("Settings:changePhoto") : t("Settings:uploadPhoto")}</Text>
            )}
          </AnimatedPressable>
          {avatar ? (
            <AnimatedPressable style={styles.ghostBtn} onPress={confirmRemove} disabled={busy}>
              <Text style={styles.ghostBtnText}>{t("Settings:removePhoto")}</Text>
            </AnimatedPressable>
          ) : null}
        </View>
        <Text style={styles.hint}>{t("Settings:photoHint")}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <AvatarPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onError={onPickError}
        onPicked={(dataUrl) => {
          setPickerOpen(false);
          save(dataUrl, "photoUpdated");
        }}
      />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      overflow: "hidden",
      backgroundColor: colors.orange,
      alignItems: "center",
      justifyContent: "center",
    },
    image: { width: 72, height: 72 },
    initial: { fontSize: 28, fontWeight: "800", color: colors.orangeForeground },
    actions: { flex: 1, gap: 6 },
    buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    primaryBtn: {
      backgroundColor: colors.orange,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: { color: colors.orangeForeground, fontSize: 14, fontWeight: "800" },
    ghostBtn: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    ghostBtnText: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    hint: { fontSize: 12, color: colors.mutedForeground },
    error: { fontSize: 12, color: colors.destructive },
  });
}
