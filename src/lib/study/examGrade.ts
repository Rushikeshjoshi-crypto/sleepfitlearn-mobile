export type ExamGrade = "red" | "yellow" | "green";

// Single source of truth for the red/yellow/green grading — mirrors web's
// src/components/study/examGrade.ts (StudyScreen.tsx's scoreColor already
// used these same 80/50 thresholds; this is the shared guidance data half).
export function getExamGrade(percentage: number): ExamGrade {
  if (percentage >= 80) return "green";
  if (percentage >= 50) return "yellow";
  return "red";
}

// Translation-key configuration, not copy — each grade maps to a title key
// and a fixed list of tip keys under Study.examGuidance.* (ported from web's
// EXAM_GUIDANCE_TITLE_KEY / EXAM_GUIDANCE_TIP_KEYS). Red has 5 tips,
// yellow/green have 4 — same as web.
export const EXAM_GUIDANCE_TITLE_KEY: Record<ExamGrade, string> = {
  red: "examGuidance.red.title",
  yellow: "examGuidance.yellow.title",
  green: "examGuidance.green.title",
};

export const EXAM_GUIDANCE_TIP_KEYS: Record<ExamGrade, string[]> = {
  red: [
    "examGuidance.red.tip1",
    "examGuidance.red.tip2",
    "examGuidance.red.tip3",
    "examGuidance.red.tip4",
    "examGuidance.red.tip5",
  ],
  yellow: [
    "examGuidance.yellow.tip1",
    "examGuidance.yellow.tip2",
    "examGuidance.yellow.tip3",
    "examGuidance.yellow.tip4",
  ],
  green: [
    "examGuidance.green.tip1",
    "examGuidance.green.tip2",
    "examGuidance.green.tip3",
    "examGuidance.green.tip4",
  ],
};
