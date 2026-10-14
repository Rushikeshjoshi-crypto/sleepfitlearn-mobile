import { ApiError } from "../api/client";

// The birth-year prompt's save error (ProfileGate, "existing" mode — the
// age-gate codes are handled before this). A 400 birth_year_invalid gets the
// specific "invalid year" message, as on the web app's BirthYearGate.
export function birthYearSaveErrorKey(err: unknown): "Age.birthYearInvalid" | "BirthYearGate.saveError" {
  return err instanceof ApiError && err.code === "birth_year_invalid" ? "Age.birthYearInvalid" : "BirthYearGate.saveError";
}
