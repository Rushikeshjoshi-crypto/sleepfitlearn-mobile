// Watch / band / BP-monitor companion apps the "Connect your watch" checkup
// looks for on the phone (they're also listed under <queries> in
// AndroidManifest.xml — Android only reports packages an app declares).
//
// healthConnect: "yes" = the app is known to write to Health Connect;
// "unknown" = not confirmed (the checkup then says it may not share).
// Package names and support: check karna padega when adding a brand — a
// wrong package simply never matches. Data from ANY app that writes to
// Health Connect is used, listed here or not.
export type KnownWatchApp = { pkg: string; name: string; healthConnect: "yes" | "unknown" };

export const KNOWN_WATCH_APPS: KnownWatchApp[] = [
  { pkg: "com.sec.android.app.shealth", name: "Samsung Health", healthConnect: "yes" },
  { pkg: "com.fitbit.FitbitMobile", name: "Fitbit", healthConnect: "yes" },
  { pkg: "com.google.android.apps.fitness", name: "Google Fit", healthConnect: "yes" },
  { pkg: "com.withings.wiscale2", name: "Withings", healthConnect: "yes" },
  { pkg: "com.ouraring.oura", name: "Oura", healthConnect: "yes" },
  { pkg: "com.garmin.android.apps.connectmobile", name: "Garmin Connect", healthConnect: "unknown" },
  { pkg: "com.huami.watch.hmwatchmanager", name: "Zepp (Amazfit)", healthConnect: "unknown" },
  { pkg: "com.xiaomi.wearable", name: "Mi Fitness", healthConnect: "unknown" },
  { pkg: "com.huawei.health", name: "Huawei Health", healthConnect: "unknown" },
  { pkg: "fi.polar.polarflow", name: "Polar Flow", healthConnect: "unknown" },
  { pkg: "com.omronhealthcare.omronconnect", name: "OMRON connect", healthConnect: "unknown" },
  { pkg: "com.crrepa.band.dafit", name: "Da Fit", healthConnect: "unknown" },
  { pkg: "com.noisefit", name: "NoiseFit", healthConnect: "unknown" },
];

export const KNOWN_WATCH_PACKAGES = KNOWN_WATCH_APPS.map((a) => a.pkg);

export function watchAppName(pkg: string): string {
  return KNOWN_WATCH_APPS.find((a) => a.pkg === pkg)?.name ?? pkg;
}

export function watchAppSharesKnown(pkg: string): boolean {
  return KNOWN_WATCH_APPS.find((a) => a.pkg === pkg)?.healthConnect === "yes";
}
