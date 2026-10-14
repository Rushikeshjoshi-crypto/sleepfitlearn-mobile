// A "Family" entry in the main menu (web nav / mobile hamburger) for adults
// who can invite — the parent dashboard used to be reachable only via Settings.
// Same helper as the web app (src/lib/family/parentNav.ts in both).
import { showParentDashboardEntry } from "../src/lib/family/parentNav";

test("only an enabled, inviting (18+) account gets the entry", () => {
  expect(showParentDashboardEntry({ enabled: true, can_invite: true })).toBe(true);
  expect(showParentDashboardEntry({ enabled: true, can_invite: false })).toBe(false);
  expect(showParentDashboardEntry({ enabled: false, can_invite: true })).toBe(false);
  expect(showParentDashboardEntry(null)).toBe(false);
  expect(showParentDashboardEntry(undefined)).toBe(false);
});

test("Nav.family exists in every locale", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    expect(require(`../src/i18n/locales/${lang}.json`).Nav.family).toBeTruthy();
  }
});
