// Parent Controls form defaults for the daily screen-time REMINDER (it's a
// once-a-day reminder on the child's Android phone — nothing is locked or
// blocked; see the mobile app's lib/family/screenTimeLimit.ts). Byte-identical
// in the web and mobile apps (src/lib/family/controlsDefaults.ts in both).

// A link that never stored the flag starts with reminders on — the backend
// creates every link with limit_warning_notifications: true.
export function warningsInitial(stored: boolean | null | undefined): boolean {
  return stored ?? true;
}

// Setting a limit (empty → a number) turns its reminder on, unless the
// parent already flipped the switch themselves; any other edit keeps it.
export function warningsAfterLimitChange(prevLimit: string, nextLimit: string, warnings: boolean, touched: boolean): boolean {
  if (!touched && prevLimit.trim() === "" && nextLimit.trim() !== "") return true;
  return warnings;
}
