// "Connect your watch" card: a step-by-step guide (5 steps + a note) that
// opens on tap, in all 7 languages.
import fs from "fs";
import path from "path";
import { WATCH_GUIDE_STEPS } from "../src/lib/watch/guide";

test("watch guide: 5 steps", () => {
  expect(WATCH_GUIDE_STEPS).toEqual(["guideStep1", "guideStep2", "guideStep3", "guideStep4", "guideStep5"]);
});

test("watch guide strings exist in all 7 languages", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const w = require(`../src/i18n/locales/${lang}.json`).Watch;
    for (const k of ["guideToggle", "guideNote", ...WATCH_GUIDE_STEPS]) expect([lang, k, typeof w?.[k]]).toEqual([lang, k, "string"]);
  }
});

test("the watch card shows the guide", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/components/watch/WatchConnectCard.tsx"), "utf8");
  expect(src).toMatch(/WATCH_GUIDE_STEPS\.map/);
  expect(src).toMatch(/t\("guideToggle"\)/);
});
