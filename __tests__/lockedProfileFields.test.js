// Settings: height, target weight and sex are locked when the profile says so
// (sleepfitlearn-users restricted_fields — 13–17 while minor_data_enabled is
// off). Same helper as the web app (src/lib/settings/lockedFields.ts).
import { lockedProfileFields } from "../src/lib/settings/lockedFields";

test("locks exactly the fields the server lists (only the known three)", () => {
  expect([...lockedProfileFields({ restricted_fields: ["height_cm", "target_weight_kg", "sex", "nickname"] })].sort()).toEqual([
    "height_cm",
    "sex",
    "target_weight_kg",
  ]);
});

test("nothing locked for adults, older servers (no field) or no profile", () => {
  expect(lockedProfileFields({ restricted_fields: [] }).size).toBe(0);
  expect(lockedProfileFields({}).size).toBe(0);
  expect(lockedProfileFields(null).size).toBe(0);
});

test("the locked-fields note exists in all 7 languages", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    expect([lang, typeof require(`../src/i18n/locales/${lang}.json`).Settings.lockedFieldsNote]).toEqual([lang, "string"]);
  }
});
