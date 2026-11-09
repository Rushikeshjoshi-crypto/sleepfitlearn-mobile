import { ApiError } from "../api/client";

// Why a request failed, for an error alert: the server's own message when it
// sent one, otherwise a "couldn't reach the server" line (an offline device
// surfaces as a plain network error, never an HTTP status).
export function errorReason(err: unknown, networkReason: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  return networkReason;
}
