// Server-side sign-up age check (sleepfitlearn-presignup, a Cognito Pre
// Sign-up trigger): the form sends the birth year as validationData, and a
// refusal ("PreSignUp failed with error <code>.") shows the same age message
// the form's own check / ProfileGate already use. Same helper as the web
// app's src/lib/auth/preSignUp.ts (byte-identical).
jest.mock("../src/i18n", () => ({ t: (key) => key }));

import { signUpValidationData, preSignUpRefusalKey } from "../src/lib/auth/preSignUp";
import { getCognitoErrorMessage } from "../src/lib/aws/cognito-errors";

const refusal = (code) =>
  Object.assign(new Error(`PreSignUp failed with error ${code}.`), { code: "UserLambdaValidationException" });

test("the birth year goes to the trigger as validationData birth_year", () => {
  expect(signUpValidationData(2001)).toEqual([{ Name: "birth_year", Value: "2001" }]);
});

test("each refusal code → the existing Family message", () => {
  expect(preSignUpRefusalKey(refusal("under_13_not_supported"))).toBe("Age.under13");
  expect(preSignUpRefusalKey(refusal("minor_signup_unavailable"))).toBe("AgeBlocked.minorUnavailable");
  expect(preSignUpRefusalKey(refusal("birth_year_required"))).toBe("Age.birthYearInvalid");
  expect(preSignUpRefusalKey(refusal("birth_year_invalid"))).toBe("Age.birthYearInvalid");
});

test("anything else isn't a refusal", () => {
  expect(preSignUpRefusalKey(refusal("age_check_unavailable"))).toBeNull();
  expect(preSignUpRefusalKey(Object.assign(new Error("x"), { code: "UsernameExistsException" }))).toBeNull();
  expect(preSignUpRefusalKey(undefined)).toBeNull();
});

test("an unmapped trigger error shows the generic message, not the raw Cognito text", () => {
  expect(getCognitoErrorMessage(refusal("age_check_unavailable"))).toBe("Errors.generic");
});

test("every key it returns exists in all 7 locales", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const family = require(`../src/i18n/locales/${lang}.json`).Family;
    for (const key of ["Age.under13", "AgeBlocked.minorUnavailable", "Age.birthYearInvalid"]) {
      expect(key.split(".").reduce((o, k) => o?.[k], family)).toBeTruthy();
    }
  }
});
