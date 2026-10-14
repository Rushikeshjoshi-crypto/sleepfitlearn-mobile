// Fallback path when the native react-native-razorpay module isn't usable
// (see razorpayCheckout.ts) — embeds the exact same checkout.js flow the web
// app uses (src/components/billing/checkout-button.tsx) inside a WebView
// instead of a real browser tab. The `handler`/`ondismiss` callbacks bridge
// back to React Native via window.ReactNativeWebView.postMessage since a
// WebView has no other channel back to the host app.
export function buildRazorpayCheckoutHtml(opts: {
  keyId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
}): string {
  const options = {
    key: opts.keyId,
    subscription_id: opts.subscriptionId,
    name: "SleepFitLearn",
    description: `${opts.currency} ${opts.amount}/month subscription`,
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body { margin: 0; background: #fff; }</style>
</head>
<body>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var rzp = new Razorpay(Object.assign({}, ${JSON.stringify(options)}, {
      handler: function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "success", paymentId: response.razorpay_payment_id }));
      },
      modal: {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
        }
      }
    }));
    rzp.open();
  </script>
</body>
</html>`;
}
