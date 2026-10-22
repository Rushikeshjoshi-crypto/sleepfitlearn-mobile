// Same as the web app's src/lib/settings/lockedStepGoal.ts. lockedFields.ts
// stays byte-identical with the web, so the step goal's lock lives here. The
// server lists daily_step_goal in `restricted_fields` for 13–17 while
// minor_data_enabled is off (sleepfitlearn-users MINOR_RESTRICTED_FIELDS):
// the goal can't be edited and the users PUT leaves it out so the stored
// goal is kept.
export function lockedStepGoal(
  profile: { restricted_fields?: string[] | null } | null | undefined,
): boolean {
  return (profile?.restricted_fields ?? []).includes("daily_step_goal");
}
