// Insight cards are translated: the engine returns a message key + params
// (no English text), and every message has a title and body in all 7
// locales under InsightCards, using exactly the engine's placeholders.
// Same engine file as the web app (byte-identical).
import { getEnergyInsight, getPatternInsight, INSIGHT_MESSAGES } from "../src/lib/insights/insightEngine";

const day = (energy, workedOut = false) => ({ date: "2026-10-07", sleepHours: 8, workedOut, intensity: null, studyMinutes: 0, energy });

test("cards carry a message key and params, not English text", () => {
  expect(getEnergyInsight({ ...day(null), studyGapMinutes: 150 })).toEqual({ key: "study_gap", messageKey: "study_gap", params: { hours: 2 } });
  expect(getEnergyInsight({ ...day(80), studyGapMinutes: null }).key).toBe("high_energy");
  expect(getPatternInsight([day(70, true), day(70, true), day(71), day(70)])).toEqual({ key: "balanced_mood", messageKey: "balanced_mood", params: { avg: 70 } });
});

test("every message has a title and body in all 7 locales, with the engine's placeholders", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const cards = require(`../src/i18n/locales/${lang}.json`).InsightCards;
    for (const [messageKey, params] of Object.entries(INSIGHT_MESSAGES)) {
      const msg = cards?.[messageKey];
      expect(msg && msg.title && msg.body).toBeTruthy();
      const used = [...msg.body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(used).toEqual([...params].sort());
    }
  }
});
