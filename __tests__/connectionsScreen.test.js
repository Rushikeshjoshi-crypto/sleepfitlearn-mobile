// Habits page no longer holds the connection switches. One "Connections &
// permissions" row opens a separate Connections screen with screen time
// tracking, the watch card and Health Connect (+ heart rate / BP), each with
// its own permission flow.
import fs from "fs";
import path from "path";

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("Habits: no Health Connect tab, no connection switches; a row opens Connections", () => {
  const src = read("src/screens/HabitsScreen.tsx");
  expect(src).not.toMatch(/value: "healthConnect"/);
  expect(src).not.toMatch(/<WatchConnectCard/);
  expect(src).not.toMatch(/<VitalsSection/);
  expect(src).not.toMatch(/<Switch/);
  expect(src).toMatch(/navigate\("Connections"\)/);
});

test("Connections screen has screen time, watch and Health Connect with their permission flows", () => {
  const src = read("src/screens/ConnectionsScreen.tsx");
  for (const re of [/<WatchConnectCard/, /<VitalsSection/, /startTracking\(\)/, /openUsageAccessSettings\(\)/, /requestHealthConnectPermissions\(await checkStepsAllowed\(\)\)/, /requestIgnoreBatteryOptimizations\(\)/]) {
    expect(src).toMatch(re);
  }
});

test("Connections is a registered screen", () => {
  const nav = read("src/navigation/AppNavigator.tsx");
  expect(nav).toMatch(/Connections: undefined/);
  expect(nav).toMatch(/name="Connections" component=\{ConnectionsScreen\}/);
});

test("connections strings exist in all 7 languages", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const h = require(`../src/i18n/locales/${lang}.json`).Habits;
    for (const k of ["connectionsTitle", "connectionsSubtitle", "statusOn", "statusOff", "turnOnInConnections"]) {
      expect([lang, k, typeof h?.[k]]).toEqual([lang, k, "string"]);
    }
  }
});

test("the hamburger menu has Connections (mobile only — web has no such page)", () => {
  const menu = read("src/components/HamburgerMenu.tsx");
  expect(menu).toMatch(/const ITEM_ROUTES[^;]*"Personal", "Connections", "Billing"\]/);
  expect(menu).toMatch(/Connections: "🔗"/);
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    expect([lang, typeof require(`../src/i18n/locales/${lang}.json`).Nav.connections]).toEqual([lang, "string"]);
  }
});
