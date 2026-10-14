#!/usr/bin/env node
/**
 * Cleans up duplicate screen_time ContextEvents caused by the sync-burst bug
 * in src/lib/screenTime/sync.ts (fixed — see ScreenTimeStore.takePending()):
 * a single tracked interval could get re-POSTed several times within a
 * fraction of a second (confirmed in production: 5 POSTs of the same
 * session 0.2s apart, each with a slightly different `minutes` value as more
 * usage was scanned in between reads).
 *
 * Because the duplicates in a burst don't always have byte-identical
 * `minutes` (unlike a simple retry-of-the-exact-same-payload), this groups
 * each day's events into "bursts" — runs of events close together in time
 * that cover the same set of apps — and keeps only the one with the largest
 * `minutes` value per burst (the most complete snapshot of that interval),
 * deleting the rest. A burst of size 1 is left untouched.
 *
 * Usage:
 *   SFL_EMAIL=you@example.com SFL_PASSWORD=... node scripts/fix-screen-time-duplicates.js
 *   SFL_EMAIL=... SFL_PASSWORD=... node scripts/fix-screen-time-duplicates.js --confirm
 *   SFL_EMAIL=... SFL_PASSWORD=... node scripts/fix-screen-time-duplicates.js --confirm --date=2026-09-07
 *   SFL_EMAIL=... SFL_PASSWORD=... node scripts/fix-screen-time-duplicates.js --gap-seconds=15
 *
 * Without --confirm (or --apply, kept as an alias) this only prints what it
 * would delete — a dry run. Nothing is deleted until you pass --confirm.
 */

const {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} = require("amazon-cognito-identity-js");

// Plain-JS mirror of src/config/env.ts (a .ts file can't be require()'d from
// a plain Node script without a loader) — keep in sync if those values change.
const ENV = {
  cognitoUserPoolId: "eu-north-1_FL7ZdX3Wc",
  cognitoClientId: "1ms2s9ba50qjv2tkjq79tpeo5d",
  apiContext: "https://x4s7vw2gh0.execute-api.eu-north-1.amazonaws.com/prod/context",
};

const DEFAULT_GAP_SECONDS = 10;

// amazon-cognito-identity-js needs a synchronous localStorage-like Storage;
// a plain in-memory Map is fine here since the script is one-shot.
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

function signIn(email, password) {
  const userPool = new CognitoUserPool({
    UserPoolId: ENV.cognitoUserPoolId,
    ClientId: ENV.cognitoClientId,
    Storage: new MemoryStorage(),
  });
  const user = new CognitoUser({ Username: email, Pool: userPool, Storage: new MemoryStorage() });
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session.getIdToken().getJwtToken()),
      onFailure: reject,
    });
  });
}

async function apiGet(token, path) {
  const res = await fetch(`${ENV.apiContext}${path}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(token, sk) {
  const res = await fetch(`${ENV.apiContext}/${encodeURIComponent(sk)}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`DELETE ${sk} -> ${res.status}: ${await res.text()}`);
}

function appSet(event) {
  return (event.metadata?.apps ?? [])
    .map((a) => a.package_name)
    .sort()
    .join(",");
}

// Runs of events that are both close in time AND cover the same set of apps
// get treated as one re-synced interval. Requiring the app-set match (not
// just the time gap) avoids merging two genuinely separate, legitimately
// close-together syncs that happen to involve different apps.
function clusterBursts(dayEvents, gapMs) {
  const sorted = [...dayEvents].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const bursts = [];
  let current = null;
  for (const event of sorted) {
    const prev = current ? current[current.length - 1] : null;
    const withinGap = prev && new Date(event.created_at).getTime() - new Date(prev.created_at).getTime() <= gapMs;
    const sameApps = prev && appSet(event) === appSet(prev);
    if (prev && withinGap && sameApps) {
      current.push(event);
    } else {
      current = [event];
      bursts.push(current);
    }
  }
  return bursts;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--confirm") || args.includes("--apply");
  const dateArg = args.find((a) => a.startsWith("--date="));
  const onlyDate = dateArg ? dateArg.slice("--date=".length) : null;
  const gapArg = args.find((a) => a.startsWith("--gap-seconds="));
  const gapMs = (gapArg ? Number(gapArg.slice("--gap-seconds=".length)) : DEFAULT_GAP_SECONDS) * 1000;

  const email = process.env.SFL_EMAIL;
  const password = process.env.SFL_PASSWORD;
  if (!email || !password) {
    console.error("Set SFL_EMAIL and SFL_PASSWORD env vars (same login as the app).");
    process.exit(1);
  }

  console.log("Signing in...");
  const token = await signIn(email, password);

  console.log("Fetching context events...");
  const events = await apiGet(token, "");
  let screenTime = events.filter((e) => e.event_type === "screen_time");
  if (onlyDate) screenTime = screenTime.filter((e) => e.event_date === onlyDate);

  const byDate = new Map();
  for (const event of screenTime) {
    if (!byDate.has(event.event_date)) byDate.set(event.event_date, []);
    byDate.get(event.event_date).push(event);
  }

  const toDelete = [];
  const dates = [...byDate.keys()].sort();
  for (const date of dates) {
    const dayEvents = byDate.get(date);
    const totalBefore = dayEvents.reduce((sum, e) => sum + (e.metadata?.minutes ?? 0), 0);

    const bursts = clusterBursts(dayEvents, gapMs);
    let deletedThisDay = 0;
    const kept = [];

    for (const burst of bursts) {
      if (burst.length === 1) {
        kept.push(burst[0]);
        continue;
      }
      const sortedByMinutes = [...burst].sort((a, b) => (b.metadata?.minutes ?? 0) - (a.metadata?.minutes ?? 0));
      const keep = sortedByMinutes[0];
      kept.push(keep);
      console.log(
        `  ${date}: burst of ${burst.length} within ${gapMs / 1000}s (apps: ${appSet(keep) || "none"}) — ` +
          `keeping ${keep.metadata?.minutes ?? 0}m (sk=${keep.sk}), removing ${burst
            .filter((e) => e.sk !== keep.sk)
            .map((e) => `${e.metadata?.minutes ?? 0}m`)
            .join(", ")}`,
      );
      for (const dup of burst) {
        if (dup.sk !== keep.sk) {
          toDelete.push(dup);
          deletedThisDay++;
        }
      }
    }

    const totalAfter = kept.reduce((sum, e) => sum + (e.metadata?.minutes ?? 0), 0);
    console.log(
      `${date}: ${dayEvents.length} entries, ${deletedThisDay} duplicate(s) to remove -> ` +
        `${totalBefore.toFixed(1)}m becomes ${totalAfter.toFixed(1)}m`,
    );
  }

  if (toDelete.length === 0) {
    console.log("\nNo duplicate bursts found.");
    return;
  }

  if (!apply) {
    console.log(`\nDry run — ${toDelete.length} duplicate event(s) would be deleted. Re-run with --confirm to delete them.`);
    return;
  }

  console.log(`\nDeleting ${toDelete.length} duplicate event(s)...`);
  for (const event of toDelete) {
    await apiDelete(token, event.sk);
    console.log(`  deleted ${event.sk} (${event.event_date}, ${event.metadata?.minutes ?? 0}m)`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
