// Opens AcceptInvite for a stored invite code once navigation is ready. On a
// cold start the container may not be ready yet, so this keeps checking
// (every `delayMs`, up to `maxAttempts`) instead of trying once and giving
// up — and only takes the stored code when it can navigate right away, so a
// code is never taken and then dropped. Dependencies are injected for tests.
export async function openPendingInviteWhenReady({
  isReady,
  take,
  navigate,
  schedule = (fn: () => void | Promise<void>, ms: number) => {
    setTimeout(fn, ms);
  },
  isCancelled = () => false,
  maxAttempts = 20,
  delayMs = 300,
}: {
  isReady: () => boolean;
  take: () => Promise<string | null>;
  navigate: (code: string) => void;
  schedule?: (fn: () => void | Promise<void>, ms: number) => void;
  isCancelled?: () => boolean;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) return;
    if (isReady()) {
      const code = await take();
      if (code && !isCancelled()) navigate(code);
      return;
    }
    await new Promise<void>((resolve) => schedule(resolve, delayMs));
  }
}
