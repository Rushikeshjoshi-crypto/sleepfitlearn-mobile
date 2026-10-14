import { ApiError } from "../api/client";

// What ProfileGate does when the profile can't be loaded (age-gate codes are
// handled before this). Same split as the web app: a 4xx means the session or
// account is wrong and retrying won't help → sign out (back to login). A
// server error or a network failure is temporary; the mobile app has always
// let the user through then (offline use), with the backend's minorGate still
// guarding every data call — that stays.
export function profileGateOutcome(err: unknown): "pass" | "sign_out" {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return "sign_out";
  return "pass";
}
