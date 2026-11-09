import { StyleSheet } from "react-native";
import { radius, typography, type ColorPalette } from "../../theme/palettes";

// Auth pages use the dark palette in both themes (the card sits on a photo,
// same as the web's AuthLayout). Pass darkColors.
export function makeAuthStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 20 },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    brandIcon: { width: 28, height: 28, borderRadius: radius.md },
    brandText: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    brandTextAccent: { fontStyle: "italic", color: colors.orange },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      gap: 12,
    },
    cardHeader: { alignItems: "center", gap: 4, marginBottom: 8 },
    title: { fontSize: typography.title.fontSize, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground, textAlign: "center" },
    subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
    input: {
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    button: {
      backgroundColor: colors.orange,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    buttonText: { color: colors.orangeForeground, fontSize: 16, fontWeight: "800" },
    footerLink: { color: "#F5F5F5", textAlign: "center" },
    footerLinkAccent: { color: colors.orange, fontWeight: "800" },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      backgroundColor: colors.destructiveBg,
      borderRadius: radius.md,
      padding: 12,
    },
    errorText: { color: colors.destructive },
  });
}
