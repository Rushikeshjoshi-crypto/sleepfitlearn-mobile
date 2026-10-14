// Mirrors src/lib/validation/study.ts + src/components/study/resolveSubjectId.ts
// in the web app. Sentinel SelectModal value for "write your own subject" —
// never a real subject id (those come from the backend's `subjects` table).
// The `subjects` table has no free-text column, so a custom subject's raw
// text becomes the subject_id itself.
export const CUSTOM_SUBJECT_VALUE = "__custom__";

// Turns the two subject form fields (picker value + optional free-text) into
// the single subject_id the API expects.
export function resolveSubjectId(subjectId: string | null, customSubject: string): string | null {
  if (subjectId !== CUSTOM_SUBJECT_VALUE) return subjectId;
  const trimmed = customSubject.trim();
  return trimmed.length > 0 ? trimmed : null;
}
