// Home → Study "Log it now" opens the Log popup on the Study tab (same as the
// web app); the top "Log today's data" button and anything unknown open Sleep.
import { LOG_TABS, resolveLogTab } from "../src/lib/logTodayTab";

test("the popup's tabs, and which one it opens on", () => {
  expect([...LOG_TABS]).toEqual(["sleep", "study", "exercise", "habits"]);
  expect(resolveLogTab("study")).toBe("study");
  expect(resolveLogTab(undefined)).toBe("sleep");
  expect(resolveLogTab("nope")).toBe("sleep");
});
