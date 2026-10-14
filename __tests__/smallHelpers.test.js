// Billing price, profile-gate outcome, 404 detection, single-flight submit.
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

import fs from "fs";
import path from "path";
import { ApiError } from "../src/lib/api/client";
import { formatPrice } from "../src/lib/billing/formatPrice";
import { profileGateOutcome } from "../src/lib/family/profileGateOutcome";
import { isNotFoundError } from "../src/lib/ui/apiErrors";
import { createSingleFlight } from "../src/lib/singleFlight";

test("billing: real decimals, whole amounts clean, missing currency doesn't throw", () => {
  expect(formatPrice(4.99, "USD", "en-US")).toBe("$4.99");
  expect(formatPrice(3.99, "GBP", "en-GB")).toBe("£3.99");
  expect(formatPrice(399, "INR", "en-IN")).toBe("₹399");
  expect(formatPrice(4.99, undefined, "en-US")).toBe("4.99");
  expect(formatPrice(4.99, "NOPE1", "en-US")).toBe("4.99");
});

test("profile gate: only an auth/client error signs out; server/network errors let the app through (offline-friendly)", () => {
  for (const s of [400, 401, 403, 404, 409]) expect(profileGateOutcome(new ApiError(s, "x"))).toBe("sign_out");
  for (const s of [500, 502, 503]) expect(profileGateOutcome(new ApiError(s, "x"))).toBe("pass");
  expect(profileGateOutcome(new TypeError("Network request failed"))).toBe("pass");
  expect(profileGateOutcome(new Error("weird"))).toBe("pass");
});

test("404 detection for the friendly 'entry no longer exists' message", () => {
  expect(isNotFoundError(new ApiError(404, "Not found"))).toBe(true);
  expect(isNotFoundError(new ApiError(400, "x"))).toBe(false);
  expect(isNotFoundError(new Error("Not found"))).toBe(false);
});

test("single flight: a second tap while saving is ignored; later taps work", async () => {
  const guard = createSingleFlight();
  let calls = 0;
  let release = () => {};
  const save = guard(() => {
    calls++;
    return new Promise((r) => (release = r));
  });
  const first = save();
  const second = save();
  expect(calls).toBe(1);
  release();
  await Promise.all([first, second]);
  const third = save();
  expect(calls).toBe(2);
  release();
  await third;
});

test("wiring: composers, Personal, exam save and the habit edit use the lock and the 404 helper", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", "src", p), "utf8");
  for (const f of ["components/composers/ExerciseComposer.tsx", "components/composers/HabitComposer.tsx", "components/composers/StudyComposer.tsx", "components/composers/SleepComposer.tsx", "screens/PersonalScreen.tsx", "screens/StudyScreen.tsx"]) {
    expect([f, read(f).includes("useSingleFlight(")]).toEqual([f, true]);
  }
  for (const f of ["components/composers/ExerciseComposer.tsx", "components/composers/SleepComposer.tsx", "components/composers/StudyComposer.tsx", "screens/PersonalScreen.tsx", "screens/StudyScreen.tsx", "components/habits/HabitEventEditModal.tsx"]) {
    expect([f, read(f).includes("showSaveError(")]).toEqual([f, true]);
  }
  // No spinner under an error: a failed summary shows its own error + retry
  // (per-tab errors; the tabs and Unlink stay visible).
  expect(read("screens/ChildDetailScreen.tsx")).toMatch(/summaryError \? \(\s*retryBlock\(summaryError/);
  expect(read("components/family/ProfileGate.tsx")).toContain("profileGateOutcome(");
  expect(read("screens/BillingScreen.tsx")).toContain('from "../lib/billing/formatPrice"');
});
