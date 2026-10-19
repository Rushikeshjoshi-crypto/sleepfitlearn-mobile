// The background screen-time sync is a HeadlessJsTaskService, which takes a
// wake lock while it runs. Without WAKE_LOCK the whole app process crashed
// ("Neither user ... nor current process has android.permission.WAKE_LOCK").
const fs = require("fs");
const path = require("path");

const manifest = fs.readFileSync(path.join(__dirname, "../android/app/src/main/AndroidManifest.xml"), "utf8");

test("manifest declares WAKE_LOCK (needed by the headless screen-time sync)", () => {
  expect(manifest).toMatch(/<uses-permission android:name="android\.permission\.WAKE_LOCK"\s*\/>/);
});

// Steps: read-only daily totals from Health Connect. No background-read or
// history permission, and no raw sensor (ACTIVITY_RECOGNITION) — Health
// Connect does the counting.
test("manifest declares health.READ_STEPS, and no background/history/sensor permission", () => {
  expect(manifest).toMatch(/<uses-permission android:name="android\.permission\.health\.READ_STEPS"\s*\/>/);
  expect(manifest).not.toMatch(/WRITE_STEPS|READ_HEALTH_DATA_IN_BACKGROUND|READ_HEALTH_DATA_HISTORY|ACTIVITY_RECOGNITION/);
});

test("the Health Connect rationale text lists steps (English and Hindi)", () => {
  const en = fs.readFileSync(path.join(__dirname, "../android/app/src/main/res/values/strings.xml"), "utf8");
  const hi = fs.readFileSync(path.join(__dirname, "../android/app/src/main/res/values-hi/strings.xml"), "utf8");
  expect(en).toMatch(/• Steps —/);
  expect(hi).toMatch(/स्टेप्स/);
});

// ScreenTimeService starts the headless sync every 20 min whatever the app's
// state; with allowedInForeground=false React Native threw "Tried to start
// task ScreenTimeSync while in foreground" and the app crashed while open.
// Running it in foreground is safe: runScreenTimeSync has one in-flight sync
// and takePending is atomic, so nothing is posted twice.
test("the headless screen-time sync is allowed to run while the app is open", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../android/app/src/main/java/com/com.sleepfitlearn.mobile/screentime/ScreenTimeSyncTaskService.kt"),
    "utf8",
  );
  expect(src).toMatch(/TASK_TIMEOUT_MS,(\s*\/\/[^\n]*)*\s*true,/);
});
