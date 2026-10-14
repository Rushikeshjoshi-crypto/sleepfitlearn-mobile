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
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { PasswordField } from "../components/PasswordField";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const { colors } = useTheme();
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
    <KeyboardAvoidingView
      style={styles.screen}
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
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 20,
    backgroundColor: colors.background,
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
  title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
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
  forgotPasswordRow: { alignItems: "flex-end" },
  forgotPasswordText: { color: colors.navTint, fontSize: 14, fontWeight: "500" },
  link: { color: colors.navTint, textAlign: "center", marginTop: 8, fontWeight: "500" },
  footerLink: { color: colors.foreground, textAlign: "center" },
  // Fixed brand gold, not colors.navTint — navTint is theme-adaptive (dark
  // forest green in light mode, per palettes.ts's own design), which read
  // as near-black here. This is meant to always be gold, in either theme.
  footerLinkAccent: { color: "#DAA520", fontWeight: "600" },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.destructiveBorder,
    backgroundColor: colors.destructiveBg,
    borderRadius: 20,
    padding: 12,
  },
  errorText: { color: colors.destructive },
  });
}
