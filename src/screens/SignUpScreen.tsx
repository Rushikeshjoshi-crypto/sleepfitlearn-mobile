import { useEffect, useMemo, useState } from "react";
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
import {
  AsYouType,
  isSupportedCountry,
  isValidPhoneNumber,
  parsePhoneNumber,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js";
import { signUp } from "../lib/aws/cognito";
import { getCognitoErrorMessage } from "../lib/aws/cognito-errors";
import { preSignUpRefusalKey } from "../lib/auth/preSignUp";
import { getConfirmationStatus } from "../lib/api/authStatus";
import type { AuthStackParamList } from "../navigation/AuthNavigator";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { PasswordField } from "../components/PasswordField";
import { CountryCodeField } from "../components/CountryCodeField";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "../lib/data/countryCodes";
import { ageBandFromBirthYear, parseBirthYearInput } from "../lib/family/age";
import { savePendingBirthYear } from "../lib/family/pending";

type Props = NativeStackScreenProps<AuthStackParamList, "SignUp">;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The user confirms via the emailed link, opened outside this app, so
// nothing tells this screen it happened — polling is the only way to pick
// it up without the user manually refreshing/reopening. 5s matches the web
// app's JustRegisteredNotice (src/components/auth/JustRegisteredNotice.tsx):
// responsive enough that they're typically back within seconds of tapping
// the link, cheap since polling stops the moment confirmed comes back true.
const POLL_INTERVAL_MS = 5000;

export default function SignUpScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Auth");
  const { t: tFamily } = useTranslation("Family");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // AsYouType alone doesn't stop the user from typing past a real number's
  // length — once nothing matches its format template it just echoes raw
  // digits back unformatted. Reject the keystroke once the selected
  // country's own metadata says the number is already too long, rather
  // than only catching it later on submit. Max digit count comes from the
  // library per country, never hardcoded.
  function onChangePhone(raw: string) {
    if (!isSupportedCountry(countryCode)) {
      setPhone(raw);
      return;
    }
    if (validatePhoneNumberLength(raw, countryCode as CountryCode) === "TOO_LONG") {
      return;
    }
    setPhone(new AsYouType(countryCode as CountryCode).input(raw));
  }

  // Mobile-only validation copy — web enforces these via zod schema messages
  // that were never exposed as translation keys in src/messages/*.json, so
  // there's nothing to port here.
  function validate(): string | null {
    if (!fullName.trim()) return t("Validation.fullNameRequired");
    if (!EMAIL_RE.test(email.trim())) return t("Validation.emailInvalid");
    if (!isSupportedCountry(countryCode) || !isValidPhoneNumber(phone, countryCode as CountryCode)) {
      const countryName = COUNTRY_CODES.find((c) => c.code === countryCode)?.name ?? countryCode;
      return t("Validation.phoneInvalid", { country: countryName });
    }
    // Required for every new account (the backend refuses a profile without
    // one); under-13s are stopped here, before any Cognito account exists.
    const year = parseBirthYearInput(birthYear);
    if (year == null) return tFamily("Age.birthYearInvalid");
    if (ageBandFromBirthYear(year) === "under_13") return tFamily("Age.under13");
    if (password.length < 8) return t("Validation.passwordMin");
    if (password !== confirmPassword) return t("Validation.passwordsDontMatch");
    return null;
  }

  async function onSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Validated per-country by validate() above, so this always resolves to
      // a real E.164 number (e.g. +919876543210) for a supported country.
      const phoneNumber = isSupportedCountry(countryCode)
        ? parsePhoneNumber(phone, countryCode as CountryCode).number
        : phone;
      // Sent with the first profile POST after login (ensureUserProfile); a
      // login on another device asks again via ProfileGate.
      const year = parseBirthYearInput(birthYear)!;
      await savePendingBirthYear(email.trim(), year);
      await signUp(email.trim(), password, { name: fullName.trim(), phoneNumber, countryCode, birthYear: year });
      setDone(true);
    } catch (err) {
      // The server-side age check refused it: same message as the form's own check.
      const refusalKey = preSignUpRefusalKey(err);
      setError(refusalKey ? tFamily(refusalKey) : getCognitoErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Checked immediately once we enter the "done" state (rather than waiting a
  // full interval), then re-checked on a timer until confirmed — confirmation
  // happens outside this app via the emailed link, so there's no push signal,
  // only polling. Stops itself (interval cleared) the moment a check comes
  // back confirmed, and always on unmount/re-run, so no timer outlives the
  // component whether the user gets confirmed or navigates away.
  useEffect(() => {
    if (!done) return;
    const confirmEmail = email.trim();
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const check = () => {
      getConfirmationStatus(confirmEmail)
        .then((result) => {
          if (cancelled) return;
          if (result.confirmed) {
            setConfirmed(true);
            clearInterval(intervalId);
          }
        })
        .catch(() => {
          // Leave the pending "check your email" message showing — a failed
          // check is not evidence the account is confirmed. Keep polling;
          // this is most likely a transient network blip.
        });
    };

    check();
    intervalId = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [done, email]);

  if (done) {
    return (
      <View style={[styles.screen, styles.scrollContent]}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            {/* Titles are mobile-only — web's JustRegisteredNotice is a single
                inline banner with no separate heading, only the body copy below. */}
            <Text style={styles.title}>{confirmed ? t("SignUp.emailVerifiedTitle") : t("SignUp.checkEmailTitle")}</Text>
            <Text style={styles.subtitle}>
              {confirmed
                ? t("JustRegisteredNotice.verified")
                : t("JustRegisteredNotice.checkEmail", { email: email.trim() }).replace(/<\/?bold>/g, "")}
            </Text>
          </View>
          <AnimatedPressable style={styles.button} onPress={() => navigation.navigate("Login")}>
            {/* No matching web key (web's equivalent flow has no separate
                "back" button on this notice) — left as mobile-only English. */}
            <Text style={styles.buttonText}>{t("SignUp.backToSignIn")}</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
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
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{t("SignUp.title")}</Text>
          <Text style={styles.subtitle}>{t("SignUp.description")}</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder={t("SignUp.fullNameLabel")}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="words"
          autoComplete="name"
          value={fullName}
          onChangeText={setFullName}
        />
        <TextInput
          style={styles.input}
          placeholder={t("SignUp.emailLabel")}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <View style={styles.phoneRow}>
          <CountryCodeField value={countryCode} onChange={setCountryCode} />
          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder={t("SignUp.phonePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={onChangePhone}
          />
        </View>
        <TextInput
          style={styles.input}
          // The fields have no separate labels, so: "Birth year (e.g. 1995)".
          placeholder={`${tFamily("Age.birthYearLabel")} (${tFamily("Age.birthYearPlaceholder")})`}
          accessibilityLabel={tFamily("Age.birthYearLabel")}
          placeholderTextColor={colors.mutedForeground}
          value={birthYear}
          onChangeText={(v) => setBirthYear(v.replace(/[^0-9]/g, "").slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityHint={tFamily("Age.birthYearHelper")}
        />
        <Text style={styles.birthYearHint}>{tFamily("Age.birthYearHelper")}</Text>
        <PasswordField
          placeholder={t("SignUp.passwordLabel")}
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />
        <PasswordField
          placeholder={t("SignUp.confirmPasswordLabel")}
          autoComplete="new-password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <AnimatedPressable style={styles.button} onPress={onSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>{t("SignUp.submit")}</Text>
          )}
        </AnimatedPressable>
      </View>

      <AnimatedPressable onPress={() => navigation.navigate("Login")}>
        <Text style={styles.footerLink}>
          {t("SignUp.haveAccount")} <Text style={styles.footerLinkAccent}>{t("SignUp.signIn")}</Text>
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
  title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
  birthYearHint: { fontSize: 12, color: colors.mutedForeground, marginTop: -4 },
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
  phoneRow: { flexDirection: "row", gap: 8 },
  phoneInput: { flex: 1 },
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
  });
}
