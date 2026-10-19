// daily_step_goal rides along on every profile save (users PUT is a full
// replace, so a save that dropped it would wipe it), and the weekly snapshot
// exposes the dashboard's steps block — safely empty from an older Lambda.
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

import * as client from "../src/lib/api/client";
import { updateUserProfile } from "../src/lib/api/users";
import { getWeeklySnapshot } from "../src/lib/api/dashboard";

const stored = {
  id: "u1", nickname: "N", sex: "female", date_of_birth: "1990-01-01", height_cm: 160, target_weight_kg: 55,
  daily_step_goal: 9000, preferred_language: "en", privacy_settings: {}, country_code: "IN",
};

beforeEach(() => jest.clearAllMocks());

test("an unrelated profile update sends the stored daily_step_goal back", async () => {
  client.apiGet.mockResolvedValue(stored);
  client.apiPut.mockResolvedValue(stored);
  await updateUserProfile({ nickname: "New" });
  const body = client.apiPut.mock.calls[0][2];
  expect(body.nickname).toBe("New");
  expect(body.daily_step_goal).toBe(9000);
});

test("setting the goal sends the new value; a profile without the field sends null", async () => {
  client.apiGet.mockResolvedValue(stored);
  client.apiPut.mockResolvedValue(stored);
  await updateUserProfile({ daily_step_goal: 12000 });
  expect(client.apiPut.mock.calls[0][2].daily_step_goal).toBe(12000);

  const { daily_step_goal, ...older } = stored;
  client.apiGet.mockResolvedValue(older);
  await updateUserProfile({ nickname: "X" });
  expect(client.apiPut.mock.calls[1][2]).toHaveProperty("daily_step_goal", null);
});

test("weekly snapshot: steps block passed through", async () => {
  client.apiGet.mockResolvedValue({
    steps: { avg: 6000, today: 8000, daily: [{ date: "2026-10-05", day_label: "M", steps: 8000 }, null, { date: "2026-10-04", day_label: "S", steps: null }] },
  });
  const s = await getWeeklySnapshot();
  expect(s.steps).toEqual({
    avg: 6000,
    today: 8000,
    daily: [{ date: "2026-10-05", day_label: "M", steps: 8000 }, { date: "2026-10-04", day_label: "S", steps: null }],
  });
});

test("weekly snapshot from a Lambda without steps → empty steps, not a crash", async () => {
  client.apiGet.mockResolvedValue({ sleep: { daily: [] } });
  const s = await getWeeklySnapshot();
  expect(s.steps).toEqual({ avg: null, today: null, daily: [] });
});
