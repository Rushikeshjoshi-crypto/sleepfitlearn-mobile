// Every sleep / exercise save, edit and delete re-syncs that date's energy
// level (same hooks as the web app's lib/api/sleep.ts and fitness.ts) — this
// also covers the Health Connect sync, which writes through these wrappers.
jest.mock("../src/lib/api/client", () => ({
  apiGet: jest.fn(async () => []),
  apiPost: jest.fn(async () => ({})),
  apiPut: jest.fn(async () => ({})),
  apiDelete: jest.fn(async () => undefined),
}));
jest.mock("../src/lib/energy/sync", () => ({
  queueEnergySync: jest.fn(),
  dateFromSk: (sk) => sk.split("#")[0].slice(0, 10),
}));

import { queueEnergySync } from "../src/lib/energy/sync";
import { createSleepEntry, deleteSleepEntry, updateSleepEntry } from "../src/lib/api/sleep";
import { createExerciseEntry, deleteExerciseEntry, updateExerciseEntry } from "../src/lib/api/fitness";

beforeEach(() => jest.clearAllMocks());

test("sleep create / edit / delete queue that date's energy sync", async () => {
  await createSleepEntry({ sleep_date: "2026-10-06", duration_hours: 8 });
  await updateSleepEntry("2026-10-05#a", { duration_hours: 7 });
  await deleteSleepEntry("2026-10-04#b");
  expect(queueEnergySync.mock.calls).toEqual([["2026-10-06"], ["2026-10-05"], ["2026-10-04"]]);
});

test("exercise create / edit / delete queue that date's energy sync", async () => {
  await createExerciseEntry({ event_date: "2026-10-07", duration_minutes: 30 });
  await updateExerciseEntry("2026-10-06#x", { event_date: "2026-10-06", duration_minutes: 20 });
  await deleteExerciseEntry("2026-10-05#y");
  expect(queueEnergySync.mock.calls).toEqual([["2026-10-07"], ["2026-10-06", "2026-10-06"], ["2026-10-05"]]);
});
