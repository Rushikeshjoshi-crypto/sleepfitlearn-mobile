// Sign-up's birth-year field shows its example ("e.g. 1995") next to the
// name — it used to repeat the label as the placeholder (web shows both).
const fs = require("fs");
const path = require("path");

test("SignUpScreen uses Age.birthYearPlaceholder, and every locale has it", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "screens", "SignUpScreen.tsx"), "utf8");
  expect(src).toContain('tFamily("Age.birthYearPlaceholder")');
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    expect(require(`../src/i18n/locales/${lang}.json`).Family.Age.birthYearPlaceholder).toBeTruthy();
  }
});
