import { apiGet, apiPost, apiPut, ApiError } from "./client";
import { getIdTokenClaims } from "../aws/cognito";
import { clearPendingBirthYear, readPendingBirthYear } from "../family/pending";

export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  phone_number: string | null;
  country_code: string | null;
  nickname: string | null;
  sex: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  // Optional daily steps target (1,000–50,000); null = not set. Older
  // profiles don't have the field at all.
  daily_step_goal?: number | null;
  preferred_language: string | null;
  privacy_settings: Record<string, unknown> | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  role: string;
  parent_user_id: string | null;
  created_at: string;
  // Derived server-side on every read (see sleepfitlearn-users' ageGate.js /
  // familyControls.js) — read-only, never sent back on PUT.
  age_band?: AgeBand | null;
  is_minor?: boolean | null;
  // true for accounts created before birth years were collected → one-time
  // birth-year prompt before the app (and before any family linking).
  dob_required?: boolean;
  has_linked_parent?: boolean;
  effective_controls?: EffectiveControls;
  // Profile fields hidden (null) and locked for this account right now —
  // height, target weight and sex for 13–17 while minor_data_enabled is off.
  restricted_fields?: string[];
};

export type AgeBand = "under_13" | "13_17" | "18_plus";

// Parent controls merged across every linked parent (most restrictive wins).
export type EffectiveControls = {
  daily_screen_time_limit_minutes: number | null;
  limit_warning_notifications: boolean;
  social_blocked: boolean;
};

// The only fields the `users` PUT endpoint accepts — everything else (id, email,
// role, parent_user_id, created_at) is server-controlled and PUT is a full
// replace of exactly this set, so any partial call must go through
// `updateUserProfile` below rather than calling `apiPut` directly.
type EditableUserFields = Pick<
  UserProfile,
  | "nickname"
  | "sex"
  | "date_of_birth"
  | "height_cm"
  | "target_weight_kg"
  | "daily_step_goal"
  | "preferred_language"
  | "privacy_settings"
  | "country_code"
>;

export function getUserProfile(): Promise<UserProfile> {
  return apiGet<UserProfile>("users", "");
}

// Lazily provisions the DynamoDB profile row after Cognito sign-up. Mirrors the
// only place this ever happens today — there is no server-side post-confirmation
// trigger, so a new user 404s on GET until this POST runs once.
export function createUserProfile(
  profile: {
    name?: string | null;
    phone_number?: string | null;
    country_code?: string | null;
    birth_year?: number | null;
  } = {},
): Promise<UserProfile> {
  return apiPost<UserProfile>("users", "", profile);
}

// `birthYear` is only passed when the user just answered the birth-year
// prompt (components/family/ProfileGate.tsx); otherwise the year captured at
// sign-up on this device is used. The backend requires one for every new
// profile — without it this throws ApiError code "birth_year_required".
export async function ensureUserProfile(birthYear?: number): Promise<UserProfile> {
  try {
    return await getUserProfile();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // name/phone_number/country_code aren't captured anywhere client-side
      // after sign-up — this can run on a much later first login — so pull
      // them back off the Cognito attributes on the ID token rather than
      // threading them through.
      const claims = await getIdTokenClaims();
      const email = (claims?.email as string | undefined) ?? null;
      const created = await createUserProfile({
        name: (claims?.name as string | undefined) ?? null,
        phone_number: (claims?.["custom:phone_number"] as string | undefined) ?? null,
        country_code: (claims?.["custom:country_code"] as string | undefined) ?? null,
        birth_year: birthYear ?? (await readPendingBirthYear(email)),
      });
      await clearPendingBirthYear(email);
      return created;
    }
    throw err;
  }
}

// `users` PUT is a full replace, not a patch — omitted fields are written as
// null. Always read-merge-write through this helper; never call apiPut("users", ...)
// directly from screen code. Mirrors the web app's src/lib/api/users.ts exactly.
export async function updateUserProfile(partial: Partial<EditableUserFields>): Promise<UserProfile> {
  const current = await getUserProfile();
  const merged: EditableUserFields = {
    nickname: current.nickname,
    sex: current.sex,
    date_of_birth: current.date_of_birth,
    height_cm: current.height_cm,
    target_weight_kg: current.target_weight_kg,
    daily_step_goal: current.daily_step_goal ?? null,
    preferred_language: current.preferred_language,
    privacy_settings: current.privacy_settings,
    country_code: current.country_code,
    ...partial,
  };
  return apiPut<UserProfile>("users", "", merged);
}
