// Why this account can't accept a family invite (null = it can: 13–17 with
// parent control enabled). The under-13 case used to fall through to a form
// that did nothing. Byte-identical in the web and mobile apps
// (src/lib/family/inviteBlockReason.ts in both).
export type InviteBlockReason = "unavailable" | "adult" | "need_birth_year" | "under_13";

export function inviteBlockReason(status: { enabled: boolean; age_band: string | null }): InviteBlockReason | null {
  if (!status.enabled) return "unavailable";
  if (status.age_band === "18_plus") return "adult";
  if (status.age_band == null) return "need_birth_year";
  if (status.age_band === "under_13") return "under_13";
  return null;
}
