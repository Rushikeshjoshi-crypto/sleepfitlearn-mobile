import { useEffect } from "react";
import { navigationRef, onInviteCaptured, takePendingInviteCode } from "../../lib/family/inviteLinks";
import { openPendingInviteWhenReady } from "../../lib/family/openPendingInvite";

// Rendered only inside the signed-in AppNavigator: opens AcceptInvite for an
// invite link captured at the app root (possibly before login). Renders nothing.
export function PendingInviteNavigator() {
  useEffect(() => {
    let cancelled = false;

    // Keeps checking until the container is ready on a cold start (it used to
    // try once after 300 ms and leave the code stored) — lib/family/openPendingInvite.
    const openPending = () =>
      openPendingInviteWhenReady({
        isReady: () => navigationRef.isReady(),
        take: takePendingInviteCode,
        // Typed loosely: navigationRef is created outside the typed navigator.
        navigate: (code) => (navigationRef.navigate as (name: string, params: object) => void)("AcceptInvite", { code }),
        isCancelled: () => cancelled,
      }).catch(() => {});

    openPending();
    const unsubscribe = onInviteCaptured(openPending);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return null;
}
