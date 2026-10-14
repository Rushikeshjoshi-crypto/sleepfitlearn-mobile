// Byte-identical in the mobile app and the web app (src/lib/vitals/sourceLabel.ts).
// Health Connect only tells us the package name of the app that wrote a
// record. Known ones get their app name; anything else is shown as the
// package itself (never guessed). Package names: check karna padega for any
// brand added here — a wrong one just falls back to the package name.
const APP_NAMES: Record<string, string> = {
  "com.sec.android.app.shealth": "Samsung Health",
  "com.google.android.apps.fitness": "Google Fit",
  "com.google.android.apps.healthdata": "Health Connect",
  "com.fitbit.FitbitMobile": "Fitbit",
  "com.garmin.android.apps.connectmobile": "Garmin Connect",
  "com.withings.wiscale2": "Withings",
  "com.omronhealthcare.omronconnect": "OMRON connect",
};

export const MANUAL_SOURCE = "manual";

export function sourceLabel(origin: string): string {
  return APP_NAMES[origin] ?? origin;
}

// BP is only colour-coded when it came from one of these: apps of cuff
// makers, or a watch whose BP has to be calibrated against a cuff. Any other
// app's BP (e.g. an uncalibrated watch estimate) is shown neutral.
const KNOWN_BP_SOURCES = new Set([
  "com.omronhealthcare.omronconnect",
  "com.withings.wiscale2",
  "com.sec.android.app.shealth",
  "com.garmin.android.apps.connectmobile",
]);

export function isKnownBloodPressureSource(origin: string): boolean {
  return KNOWN_BP_SOURCES.has(origin);
}
