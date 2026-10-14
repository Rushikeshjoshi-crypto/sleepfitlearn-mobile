import type { PersonalEntry } from "../api/fitness";
import type { AgeBand } from "../api/users";
import { energyLabel, type EnergyLabel } from "../energy/calculate";
import {
  bloodPressureBand,
  bloodPressureNeedsDoctor,
  heartRateNeedsDoctor,
  restingHeartRateBand,
  type RangeBand,
} from "./ranges";
import { sourceLabel } from "./sourceLabel";

// What the Personal screen's Heart rate / Blood pressure tiles show for their
// latest entry. `source` is the app name(s) for a Health Connect reading,
// null for a manual one. Same colour rules as everywhere (lib/vitals/ranges).
export type VitalsTile = {
  value: string;
  resting: number | null;
  band: RangeBand;
  source: string | null;
  doctor: boolean;
};

type ValueEntry = Exclude<PersonalEntry, { kind: "bp" }>;
type BpEntry = Extract<PersonalEntry, { kind: "bp" }>;

const apps = (origins: string[]) => origins.map(sourceLabel).join(", ");

export function heartRateTile(e: ValueEntry): VitalsTile {
  const v = e.vitals;
  if (!v) return { value: String(e.value), resting: null, band: "neutral", source: null, doctor: false };
  return {
    value: String(v.avg ?? v.resting ?? e.value),
    resting: v.resting,
    band: restingHeartRateBand(v.resting),
    source: apps(v.origins),
    doctor: heartRateNeedsDoctor(v.resting),
  };
}

export function bloodPressureTile(e: BpEntry, ageBand: AgeBand | null): VitalsTile {
  const origins = e.vitals?.origins ?? [];
  return {
    value: `${e.systolic} / ${e.diastolic}`,
    resting: null,
    band: bloodPressureBand(e.systolic, e.diastolic, { origins, ageBand }),
    source: e.vitals ? apps(origins) : null,
    doctor: bloodPressureNeedsDoctor(e.systolic, e.diastolic),
  };
}

// The Energy tile's bar (same as the web's EnergyLevelCard): width = the
// 0–100 score, colour from the shared energyLabel (lib/energy/calculate).
export function energyBar(score: number): { percent: number; label: EnergyLabel } {
  const percent = Math.max(0, Math.min(100, Math.round(score)));
  return { percent, label: energyLabel(percent) };
}
