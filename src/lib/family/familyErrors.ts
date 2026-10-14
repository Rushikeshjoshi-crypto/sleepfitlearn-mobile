import { ApiError } from "../api/client";

// Backend `code` → key under the "Family" namespace's "Errors" group (same
// map as the web app's src/components/family/familyErrors.ts). Codes are
// defined in sleepfitlearn-family/index.js and sleepfitlearn-users/ageGate.js.
const FAMILY_ERROR_KEYS: Record<string, string> = {
  family_disabled: "familyDisabled",
  birth_year_required: "birthYearRequired",
  birth_year_invalid: "birthYearInvalid",
  birth_year_locked: "birthYearLocked",
  birth_year_decrease_blocked: "birthYearDecreaseBlocked",
  minor_data_disabled: "minorDataDisabled",
  under_13_not_supported: "under13",
  parent_must_be_adult: "parentMustBeAdult",
  adult_cannot_be_linked: "adultCannotBeLinked",
  child_email_invalid: "childEmailInvalid",
  cannot_invite_self: "cannotInviteSelf",
  invite_exists: "inviteExists",
  too_many_pending_invites: "tooManyInvites",
  invite_not_found: "inviteNotFound",
  invite_expired: "inviteExpired",
  invite_email_mismatch: "inviteEmailMismatch",
  email_not_verified: "emailNotVerified",
  invite_not_pending: "inviteNotPending",
  consent_version_mismatch: "consentVersionMismatch",
  already_linked: "alreadyLinked",
  max_parents_reached: "maxParents",
  controls_invalid: "controlsInvalid",
  link_not_found: "linkNotFound",
  link_not_open: "linkNotOpen",
  no_pending_request: "noPendingRequest",
  child_now_adult: "childNowAdult",
  link_changed: "linkChanged",
};

const BIRTH_YEAR_CODES = new Set(["birth_year_required", "birth_year_invalid", "birth_year_locked", "birth_year_decrease_blocked", "minor_data_disabled", "under_13_not_supported"]);

export function familyErrorKey(err: unknown): string {
  if (err instanceof ApiError && err.code && FAMILY_ERROR_KEYS[err.code]) return FAMILY_ERROR_KEYS[err.code];
  return "generic";
}

export function birthYearErrorKey(code: string | null): string | null {
  return code && BIRTH_YEAR_CODES.has(code) ? FAMILY_ERROR_KEYS[code] : null;
}
