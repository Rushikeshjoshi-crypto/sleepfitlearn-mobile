// Settings → Save is only allowed once the profile actually loaded: saving
// after a failed (or empty) load would PUT a form built from nothing and wipe
// the stored fields.
import { canSaveProfile } from "../src/lib/settings/canSaveProfile";

const ok = { submitting: false, loading: false, profile: { id: "u1" }, loadError: null };

test("loaded profile, idle → can save", () => {
  expect(canSaveProfile(ok)).toBe(true);
});

test("load failed, profile null, still loading, or saving → can't save", () => {
  expect(canSaveProfile({ ...ok, loadError: "Couldn't load" })).toBe(false);
  expect(canSaveProfile({ ...ok, profile: null })).toBe(false);
  expect(canSaveProfile({ ...ok, loading: true })).toBe(false);
  expect(canSaveProfile({ ...ok, submitting: true })).toBe(false);
});
