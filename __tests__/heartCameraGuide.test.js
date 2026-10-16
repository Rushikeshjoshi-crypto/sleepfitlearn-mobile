// Camera heart rate: the step-by-step guide on the intro screen — 4 steps,
// "how it works" and 3 tips — has its text in all 7 languages.
import { GUIDE_STEPS, GUIDE_TIPS, GUIDE_KEYS } from "../src/lib/heartCamera/guide";

test("guide: 4 steps, 3 tips", () => {
  expect(GUIDE_STEPS).toEqual(["step1", "step2", "step3", "step4"]);
  expect(GUIDE_TIPS).toEqual(["tip1", "tip2", "tip3"]);
});

test("guide strings exist in all 7 languages", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const hc = require(`../src/i18n/locales/${lang}.json`).HeartCamera;
    for (const k of GUIDE_KEYS) expect([lang, k, typeof hc?.[k]]).toEqual([lang, k, "string"]);
  }
});
