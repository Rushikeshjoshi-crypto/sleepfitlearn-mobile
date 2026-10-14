// Camera heart rate (finger on the camera + flash): from the per-frame
// average colour the native side sends, find the pulse. Tested with
// synthetic signals — a real PPG is a ~1–2% red-brightness ripple per beat.
import { analyzePpg, liveFeedback, WARMUP_MS } from "../src/lib/heartCamera/ppg";

// Deterministic pseudo-random noise.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;
}

// A finger-on-camera recording: bright red, a pulse ripple with a harmonic,
// slow drift, noise, ~30 fps with jittery timestamps.
function recording({ bpm, seconds = 35, noise = 0.6, fps = 30, seed = 1, finger = true, motionAt = null }) {
  const r = rng(seed);
  const out = [];
  let t = 0;
  while (t < seconds * 1000) {
    const s = t / 1000;
    const phase = 2 * Math.PI * (bpm / 60) * s;
    const pulse = 2.0 * Math.sin(phase) + 0.6 * Math.sin(2 * phase + 0.8);
    const drift = 3 * Math.sin(2 * Math.PI * 0.05 * s);
    let red = finger ? 200 + drift + pulse + noise * 4 * r() : 90 + 20 * r();
    if (motionAt && s > motionAt[0] && s < motionAt[1]) red += 40 * r();
    out.push({ t, r: red, g: finger ? 40 + r() : 85 + 20 * r(), b: finger ? 30 + r() : 80 + 20 * r() });
    t += 1000 / fps + 4 * r();
  }
  return out;
}

test.each([60, 75, 95, 120])("finds %i bpm within ±3, good quality", (bpm) => {
  const res = analyzePpg(recording({ bpm, seed: bpm }));
  expect(Math.abs(res.bpm - bpm)).toBeLessThanOrEqual(3);
  expect(res.quality).toBe("good");
});

test("a lower frame rate (15 fps) still works", () => {
  const res = analyzePpg(recording({ bpm: 80, fps: 15, seed: 7 }));
  expect(Math.abs(res.bpm - 80)).toBeLessThanOrEqual(3);
  expect(res.quality).not.toBe("poor");
});

test("pure noise (no pulse) is rejected as poor, no bpm", () => {
  const r = rng(3);
  const samples = [];
  for (let t = 0; t < 35000; t += 33) samples.push({ t, r: 200 + 6 * r(), g: 40, b: 30 });
  const res = analyzePpg(samples);
  expect(res.quality).toBe("poor");
  expect(res.bpm).toBeNull();
});

test("no finger on the camera → poor with reason noFinger", () => {
  const res = analyzePpg(recording({ bpm: 70, finger: false }));
  expect(res).toMatchObject({ quality: "poor", bpm: null, reason: "noFinger" });
});

test("too short a recording → poor with reason tooShort", () => {
  const res = analyzePpg(recording({ bpm: 70, seconds: 12 }));
  expect(res).toMatchObject({ quality: "poor", reason: "tooShort" });
});

test("heavy movement during the reading lowers the quality", () => {
  const still = analyzePpg(recording({ bpm: 70, seed: 11 }));
  const moved = analyzePpg(recording({ bpm: 70, seed: 11, motionAt: [10, 24] }));
  expect(still.quality).toBe("good");
  expect(moved.quality).not.toBe("good");
});

test("the first seconds (warm-up) are ignored", () => {
  expect(WARMUP_MS).toBe(5000);
  const samples = recording({ bpm: 72, seed: 5 }).map((s) => (s.t < WARMUP_MS ? { ...s, r: s.r + 60 * Math.sin(s.t) } : s));
  expect(Math.abs(analyzePpg(samples).bpm - 72)).toBeLessThanOrEqual(3);
});

describe("live feedback (last ~2 s)", () => {
  test("finger covering the camera, still → ok", () => {
    const s = recording({ bpm: 70, seconds: 8 });
    expect(liveFeedback(s.slice(-60))).toBe("ok");
  });
  test("no finger → noFinger", () => {
    expect(liveFeedback(recording({ bpm: 70, seconds: 3, finger: false }).slice(-60))).toBe("noFinger");
  });
  test("big jumps → moving", () => {
    const s = recording({ bpm: 70, seconds: 3, motionAt: [0, 3] });
    expect(liveFeedback(s.slice(-60))).toBe("moving");
  });
  test("nothing yet → waiting", () => {
    expect(liveFeedback([])).toBe("waiting");
  });
});
