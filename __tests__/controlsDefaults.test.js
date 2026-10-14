// Parent Controls form: setting a screen-time limit turns its reminder on
// unless the parent already set the switch themselves; the copy calls it a
// reminder (nothing is blocked). Same helper as the web app.
import { warningsAfterLimitChange, warningsInitial } from "../src/lib/family/controlsDefaults";

test("empty → a limit turns reminders on (switch untouched)", () => {
  expect(warningsAfterLimitChange("", "60", false, false)).toBe(true);
});

test("a parent's own choice wins; editing an existing limit doesn't flip it", () => {
  expect(warningsAfterLimitChange("", "60", false, true)).toBe(false);
  expect(warningsAfterLimitChange("60", "90", false, false)).toBe(false);
  expect(warningsAfterLimitChange("60", "", true, false)).toBe(true);
});

test("a link without the flag starts with reminders on (backend default)", () => {
  expect(warningsInitial(undefined)).toBe(true);
  expect(warningsInitial(null)).toBe(true);
  expect(warningsInitial(false)).toBe(false);
});

test("Controls copy says reminder, in every locale's English source", () => {
  const en = require("../src/i18n/locales/en.json").Family.Controls;
  expect(en.limitLabel.toLowerCase()).toContain("reminder");
  expect(en.limitHelper.toLowerCase()).toMatch(/isn't (locked|blocked)|not (locked|blocked)/);
  for (const lang of ["hi", "bn", "de", "es", "fr", "it"]) {
    const c = require(`../src/i18n/locales/${lang}.json`).Family.Controls;
    expect(c.limitLabel).toBeTruthy();
    expect(c.limitHelper).not.toBe(en.limitHelper);
  }
});
