import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/aws/AuthContext";
import { getUserProfile, updateUserProfile, type UserProfile } from "../lib/api/users";
import { useTheme, type ThemeMode } from "../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../theme/palettes";
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
import { ProfilePhoto } from "../components/settings/ProfilePhoto";
import { SettingsRail, type SettingsSectionId } from "../components/settings/SettingsRail";
import {
  EditBox,
  FieldLabel,
  PickerBox,
  ReadOnlyField,
  SettingsInput,
  SettingsSection,
} from "../components/settings/SettingsFields";

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
    countryCode: profile.country_code ?? "",
  };
}

// The text fields that start locked and open with their pencil button.
type EditableField = "nickname" | "sex" | "birthYear" | "heightCm";

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
  // Height / sex the server hides and locks for this account (13–17 while
  // minor_data_enabled is off). Saving sends them back empty and the server
  // keeps the stored values.
  const locked = lockedProfileFields(profile);

  const [form, setForm] = useState(() => toFormValues({} as UserProfile));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Fields opened with their pencil; all lock again after Save / Discard.
  const [editing, setEditing] = useState<Set<EditableField>>(() => new Set());

  // Section rail: tap a chip to jump, the section in view is highlighted.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Partial<Record<SettingsSectionId, number>>>({});
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("profile");

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

  function startEditing(name: EditableField) {
    setEditing((prev) => new Set(prev).add(name));
    if (name === "sex") setSexPickerOpen(true);
  }

  const dirty = profile != null && JSON.stringify(form) !== JSON.stringify(toFormValues(profile));

  function onDiscard() {
    if (profile) setForm(toFormValues(profile));
    setEditing(new Set());
    setFormError(null);
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
      // Target weight isn't edited here any more (same as the web): left out,
      // so the updateUserProfile merge keeps the stored value.
      const updated = await updateUserProfile({
        nickname: form.nickname.trim() || null,
        sex: form.sex || null,
        date_of_birth: form.birthYear ? `${form.birthYear}-01-01` : null,
        height_cm: form.heightCm ? Number(form.heightCm) : null,
        country_code: form.countryCode || null,
      });
      setProfile(updated);
      setForm(toFormValues(updated));
      setEditing(new Set());
      Alert.alert(t("Settings:profileUpdated"));
    } catch (err) {
      // Birth-year edits go through the backend age gate (ageGate.js).
      const key = err instanceof ApiError ? birthYearErrorKey(err.code) : null;
      setFormError(key ? t(`Family:Errors.${key}`) : t("Settings:saveProfileError"));
    } finally {
      setSubmitting(false);
    }
  }

  function jumpTo(id: SettingsSectionId) {
    setActiveSection(id);
    scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[id] ?? 0) - 8), animated: true });
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y + 80;
    let current: SettingsSectionId = "profile";
    for (const id of ["profile", "body", "preferences", "family"] as SettingsSectionId[]) {
      if ((sectionY.current[id] ?? Infinity) <= y) current = id;
    }
    if (current !== activeSection) setActiveSection(current);
  }

  const displayName = form.nickname.trim() || profile?.name?.trim() || profile?.email || "";
  const initial = displayName.charAt(0).toUpperCase() || "?";
  const notSet = t("Settings:notSet");
  const signUpHint = t("Settings:readOnlyHint");
  const editLabel = (label: string) => t("Settings:editField", { label });
  const sexLocked = locked.has("sex");
  const heightLocked = locked.has("height_cm");

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      stickyHeaderIndices={[0]}
      onScroll={onScroll}
      scrollEventThrottle={64}
      keyboardShouldPersistTaps="handled"
    >
      <SettingsRail active={activeSection} onSelect={jumpTo} t={t} label={t("Settings:sectionsLabel")} />

      <View style={styles.container}>
        <View>
          <Text style={styles.title}>{t("Settings:pageTitle")}</Text>
          <Text style={styles.pageHint}>{t("Settings:pageDescription")}</Text>
          {loading && <ActivityIndicator color={colors.primary} style={styles.loader} />}
          {loadError && <Text style={styles.errorText}>{loadError}</Text>}
        </View>

        <SettingsSection
          title={t("Settings:sectionProfile")}
          hint={t("Settings:sectionProfileHint")}
          onSectionLayout={(y) => (sectionY.current.profile = y)}
        >
          <ProfilePhoto
            avatar={profile?.avatar}
            initial={initial}
            name={displayName}
            onSaved={(updated) => setProfile(updated)}
          />

          <EditBox
            label={t("Settings:nicknameLabel")}
            editing={editing.has("nickname")}
            onEdit={() => startEditing("nickname")}
            editLabel={editLabel(t("Settings:nicknameLabel"))}
          >
            <SettingsInput
              value={form.nickname}
              onChangeText={(v) => field("nickname", v)}
              placeholder={t("Settings:nicknamePlaceholder")}
              locked={!editing.has("nickname")}
            />
          </EditBox>
          <ReadOnlyField label={t("Settings:nameLabel")} value={profile?.name || notSet} hint={signUpHint} />
          <ReadOnlyField label={t("Settings:emailLabel")} value={profile?.email || notSet} hint={signUpHint} />
          <ReadOnlyField label={t("Settings:phoneLabel")} value={profile?.phone_number || notSet} hint={signUpHint} />
        </SettingsSection>

        <SettingsSection
          title={t("Settings:sectionBody")}
          hint={t("Settings:sectionBodyHint")}
          onSectionLayout={(y) => (sectionY.current.body = y)}
        >
          {locked.size > 0 && <Text style={styles.note}>{t("Settings:lockedFieldsNote")}</Text>}

          <EditBox
            label={t("Settings:sexLabel")}
            editing={editing.has("sex")}
            canEdit={!sexLocked}
            onEdit={() => startEditing("sex")}
            editLabel={editLabel(t("Settings:sexLabel"))}
          >
            <PickerBox
              value={form.sex ? t(`Settings:${form.sex}`) : null}
              placeholder={t("Settings:sexPlaceholder")}
              onPress={() => setSexPickerOpen(true)}
              locked={sexLocked || !editing.has("sex")}
            />
          </EditBox>

          <EditBox
            label={t("Settings:birthYearLabel")}
            editing={editing.has("birthYear")}
            onEdit={() => startEditing("birthYear")}
            editLabel={editLabel(t("Settings:birthYearLabel"))}
          >
            <SettingsInput
              value={form.birthYear}
              onChangeText={(v) => field("birthYear", v.replace(/[^0-9]/g, ""))}
              placeholder="1990"
              keyboardType="number-pad"
              maxLength={4}
              locked={!editing.has("birthYear")}
            />
          </EditBox>

          <EditBox
            label={t("Settings:heightLabel")}
            editing={editing.has("heightCm")}
            canEdit={!heightLocked}
            onEdit={() => startEditing("heightCm")}
            editLabel={editLabel(t("Settings:heightLabel"))}
          >
            <SettingsInput
              value={form.heightCm}
              onChangeText={(v) => field("heightCm", v.replace(/[^0-9.]/g, ""))}
              placeholder="176"
              keyboardType="decimal-pad"
              locked={heightLocked || !editing.has("heightCm")}
            />
          </EditBox>
        </SettingsSection>

        <SettingsSection
          title={t("Settings:sectionPreferences")}
          hint={t("Settings:sectionPreferencesHint")}
          onSectionLayout={(y) => (sectionY.current.preferences = y)}
        >
          <View style={styles.fieldGroup}>
            <FieldLabel>{t("Settings:preferredLanguageLabel")}</FieldLabel>
            <PickerBox value={t(`Settings:languages.${i18n.language}`)} onPress={() => setLanguagePickerOpen(true)} />
            <Text style={styles.fieldHint}>{t("Settings:languageHint")}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <FieldLabel>{t("Settings:countryLabel")}</FieldLabel>
            <View style={styles.countryRow}>
              <CountryCodeField value={form.countryCode} onChange={(code) => field("countryCode", code)} />
            </View>
            <Text style={styles.fieldHint}>{t("Settings:countryHelper")}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <FieldLabel>{t("Settings:appearanceLabel")}</FieldLabel>
            <View style={styles.modeRow}>
              {MODE_OPTIONS.map((option) => (
                <AnimatedPressable
                  key={option.value}
                  style={[styles.modeButton, mode === option.value && styles.modeButtonActive]}
                  onPress={() => setMode(option.value)}
                >
                  <Text style={[styles.modeText, mode === option.value && styles.modeTextActive]}>{t(option.labelKey)}</Text>
                </AnimatedPressable>
              ))}
            </View>
            <Text style={styles.fieldHint}>{t("Settings:systemThemeHint")}</Text>
          </View>
        </SettingsSection>

        <View style={styles.saveBar}>
          {dirty && <Text style={styles.fieldHint}>{t("Settings:unsavedChanges")}</Text>}
          {formError && <Text style={styles.errorText}>{formError}</Text>}
          <View style={styles.saveRow}>
            <AnimatedPressable style={styles.ghostButton} onPress={onDiscard} disabled={!dirty || submitting}>
              <Text style={[styles.ghostButtonText, (!dirty || submitting) && styles.disabledText]}>{t("Settings:discardChanges")}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.button, styles.saveButton]}
              onPress={onSave}
              disabled={!canSaveProfile({ submitting, loading, profile, loadError })}
            >
              {submitting ? (
                <ActivityIndicator color={colors.orangeForeground} size="small" />
              ) : (
                <Text style={styles.buttonText}>{t("Settings:saveChanges")}</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>

        <View onLayout={(e) => (sectionY.current.family = e.nativeEvent.layout.y)}>
          <FamilySection />
        </View>

        <AnimatedPressable style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>{t("Nav:logout")}</Text>
        </AnimatedPressable>

        {/* UI only for now: confirming says "coming soon" (DeleteAccountModal). */}
        <ModernButton title={t("Settings:deleteAccount.button")} onPress={() => setDeleteAccountOpen(true)} variant="destructive" />
        <DeleteAccountModal visible={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />
      </View>

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
    scrollContent: { paddingBottom: 40 },
    container: { paddingHorizontal: 16, paddingTop: 8, gap: 24 },
    title: { fontSize: typography.title.fontSize, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    pageHint: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, marginTop: 2 },
    loader: { alignSelf: "flex-start", marginTop: 8 },
    note: { fontSize: 12, color: colors.mutedForeground },
    fieldGroup: { gap: 6 },
    fieldHint: { fontSize: 12, color: colors.mutedForeground },
    countryRow: { flexDirection: "row" },
    modeRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 3, gap: 3 },
    modeButton: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center", minHeight: 44, justifyContent: "center" },
    modeButtonActive: { backgroundColor: colors.orange },
    modeText: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    modeTextActive: { color: colors.orangeForeground, fontWeight: "800" },
    errorText: { fontSize: typography.bodySmall.fontSize, color: colors.destructive },
    saveBar: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
    saveRow: { flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "flex-end" },
    ghostButton: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
    ghostButtonText: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    disabledText: { opacity: 0.4 },
    saveButton: { flex: 1, marginTop: 0 },
    button: {
      backgroundColor: colors.orange,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: "center",
      minHeight: 44,
      justifyContent: "center",
    },
    buttonText: { color: colors.orangeForeground, fontSize: 16, fontWeight: "800" },
  });
}
