// Screen time backfill + background gate.
// (0) The background-sync flag survives the app closing; it's cleared only on
//     sign-out or when the account may not send data (13–17 with
//     minor_data_enabled off, under-13, or a failed status check) — and the
//     headless sync re-checks that every time (fails closed).
// (a) Every sync sends one snapshot per local day for the last 7 days, taken
//     from Android's own usage record: today keeps updating, an ended day is
//     sent once (final), a day Android has no data for is skipped ("no
//     data", never 0), and pending deltas for snapshot days aren't posted.
jest.mock("../src/lib/native/screenTime", () => ({
  takePendingSync: jest.fn(async () => null),
  restorePendingSync: jest.fn(),
  markSyncSucceeded: jest.fn(),
  getDailyUsage: jest.fn(async () => []),
  onSyncDue: jest.fn(() => () => {}),
}));
jest.mock("../src/lib/api/context", () => ({
  createContextEvent: jest.fn(async () => ({})),
  upsertScreenTimeSnapshot: jest.fn(async () => ({})),
}));
jest.mock("../src/lib/family/screenTimeLimit", () => ({ checkScreenTimeLimit: jest.fn() }));
jest.mock("../src/lib/aws/cognito", () => ({ getCurrentUserId: jest.fn(async () => "user-1") }));
jest.mock("../src/lib/api/family", () => ({ getFamilyStatus: jest.fn(), isFamilyApiConfigured: () => true }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as native from "../src/lib/native/screenTime";
import * as contextApi from "../src/lib/api/context";
import { getFamilyStatus } from "../src/lib/api/family";
import {
  setBackgroundSyncAllowed,
  endForegroundSession,
  clearBackgroundSyncAllowed,
  wasBackgroundSyncAllowedLastSession,
} from "../src/lib/syncGate";
import { syncScreenTime, syncScreenTimeHeadless } from "../src/lib/screenTime/sync";

const status = (age_band, enabled) => ({ age_band, enabled, can_invite: false, can_be_linked: false, consent_text_version: "v" });
const day = (date, minutes, { available = true, final = true } = {}) => ({
  date, available, final, totalMinutes: minutes,
  apps: minutes ? [{ packageName: "com.whatsapp", appName: "WhatsApp", minutesUsed: minutes }] : [],
});
const upserted = () => contextApi.upsertScreenTimeSnapshot.mock.calls.map((c) => [c[0], c[1]]);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  getFamilyStatus.mockResolvedValue(status("18_plus", false));
  native.getDailyUsage.mockResolvedValue([]);
  native.takePendingSync.mockResolvedValue(null);
});

describe("(0) background gate", () => {
  test("closing the app (ProfileGate unmount) keeps the flag; only this session's gate ends", async () => {
    await setBackgroundSyncAllowed(true);
    endForegroundSession();
    expect(await wasBackgroundSyncAllowedLastSession()).toBe(true);
  });

  test("sign-out clears it, and the headless sync then does nothing", async () => {
    await setBackgroundSyncAllowed(true);
    await clearBackgroundSyncAllowed();
    native.getDailyUsage.mockResolvedValue([day("2026-10-10", 60)]);
    await syncScreenTimeHeadless();
    expect(native.getDailyUsage).not.toHaveBeenCalled();
    expect(contextApi.upsertScreenTimeSnapshot).not.toHaveBeenCalled();
  });

  test.each([
    ["13–17 with the flag off", () => getFamilyStatus.mockResolvedValue(status("13_17", false))],
    ["under-13", () => getFamilyStatus.mockResolvedValue(status("under_13", true))],
    ["status error", () => getFamilyStatus.mockRejectedValue(new Error("503"))],
  ])("headless re-check fails closed: %s → nothing sent, flag cleared", async (_name, arrange) => {
    await setBackgroundSyncAllowed(true);
    arrange();
    native.getDailyUsage.mockResolvedValue([day("2026-10-10", 60)]);
    native.takePendingSync.mockResolvedValue({ days: [day("2026-10-10", 5)] });
    await syncScreenTimeHeadless();
    expect(contextApi.upsertScreenTimeSnapshot).not.toHaveBeenCalled();
    expect(contextApi.createContextEvent).not.toHaveBeenCalled();
    expect(native.takePendingSync).not.toHaveBeenCalled();
    expect(await wasBackgroundSyncAllowedLastSession()).toBe(false);
  });

  test("13–17 with the flag on: allowed", async () => {
    await setBackgroundSyncAllowed(true);
    getFamilyStatus.mockResolvedValue(status("13_17", true));
    native.getDailyUsage.mockResolvedValue([day("2026-10-10", 60)]);
    await syncScreenTimeHeadless();
    expect(upserted()).toEqual([["2026-10-10", 60]]);
  });
});

