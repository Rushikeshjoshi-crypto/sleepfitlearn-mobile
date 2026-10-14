// Byte-identical in the mobile app and the web app (src/lib/family/parentVitals.ts).
// One "personal" reading in the parent's child summary, as text. Heart rate /
// blood pressure the child synced from Health Connect come with `vitals`
// (backend parentVitals): BP as systolic/diastolic + time + source app, HR as
// the day's average + resting. Deliberately no colour, range or
// normal/high label for the parent — just numbers, time and source.
import { sourceLabel } from "../vitals/sourceLabel";

export type ParentVitals = {
  source: "health_connect";
  systolic?: number | null;
  diastolic?: number | null;
  time?: string | null;
  avg?: number | null;
  resting?: number | null;
  origins: string[];
};

export type ParentReading = { metric_type: string; value: number; unit: string | null; vitals?: ParentVitals };

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function parentVitalsDisplay(
  m: ParentReading,
  t: Translate,
  formatTime: (iso: string) => string,
): { value: string; detail: string | null } {
  const v = m.vitals;
  if (!v) return { value: `${m.value} ${m.unit ?? ""}`.trim(), detail: null };
  const source = t("fromHealthConnect", { app: v.origins.map(sourceLabel).join(", ") });
  if (m.metric_type === "blood_pressure") {
    return {
      value: `${v.systolic ?? "—"}/${v.diastolic ?? "—"} mmHg`,
      detail: [v.time ? formatTime(v.time) : null, source].filter(Boolean).join(" · "),
    };
  }
  const parts = [];
  if (v.avg != null) parts.push(t("parentAvg", { avg: v.avg }));
  if (v.resting != null) parts.push(t("resting", { value: v.resting }));
  return { value: `${parts.join(" · ") || m.value} bpm`, detail: source };
}
