// Shared y-axis maths for the SVG trend charts. Mirrors recharts' defaults on
// the web app's Trends page: a numeric Y axis starts at 0 and rounds its top
// up to a "nice" tick, so mobile and web charts read the same way.

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const f = rough / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

export function yScale(maxValue: number, tickCount = 4): { max: number; ticks: number[] } {
  const step = niceStep((maxValue > 0 ? maxValue : 1) / tickCount);
  const max = Math.ceil((maxValue > 0 ? maxValue : 1) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max, ticks };
}

export function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

// Picks up to `count` evenly spaced indexes to label on the x axis
// (web's minTickGap equivalent for a small screen).
export function xLabelIndexes(length: number, count: number): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(Math.round((i * (length - 1)) / (count - 1)));
  return [...out];
}

export const CHART_HEIGHT = 200;
export const PAD = { top: 20, right: 8, bottom: 22, left: 36 };
