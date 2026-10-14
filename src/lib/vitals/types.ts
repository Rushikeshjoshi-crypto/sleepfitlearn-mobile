// Byte-identical in the mobile app and the web app (src/lib/vitals/types.ts).
// Heart rate + blood pressure read from a phone health store. Health Connect
// (Android) is the only source today; HealthKit (iOS) is meant to plug in
// later as another VitalsSource without touching the sync or the UI.

export type VitalType = "HeartRate" | "RestingHeartRate" | "BloodPressure";

// `origin`: the app that wrote the record (Health Connect's dataOrigin
// package name, e.g. "com.sec.android.app.shealth").
export type HeartRateSample = { time: string; bpm: number; origin: string };

export type BloodPressureReading = {
  id: string;
  time: string;
  systolic: number;
  diastolic: number;
  // The store's own enum values (Health Connect BloodPressureRecord), or null.
  bodyPosition: number | null;
  measurementLocation: number | null;
  origin: string;
};

export interface VitalsSource {
  isAvailable(): Promise<boolean>;
  grantedTypes(): Promise<Set<VitalType>>;
  requestPermissions(): Promise<Set<VitalType>>;
  readHeartRate(from: string, to: string): Promise<HeartRateSample[]>;
  readRestingHeartRate(from: string, to: string): Promise<HeartRateSample[]>;
  readBloodPressure(from: string, to: string): Promise<BloodPressureReading[]>;
  // Where the user can revoke the store's permissions.
  openSettings(): void;
}

// What a synced row carries in health_metrics.meta. `source` tells it apart
// from a manual entry (manual rows have no meta).
export type HeartRateDailyMeta = {
  source: "health_connect";
  min: number | null;
  max: number | null;
  avg: number | null;
  resting: number | null;
  samples: number;
  origins: string[];
};

export type BloodPressureMeta = {
  source: "health_connect";
  systolic: number;
  diastolic: number;
  time: string;
  body_position: number | null;
  measurement_location: number | null;
  origins: string[];
  hc_ids: string[];
};
