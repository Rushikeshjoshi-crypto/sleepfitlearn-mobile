import { apiGet, apiPost } from "./client";

// Mirrors the web app's src/lib/api/payments.ts.

export type PricingPlan = {
  gateway: "razorpay" | "stripe";
  currency: string;
  amount: number;
  interval: string;
  // True when the backend had no usable country_code to resolve a region
  // from and fell back to the US region — see resolveRegionCode in
  // sleepfitlearn-payments/index.js. Prompt the user to set it in Settings.
  countryMissing: boolean;
};

export type CheckoutResult =
  | { status: "trial_active"; trialEndsAt: string; message: string; countryMissing: boolean }
  // Returned instead of starting a second checkout when the caller already
  // has an active subscription — see createCheckout's guard in
  // sleepfitlearn-payments/index.js.
  | { status: "already_subscribed"; plan: string | null; message: string; countryMissing: boolean }
  | { gateway: "razorpay"; subscriptionId: string; amount: number; currency: string; keyId: string; countryMissing: boolean }
  | { gateway: "stripe"; checkoutUrl: string; countryMissing: boolean };

// Mobile-only counterpart to CheckoutResult's stripe branch — the backend's
// /payments/mobile-intent route (Stripe PaymentSheet only; Razorpay reuses
// createCheckout above as-is). Same trial_active/already_subscribed shapes
// can come back here too, since it shares createCheckout's guards.
export type MobileStripeIntentResult =
  | { status: "trial_active"; trialEndsAt: string; message: string; countryMissing: boolean }
  | { status: "already_subscribed"; plan: string | null; message: string; countryMissing: boolean }
  | {
      gateway: "stripe";
      clientSecret: string;
      ephemeralKey: string;
      customerId: string;
      publishableKey: string;
      countryMissing: boolean;
    };

export function getPricing(): Promise<PricingPlan> {
  return apiGet<PricingPlan>("payments", "pricing");
}

// successUrl/cancelUrl are only used for the Stripe path (Checkout Sessions
// require them); harmless to send unconditionally since a Razorpay response
// never references them. Mobile has no browser to redirect back to, so it
// only ever calls this for the Razorpay branch — Stripe checkout on mobile
// goes through createMobileStripeIntent below instead.
export function createCheckout(input: { successUrl: string; cancelUrl: string }): Promise<CheckoutResult> {
  return apiPost<CheckoutResult>("payments", "create", input);
}

export function createMobileStripeIntent(): Promise<MobileStripeIntentResult> {
  return apiPost<MobileStripeIntentResult>("payments", "mobile-intent", {});
}
