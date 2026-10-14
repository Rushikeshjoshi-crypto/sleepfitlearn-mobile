// Whether the main menu (web nav / mobile hamburger) shows a "Family" entry
// to the parent dashboard — only for an account that can invite (18+, with
// parent control enabled). It used to be reachable only via Settings.
// Byte-identical in the web and mobile apps (src/lib/family/parentNav.ts).
export function showParentDashboardEntry(status: { enabled: boolean; can_invite: boolean } | null | undefined): boolean {
  return Boolean(status?.enabled && status.can_invite);
}
