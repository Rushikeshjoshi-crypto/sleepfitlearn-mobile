// No official/community type declarations exist for this package — its own
// source (RazorpayCheckout.js) is plain JS. Typed here only to the surface
// this app actually calls (see src/lib/billing/razorpayCheckout.ts).
declare module "react-native-razorpay" {
  export type RazorpayCheckoutOptions = {
    key: string;
    subscription_id?: string;
    order_id?: string;
    amount?: string | number;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: { email?: string; contact?: string; name?: string };
    theme?: { color?: string };
  };

  export type RazorpaySuccessResponse = {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  };

  export type RazorpayErrorResponse = {
    code: number;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
  };

  export default class RazorpayCheckout {
    static open(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResponse>;
    static onExternalWalletSelection(callback: (data: unknown) => void): void;
  }
}
