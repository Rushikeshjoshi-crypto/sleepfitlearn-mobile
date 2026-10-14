// Byte-identical in the mobile app and the web app (src/lib/settings/lockedFields.ts).
// Profile fields the server says this account can't see or change right now
// (sleepfitlearn-users `restricted_fields`: height, target weight and sex for
// 13–17 while minor_data_enabled is off). Settings shows them locked; saving
// sends them back as shown and the server keeps the stored values.
export type LockableProfileField = "height_cm" | "target_weight_kg" | "sex";

const LOCKABLE: LockableProfileField[] = ["height_cm", "target_weight_kg", "sex"];

export function lockedProfileFields(
  profile: { restricted_fields?: string[] | null } | null | undefined,
): Set<LockableProfileField> {
  const listed = profile?.restricted_fields ?? [];
  return new Set(LOCKABLE.filter((f) => listed.includes(f)));
}
