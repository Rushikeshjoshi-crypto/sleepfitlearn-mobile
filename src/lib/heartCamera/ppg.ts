// Camera heart rate (photoplethysmography, PPG): with a fingertip over the
// back camera and the flash on, each heartbeat pushes a little more blood
// into the finger and the frame gets ~1–2% darker red. The native side
// (HeartRateCameraModule.kt) sends one average colour per frame; this finds
// the pulse in it. Wellness estimate only — never shown as medical.
//
//   1. drop the first 5 s (exposure / flash settling)
//   2. resample to an even 30 Hz (frame times jitter)
//   3. take out the slow drift (1 s moving average) and smooth (5 samples)
//   4. autocorrelation over 42–210 bpm → the beat period
//   5. cross-check with a simple peak count; score the quality

export type Frame = { t: number; r: number; g: number; b: number };
export type PpgQuality = "good" | "fair" | "poor";
export type PpgResult =
  | { bpm: number; quality: "good" | "fair"; confidence: number; reason?: undefined }
  | { bpm: null; quality: "poor"; confidence: number; reason: "tooShort" | "noFinger" | "noPulse" };

export const WARMUP_MS = 5000;
export const MIN_MEASURE_MS = 20000;
// One measurement: 5 s warm-up + 30 s that are analysed.
export const MEASURE_MS = WARMUP_MS + 30000;
const FS = 30;
const MIN_BPM = 42;
const MAX_BPM = 210;
const GOOD = 0.5;
const FAIR = 0.3;

// A fingertip lit by the flash: a bright frame that is strongly red.
export function fingerOn(f: Frame): boolean {
  return f.r > 120 && f.r > 2 * f.g && f.r > 2 * f.b;
}

function resample(frames: Frame[]): number[] {
  const out: number[] = [];
  const step = 1000 / FS;
  let j = 0;
  for (let t = frames[0].t; t <= frames[frames.length - 1].t; t += step) {
    while (j < frames.length - 2 && frames[j + 1].t < t) j++;
    const a = frames[j];
    const b = frames[j + 1] ?? a;
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    out.push(a.r + (b.r - a.r) * k);
  }
  return out;
}

function movingAverage(x: number[], win: number): number[] {
  const half = Math.floor(win / 2);
  const out = new Array<number>(x.length);
  let sum = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < x.length; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(x.length - 1, i + half);
    while (hi < to) sum += x[++hi];
    while (lo < from) sum -= x[lo++];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

function bandpass(x: number[]): number[] {
  const trend = movingAverage(x, FS + 1);
  return movingAverage(
    x.map((v, i) => v - trend[i]),
    5,
  );
}

// Normalised (biased) autocorrelation at `lag`.
function autocorr(x: number[], lag: number, energy: number): number {
  let s = 0;
  for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
  return energy > 0 ? s / energy : 0;
}

function bestPeriod(x: number[]): { lag: number; r: number } {
  const energy = x.reduce((a, v) => a + v * v, 0);
  const minLag = Math.floor((FS * 60) / MAX_BPM);
  const maxLag = Math.ceil((FS * 60) / MIN_BPM);
  const r: number[] = [];
  for (let lag = 0; lag <= maxLag + 1; lag++) r.push(autocorr(x, lag, energy));
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) if (r[lag] > r[best]) best = lag;
  // Sub-sample refinement (parabola through the peak and its neighbours).
  const a = r[best - 1] ?? r[best];
  const b = r[best];
  const c = r[best + 1] ?? r[best];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * denom))) : 0;
  return { lag: best + shift, r: b };
}

// Beats counted as local maxima at least ~60% of a period apart.
function peakCountBpm(x: number[], lag: number): number | null {
  const minGap = Math.max(1, Math.floor(lag * 0.6));
  const peaks: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > 0 && x[i] >= x[i - 1] && x[i] > x[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minGap) peaks.push(i);
      else if (x[i] > x[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
    }
  }
  if (peaks.length < 3) return null;
  const span = (peaks[peaks.length - 1] - peaks[0]) / FS;
  return ((peaks.length - 1) / span) * 60;
}

export function analyzePpg(frames: Frame[]): PpgResult {
  if (!frames.length) return { bpm: null, quality: "poor", confidence: 0, reason: "tooShort" };
  const start = frames[0].t + WARMUP_MS;
  const use = frames.filter((f) => f.t >= start);
  if (use.length < 2 || use[use.length - 1].t - use[0].t < MIN_MEASURE_MS) {
    return { bpm: null, quality: "poor", confidence: 0, reason: "tooShort" };
  }
  if (use.filter(fingerOn).length / use.length < 0.8) {
    return { bpm: null, quality: "poor", confidence: 0, reason: "noFinger" };
  }

  const x = bandpass(resample(use));
  const { lag, r } = bestPeriod(x);
  const confidence = Math.max(0, Math.min(1, r));
  if (r < FAIR) return { bpm: null, quality: "poor", confidence, reason: "noPulse" };

  const bpm = (60 * FS) / lag;
  let quality: "good" | "fair" = r >= GOOD ? "good" : "fair";
  const counted = peakCountBpm(x, lag);
  if (counted == null || Math.abs(counted - bpm) / bpm > 0.15) {
    // The two methods disagree: lower the grade (or reject a fair one).
    if (quality === "fair") return { bpm: null, quality: "poor", confidence, reason: "noPulse" };
    quality = "fair";
  }
  return { bpm: Math.round(bpm), quality, confidence };
}

// While measuring (the last ~2 s of frames): what to tell the user.
export type LiveFeedback = "waiting" | "noFinger" | "moving" | "ok";

export function liveFeedback(recent: Frame[]): LiveFeedback {
  if (recent.length < 10) return "waiting";
  if (recent.filter(fingerOn).length / recent.length < 0.7) return "noFinger";
  let maxJump = 0;
  for (let i = 1; i < recent.length; i++) maxJump = Math.max(maxJump, Math.abs(recent[i].r - recent[i - 1].r));
  return maxJump > 12 ? "moving" : "ok";
}
