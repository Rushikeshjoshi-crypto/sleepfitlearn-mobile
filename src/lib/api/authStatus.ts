import { apiGet } from "./client";

// Mirrors src/lib/api/authStatus.ts in the web app. Backed by
// sleepfitlearn-auth-status (AdminGetUser under the hood). Needed because the
// Cognito app client has PreventUserExistenceErrors ENABLED, which masks
// account existence/confirmation state on every unauthenticated Cognito API —
// there's no way to read real UserStatus from the client, so this goes
// through a backend endpoint with admin credentials instead. Called
// pre-login, so this is unauthenticated by design.
export function getConfirmationStatus(email: string): Promise<{ confirmed: boolean }> {
  return apiGet<{ confirmed: boolean }>("authStatus", "status", { email });
}
