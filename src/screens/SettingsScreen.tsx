import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/aws/AuthContext";
import { getUserProfile, updateUserProfile, type UserProfile } from "../lib/api/users";
import { useTheme, type ThemeMode } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import SelectModal, { type SelectSection } from "../components/SelectModal";
import { CountryCodeField } from "../components/CountryCodeField";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "../i18n";
import { ApiError } from "../lib/api/client";
import { birthYearErrorKey } from "../lib/family/familyErrors";
import { FamilySection } from "../components/family/FamilySection";
import { loadErrorText } from "../lib/api/gateErrors";
import { canSaveProfile } from "../lib/settings/canSaveProfile";
import { lockedProfileFields } from "../lib/settings/lockedFields";
import { ModernButton } from "../components/ModernButton";
import { DeleteAccountModal } from "../components/settings/DeleteAccountModal";

const MODE_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: "light", labelKey: "Settings:themeLight" },
  { value: "dark", labelKey: "Settings:themeDark" },
  { value: "system", labelKey: "Settings:themeSystem" },
];

const CURRENT_YEAR = new Date().getFullYear();

function toFormValues(profile: UserProfile) {
  return {
    nickname: profile.nickname ?? "",
    sex: profile.sex === "male" || profile.sex === "female" ? profile.sex : "",
    birthYear: profile.date_of_birth ? profile.date_of_birth.slice(0, 4) : "",
    heightCm: profile.height_cm != null ? String(profile.height_cm) : "",
    targetWeightKg: profile.target_weight_kg != null ? String(profile.target_weight_kg) : "",
    countryCode: profile.country_code ?? "",
  };
}

