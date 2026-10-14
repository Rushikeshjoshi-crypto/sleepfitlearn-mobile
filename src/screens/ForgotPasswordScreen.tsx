import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { forgotPassword, confirmForgotPassword } from "../lib/aws/cognito";
import { getCognitoErrorMessage } from "../lib/aws/cognito-errors";
import type { AuthStackParamList } from "../navigation/AuthNavigator";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { PasswordField } from "../components/PasswordField";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

type Step = "email" | "reset" | "success";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Auth");
  // Shown on both a real send and a UserNotFoundException — never reveal
  // whether an account exists for the entered email.
  const codeSentMessage = t("ForgotPassword.codeSentMessage");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function onRequestCode() {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError(t("Validation.emailInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setInfo(codeSentMessage);
      setStep("reset");
    } catch (err) {
      const code = (err as { code?: string; name?: string } | undefined)?.code ?? (err as { name?: string } | undefined)?.name;
      if (code === "UserNotFoundException") {
        setInfo(codeSentMessage);
        setStep("reset");
        return;
      }
      setError(getCognitoErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetPassword() {
    setError(null);
    if (!code.trim()) {
      setError(t("Validation.codeRequired"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("Validation.passwordMin"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(t("Validation.passwordsDontMatch"));
      return;
    }
    setSubmitting(true);
    try {
      await confirmForgotPassword(email.trim(), code.trim(), newPassword);
      setStep("success");
      setTimeout(() => navigation.navigate("Login"), 2500);
    } catch (err) {
      setError(getCognitoErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setResending(true);
    try {
      await forgotPassword(email.trim());
      setInfo(t("ForgotPassword.newCodeSentMessage"));
    } catch (err) {
      setError(getCognitoErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image source={require("../../assets/images/brand-icon.png")} style={styles.brandIcon} />
          <Text style={styles.brandText}>
            SleepFit<Text style={styles.brandTextAccent}>Learn</Text>
          </Text>
        </View>

        <View style={styles.card}>
          {step === "success" ? (
            <>
              {/* No separate web key for this step's heading (web shows one
                  continuous form, not discrete steps) — kept mobile-only. */}
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{t("ForgotPassword.resetDoneTitle")}</Text>
                <Text style={styles.subtitle}>{t("ForgotPassword.successMessage")}</Text>
              </View>
              <AnimatedPressable style={styles.button} onPress={() => navigation.navigate("Login")}>
                <Text style={styles.buttonText}>{t("ForgotPassword.backToLogin")}</Text>
              </AnimatedPressable>
            </>
          ) : step === "reset" ? (
            <>
              {/* No separate web key for this step's heading either — same
                  reasoning as the success step above. */}
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{t("ForgotPassword.title")}</Text>
                <Text style={styles.subtitle}>{t("ForgotPassword.resetCodeSubtitle")}</Text>
              </View>

              {info && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>{info}</Text>
                </View>
              )}

              <TextInput
                style={styles.input}
                placeholder={t("ForgotPassword.verificationCodeLabel")}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
              />

              <AnimatedPressable style={styles.resendRow} onPress={onResend} disabled={resending}>
                <Text style={styles.resendText}>
                  {resending ? t("ForgotPassword.sendingEllipsis") : t("ForgotPassword.resendCode")}
                </Text>
              </AnimatedPressable>

              <PasswordField
                placeholder={t("ForgotPassword.newPasswordLabel")}
                autoComplete="new-password"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <PasswordField
                placeholder={t("ForgotPassword.confirmNewPasswordLabel")}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
              />

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <AnimatedPressable style={styles.button} onPress={onResetPassword} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.buttonText}>{t("ForgotPassword.resetPassword")}</Text>
                )}
              </AnimatedPressable>
            </>
          ) : (
            <>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{t("ForgotPassword.title")}</Text>
                <Text style={styles.subtitle}>{t("ForgotPassword.description")}</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder={t("ForgotPassword.emailLabel")}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <AnimatedPressable style={styles.button} onPress={onRequestCode} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.buttonText}>{t("ForgotPassword.sendCode")}</Text>
                )}
              </AnimatedPressable>
            </>
          )}
        </View>

        <AnimatedPressable onPress={() => navigation.navigate("Login")}>
          <Text style={styles.footerLink}>
            {t("ForgotPassword.rememberedIt")} <Text style={styles.footerLinkAccent}>{t("ForgotPassword.backToLogin")}</Text>
          </Text>
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 24,
      gap: 20,
    },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    brandIcon: { width: 28, height: 28, borderRadius: 8 },
    brandText: { fontSize: 20, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
    brandTextAccent: { fontStyle: "italic", color: colors.navTint },
    card: {
      backgroundColor: colors.card,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 28,
      gap: 12,
      shadowColor: colors.primary,
      shadowOpacity: 0.15,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },
    cardHeader: { alignItems: "center", gap: 4, marginBottom: 8 },
    title: {
      fontSize: typography.title.fontSize,
      fontWeight: "600",
      letterSpacing: -0.3,
      color: colors.foreground,
      textAlign: "center",
    },
    subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
    },
    buttonText: { color: colors.primaryForeground, fontSize: 16, fontWeight: "600" },
    resendRow: { alignItems: "flex-end" },
    resendText: { color: colors.navTint, fontSize: 14, fontWeight: "500" },
    footerLink: { color: colors.foreground, textAlign: "center" },
    // Fixed brand gold, not colors.navTint — see LoginScreen's same style for why.
    footerLinkAccent: { color: "#DAA520", fontWeight: "600" },
    errorBox: {
      borderWidth: 1,
      borderColor: colors.destructiveBorder,
      backgroundColor: colors.destructiveBg,
      borderRadius: 20,
      padding: 12,
    },
    errorText: { color: colors.destructive },
    infoBox: {
      borderWidth: 1,
      borderColor: colors.navTint,
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 12,
    },
    infoText: { color: colors.foreground, fontSize: typography.bodySmall.fontSize },
  });
}
