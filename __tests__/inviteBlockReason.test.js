// Accept-invite screen: why this account can't accept, including the
// under-13 case (it used to fall through to a form that did nothing).
// Same helper as the web app (src/lib/family/inviteBlockReason.ts in both).
import { inviteBlockReason } from "../src/lib/family/inviteBlockReason";

const s = (age_band, enabled = true) => ({ enabled, age_band });

test("each blocked case has its reason; 13–17 can accept", () => {
  expect(inviteBlockReason(s("13_17", false))).toBe("unavailable");
  expect(inviteBlockReason(s("18_plus"))).toBe("adult");
  expect(inviteBlockReason(s(null))).toBe("need_birth_year");
  expect(inviteBlockReason(s("under_13"))).toBe("under_13");
  expect(inviteBlockReason(s("13_17"))).toBeNull();
});
