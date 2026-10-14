// Exercise history names and group keys: never a raw UUID or a blank title.
import { activityGroupKey, activityLabel, resolveActivityName } from "../src/lib/exercise/activityNames";

const labels = { unnamed: "Unnamed activity", deleted: "Deleted activity", unknown: "Unknown activity" };
const lookups = {
  activityTypes: [{ id: "run", category: "cardio", name_i18n: { en: "Running" } }],
  customActivities: [
    { id: "c-yoga", slot: 1, name: "Yoga" },
    { id: "c-blank", slot: 2, name: "" },
    { id: "c-null", slot: 3, name: null },
  ],
  language: "en",
  listsReady: true,
};
const entry = (activity_type_id, custom_activity_name = null) =>
  ({ activity_type_id, custom_activity_name });

test("group keys are prefixed and never empty", () => {
  expect(activityGroupKey(entry("run"))).toBe("id:run");
  expect(activityGroupKey(entry(null, " Swim "))).toBe("name:Swim");
  expect(activityGroupKey(entry(null, ""))).toBe("__unknown__");
  expect(activityGroupKey(entry(null, null))).toBe("__unknown__");
});

test("resolveActivityName: real name or null (|| so blanks fall through)", () => {
  expect(resolveActivityName("run", null, lookups)).toBe("Running");
  expect(resolveActivityName("c-yoga", null, lookups)).toBe("Yoga");
  expect(resolveActivityName("c-blank", "Legacy", lookups)).toBe("Legacy");
  expect(resolveActivityName("c-null", null, lookups)).toBeNull();
  expect(resolveActivityName("gone", "  ", lookups)).toBeNull();
});

test("activityLabel: Unnamed / Deleted / Unknown — never a UUID or blank", () => {
  expect(activityLabel("c-blank", null, lookups, labels)).toBe("Unnamed activity");
  expect(activityLabel("c-null", null, lookups, labels)).toBe("Unnamed activity");
  expect(activityLabel("6f1c-uuid-gone", null, lookups, labels)).toBe("Deleted activity");
  expect(activityLabel(null, "", lookups, labels)).toBe("Unknown activity");
  // custom-activities failed or still loading → can't say "Deleted"
  expect(activityLabel("6f1c-uuid-gone", null, { ...lookups, listsReady: false }, labels)).toBe("Unknown activity");
});
