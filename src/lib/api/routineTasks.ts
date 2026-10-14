import { apiGet, apiPost, apiPut, apiDelete } from "./client";

// Mirrors the web app's src/lib/api/context.ts routine-task functions —
// the routine checklist itself, distinct from the adherence-% ContextEvent
// that HabitComposer logs against context_events.

export type RoutineTask = {
  id: string;
  sk: string;
  text: string;
  sort_order: number;
};

export type RoutineTaskInput = {
  text: string;
  sort_order?: number;
};

export type RoutineTaskUpdate = {
  text?: string;
  sort_order?: number;
};

export function listRoutineTasks(): Promise<RoutineTask[]> {
  return apiGet<RoutineTask[]>("context", "routine-tasks");
}

export function createRoutineTask(input: RoutineTaskInput): Promise<RoutineTask> {
  return apiPost<RoutineTask>("context", "routine-tasks", input);
}

// Addressed by `id` (plain UUID) — no URL-encoding gotcha like ContextEvent's
// date-prefixed `sk`.
export function updateRoutineTask(id: string, input: RoutineTaskUpdate): Promise<RoutineTask> {
  return apiPut<RoutineTask>("context", `routine-tasks/${encodeURIComponent(id)}`, input);
}

export function deleteRoutineTask(id: string): Promise<void> {
  return apiDelete("context", `routine-tasks/${encodeURIComponent(id)}`);
}
