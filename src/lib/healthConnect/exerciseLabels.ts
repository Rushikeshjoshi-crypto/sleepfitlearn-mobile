import { ExerciseType } from "react-native-health-connect";

// Derived once from the library's own ExerciseType constants (single source
// of truth for the numeric codes — never hand-copied) so a code like
// `ExerciseType.RUNNING` (56) resolves to a human label ("Running") that can
// be matched against this app's activity_types.name_i18n.en at sync time.
function titleCase(constantName: string): string {
  return constantName
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const EXERCISE_TYPE_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(ExerciseType).map(([name, code]) => [code, titleCase(name)]),
);

export function labelForExerciseType(code: number): string {
  return EXERCISE_TYPE_LABELS[code] ?? "Health Connect";
}
