// Byte-identical in the mobile app and the web app (src/lib/vitals/ranges.ts).
import type { AgeBand } from "../api/users";
import { isKnownBloodPressureSource } from "./sourceLabel";

// A light colour hint next to a reading — general reference ranges, never a
// diagnosis (the UI says so). "neutral" = no colour.
export type RangeBand = "good" | "watch" | "high" | "neutral";

// Heart rate is coloured on RESTING HR only; the day's min / avg / max move
// with activity and stay neutral.
export function restingHeartRateBand(bpm: number | null): RangeBand {
  if (bpm == null) return "neutral";
  if (bpm >= 60 && bpm <= 100) return "good";
  if ((bpm >= 50 && bpm < 60) || (bpm > 100 && bpm <= 120)) return "watch";
  return "high";
}

// Blood pressure is coloured only when every app that wrote the reading is a
// known BP source (a cuff maker, or a cuff-calibrated watch), and never for
// 13–17s (adult ranges). Manual entries carry no app, so they stay neutral.
export function bloodPressureBand(
  systolic: number,
  diastolic: number,
  context: { origins: string[]; ageBand: AgeBand | null },
): RangeBand {
  if (context.ageBand === "13_17" || context.ageBand === "under_13") return "neutral";
  if (context.origins.length === 0 || !context.origins.every(isKnownBloodPressureSource)) return "neutral";
  if (systolic < 120 && diastolic < 80) return "good";
  if (systolic < 140 && diastolic < 90) return "watch";
  return "high";
}

// "Please see a doctor" — only at the extremes.
export function heartRateNeedsDoctor(restingBpm: number | null): boolean {
  return restingBpm != null && (restingBpm < 40 || restingBpm > 120);
}

export function bloodPressureNeedsDoctor(systolic: number, diastolic: number): boolean {
  return systolic >= 180 || diastolic >= 120;
}
