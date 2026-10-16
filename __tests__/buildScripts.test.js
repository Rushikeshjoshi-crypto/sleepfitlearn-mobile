// APK size: the tester APK is built for arm64-v8a only (every modern phone;
// the 4-ABI APK was ~98 MB), and the Play Store gets an AAB (Play serves each
// phone only its own ABI).
const pkg = require("../package.json");

test("build:apk makes a release APK for arm64-v8a only", () => {
  expect(pkg.scripts["build:apk"]).toBe("cd android && gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a");
});

test("build:aab makes the Play Store bundle (all ABIs, split by Play)", () => {
  expect(pkg.scripts["build:aab"]).toBe("cd android && gradlew bundleRelease");
});
