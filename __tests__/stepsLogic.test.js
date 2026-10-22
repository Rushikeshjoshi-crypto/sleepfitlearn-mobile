// Steps logic on mobile, mirroring the web's tests/stepsWeb.test.mjs: goal and
// progress, missing day vs stored 0, chart scale (goal always inside), the
// goal popup's rules, optimistic save + rollback (a dropped daily_step_goal
// is a failed save), the locked goal, the source line and the minor gate.
jest.mock("../src/lib/api/client", () => {
  class ApiError extends Error {
    constructor(status, message, code = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { ApiError, apiGet: jest.fn(), apiPost: jest.fn(), apiPut: jest.fn(), apiDelete: jest.fn() };
});
jest.mock("../src/lib/api/family", () => ({
  isFamilyApiConfigured: jest.fn(() => true),
  getFamilyStatus: jest.fn(),
}));

import * as client from "../src/lib/api/client";
import * as family from "../src/lib/api/family";
import { updateUserProfile } from "../src/lib/api/users";
import { lockedStepGoal } from "../src/lib/settings/lockedStepGoal";
import { checkStepsAllowed } from "../src/lib/steps/access";
import { DEFAULT_STEP_GOAL, isMissingDay, noStepsSynced, stepGoal, stepProgress, stepsSourceText } from "../src/lib/steps/display";
import {
  MAX_STEP_GOAL,
  MIN_STEP_GOAL,
  STEP_GOAL_PRESETS,
  compactSteps,
  parseStepGoal,
  saveStepGoalOptimistic,
  stepChart,
} from "../src/lib/steps/goal";

beforeEach(() => jest.clearAllMocks());

const day = (date, steps, day_label = "M") => ({ date, day_label, steps });

describe("goal and progress", () => {
  test("default goal is 10,000; a stored goal wins; 0/null/missing fall back", () => {
    expect(DEFAULT_STEP_GOAL).toBe(10000);
    expect(stepGoal({ daily_step_goal: 8000 })).toBe(8000);
    expect(stepGoal({ daily_step_goal: null })).toBe(10000);
    expect(stepGoal({ daily_step_goal: 0 })).toBe(10000);
    expect(stepGoal({})).toBe(10000);
    expect(stepGoal(null)).toBe(10000);
  });

  test("progress is rounded and capped at 100; no steps is 0", () => {
    expect(stepProgress(5000, 10000)).toBe(50);
    expect(stepProgress(3333, 10000)).toBe(33);
    expect(stepProgress(25000, 10000)).toBe(100);
    expect(stepProgress(null, 10000)).toBe(0);
    expect(stepProgress(5000, 0)).toBe(0);
  });
});

describe("missing day vs stored 0", () => {
  test("a stored 0 is data; null / absent / null entry is missing", () => {
    expect(isMissingDay(day("2026-10-01", 0))).toBe(false);
    expect(isMissingDay(day("2026-10-01", null))).toBe(true);
    expect(isMissingDay({ date: "2026-10-01" })).toBe(true);
    expect(isMissingDay(null)).toBe(true);
  });

  test("empty state only when every day is missing", () => {
    expect(noStepsSynced([day("a", null), null])).toBe(true);
    expect(noStepsSynced([])).toBe(true);
    expect(noStepsSynced([day("a", null), day("b", 0)])).toBe(false);
  });
});

describe("chart", () => {
  const week = [
    day("2026-10-15", 4000),
    day("2026-10-16", null),
    day("2026-10-17", 0),
    day("2026-10-18", 12000),
    day("2026-10-19", 9999),
    day("2026-10-20", 10000),
    day("2026-10-21", 150),
  ];

  test("scale is max(goal, best day): goal stays inside the chart", () => {
    expect(stepChart([day("a", 4000)], 10000, "a")).toMatchObject({ scale: 10000, goalPct: 100 });
    const c = stepChart(week, 10000, "2026-10-21");
    expect(c.scale).toBe(12000);
    expect(c.goalPct).toBe(83);
    expect(stepChart([day("a", null)], 10000, "a").scale).toBe(10000);
  });

  test("bars: missing, stored 0, small stub, reached at or above goal, today", () => {
    const { bars } = stepChart(week, 10000, "2026-10-21");
    expect(bars[1]).toMatchObject({ missing: true, steps: null, heightPct: 0, reached: false });
    expect(bars[2]).toMatchObject({ missing: false, steps: 0, heightPct: 0, reached: false });
    expect(bars[6]).toMatchObject({ heightPct: 3, isToday: true });
    expect(bars[3]).toMatchObject({ heightPct: 100, reached: true });
    expect(bars[4].reached).toBe(false);
    expect(bars[5].reached).toBe(true);
    expect(bars.filter((b) => b.isToday)).toHaveLength(1);
  });

  test("compact labels", () => {
    expect(compactSteps(7200, "en")).toBe("7.2K");
    expect(compactSteps(10000, "en")).toBe("10K");
    expect(compactSteps(950, "en")).toBe("950");
    expect(compactSteps(0, "en")).toBe("0");
  });
});

describe("goal popup rules", () => {
  test("presets and bounds match the users API", () => {
    expect([...STEP_GOAL_PRESETS]).toEqual([5000, 8000, 10000, 12000]);
    expect([MIN_STEP_GOAL, MAX_STEP_GOAL]).toEqual([1000, 50000]);
  });

  test("whole numbers 1,000–50,000 only", () => {
    expect(parseStepGoal("1000")).toBe(1000);
    expect(parseStepGoal(" 50000 ")).toBe(50000);
    expect(parseStepGoal("999")).toBeNull();
    expect(parseStepGoal("50001")).toBeNull();
    expect(parseStepGoal("8000.5")).toBeNull();
    expect(parseStepGoal("-5000")).toBeNull();
    expect(parseStepGoal("8,000")).toBeNull();
    expect(parseStepGoal("")).toBeNull();
    expect(parseStepGoal("abc")).toBeNull();
  });
});

describe("optimistic save", () => {
  const profile = { id: "u1", daily_step_goal: 8000, restricted_fields: [], age_band: "18_plus" };

  test("success: new goal shown at once, then the server's profile (read-only fields kept)", async () => {
    const seen = [];
    const update = jest.fn(async () => ({ id: "u1", daily_step_goal: 12000 }));
    const out = await saveStepGoalOptimistic(profile, 12000, (p) => seen.push(p), update);
    expect(update).toHaveBeenCalledWith({ daily_step_goal: 12000 });
    expect(seen[0].daily_step_goal).toBe(12000);
    expect(out).toMatchObject({ daily_step_goal: 12000, age_band: "18_plus" });
  });

  test("error: the previous profile is put back and the error rethrown", async () => {
    const seen = [];
    await expect(
      saveStepGoalOptimistic(profile, 12000, (p) => seen.push(p), async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(seen.map((p) => p.daily_step_goal)).toEqual([12000, 8000]);
    expect(seen[1]).toBe(profile);
  });

  test("a 200 that drops daily_step_goal (older Lambda) is a failed save", async () => {
    const seen = [];
    await expect(
      saveStepGoalOptimistic(profile, 12000, (p) => seen.push(p), async () => ({ id: "u1" })),
    ).rejects.toThrow("step_goal_not_saved");
    expect(seen[seen.length - 1]).toBe(profile);
  });
});

describe("locked step goal", () => {
  const stored = {
    id: "u1", nickname: "N", sex: null, date_of_birth: "2010-01-01", height_cm: null, target_weight_kg: null,
    daily_step_goal: null, preferred_language: "en", privacy_settings: {}, country_code: "IN",
  };

  test("lockedStepGoal reads restricted_fields", () => {
    expect(lockedStepGoal({ restricted_fields: ["height_cm", "daily_step_goal"] })).toBe(true);
    expect(lockedStepGoal({ restricted_fields: ["height_cm"] })).toBe(false);
    expect(lockedStepGoal({})).toBe(false);
    expect(lockedStepGoal(null)).toBe(false);
  });

  test("updateUserProfile leaves a locked goal out of the PUT (even if one is passed)", async () => {
    client.apiGet.mockResolvedValue({ ...stored, restricted_fields: ["daily_step_goal"] });
    client.apiPut.mockResolvedValue(stored);
    await updateUserProfile({ nickname: "X" });
    expect(client.apiPut.mock.calls[0][2]).not.toHaveProperty("daily_step_goal");
    await updateUserProfile({ daily_step_goal: 12000 });
    expect(client.apiPut.mock.calls[1][2]).not.toHaveProperty("daily_step_goal");
  });

  test("not locked: the goal is still sent", async () => {
    client.apiGet.mockResolvedValue({ ...stored, daily_step_goal: 9000, restricted_fields: [] });
    client.apiPut.mockResolvedValue(stored);
    await updateUserProfile({ daily_step_goal: 12000 });
    expect(client.apiPut.mock.calls[0][2].daily_step_goal).toBe(12000);
  });
});

describe("source line", () => {
  const tv = (key, values) => (key === "manual" ? "Manual" : `Health Connect · ${values.app}`);

  test("synced with origins → app names; without → Health Connect; manual → Manual", () => {
    expect(stepsSourceText({ source: "health_connect", meta: { origins: ["com.sec.android.app.shealth", "com.x.y"] } }, tv, "Health Connect")).toBe(
      "Health Connect · Samsung Health, com.x.y",
    );
    expect(stepsSourceText({ meta: { source: "health_connect", origins: [] } }, tv, "Health Connect")).toBe("Health Connect");
    expect(stepsSourceText({ source: "manual", meta: { origins: ["com.x"] } }, tv, "Health Connect")).toBe("Manual");
    expect(stepsSourceText({ meta: { source: "manual" } }, tv, "Health Connect")).toBe("Manual");
  });
});

describe("minor gate (same rule as synced HR/BP, fails closed)", () => {
  const status = (age_band, enabled) => ({ age_band, enabled });

  test.each([
    ["18+", status("18_plus", false), true],
    ["no birth year", status(null, false), true],
    ["13–17 flag ON", status("13_17", true), true],
    ["13–17 flag OFF", status("13_17", false), false],
    ["under 13", status("under_13", true), false],
  ])("%s", async (_name, s, allowed) => {
    family.getFamilyStatus.mockResolvedValue(s);
    expect(await checkStepsAllowed()).toBe(allowed);
  });

  test("status error → not allowed", async () => {
    family.getFamilyStatus.mockRejectedValue(new Error("503"));
    expect(await checkStepsAllowed()).toBe(false);
  });

  test("no family API configured → not allowed", async () => {
    family.isFamilyApiConfigured.mockReturnValueOnce(false);
    expect(await checkStepsAllowed()).toBe(false);
    expect(family.getFamilyStatus).not.toHaveBeenCalled();
  });
});

describe("compact labels without Intl compact support (some Hermes builds)", () => {
  test("falls back to the same short form", () => {
    const Real = Intl.NumberFormat;
    // An engine that ignores notation: "compact".
    Intl.NumberFormat = function (locale, opts = {}) {
      const { notation, ...rest } = opts;
      return new Real(locale, rest);
    };
    try {
      expect(compactSteps(7200, "en")).toBe("7.2K");
      expect(compactSteps(10000, "en")).toBe("10K");
      expect(compactSteps(12345, "en")).toBe("12.3K");
      expect(compactSteps(950, "en")).toBe("950");
    } finally {
      Intl.NumberFormat = Real;
    }
  });
});

describe("Connections no-data hint and rationale comment", () => {
  const fs = require("fs");
  const path = require("path");
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");

  test("no-data hint counts Steps (read on its own, only when allowed), each type failing alone", () => {
    const src = read("src", "screens", "ConnectionsScreen.tsx");
    expect(src).toMatch(/checkStepsAllowed\(\)\.then\(\(ok\) => \(ok \? readDailySteps\(/);
    expect(src).toMatch(/readSleepSessions\(from, to\)\.catch\(none\)/);
    expect(src).toMatch(/sleep\.length \+ exercise\.length \+ weight\.length \+ steps\.length > 0/);
  });

  test("the rationale activity's comment lists steps", () => {
    expect(read("android", "app", "src", "main", "java", "com", "com.sleepfitlearn.mobile", "HealthPermissionsRationaleActivity.kt")).toMatch(/steps as daily/);
  });

  test("deleteSyncedSteps stays available (no button is added for it)", () => {
    expect(typeof require("../src/lib/steps/sync").deleteSyncedSteps).toBe("function");
  });
});

describe("Health Connect texts (Connections)", () => {
  const LANGS = ["en", "fr", "de", "it", "es", "hi", "bn"];
  const KEYS = ["hcConnectBody", "hcCardSubtitle", "hcConnectBodyNoSteps", "hcCardSubtitleNoSteps"];

  test("all four keys in all 7 languages; the steps versions differ from the no-steps ones", () => {
    for (const lang of LANGS) {
      const h = require(`../src/i18n/locales/${lang}.json`).Habits;
      for (const k of KEYS) expect([lang, k, typeof h[k] === "string" && h[k].length > 0]).toEqual([lang, k, true]);
      expect([lang, h.hcConnectBody !== h.hcConnectBodyNoSteps, h.hcCardSubtitle !== h.hcCardSubtitleNoSteps]).toEqual([lang, true, true]);
    }
    const en = require("../src/i18n/locales/en.json").Habits;
    expect(en.hcConnectBody).toMatch(/step/i);
    expect(en.hcCardSubtitle).toMatch(/step/i);
    expect(en.hcConnectBodyNoSteps).not.toMatch(/step/i);
    expect(en.hcCardSubtitleNoSteps).not.toMatch(/step/i);
  });

  test("Connections picks the text by the steps rule", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "screens", "ConnectionsScreen.tsx"), "utf8");
    expect(src).toMatch(/stepsAllowed \? "Habits:hcConnectBody" : "Habits:hcConnectBodyNoSteps"/);
    expect(src).toMatch(/stepsAllowed \? "Habits:hcCardSubtitle" : "Habits:hcCardSubtitleNoSteps"/);
  });
});
