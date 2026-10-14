import { apiGet, apiPost, apiPut, apiDelete } from "./client";

export type StudySession = {
  id: string;
  sk: string;
  session_date: string;
  subject_id: string | null;
  duration_minutes: number | null;
  session_type: string | null;
  notes: string | null;
};

export type StudySessionInput = {
  session_date: string;
  subject_id?: string | null;
  duration_minutes?: number | null;
  session_type?: string | null;
  notes?: string | null;
};

// session_date stays fixed once an entry exists (matches the web app's edit form).
export type StudySessionUpdate = {
  subject_id?: string | null;
  duration_minutes?: number | null;
  session_type?: string | null;
  notes?: string | null;
};

export type StudySubject = {
  id: string;
  name_i18n: { en: string; [locale: string]: string | undefined };
  module_area: string;
};

export function listStudySessions(range?: { from: string; to: string }): Promise<StudySession[]> {
  return apiGet<StudySession[]>("study", "sessions", range);
}

export function createStudySession(input: StudySessionInput): Promise<StudySession> {
  return apiPost<StudySession>("study", "sessions", input);
}

// `sk` contains a "#" and must be encoded before it reaches the URL.
export function updateStudySession(sk: string, input: StudySessionUpdate): Promise<StudySession> {
  return apiPut<StudySession>("study", `sessions/${encodeURIComponent(sk)}`, input);
}

export function deleteStudySession(sk: string): Promise<void> {
  return apiDelete("study", `sessions/${encodeURIComponent(sk)}`);
}

// Global lookup, not user-created — fetch once, doesn't change per-session.
export function listStudySubjects(): Promise<StudySubject[]> {
  return apiGet<StudySubject[]>("study", "subjects");
}
