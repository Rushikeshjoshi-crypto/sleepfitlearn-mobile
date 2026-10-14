import RazorpayCheckout, { type RazorpayErrorResponse } from "react-native-razorpay";
import { buildRazorpayCheckoutHtml } from "./razorpayCheckoutHtml";

export type RazorpayCheckoutOpts = {
  keyId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
};

export type RazorpayPayResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; fallbackHtml: string };

// react-native-razorpay's native module isn't confirmed compatible with this
// app's New Architecture setup (open GitHub issue, unresolved as of writing —
// see the SOW audit this decision came out of). RazorpayCheckout.open()
// rejects if the native module failed to load rather than hanging, so a
// plain try/catch is enough to detect that and fall back to the same
// checkout.js flow the web app uses, just inside a WebView (see
// razorpayCheckoutHtml.ts) instead of a real browser tab.
export async function payWithRazorpay(opts: RazorpayCheckoutOpts): Promise<RazorpayPayResult> {
  try {
    await RazorpayCheckout.open({
      key: opts.keyId,
      subscription_id: opts.subscriptionId,
      name: "SleepFitLearn",
      description: `${opts.currency} ${opts.amount}/month subscription`,
    });
    return { ok: true };
  } catch (err) {
    // Razorpay's native SDK reports a real user-initiated cancel as error
    // code 2 (Payment Cancelled) — that's not a reason to fall back to the
    // WebView flow, the user just backed out.
    const code = (err as RazorpayErrorResponse | undefined)?.code;
    if (code === 2) return { ok: false, cancelled: true };

    return { ok: false, cancelled: false, fallbackHtml: buildRazorpayCheckoutHtml(opts) };
  }
}
