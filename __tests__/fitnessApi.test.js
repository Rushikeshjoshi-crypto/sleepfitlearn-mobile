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

test("Personal: an unknown metric_type is skipped", async () => {
  get.mockImplementation(async (_domain, resource) =>
    resource === "health"
      ? [
          { sk: "1", measured_at: "2026-10-01", metric_type: "heart_rate", value: 60, unit: "bpm" },
          { sk: "2", measured_at: "2026-10-01", metric_type: "steps", value: 9000, unit: "count" },
        ]
      : [],
  );
  const entries = await listPersonalEntries({ from: "2026-10-01", to: "2026-10-02" });
  expect(entries.map((e) => e.kind)).toEqual(["heart_rate"]);
});
