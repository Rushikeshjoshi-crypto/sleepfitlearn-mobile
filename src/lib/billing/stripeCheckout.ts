import type { InitPaymentSheetResult, PresentPaymentSheetResult } from "@stripe/stripe-react-native";

export type StripeIntent = {
  clientSecret: string;
  customerId: string;
  ephemeralKey: string;
};

export type StripePayResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  // The backend's /create endpoint (checkoutUrl, same as the web app) is the
  // fallback here, not a WebView-embedded Stripe.js like Razorpay's — a
  // Checkout Session is a self-contained hosted page, nothing to embed.
  | { ok: false; cancelled: false; needsFallback: true };

// Native PaymentSheet only, no HTML-embedding fallback path — unlike
// Razorpay's checkout.js, Stripe's PaymentSheet has no equivalent
// browser-script form to embed in a WebView. A real init/present failure
// (not a user cancel) falls back to the hosted Checkout Session flow
// instead (see BillingScreen — it re-calls createCheckout and opens
// checkoutUrl in a WebView, exactly like the Stripe branch below Razorpay's).
export async function payWithStripe(
  intent: StripeIntent,
  hooks: {
    initPaymentSheet: (params: {
      merchantDisplayName: string;
      customerId: string;
      customerEphemeralKeySecret: string;
      paymentIntentClientSecret: string;
    }) => Promise<InitPaymentSheetResult>;
    presentPaymentSheet: () => Promise<PresentPaymentSheetResult>;
  },
): Promise<StripePayResult> {
  const initResult = await hooks.initPaymentSheet({
    merchantDisplayName: "SleepFitLearn",
    customerId: intent.customerId,
    customerEphemeralKeySecret: intent.ephemeralKey,
    paymentIntentClientSecret: intent.clientSecret,
  });
  if (initResult.error) return { ok: false, cancelled: false, needsFallback: true };

  const presentResult = await hooks.presentPaymentSheet();
  if (presentResult.error) {
    if (presentResult.error.code === "Canceled") return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, needsFallback: true };
  }

  return { ok: true };
}
