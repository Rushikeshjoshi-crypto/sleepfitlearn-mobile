import { apiGet, apiPost, apiPut, apiDelete } from "./client";

export type ExamLog = {
  id: string;
  sk: string;
  exam_date: string;
  subject_id: string;
  marks_obtained: number;
  marks_total: number;
  suggestions: string | null;
};

export type ExamLogInput = {
  exam_date: string;
  subject_id: string;
  marks_obtained: number;
  marks_total: number;
  suggestions?: string | null;
};

export type ExamLogUpdate = {
  subject_id?: string;
  marks_obtained?: number;
  marks_total?: number;
  suggestions?: string | null;
};

export function listExamLogs(range?: { from: string; to: string }): Promise<ExamLog[]> {
  return apiGet<ExamLog[]>("study", "exams", range);
}

export function createExamLog(input: ExamLogInput): Promise<ExamLog> {
  return apiPost<ExamLog>("study", "exams", input);
}

// `sk` contains a "#" and must be encoded before it reaches the URL — same
// gotcha as updateStudySession/deleteStudySession in study.ts.
export function updateExamLog(sk: string, input: ExamLogUpdate): Promise<ExamLog> {
  return apiPut<ExamLog>("study", `exams/${encodeURIComponent(sk)}`, input);
}

export function deleteExamLog(sk: string): Promise<void> {
  return apiDelete("study", `exams/${encodeURIComponent(sk)}`);
}
