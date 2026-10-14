// Exercise duration is entered as hours + minutes (like Study), not minutes
// only; the API still gets one duration_minutes number (1–1440).
import { exerciseDurationMinutes } from "../src/lib/exercise/duration";

test("hours + minutes → total minutes", () => {
  expect(exerciseDurationMinutes("1", "30")).toBe(90);
  expect(exerciseDurationMinutes("2", "")).toBe(120);
  expect(exerciseDurationMinutes("", "45")).toBe(45);
  expect(exerciseDurationMinutes("24", "0")).toBe(1440);
});

test("nothing, over 24 h, minutes ≥ 60 or non-numbers → null (invalid)", () => {
  expect(exerciseDurationMinutes("", "")).toBeNull();
  expect(exerciseDurationMinutes("0", "0")).toBeNull();
  expect(exerciseDurationMinutes("24", "1")).toBeNull();
  expect(exerciseDurationMinutes("0", "60")).toBeNull();
  expect(exerciseDurationMinutes("x", "10")).toBeNull();
});

test("Exercise has Hours / Minutes labels in every locale", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const ex = require(`../src/i18n/locales/${lang}.json`).Exercise;
    expect(ex.hoursLabel && ex.minutesLabel).toBeTruthy();
  }
});
