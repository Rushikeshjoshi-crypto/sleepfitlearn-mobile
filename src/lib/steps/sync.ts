import { deleteDailySteps, listDailySteps, upsertDailySteps, type StepsMeta } from "../api/fitness";
import { MinorDataDisabledError, MinorGateUnavailableError, ProfileRequiredError } from "../api/client";
import { getCurrentUserId } from "../aws/cognito";
import { readDailySteps } from "../native/healthConnect";
import { getStepsLastSync, setStepsLastSync } from "./preference";
import { stepsSyncDates } from "./window";

// The account isn't allowed to store data right now (minor gate, no
// profile): every other day would be refused the same way.
const isAccountBlock = (err: unknown) =>
  err instanceof MinorDataDisabledError || err instanceof MinorGateUnavailableError || err instanceof ProfileRequiredError;

const deviceTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

// Daily step totals from Health Connect → one row per day on the server
// (PUT fitness/steps/{date} is an upsert, so re-sending a day — today as it
// grows, yesterday when a watch uploads late — overwrites, never adds; a day
// the user typed in by hand is kept by the server). Run from
// syncHealthConnect() only when Steps is granted, so it shares that sync's
// gate (lib/syncGate.ts) and single in-flight run. The window only moves on
// when every day saved; anything that failed is read again next time.
export async function syncSteps(now: Date = new Date()): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { fromDate, toDate } = stepsSyncDates(await getStepsLastSync(userId), now);
  const days = await readDailySteps(fromDate, toDate, now);
  const tz = deviceTimeZone();

  let failed = false;
  for (const day of days) {
    const meta: StepsMeta = { source: "health_connect", origins: day.origins, ...(tz && { tz }), synced_at: now.toISOString() };
    try {
      await upsertDailySteps(day.date, day.steps, meta);
    } catch (err) {
      failed = true;
      if (isAccountBlock(err)) break;
      console.warn(`Steps sync: couldn't save ${day.date}`, err);
    }
  }

  if (!failed) await setStepsLastSync(userId, now.toISOString());
}

// "Delete my synced steps": removes the days this sync wrote from OUR server
// only (Health Connect keeps its own copy). Manual days stay. Resets the
// window so a later re-connect reads the last 30 days again. Returns how many
// days were removed.
export async function deleteSyncedSteps(userId: string): Promise<number> {
  await setStepsLastSync(userId, null);
  const rows = (await listDailySteps()).filter((r) => r.meta?.source === "health_connect");
  for (const row of rows) await deleteDailySteps(row.measured_at);
  return rows.length;
}
