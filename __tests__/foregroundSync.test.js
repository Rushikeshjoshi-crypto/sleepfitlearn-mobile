// Foreground syncs are fire-and-forget: a rejected screen-time or Health
// Connect sync must be caught (logged), never left as an unhandled rejection.
jest.mock("../src/lib/screenTime/sync", () => ({ syncScreenTime: jest.fn() }));
jest.mock("../src/lib/healthConnect/sync", () => ({ syncHealthConnectIfEnabled: jest.fn() }));
jest.mock("../src/lib/vitals/sync", () => ({ syncVitals: jest.fn() }));

import { syncScreenTime } from "../src/lib/screenTime/sync";
import { syncHealthConnectIfEnabled } from "../src/lib/healthConnect/sync";
import { syncVitals } from "../src/lib/vitals/sync";
import { runForegroundSyncs } from "../src/components/ForegroundSync";

test("all syncs run (incl. heart rate / BP), and their rejections are caught", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  syncScreenTime.mockRejectedValue(new Error("offline"));
  syncHealthConnectIfEnabled.mockRejectedValue(new Error("SecurityException"));
  syncVitals.mockRejectedValue(new Error("503"));
  await expect(runForegroundSyncs()).resolves.toBeUndefined();
  expect(syncScreenTime).toHaveBeenCalledTimes(1);
  expect(syncHealthConnectIfEnabled).toHaveBeenCalledTimes(1);
  expect(syncVitals).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(3);
  warn.mockRestore();
});
