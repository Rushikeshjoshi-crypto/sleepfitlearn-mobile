import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../lib/api/client";
import { ensureUserProfile, updateUserProfile } from "../../lib/api/users";
import { useAuth } from "../../lib/aws/AuthContext";
import { ageBandFromBirthYear, parseBirthYearInput } from "../../lib/family/age";
import { endForegroundSession, setBackgroundSyncAllowed } from "../../lib/syncGate";
import { readBirthYearPromptSkip, saveBirthYearPromptSkip } from "../../lib/family/pending";
import { isBirthYearPromptSnoozed } from "../../lib/family/birthYearPrompt";
import { useTheme } from "../../theme/ThemeContext";
import { ModernButton } from "../ModernButton";
import { makeFamilyStyles } from "./familyStyles";
import { profileGateOutcome } from "../../lib/family/profileGateOutcome";
import { birthYearSaveErrorKey } from "../../lib/family/birthYearSaveError";

type AgeBlockReason = "under_13_not_supported" | "minor_signup_unavailable" | "minor_data_disabled";

type GateState =
  | { status: "checking" }
  | { status: "ready" }
  // "new": no profile yet (first login on another device than sign-up);
  // "existing": a profile from before birth years were collected (dob_required).
  | { status: "needs_birth_year"; mode: "new" }
  // userId: for "Skip for now" (existing accounts only — see birthYearPrompt.ts).
  | { status: "needs_birth_year"; mode: "existing"; userId: string }
  | { status: "age_blocked"; reason: AgeBlockReason };

const AGE_BLOCK_CODES: readonly string[] = ["under_13_not_supported", "minor_signup_unavailable", "minor_data_disabled"];

// Runs the backend age gate (sleepfitlearn-users ageGate.js) once per signed-in
// launch, before the app. Same states as the web app's useRequireAuth.
// Background sync (lib/syncGate.ts) is only allowed once this passes, and is
// switched on BEFORE the app renders — child effects (ForegroundSync) run
// before this component's own effects, so it can't wait for an effect here.
// Any other failure (e.g. offline) lets the app through as before; the
// backend's minorGate still refuses under-18 data on every call.
export function ProfileGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t } = useTranslation("Family");
  const { signOut } = useAuth();
  const [state, setState] = useState<GateState>({ status: "checking" });
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pass = useCallback(async () => {
    await setBackgroundSyncAllowed(true);
    setState({ status: "ready" });
  }, []);

  const block = useCallback(async (next: GateState) => {
    await setBackgroundSyncAllowed(false);
    setState(next);
  }, []);

  const handleAgeError = useCallback(
    async (err: unknown): Promise<boolean> => {
      if (err instanceof ApiError && err.code === "birth_year_required") {
        await block({ status: "needs_birth_year", mode: "new" });
        return true;
      }
      if (err instanceof ApiError && err.code && AGE_BLOCK_CODES.includes(err.code)) {
        await block({ status: "age_blocked", reason: err.code as AgeBlockReason });
        return true;
      }
      return false;
    },
    [block],
  );

  const run = useCallback(
    async (year?: number) => {
      try {
        const profile = await ensureUserProfile(year);
        // Existing account without a birth year: prompt, unless skipped recently.
        if (profile.dob_required && !isBirthYearPromptSnoozed(await readBirthYearPromptSkip(profile.id))) {
          await block({ status: "needs_birth_year", mode: "existing", userId: profile.id });
        } else {
          await pass();
        }
      } catch (err) {
        if (await handleAgeError(err)) return;
        if (year !== undefined) throw err;
        // A 4xx means the session/account is wrong — retrying won't help, so
        // back to login. Server/network errors still let the app through.
        if (profileGateOutcome(err) === "sign_out") {
          await setBackgroundSyncAllowed(false);
          signOut();
          return;
        }
        await pass();
      }
    },
    [block, pass, handleAgeError, signOut],
  );

  useEffect(() => {
    run();
    // Unmounting (app closed, or signed out) ends this session's gate only;
    // the persisted flag is cleared by sign-out itself (AuthContext) and by
    // the blocks above, so screen time keeps syncing while the app is closed.
    return () => {
      endForegroundSession();
    };
  }, [run]);

  async function submit() {
    if (state.status !== "needs_birth_year") return;
    const year = parseBirthYearInput(birthYear);
    if (year == null) return setError(t("Age.birthYearInvalid"));
    if (ageBandFromBirthYear(year) === "under_13") return setError(t("Age.under13"));
    setError(null);
    setSubmitting(true);
    try {
      if (state.mode === "existing") {
        const updated = await updateUserProfile({ date_of_birth: `${year}-01-01` });
        if (updated.dob_required) throw new Error("birth year not saved");
        await pass();
      } else {
        await run(year);
      }
    } catch (err) {
      // A 400 birth_year_invalid gets the specific message (same as web).
      if (!(await handleAgeError(err))) setError(t(birthYearSaveErrorKey(err)));
    } finally {
      setSubmitting(false);
    }
  }

  async function skip() {
    if (state.status !== "needs_birth_year" || state.mode !== "existing") return;
    await saveBirthYearPromptSkip(state.userId);
    await pass();
  }

  if (state.status === "ready") return <>{children}</>;

  return (
    <View style={[styles.screen, { justifyContent: "center", padding: 24 }]}>
      {state.status === "checking" ? (
        <ActivityIndicator color={colors.primary} />
      ) : state.status === "needs_birth_year" ? (
        <View style={styles.card}>
          <Text style={styles.title}>{t("BirthYearGate.title")}</Text>
          <Text style={styles.hint}>
            {state.mode === "existing" ? t("BirthYearGate.descriptionExisting") : t("BirthYearGate.description")}
          </Text>
          <Text style={styles.label}>{t("Age.birthYearLabel")}</Text>
          <TextInput
            style={styles.input}
            value={birthYear}
            onChangeText={(v) => setBirthYear(v.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder={t("Age.birthYearPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Text style={styles.hint}>{t("Age.birthYearHelper")}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <ModernButton title={t("BirthYearGate.continue")} onPress={submit} loading={submitting} />
          {state.mode === "existing" && (
            <>
              <ModernButton title={t("BirthYearGate.skip")} onPress={skip} variant="outline" disabled={submitting} />
              <Text style={[styles.hint, styles.centerText]}>{t("BirthYearGate.skipHint")}</Text>
            </>
          )}
          <ModernButton title={t("BirthYearGate.signOut")} onPress={signOut} variant="outline" />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>{t("AgeBlocked.title")}</Text>
          <Text style={styles.hint}>
            {state.reason === "under_13_not_supported" ? t("AgeBlocked.under13") : t("AgeBlocked.minorUnavailable")}
          </Text>
          <ModernButton title={t("AgeBlocked.signOut")} onPress={signOut} variant="outline" />
        </View>
      )}
    </View>
  );
}
