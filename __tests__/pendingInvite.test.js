// A family invite link opened on a cold start: keep checking until the
// navigation container is ready (it used to try once after 300 ms and give
// up), and only take the stored code when it can actually navigate.
import { openPendingInviteWhenReady } from "../src/lib/family/openPendingInvite";

function harness({ readyAfter, code = "ABCD-1234" }) {
  let checks = 0;
  const taken = [];
  const navigated = [];
  const deps = {
    isReady: () => ++checks > readyAfter,
    take: async () => {
      taken.push(code);
      return code;
    },
    navigate: (c) => navigated.push(c),
    schedule: (fn) => setImmediate(fn),
  };
  return { deps, taken, navigated, checks: () => checks };
}

test("not ready at first → keeps retrying, then opens the invite once", async () => {
  const h = harness({ readyAfter: 5 });
  await openPendingInviteWhenReady(h.deps);
  expect(h.navigated).toEqual(["ABCD-1234"]);
  expect(h.taken).toHaveLength(1);
});

test("never ready → gives up without taking (so the code isn't lost)", async () => {
  const h = harness({ readyAfter: Infinity });
  await openPendingInviteWhenReady({ ...h.deps, maxAttempts: 4 });
  expect(h.taken).toHaveLength(0);
  expect(h.navigated).toHaveLength(0);
});

test("cancelled before ready → nothing taken", async () => {
  const h = harness({ readyAfter: 2 });
  let cancelled = false;
  const done = openPendingInviteWhenReady({ ...h.deps, isCancelled: () => cancelled });
  cancelled = true;
  await done;
  expect(h.taken).toHaveLength(0);
});
