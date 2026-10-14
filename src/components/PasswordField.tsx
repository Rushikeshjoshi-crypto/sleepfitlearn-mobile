import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";

type Props = Omit<TextInputProps, "secureTextEntry" | "style"> & {
  style?: object;
};

export function PasswordField({ style, ...props }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={!visible}
        {...props}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Text style={[styles.toggleText, !visible && styles.toggleTextMuted]}>👁</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrapper: { justifyContent: "center" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      paddingRight: 44,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    toggle: {
      position: "absolute",
      right: 12,
      height: 24,
      width: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    toggleText: { fontSize: 16, opacity: 1 },
    toggleTextMuted: { opacity: 0.4 },
  });
}
