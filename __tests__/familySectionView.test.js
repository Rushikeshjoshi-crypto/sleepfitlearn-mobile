// Settings → Family: a failed status or links request is an error with a
// retry — not "Parent controls are coming soon" or "No parent linked".
// Same helper as the web app (src/lib/family/familySectionView.ts in both).
import { familySectionView } from "../src/lib/family/familySectionView";

const base = { statusLoading: false, statusError: false, status: null, linksLoading: false, linksError: false };
const teen = { enabled: true, age_band: "13_17", can_invite: false, can_be_linked: true };

test("status request failed → status_error (not 'unavailable')", () => {
  expect(familySectionView({ ...base, statusError: true })).toBe("status_error");
  expect(familySectionView({ ...base, status: { ...teen, enabled: false } })).toBe("unavailable");
});

test("links request failed → links_error (not 'no parents'); otherwise child", () => {
  expect(familySectionView({ ...base, status: teen, linksError: true })).toBe("links_error");
  expect(familySectionView({ ...base, status: teen, linksLoading: true })).toBe("child_loading");
  expect(familySectionView({ ...base, status: teen })).toBe("child");
});

test("the other states are unchanged", () => {
  expect(familySectionView({ ...base, statusLoading: true })).toBe("loading");
  expect(familySectionView({ ...base, status: { ...teen, age_band: null } })).toBe("need_birth_year");
  expect(familySectionView({ ...base, status: { enabled: true, age_band: "18_plus", can_invite: true, can_be_linked: false } })).toBe("parent");
  expect(familySectionView({ ...base, status: { enabled: true, age_band: "under_13", can_invite: false, can_be_linked: false } })).toBe("none");
});
