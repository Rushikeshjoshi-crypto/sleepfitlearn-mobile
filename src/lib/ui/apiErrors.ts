import { Alert } from "react-native";
import { ApiError } from "../api/client";

// The backend answers 404 "Not found" when an edit targets an entry that no
// longer exists (deleted on another device, or removed by a cleanup).
export function isNotFoundError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

// Save-failure alert. A 404 gets a friendly message and `onGone` (refresh the
// list / close the editor) instead of the raw "Not found"; anything else keeps
// the screen's own title plus the error text, as before.
export function showSaveError(t: (key: string) => string, title: string, err: unknown, onGone?: () => void): void {
  if (isNotFoundError(err)) {
    Alert.alert(t("Common:entryGoneTitle"), t("Common:entryGoneBody"));
    onGone?.();
    return;
  }
  Alert.alert(title, err instanceof Error ? err.message : undefined);
}
