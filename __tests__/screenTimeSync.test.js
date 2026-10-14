// Screen-time sync: each pending day is posted with the date the usage
// happened on (the native store buckets it per local day), not the date the
// sync ran — usage from 23:50 synced at 00:10 stays on the previous day.
// lastSyncAt is only marked after the POSTs succeed, and the parent-limit
// check never runs from the headless (no-UI) path.
jest.mock("../src/lib/native/screenTime", () => ({
  takePendingSync: jest.fn(),
  restorePendingSync: jest.fn(),
  markSyncSucceeded: jest.fn(),
  onSyncDue: jest.fn(() => () => {}),
}));
jest.mock("../src/lib/api/context", () => ({ createContextEvent: jest.fn() }));
jest.mock("../src/lib/family/screenTimeLimit", () => ({ checkScreenTimeLimit: jest.fn() }));
// The headless path re-checks the account first (screenTimeBackfill.test.js covers that).
jest.mock("../src/lib/screenTime/backgroundGate", () => ({ recheckBackgroundGate: jest.fn(async () => true) }));
jest.mock("../src/lib/syncGate", () => ({
  isBackgroundSyncAllowed: () => true,
  wasBackgroundSyncAllowedLastSession: async () => true,
}));

import * as native from "../src/lib/native/screenTime";
import { createContextEvent } from "../src/lib/api/context";
import { checkScreenTimeLimit } from "../src/lib/family/screenTimeLimit";
import { syncScreenTime, syncScreenTimeHeadless } from "../src/lib/screenTime/sync";

const app = (minutes) => [{ packageName: "com.example", appName: "Example", minutesUsed: minutes }];
const twoDays = {
  days: [
    { date: "2026-10-07", totalMinutes: 10, apps: app(10) },
    { date: "2026-10-08", totalMinutes: 5, apps: app(5) },
  ],
};

beforeEach(() => jest.clearAllMocks());

test("midnight: usage before and after midnight is posted on each day's own date", async () => {
  native.takePendingSync.mockResolvedValue(twoDays);
  createContextEvent.mockResolvedValue({});
  await syncScreenTime();
  expect(createContextEvent.mock.calls.map((c) => [c[0].event_date, c[0].metadata.minutes])).toEqual([
    ["2026-10-07", 10],
    ["2026-10-08", 5],
  ]);
  expect(native.markSyncSucceeded).toHaveBeenCalledTimes(1);
  expect(native.restorePendingSync).not.toHaveBeenCalled();
});

test("a failed POST hands that day (and the rest) back with their dates; lastSyncAt isn't marked", async () => {
  native.takePendingSync.mockResolvedValue(twoDays);
  createContextEvent.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("offline"));
  await syncScreenTime();
  expect(native.restorePendingSync).toHaveBeenCalledTimes(1);
  expect(native.restorePendingSync).toHaveBeenCalledWith("2026-10-08", 5, app(5));
  expect(native.markSyncSucceeded).not.toHaveBeenCalled();
  expect(checkScreenTimeLimit).not.toHaveBeenCalled();
});

test("nothing pending → no POST, no lastSyncAt", async () => {
  native.takePendingSync.mockResolvedValue(null);
  await syncScreenTime();
  expect(createContextEvent).not.toHaveBeenCalled();
  expect(native.markSyncSucceeded).not.toHaveBeenCalled();
});

test("the limit check runs after a foreground sync, never from the headless task", async () => {
  native.takePendingSync.mockResolvedValue(twoDays);
  createContextEvent.mockResolvedValue({});
  await syncScreenTime();
  expect(checkScreenTimeLimit).toHaveBeenCalledTimes(1);

  jest.clearAllMocks();
  native.takePendingSync.mockResolvedValue(twoDays);
  createContextEvent.mockResolvedValue({});
  await syncScreenTimeHeadless();
  expect(createContextEvent).toHaveBeenCalledTimes(2);
  expect(checkScreenTimeLimit).not.toHaveBeenCalled();
});