describe("(a) day snapshots", () => {
  beforeEach(async () => {
    await setBackgroundSyncAllowed(true);
  });

  test("app closed 4 days with the tracking service dead: all 4 days + today still go up, by date", async () => {
    native.getDailyUsage.mockResolvedValue([
      day("2026-10-08", 0, { available: false }),
      day("2026-10-09", 120),
      day("2026-10-10", 95),
      day("2026-10-11", 200),
      day("2026-10-12", 30),
      day("2026-10-13", 15, { final: false }),
    ]);
    await syncScreenTimeHeadless();
    expect(upserted()).toEqual([
      ["2026-10-09", 120],
      ["2026-10-10", 95],
      ["2026-10-11", 200],
      ["2026-10-12", 30],
      ["2026-10-13", 15],
    ]);
    expect(native.markSyncSucceeded).toHaveBeenCalled();
  });

  test("no duplicates: an ended day is sent once; today keeps updating (upsert)", async () => {
    native.getDailyUsage.mockResolvedValue([day("2026-10-12", 30), day("2026-10-13", 15, { final: false })]);
    await syncScreenTimeHeadless();
    native.getDailyUsage.mockResolvedValue([day("2026-10-12", 31), day("2026-10-13", 40, { final: false })]);
    jest.clearAllMocks();
    getFamilyStatus.mockResolvedValue(status("18_plus", false));
    await syncScreenTimeHeadless();
    expect(upserted()).toEqual([["2026-10-13", 40]]);
  });

  test("a failed upload isn't marked final, so it's retried next time", async () => {
    native.getDailyUsage.mockResolvedValue([day("2026-10-12", 30)]);
    contextApi.upsertScreenTimeSnapshot.mockRejectedValueOnce(new Error("offline"));
    await syncScreenTimeHeadless();
    expect(native.markSyncSucceeded).not.toHaveBeenCalled();
    jest.clearAllMocks();
    getFamilyStatus.mockResolvedValue(status("18_plus", false));
    await syncScreenTimeHeadless();
    expect(upserted()).toEqual([["2026-10-12", 30]]);
  });

  test("pending deltas: dropped for snapshot days, still posted for days Android has no data for", async () => {
    native.getDailyUsage.mockResolvedValue([day("2026-10-12", 0, { available: false }), day("2026-10-13", 50, { final: false })]);
    native.takePendingSync.mockResolvedValue({ days: [day("2026-10-12", 7), day("2026-10-13", 9)] });
    await syncScreenTimeHeadless();
    expect(upserted()).toEqual([["2026-10-13", 50]]);
    expect(contextApi.createContextEvent.mock.calls.map((c) => c[0].event_date)).toEqual(["2026-10-12"]);
  });

  test("timezone changed: an already-final day isn't re-sent with a recomputed total; a new date is sent once", async () => {
    native.getDailyUsage.mockResolvedValue([day("2026-10-12", 30)]);
    await syncScreenTimeHeadless();
    // Same phone, new timezone — Android's local days shift.
    native.getDailyUsage.mockResolvedValue([day("2026-10-11", 12), day("2026-10-12", 41)]);
    jest.clearAllMocks();
    getFamilyStatus.mockResolvedValue(status("18_plus", false));
    await syncScreenTimeHeadless();
    expect(upserted()).toEqual([["2026-10-11", 12]]);
  });

  test("foreground sync (gate passed this session) sends snapshots too", async () => {
    native.getDailyUsage.mockResolvedValue([day("2026-10-13", 15, { final: false })]);
    await syncScreenTime();
    expect(upserted()).toEqual([["2026-10-13", 15]]);
  });
});
