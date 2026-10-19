// R2: weight is range-checked like the web (20–400 kg) and never half-saved;
// Personal skips metric types the app doesn't know.
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
import { createWeightEntry, isWeightInRange, listPersonalEntries } from "../src/lib/api/fitness";

const post = client.apiPost;
const del = client.apiDelete;
const get = client.apiGet;
const put = client.apiPut;

beforeEach(() => jest.clearAllMocks());

test("weight range matches the web form (20–400 kg)", () => {
  for (const ok of [20, 70.5, 400]) expect(isWeightInRange(ok)).toBe(true);
  for (const bad of [-5, 0, 19.9, 400.1, 1001, NaN]) expect(isWeightInRange(bad)).toBe(false);
});

test("if /weights fails, /health is never written", async () => {
  post.mockRejectedValueOnce(new Error("400"));
  await expect(createWeightEntry("2026-10-01", 70)).rejects.toThrow("400");
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1]).toBe("weights");
});

test("if /health fails after /weights saved, the /weights row is rolled back", async () => {
  post.mockResolvedValueOnce({ sk: "2026-10-01#w1" }).mockRejectedValueOnce(new Error("500"));
  del.mockResolvedValue(undefined);
  await expect(createWeightEntry("2026-10-01", 70)).rejects.toThrow("500");
  expect(del).toHaveBeenCalledWith("fitness", `weights/${encodeURIComponent("2026-10-01#w1")}`);
});

test("both succeed → /weights then /health", async () => {
  post.mockResolvedValueOnce({ sk: "w" }).mockResolvedValueOnce({ sk: "h" });
  await createWeightEntry("2026-10-01", 70);
  expect(post.mock.calls.map((c) => c[1])).toEqual(["weights", "health"]);
  expect(del).not.toHaveBeenCalled();
});

// Steps are a supported type now, but they're shown on Home (from the
// dashboard snapshot / listDailySteps), not as a Personal vitals entry — so
// a steps row is still left out of the Personal list, like any type the
// Personal screen has no tile for.
test("Personal: steps rows and unknown metric_types are not Personal entries", async () => {
  get.mockImplementation(async (_domain, resource) =>
    resource === "health"
      ? [
          { sk: "1", measured_at: "2026-10-01", metric_type: "heart_rate", value: 60, unit: "bpm" },
          { sk: "2026-10-01#steps", measured_at: "2026-10-01", metric_type: "steps", value: 9000, unit: "count", meta: { source: "health_connect" } },
          { sk: "3", measured_at: "2026-10-01", metric_type: "something_new", value: 1, unit: "x" },
        ]
      : [],
  );
  const entries = await listPersonalEntries({ from: "2026-10-01", to: "2026-10-02" });
  expect(entries.map((e) => e.kind)).toEqual(["heart_rate"]);
});

describe("daily steps API", () => {
  const { upsertDailySteps, listDailySteps, deleteDailySteps } = require("../src/lib/api/fitness");

  test("upsert is a PUT to steps/{date} with value + meta (no user id sent)", async () => {
    put.mockResolvedValue({ sk: "2026-10-01#steps" });
    await upsertDailySteps("2026-10-01", 9000, { source: "health_connect", origins: ["com.x"] });
    expect(put).toHaveBeenCalledWith("fitness", "steps/2026-10-01", { value: 9000, meta: { source: "health_connect", origins: ["com.x"] } });
    expect(JSON.stringify(put.mock.calls[0][2])).not.toMatch(/user_id/);
  });

  test("list and delete use the steps resource", async () => {
    get.mockResolvedValue([]);
    del.mockResolvedValue(undefined);
    await listDailySteps({ from: "2026-10-01", to: "2026-10-07" });
    expect(get).toHaveBeenCalledWith("fitness", "steps", { from: "2026-10-01", to: "2026-10-07" });
    await deleteDailySteps("2026-10-01");
    expect(del).toHaveBeenCalledWith("fitness", "steps/2026-10-01");
  });
});
