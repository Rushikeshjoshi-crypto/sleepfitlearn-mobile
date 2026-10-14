// Family / birth-year error codes → their own message (not the generic one),
// in every locale. Same map as the web app's familyErrors.ts.
jest.mock("../src/lib/api/client", () => {
  class ApiError extends Error {
    constructor(status, message, code = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { ApiError };
});

import { ApiError } from "../src/lib/api/client";
import { birthYearErrorKey, familyErrorKey } from "../src/lib/family/familyErrors";

test("link_changed (409 lost race) gets its own message", () => {
  expect(familyErrorKey(new ApiError(409, "changed", "link_changed"))).toBe("linkChanged");
});

test("birth_year_decrease_blocked is a family error and a birth-year error (Settings shows it)", () => {
  expect(familyErrorKey(new ApiError(409, "blocked", "birth_year_decrease_blocked"))).toBe("birthYearDecreaseBlocked");
  expect(birthYearErrorKey("birth_year_decrease_blocked")).toBe("birthYearDecreaseBlocked");
});

test("both messages exist in all 7 locales", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const errors = require(`../src/i18n/locales/${lang}.json`).Family.Errors;
    expect(errors.linkChanged).toBeTruthy();
    expect(errors.birthYearDecreaseBlocked).toBeTruthy();
  }
});

test("email_not_verified (invite with an unverified login email) has its own message in every locale", () => {
  expect(familyErrorKey(new ApiError(403, "x", "email_not_verified"))).toBe("emailNotVerified");
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    expect(require(`../src/i18n/locales/${lang}.json`).Family.Errors.emailNotVerified).toBeTruthy();
  }
});
