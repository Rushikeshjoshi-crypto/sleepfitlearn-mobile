import { useMemo } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { useTheme } from "../../theme/ThemeContext";
import type { ColorPalette } from "../../theme/palettes";

// Shared sentinel deep-link scheme for the Stripe hosted-Checkout fallback
// (registered as StripeProvider's urlScheme too, and in AndroidManifest, for
// native 3D Secure redirects) — reused here purely to detect the WebView
// navigating to Checkout's success/cancel redirect, intercepted with
// onShouldStartLoadWithRequest before the WebView tries (and fails) to
// actually load a scheme with no http handler.
export const BILLING_SUCCESS_URL = "sleepfitlearn://billing-success";
export const BILLING_CANCEL_URL = "sleepfitlearn://billing-cancel";

export type CheckoutWebViewSource = { html: string } | { uri: string };

export type RazorpayWebViewMessage = { type: "success"; paymentId: string } | { type: "dismiss" };

export default function CheckoutWebViewModal({
  visible,
  source,
  onClose,
  onRazorpayMessage,
  onStripeRedirect,
}: {
  visible: boolean;
  source: CheckoutWebViewSource | null;
  onClose: () => void;
  // Only fires for the Razorpay embedded checkout.js flow (see
  // razorpayCheckoutHtml.ts) — irrelevant when source is a plain Stripe uri.
  onRazorpayMessage?: (message: RazorpayWebViewMessage) => void;
  // Only fires for the Stripe hosted-Checkout fallback flow.
  onStripeRedirect?: (result: "success" | "cancel") => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function handleShouldStartLoad(request: WebViewNavigation): boolean {
    if (request.url === BILLING_SUCCESS_URL || request.url.startsWith(`${BILLING_SUCCESS_URL}?`)) {
      onStripeRedirect?.("success");
      return false;
    }
    if (request.url === BILLING_CANCEL_URL || request.url.startsWith(`${BILLING_CANCEL_URL}?`)) {
      onStripeRedirect?.("cancel");
      return false;
    }
    return true;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        {source && (
          <WebView
            source={"html" in source ? { html: source.html } : { uri: source.uri }}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.navTint} />
              </View>
            )}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onMessage={(event) => {
              try {
                const message = JSON.parse(event.nativeEvent.data) as RazorpayWebViewMessage;
                onRazorpayMessage?.(message);
              } catch {
                // Not a message this modal understands — ignore.
              }
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "flex-end", padding: 12 },
    closeText: { fontSize: 20, color: colors.foreground, padding: 8 },
    webview: { flex: 1 },
    loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  });
}
