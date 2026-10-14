#!/usr/bin/env node
/**
 * READ-ONLY diagnostic — lists every screen_time ContextEvent for one date,
 * with the exact fields needed to root-cause a mobile-vs-website mismatch:
 * minutes, whether metadata.apps is present (auto-tracked) or absent
 * (manual entry), created_at (when it was written), and whether its content
 * signature duplicates another entry that day. Deletes nothing.
 *
 * Usage:
 *   SFL_EMAIL=you@example.com SFL_PASSWORD=... node scripts/diagnose-screen-time.js
 *   SFL_EMAIL=... SFL_PASSWORD=... node scripts/diagnose-screen-time.js --date=2026-09-07
 */

const {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} = require("amazon-cognito-identity-js");

// Plain-JS mirror of src/config/env.ts.
const ENV = {
  cognitoUserPoolId: "eu-north-1_FL7ZdX3Wc",
  cognitoClientId: "1ms2s9ba50qjv2tkjq79tpeo5d",
  apiContext: "https://x4s7vw2gh0.execute-api.eu-north-1.amazonaws.com/prod/context",
};

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

function signature(event) {
  const minutes = Math.round((event.metadata?.minutes ?? 0) * 1000) / 1000;
  const apps = (event.metadata?.apps ?? [])
    .map((a) => `${a.package_name}:${Math.round((a.minutes_used ?? 0) * 1000) / 1000}`)
    .sort();
  return `${minutes}|${apps.join(",")}`;
}

function localTodayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const dateArg = args.find((a) => a.startsWith("--date="));
  const date = dateArg ? dateArg.slice("--date=".length) : localTodayISO();

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
  const dayEvents = events
    .filter((e) => e.event_type === "screen_time" && e.event_date === date)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  console.log(`\nDate: ${date}  (your local "today" if --date wasn't passed)`);
  console.log(`Entries found: ${dayEvents.length}\n`);

  const bySignature = new Map();
  let total = 0;

  dayEvents.forEach((e, i) => {
    const minutes = e.metadata?.minutes ?? 0;
    const hasApps = Array.isArray(e.metadata?.apps) && e.metadata.apps.length > 0;
    const sig = signature(e);
    bySignature.set(sig, (bySignature.get(sig) ?? 0) + 1);
    total += minutes;

    console.log(`[${i + 1}] sk=${e.sk}`);
    console.log(`    minutes: ${minutes}`);
    console.log(`    source: ${hasApps ? "auto-tracked (has apps[])" : "manual (no apps[])"}`);
    console.log(`    created_at: ${e.created_at}`);
    if (hasApps) {
      const topApps = [...e.metadata.apps]
        .sort((a, b) => (b.minutes_used ?? 0) - (a.minutes_used ?? 0))
        .slice(0, 3)
        .map((a) => `${a.app_name}: ${a.minutes_used?.toFixed(1)}m`);
      console.log(`    top apps: ${topApps.join(", ")}`);
    }
    console.log("");
  });

  console.log(`Sum of all entries' minutes: ${total.toFixed(1)}m (${(total / 60).toFixed(2)}h)`);

  const dupSignatures = [...bySignature.entries()].filter(([, count]) => count > 1);
  if (dupSignatures.length > 0) {
    console.log(`\nEXACT-DUPLICATE content signatures found (same minutes + same apps breakdown):`);
    dupSignatures.forEach(([sig, count]) => console.log(`  x${count}: ${sig}`));
  } else {
    console.log(`\nNo exact-duplicate entries (by minutes+apps content) — if the total is still` +
      ` inflated, it's not simple re-POSTed duplicates; check timestamps above for overlapping` +
      ` time windows or entries with no apps[] (manual/stale data) instead.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
