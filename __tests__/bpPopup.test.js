// The Heart rate and BP tiles share one popup. Opened from the BP tile it must
// not offer "Measure with camera" (the camera measures heart rate only) and
// says how BP gets in instead; from the Heart rate tile the button stays.
import fs from "fs";
import path from "path";

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("popup remembers which tile opened it; camera button only for heart rate", () => {
  const src = read("src/screens/PersonalScreen.tsx");
  expect(src).toMatch(/setVitalsDetailKind\(kind === "bp" \? "bp" : "heart_rate"\)/);
  expect(src).toMatch(/onMeasure=\{\s*vitalsDetailKind === "heart_rate"/);
  expect(src).toMatch(/focus=\{vitalsDetailKind\}/);
});

test("from the BP tile the popup explains how blood pressure is added", () => {
  const section = read("src/components/vitals/VitalsPersonalSection.tsx");
  expect(section).toMatch(/focus === "bp" && <Text[^>]*>\{t\("bpHowTo"\)\}<\/Text>/);
});

test("strings: bpHowTo in 7 languages; empty text points to Connections, not Habits", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const d = require(`../src/i18n/locales/${lang}.json`);
    expect([lang, typeof d.Vitals.bpHowTo]).toEqual([lang, "string"]);
    expect([lang, d.Vitals.emptyMobile.includes(d.Habits.connectionsTitle)]).toEqual([lang, true]);
    expect([lang, d.Vitals.bpHowTo.includes(d.Habits.connectionsTitle)]).toEqual([lang, true]);
  }
});