// Mirrors the web app's profileSchema ranges (src/lib/validation/profile.ts)
// — mobile has no zod/react-hook-form, so this is a plain manual check
// matching the same numeric bounds instead.
function validate(values: ReturnType<typeof toFormValues>, t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (values.birthYear) {
    const year = Number(values.birthYear);
    if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) {
      return t("Settings:birthYearRange", { year: CURRENT_YEAR });
    }
  }
  if (values.heightCm) {
    const cm = Number(values.heightCm);
    if (!Number.isFinite(cm) || cm < 50 || cm > 250) return t("Settings:heightRange");
  }
  if (values.targetWeightKg) {
    const kg = Number(values.targetWeightKg);
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) return t("Settings:targetWeightRange");
  }
  return null;
}

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Settings", "Nav", "Common", "Family"]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [sexPickerOpen, setSexPickerOpen] = useState(false);
  // Height / target weight / sex the server hides and locks for this account
  // (13–17 while minor_data_enabled is off). Saving sends them back empty and
  // the server keeps the stored values.
  const locked = lockedProfileFields(profile);

  const [form, setForm] = useState(() => toFormValues({} as UserProfile));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        setProfile(p);
        setForm(toFormValues(p));
        setLoadError(null);
      })
      .catch((err) => setLoadError(loadErrorText(err, t("Settings:loadProfileError"))))
      .finally(() => setLoading(false));
  }, [t]);

  const languageSections: SelectSection[] = [
    {
      title: "",
      data: SUPPORTED_LANGUAGES.map((code) => ({ label: t(`Settings:languages.${code}`), value: code })),
    },
  ];

  const sexSections: SelectSection[] = [
    {
      title: "",
      data: [
        { label: t("Settings:male"), value: "male" },
        { label: t("Settings:female"), value: "female" },
      ],
    },
  ];

  // Same as the web app's ProfileForm.handleLanguageChange: applies right away
  // (not batched with "Save changes") and saves preferred_language on the
  // profile, so the choice follows the account to other devices.
  async function onLanguageChange(lang: SupportedLanguage) {
    await setLanguage(lang);
    try {
      const updated = await updateUserProfile({ preferred_language: lang });
      setProfile(updated);
    } catch {
      Alert.alert(t("Settings:saveProfileError"));
    }
  }

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!canSaveProfile({ submitting, loading, profile, loadError })) return;
    setFormError(null);
    const validationError = validate(form, t);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateUserProfile({
        nickname: form.nickname.trim() || null,
        sex: form.sex || null,
        date_of_birth: form.birthYear ? `${form.birthYear}-01-01` : null,
        height_cm: form.heightCm ? Number(form.heightCm) : null,
        target_weight_kg: form.targetWeightKg ? Number(form.targetWeightKg) : null,
        country_code: form.countryCode || null,
      });
      setProfile(updated);
      setForm(toFormValues(updated));
      Alert.alert(t("Settings:profileUpdated"));
    } catch (err) {
      // Birth-year edits go through the backend age gate (ageGate.js).
      const key = err instanceof ApiError ? birthYearErrorKey(err.code) : null;
      setFormError(key ? t(`Family:Errors.${key}`) : t("Settings:saveProfileError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>{t("Settings:emailLabel")}</Text>
        {loading ? (
          <ActivityIndicator color={colors.navTint} />
        ) : (
          <Text style={styles.value}>{profile?.email ?? "—"}</Text>
        )}
        {loadError && <Text style={styles.errorText}>{loadError}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("Settings:pageTitle")}</Text>
        <Text style={styles.hint}>{t("Settings:pageDescription")}</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("Settings:nicknameLabel")}</Text>
          <TextInput
            style={styles.input}
            value={form.nickname}
            onChangeText={(v) => field("nickname", v)}
            placeholder={t("Settings:nicknamePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {locked.size > 0 && <Text style={styles.hint}>{t("Settings:lockedFieldsNote")}</Text>}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("Settings:sexLabel")}</Text>
          <AnimatedPressable
            style={[styles.pickerRow, locked.has("sex") && styles.lockedField]}
            onPress={() => setSexPickerOpen(true)}
            disabled={locked.has("sex")}
          >
            <Text style={form.sex ? styles.value : styles.placeholderText}>
              {form.sex ? t(`Settings:${form.sex}`) : t("Settings:sexPlaceholder")}
            </Text>
          </AnimatedPressable>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("Settings:birthYearLabel")}</Text>
          <TextInput
            style={styles.input}
            value={form.birthYear}
            onChangeText={(v) => field("birthYear", v.replace(/[^0-9]/g, ""))}
            placeholder="1990"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, styles.halfField]}>
            <Text style={styles.label}>{t("Settings:heightLabel")}</Text>
            <TextInput
              style={[styles.input, locked.has("height_cm") && styles.lockedField]}
              editable={!locked.has("height_cm")}
              value={form.heightCm}
              onChangeText={(v) => field("heightCm", v.replace(/[^0-9.]/g, ""))}
              placeholder="176"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.fieldGroup, styles.halfField]}>
            <Text style={styles.label}>{t("Settings:targetWeightLabel")}</Text>
            <TextInput
              style={[styles.input, locked.has("target_weight_kg") && styles.lockedField]}
              editable={!locked.has("target_weight_kg")}
              value={form.targetWeightKg}
              onChangeText={(v) => field("targetWeightKg", v.replace(/[^0-9.]/g, ""))}
              placeholder="70"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("Settings:countryLabel")}</Text>
          <CountryCodeField value={form.countryCode} onChange={(code) => field("countryCode", code)} />
          <Text style={styles.hint}>{t("Settings:countryHelper")}</Text>
        </View>

        {formError && <Text style={styles.errorText}>{formError}</Text>}

        <AnimatedPressable
          style={styles.button}
          onPress={onSave}
          disabled={!canSaveProfile({ submitting, loading, profile, loadError })}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.buttonText}>{t("Settings:saveChanges")}</Text>
          )}
        </AnimatedPressable>
      </View>

      <FamilySection />

      <View style={styles.card}>
        <Text style={styles.label}>{t("Settings:appearanceLabel")}</Text>
        <View style={styles.modeRow}>
          {MODE_OPTIONS.map((option) => (
            <AnimatedPressable
              key={option.value}
              style={[styles.modeButton, mode === option.value && styles.modeButtonActive]}
              onPress={() => setMode(option.value)}
            >
              <Text style={[styles.modeText, mode === option.value && styles.modeTextActive]}>
                {t(option.labelKey)}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
        <Text style={styles.hint}>{t("Settings:systemThemeHint")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("Settings:preferredLanguageLabel")}</Text>
        <AnimatedPressable style={styles.languageRow} onPress={() => setLanguagePickerOpen(true)}>
          <Text style={styles.value}>{t(`Settings:languages.${i18n.language}`)}</Text>
        </AnimatedPressable>
      </View>

      <AnimatedPressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>{t("Nav:logout")}</Text>
      </AnimatedPressable>

      {/* UI only for now: confirming says "coming soon" (DeleteAccountModal). */}
      <ModernButton title={t("Settings:deleteAccount.button")} onPress={() => setDeleteAccountOpen(true)} variant="destructive" />
      <DeleteAccountModal visible={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />

      <SelectModal
        visible={languagePickerOpen}
        title={t("Settings:preferredLanguageLabel")}
        sections={languageSections}
        onSelect={(value) => onLanguageChange(value as SupportedLanguage)}
        onClose={() => setLanguagePickerOpen(false)}
      />

      <SelectModal
        visible={sexPickerOpen}
        title={t("Settings:sexLabel")}
        sections={sexSections}
        onSelect={(value) => field("sex", value as "male" | "female")}
        onClose={() => setSexPickerOpen(false)}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 8,
    },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    label: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    value: { fontSize: 16, fontWeight: "500", color: colors.foreground },
    placeholderText: { fontSize: 16, color: colors.mutedForeground },
    languageRow: { minHeight: 44, justifyContent: "center" },
    modeRow: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: 999, padding: 4, gap: 4 },
    modeButton: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", minHeight: 44, justifyContent: "center" },
    modeButtonActive: { backgroundColor: colors.primary },
    modeText: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    modeTextActive: { color: colors.primaryForeground },
    hint: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginTop: 2 },
    lockedField: { opacity: 0.5 },
    fieldGroup: { gap: 6 },
    row: { flexDirection: "row", gap: 12 },
    halfField: { flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    pickerRow: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 44,
      justifyContent: "center",
    },
    errorText: { fontSize: typography.bodySmall.fontSize, color: colors.destructive },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    buttonText: { color: colors.primaryForeground, fontSize: 16, fontWeight: "600" },
  });
}
