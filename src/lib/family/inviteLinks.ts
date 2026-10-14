import { Linking } from "react-native";
import { createNavigationContainerRef } from "@react-navigation/native";
import { savePendingInviteCode, takePendingInviteCode } from "./pending";

// Family invite deep links: sleepfitlearn://family/accept?code=XXXX-XXXX
// (the Android intent-filter for the "sleepfitlearn" scheme already exists
// for Stripe's return URL), plus the web invite URL (…/family/accept?code=…)
// if it's ever opened by the app.
//
// Links are captured at the app root whether or not anyone is signed in, and
// parked in storage; PendingInviteNavigator (rendered only once signed in)
// then opens AcceptInvite with the code. Every other URL — e.g. Stripe's
// sleepfitlearn://billing-success — is ignored here.

export const navigationRef = createNavigationContainerRef();

type Listener = () => void;
const listeners = new Set<Listener>();

export function parseInviteCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^(?:sleepfitlearn:\/\/|https?:\/\/[^/]+\/(?:[a-z]{2}\/)?)family\/accept\?(.*)$/i.exec(url);
  if (!match) return null;
  const code = /(?:^|&)code=([^&#]+)/.exec(match[1])?.[1];
  return code ? decodeURIComponent(code) : null;
}

async function capture(url: string | null | undefined) {
  const code = parseInviteCode(url);
  if (!code) return;
  await savePendingInviteCode(code);
  listeners.forEach((l) => l());
}

// Call once at app start; returns the unsubscribe.
export function startInviteLinkCapture(): () => void {
  Linking.getInitialURL().then(capture).catch(() => {});
  const sub = Linking.addEventListener("url", ({ url }) => {
    capture(url);
  });
  return () => sub.remove();
}

export function onInviteCaptured(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export { takePendingInviteCode };
