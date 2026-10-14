// "Delete my account" — UI only for now: the confirm dialog needs the user to
// type DELETE, and confirming only says "coming soon". No backend call,
// no Cognito delete, nothing removed (docs/account-deletion-design.md).
import fs from "fs";
import path from "path";
import { isDeleteConfirmation } from "../src/lib/account/deleteConfirmation";

test("only the exact word DELETE confirms", () => {
  expect(isDeleteConfirmation("DELETE")).toBe(true);
  expect(isDeleteConfirmation("  DELETE ")).toBe(true);
  for (const no of ["", "delete", "Delete", "DELET", "DELETE ME", undefined]) expect(isDeleteConfirmation(no)).toBe(false);
});

test("the dialog makes no backend / Cognito call", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "components", "settings", "DeleteAccountModal.tsx"), "utf8");
  expect(src).not.toMatch(/lib\/api\//);
  expect(src).not.toMatch(/aws\/cognito/);
  expect(src).not.toMatch(/apiDelete|apiPost|deleteUser/);
});

test("every dialog string exists in all 7 languages", () => {
  const keys = Object.keys(require("../src/i18n/locales/en.json").Settings.deleteAccount);
  expect(keys.length).toBeGreaterThan(5);
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const block = require(`../src/i18n/locales/${lang}.json`).Settings.deleteAccount;
    for (const k of keys) expect([lang, k, typeof block?.[k]]).toEqual([lang, k, "string"]);
  }
});
