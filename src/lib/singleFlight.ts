import { useRef } from "react";

// Wraps a submit handler so a second call is ignored while the first is still
// running. A `submitting` state + disabled button isn't enough on its own: a
// fast double tap lands before React re-renders. The flag here flips
// synchronously, so the second tap sees it. Same idea as the web app's
// useSingleFlight.
export function createSingleFlight() {
  let busy = false;
  return function guard<A extends unknown[]>(fn: (...args: A) => unknown) {
    return async (...args: A): Promise<void> => {
      if (busy) return;
      busy = true;
      try {
        await fn(...args);
      } finally {
        busy = false;
      }
    };
  };
}

// One guard per component instance.
export function useSingleFlight() {
  const ref = useRef<ReturnType<typeof createSingleFlight> | null>(null);
  if (!ref.current) ref.current = createSingleFlight();
  return ref.current;
}
