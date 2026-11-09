import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { signIn, resendConfirmationCode } from "../lib/aws/cognito";
import { getCognitoErrorMessage } from "../lib/aws/cognito-errors";
import { ensureUserProfile } from "../lib/api/users";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "../i18n";
import { useAuth } from "../lib/aws/AuthContext";
import type { AuthStackParamList } from "../navigation/AuthNavigator";
import { darkColors, type ColorPalette } from "../theme/palettes";
import { AuthBackground } from "../components/auth/AuthBackground";
import { makeAuthStyles } from "../components/auth/authStyles";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { PasswordField } from "../components/PasswordField";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  // Auth pages are always dark: the card sits on a photo (web AuthLayout).
  const colors = darkColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Auth");
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit() {
    setError(null);
    setUnconfirmedEmail(null);
    if (!email.trim() || !password) {
      // Mobile-only validation message — web enforces this via native HTML
      // "required" inputs rather than a translated string, so there's no
      // equivalent key to port from src/messages/*.json.
      setError(t("Validation.emailPasswordRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      const profile = await ensureUserProfile().catch(() => null);
      // Same as the web app's SignInForm: the account's saved language wins
      // over whatever this device was showing before login.
      const preferred = profile?.preferred_language;
      if (preferred && (SUPPORTED_LANGUAGES as readonly string[]).includes(preferred)) {
        await setLanguage(preferred as SupportedLanguage);
      }
      await refresh();
    } catch (err) {
      const code = (err as { code?: string; name?: string } | undefined)?.code ?? (err as { name?: string } | undefined)?.name;
      if (code === "UserNotConfirmedException") setUnconfirmedEmail(email.trim());
      setError(getCognitoErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!unconfirmedEmail) return;
    setResending(true);
    try {
      await resendConfirmationCode(unconfirmedEmail);
      setError(t("Login.verificationEmailSent"));
    } catch (err) {
      setError(getCognitoErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthBackground variant="login">
    <KeyboardAvoidingView
      style={[styles.screen, styles.scrollContent]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.brandRow}>
        <Image source={require("../../assets/images/brand-icon.png")} style={styles.brandIcon} />
        <Text style={styles.brandText}>
          SleepFit<Text style={styles.brandTextAccent}>Learn</Text>
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{t("Login.title")}</Text>
          <Text style={styles.subtitle}>{t("Login.description")}</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder={t("Login.emailLabel")}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <PasswordField
          colors={colors}
          placeholder={t("Login.passwordLabel")}
          autoComplete="off"
          importantForAutofill="no"
          value={password}
          onChangeText={setPassword}
        />

        <AnimatedPressable
          style={styles.forgotPasswordRow}
          onPress={() => navigation.navigate("ForgotPassword")}
        >
          <Text style={styles.forgotPasswordText}>{t("Login.forgotPassword")}</Text>
        </AnimatedPressable>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            {unconfirmedEmail && (
              <AnimatedPressable onPress={onResend} disabled={resending}>
                <Text style={styles.link}>{resending ? t("Login.sendingEllipsis") : t("Login.resendVerificationEmail")}</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        <AnimatedPressable style={styles.button} onPress={onSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>{t("Login.submit")}</Text>
          )}
        </AnimatedPressable>
      </View>

      <AnimatedPressable onPress={() => navigation.navigate("SignUp")}>
        <Text style={styles.footerLink}>
          {t("Login.noAccount")} <Text style={styles.footerLinkAccent}>{t("Login.createOne")}</Text>
        </Text>
      </AnimatedPressable>
    </KeyboardAvoidingView>
    </AuthBackground>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    ...makeAuthStyles(colors),
    forgotPasswordRow: { alignItems: "flex-end" },
    forgotPasswordText: { color: colors.orange, fontSize: 14, fontWeight: "600" },
    link: { color: colors.orange, textAlign: "center", marginTop: 8, fontWeight: "600" },
  });
}
