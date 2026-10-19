// Steps sync: Health Connect's daily totals (aggregateGroupByPeriod, via
// readDailySteps) → one upsert per day. The window is the day before the last
// successful sync through today (max 30 days, first sync = 30), it only moves
// on when every day saved, and a minor-gate refusal stops the run.
jest.mock("../src/lib/native/healthConnect", () => ({ readDailySteps: jest.fn() }));
jest.mock("../src/lib/api/fitness", () => ({
  upsertDailySteps: jest.fn(async () => ({})),
  listDailySteps: jest.fn(async () => []),
  deleteDailySteps: jest.fn(async () => {}),
}));
jest.mock("../src/lib/aws/cognito", () => ({ getCurrentUserId: jest.fn(async () => "u1"), getIdToken: jest.fn(async () => null) }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as native from "../src/lib/native/healthConnect";
import * as fitnessApi from "../src/lib/api/fitness";
import * as cognito from "../src/lib/aws/cognito";
import { MinorDataDisabledError, ApiError } from "../src/lib/api/client";
import { deleteSyncedSteps, syncSteps } from "../src/lib/steps/sync";
import { stepsSyncDates } from "../src/lib/steps/window";

const NOW = new Date(2026, 9, 20, 9, 30); // 2026-10-20 09:30 local
const day = (date, steps, origins = ["com.sec.android.app.shealth"]) => ({ date, steps, origins });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("stepsSyncDates", () => {
  test("first sync: the last 30 days including today", () => {
    expect(stepsSyncDates(null, NOW)).toEqual({ fromDate: "2026-09-21", toDate: "2026-10-20" });
  });

  test("after a sync: from the day before the last sync's day (late watch uploads)", () => {
    expect(stepsSyncDates(new Date(2026, 9, 20, 7, 0).toISOString(), NOW)).toEqual({ fromDate: "2026-10-19", toDate: "2026-10-20" });
    expect(stepsSyncDates(new Date(2026, 9, 15, 23, 50).toISOString(), NOW)).toEqual({ fromDate: "2026-10-14", toDate: "2026-10-20" });
  });

  test("a very old last sync is capped at 30 days", () => {
    expect(stepsSyncDates(new Date(2026, 5, 1).toISOString(), NOW).fromDate).toBe("2026-09-21");
  });

  test("month boundary", () => {
    expect(stepsSyncDates(new Date(2026, 10, 1, 8).toISOString(), new Date(2026, 10, 1, 9))).toEqual({ fromDate: "2026-10-31", toDate: "2026-11-01" });
  });
});

describe("syncSteps", () => {
  test("each day is upserted once with source health_connect, origins and tz; window then moves", async () => {
    native.readDailySteps.mockResolvedValue([day("2026-10-19", 8000), day("2026-10-20", 1200)]);
    await syncSteps(NOW);
    expect(native.readDailySteps).toHaveBeenCalledWith("2026-09-21", "2026-10-20", NOW);
    const calls = fitnessApi.upsertDailySteps.mock.calls;
    expect(calls.map((c) => [c[0], c[1]])).toEqual([["2026-10-19", 8000], ["2026-10-20", 1200]]);
    expect(calls[0][2]).toMatchObject({ source: "health_connect", origins: ["com.sec.android.app.shealth"], synced_at: NOW.toISOString() });
    expect(typeof calls[0][2].tz).toBe("string");
    expect(await AsyncStorage.getItem("steps.lastSyncAt.u1")).toBe(NOW.toISOString());

    // next run reads from the day before
    native.readDailySteps.mockResolvedValue([]);
    await syncSteps(new Date(2026, 9, 20, 18, 0));
    expect(native.readDailySteps.mock.calls[1].slice(0, 2)).toEqual(["2026-10-19", "2026-10-20"]);
  });

  test("one day failing: the others still save, but the window does NOT move", async () => {
    native.readDailySteps.mockResolvedValue([day("2026-10-18", 1), day("2026-10-19", 2), day("2026-10-20", 3)]);
    fitnessApi.upsertDailySteps.mockRejectedValueOnce(new ApiError(500, "boom"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await syncSteps(NOW);
    warn.mockRestore();
    expect(fitnessApi.upsertDailySteps).toHaveBeenCalledTimes(3);
    expect(await AsyncStorage.getItem("steps.lastSyncAt.u1")).toBeNull();
  });

  test("a minor-gate refusal stops the run (every day would be refused) and doesn't move the window", async () => {
    native.readDailySteps.mockResolvedValue([day("2026-10-19", 1), day("2026-10-20", 2)]);
    fitnessApi.upsertDailySteps.mockRejectedValueOnce(new MinorDataDisabledError("no"));
    await syncSteps(NOW);
    expect(fitnessApi.upsertDailySteps).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem("steps.lastSyncAt.u1")).toBeNull();
  });

  test("a manual day the server kept ({ skipped }) counts as done", async () => {
    native.readDailySteps.mockResolvedValue([day("2026-10-20", 3)]);
    fitnessApi.upsertDailySteps.mockResolvedValueOnce({ skipped: "manual_entry", date: "2026-10-20" });
    await syncSteps(NOW);
    expect(await AsyncStorage.getItem("steps.lastSyncAt.u1")).toBe(NOW.toISOString());
  });

  test("not signed in: nothing is read or sent", async () => {
    cognito.getCurrentUserId.mockResolvedValueOnce(null);
    await syncSteps(NOW);
    expect(native.readDailySteps).not.toHaveBeenCalled();
    expect(fitnessApi.upsertDailySteps).not.toHaveBeenCalled();
  });

  test("the window is per account", async () => {
    await AsyncStorage.setItem("steps.lastSyncAt.someone-else", new Date(2026, 9, 20, 7).toISOString());
    native.readDailySteps.mockResolvedValue([]);
    await syncSteps(NOW);
    expect(native.readDailySteps.mock.calls[0][0]).toBe("2026-09-21");
  });
});

test("deleteSyncedSteps removes only Health Connect days and resets the window", async () => {
  await AsyncStorage.setItem("steps.lastSyncAt.u1", NOW.toISOString());
  fitnessApi.listDailySteps.mockResolvedValue([
    { measured_at: "2026-10-19", meta: { source: "health_connect" } },
    { measured_at: "2026-10-20", meta: { source: "manual" } },
  ]);
  expect(await deleteSyncedSteps("u1")).toBe(1);
  expect(fitnessApi.deleteDailySteps.mock.calls).toEqual([["2026-10-19"]]);
  expect(await AsyncStorage.getItem("steps.lastSyncAt.u1")).toBeNull();
});
