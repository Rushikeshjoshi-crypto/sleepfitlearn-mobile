// Who sees heart rate / BP synced from Health Connect.
// User (own data): 18+ / no birth year → yes; 13–17 → only with
// minor_data_enabled; under-13 or status unknown → no (fail closed).
// Parent: BP as systolic/diastolic + time + source, HR as avg + resting,
// no colour / grading; the "personal" share text says HR/BP are included.
jest.mock("../src/lib/api/family", () => ({ getFamilyStatus: jest.fn(), isFamilyApiConfigured: () => true }));

import { getFamilyStatus } from "../src/lib/api/family";
import { checkVitalsAccess } from "../src/lib/vitals/eligibility";
import { hideSyncedVitals } from "../src/lib/vitals/display";
import { parentVitalsDisplay } from "../src/lib/family/parentVitals";

const status = (age_band, enabled) => ({ age_band, enabled, can_invite: false, can_be_linked: false, consent_text_version: "v" });

describe("user's own HR/BP", () => {
  test.each([
    ["18+", status("18_plus", false), true],
    ["no birth year (test account)", status(null, false), true],
    ["13–17, flag ON", status("13_17", true), true],
    ["13–17, flag OFF", status("13_17", false), false],
    ["under-13", status("under_13", true), false],
  ])("%s", async (_name, s, allowed) => {
    getFamilyStatus.mockResolvedValueOnce(s);
    expect((await checkVitalsAccess()).allowed).toBe(allowed);
  });

  test("status error → hidden (fail closed)", async () => {
    getFamilyStatus.mockRejectedValueOnce(new Error("503"));
    expect((await checkVitalsAccess()).allowed).toBe(false);
  });

  test("when not allowed, synced HR/BP rows are taken out; manual entries stay", () => {
    const entries = [
      { kind: "heart_rate", date: "d", value: 80, source: "health", sk: "h1", vitals: { source: "health_connect" } },
      { kind: "heart_rate", date: "d", value: 72, source: "health", sk: "m1" },
      { kind: "bp", date: "d", systolic: 128, diastolic: 82, sysSk: "b1", diaSk: "b1", vitals: { source: "health_connect" } },
      { kind: "weight", date: "d", value: 70, source: "health", sk: "w" },
    ];
    expect(hideSyncedVitals(entries).map((e) => e.sk ?? e.sysSk)).toEqual(["m1", "w"]);
  });
});

describe("parent view", () => {
  const t = (key, v = {}) => `${key}${Object.keys(v).length ? JSON.stringify(v) : ""}`;
  const time = (iso) => `T(${iso})`;

  test("BP: systolic/diastolic, time and source app — no colour or label", () => {
    const out = parentVitalsDisplay(
      { metric_type: "blood_pressure", value: 128, unit: "mmHg", vitals: { source: "health_connect", systolic: 128, diastolic: 82, time: "2026-10-11T07:00:00Z", origins: ["com.omronhealthcare.omronconnect"] } },
      t,
      time,
    );
    expect(out.value).toBe("128/82 mmHg");
    expect(out.detail).toBe('T(2026-10-11T07:00:00Z) · fromHealthConnect{"app":"OMRON connect"}');
    expect(JSON.stringify(out)).not.toMatch(/band|good|watch|high|normal/i);
  });

  test("HR: average and resting only", () => {
    const out = parentVitalsDisplay(
      { metric_type: "heart_rate", value: 80, unit: "bpm", vitals: { source: "health_connect", avg: 80, resting: 58, origins: ["com.sec.android.app.shealth"] } },
      t,
      time,
    );
    expect(out.value).toBe('parentAvg{"avg":80} · resting{"value":58} bpm');
    expect(out.detail).toBe('fromHealthConnect{"app":"Samsung Health"}');
  });

  test("manual / other readings: just the number, as before", () => {
    expect(parentVitalsDisplay({ metric_type: "weight", value: 50, unit: "kg" }, t, time)).toEqual({ value: "50 kg", detail: null });
  });

  test("'personal' share text mentions heart rate and blood pressure, and the parent strings exist, in all 7 languages", () => {
    const before = {
      en: "Latest readings like weight or heart rate.",
      hi: "वज़न या हार्ट रेट जैसी नवीनतम रीडिंग्स।",
      bn: "ওজন বা হার্ট রেটের মতো সাম্প্রতিক রিডিং।",
      de: "Neueste Werte wie Gewicht oder Herzfrequenz.",
      es: "Últimas mediciones, como el peso o el ritmo cardíaco.",
      fr: "Dernières mesures comme le poids ou la fréquence cardiaque.",
      it: "Ultime rilevazioni come peso o battito cardiaco.",
    };
    for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
      const m = require(`../src/i18n/locales/${lang}.json`);
      expect([lang, m.Family.Scopes.personal.description]).not.toEqual([lang, before[lang]]);
      expect([lang, typeof m.Vitals.parentAvg]).toEqual([lang, "string"]);
      expect([lang, typeof m.Vitals.disclaimer]).toEqual([lang, "string"]);
    }
    expect(require("../src/i18n/locales/en.json").Family.Scopes.personal.description).toMatch(/heart rate.*blood pressure/i);
    expect(require("../src/i18n/locales/hi.json").Family.Scopes.personal.description).toMatch(/ब्लड प्रेशर/);
  });
});
