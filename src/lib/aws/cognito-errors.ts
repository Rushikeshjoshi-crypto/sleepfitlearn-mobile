import i18n from "../../i18n";

const CODE_TO_KEY: Record<string, string> = {
  UserNotConfirmedException: "userNotConfirmed",
  NotAuthorizedException: "incorrectCredentials",
  UserNotFoundException: "incorrectCredentials",
  UsernameExistsException: "usernameExists",
  InvalidPasswordException: "invalidPassword",
  InvalidParameterException: "invalidParameter",
  CodeMismatchException: "codeMismatch",
  ExpiredCodeException: "codeExpired",
  LimitExceededException: "tooManyAttempts",
  TooManyRequestsException: "tooManyAttempts",
  // A Cognito trigger refused the request (e.g. the Pre Sign-up age check) for
  // a reason with no message of its own — see lib/auth/preSignUp.ts.
  UserLambdaValidationException: "generic",
};

// Called from plain (non-component) code, so it reads the i18next singleton
// directly rather than the useTranslation() hook — same translated copy
// either way, under the Auth.Errors namespace.
export function getCognitoErrorMessage(err: unknown): string {
  const code = (err as { code?: string; name?: string } | undefined)?.code ?? (err as { name?: string } | undefined)?.name;
  const key = code ? CODE_TO_KEY[code] : undefined;
  if (key) return i18n.t(`Errors.${key}`, { ns: "Auth" });
  // A raw Cognito message isn't a translation key — shown as-is, same as before.
  if (err instanceof Error && err.message) return err.message;
  return i18n.t("Errors.generic", { ns: "Auth" });
}
