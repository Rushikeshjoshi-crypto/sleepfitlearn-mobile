// Local-calendar "today" everywhere (not the UTC date from toISOString()).
// 2026-10-05T20:00Z is 01:30 on 6 Oct in IST — the UTC date is still the 5th.
process.env.TZ = "Asia/Kolkata";

import fs from "fs";
import path from "path";
import { todayISO, isoDaysAgo } from "../src/lib/dateRange";
import { dateGroupLabel } from "../src/lib/groupByDate";
import { computeStreak } from "../src/lib/exercise/streak";

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-05T20:00:00Z") });
});
afterEach(() => jest.useRealTimers());

test("today / yesterday are the IST dates just after midnight", () => {
  expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-05"); // the old, wrong answer
  expect(todayISO()).toBe("2026-10-06");
  expect(isoDaysAgo(1)).toBe("2026-10-05");
});

test("history labels: Today / Yesterday follow the local date", () => {
  expect(dateGroupLabel("2026-10-06")).toBe("Today");
  expect(dateGroupLabel("2026-10-05")).toBe("Yesterday");
  expect(dateGroupLabel("2026-10-04")).toBe("2026-10-04");
});

test("exercise streak counts today and walks back by local days", () => {
  const e = (event_date) => ({ event_date });
  expect(computeStreak([e("2026-10-06"), e("2026-10-05"), e("2026-10-04")])).toBe(3);
  expect(computeStreak([e("2026-10-05")])).toBe(0); // nothing logged today yet
});

test("no screen or composer derives a calendar date from toISOString() any more", () => {
  const offenders = [];
  const allowed = new Set([
    // these shift by the timezone offset first, or do pure UTC date maths
    path.join("lib", "dateRange.ts"),
    path.join("lib", "screenTime", "sync.ts"),
    path.join("lib", "healthConnect", "sync.ts"),
    path.join("lib", "vitals", "aggregate.ts"),
    path.join("lib", "family", "screenTimeLimit.ts"),
    path.join("lib", "insights", "coverage.ts"),
    path.join("screens", "PersonalScreen.tsx"),
  ]);
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) {
        const rel = path.relative(path.join(__dirname, "..", "src"), full);
        // code only — a comment that names the pattern isn't a use of it
        const code = fs.readFileSync(full, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
        if (!allowed.has(rel) && /toISOString\(\)\.slice\(0,\s*10\)/.test(code)) offenders.push(rel);
      }
    }
  };
  walk(path.join(__dirname, "..", "src"));
  expect(offenders).toEqual([]);
});
