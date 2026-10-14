// ChildDetail: a summary metric with a null metric_type must not crash the
// screen; ProfileGate's "existing" birth-year prompt shows the specific
// "invalid year" message for a 400 birth_year_invalid (same as web).
jest.mock("../src/lib/api/client", () => {
  class ApiError extends Error {
    constructor(status, message, code = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { ApiError };
});

import { ApiError } from "../src/lib/api/client";
import { metricTypeLabel } from "../src/lib/family/childDetail";
import { birthYearSaveErrorKey } from "../src/lib/family/birthYearSaveError";

test("metric_type label: underscores to spaces; null/undefined → empty", () => {
  expect(metricTypeLabel("heart_rate")).toBe("heart rate");
  expect(metricTypeLabel(null)).toBe("");
  expect(metricTypeLabel(undefined)).toBe("");
});

test("birth-year save: birth_year_invalid gets its own message, anything else the generic one", () => {
  expect(birthYearSaveErrorKey(new ApiError(400, "bad", "birth_year_invalid"))).toBe("Age.birthYearInvalid");
  expect(birthYearSaveErrorKey(new ApiError(500, "boom"))).toBe("BirthYearGate.saveError");
  expect(birthYearSaveErrorKey(new Error("offline"))).toBe("BirthYearGate.saveError");
});
