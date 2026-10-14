// Server-side sign-up age check: the backend's sleepfitlearn-presignup Cognito
// Pre Sign-up trigger runs the users age gate's rule before the account is
// created. Byte-identical in the web app and the mobile app.

// Sent as sign-up validationData: Cognito passes it to the trigger but never
// stores it on the user (the year is still saved by the first profile POST).
export function signUpValidationData(birthYear: number): { Name: string; Value: string }[] {
  return [{ Name: "birth_year", Value: String(birthYear) }];
}

// Same messages the sign-up form's own check and the profile gate show.
const REFUSAL_KEYS: Record<string, string> = {
  under_13_not_supported: "Age.under13",
  minor_signup_unavailable: "AgeBlocked.minorUnavailable",
  birth_year_required: "Age.birthYearInvalid",
  birth_year_invalid: "Age.birthYearInvalid",
};

// A refusal arrives as UserLambdaValidationException "PreSignUp failed with
// error <code>.". Returns its message key under the "Family" namespace, or
// null for any other error.
export function preSignUpRefusalKey(err: unknown): string | null {
  const e = err as { code?: string; name?: string; message?: string } | undefined;
  if ((e?.code ?? e?.name) !== "UserLambdaValidationException") return null;
  const code = /PreSignUp failed with error (\w+)/.exec(e?.message ?? "")?.[1];
  return (code && REFUSAL_KEYS[code]) || null;
}
