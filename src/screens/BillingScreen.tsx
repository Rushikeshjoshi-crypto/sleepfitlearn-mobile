import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { initStripe, useStripe } from "@stripe/stripe-react-native";
import { getPricing, createCheckout, createMobileStripeIntent, type PricingPlan } from "../lib/api/payments";
import { getUserProfile, type UserProfile } from "../lib/api/users";
import { payWithRazorpay } from "../lib/billing/razorpayCheckout";
import { payWithStripe } from "../lib/billing/stripeCheckout";
import CheckoutWebViewModal, {
  BILLING_CANCEL_URL,
  BILLING_SUCCESS_URL,
  type CheckoutWebViewSource,
  type RazorpayWebViewMessage,
} from "../components/billing/CheckoutWebViewModal";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useTheme } from "../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../theme/palettes";
import { AppHeader } from "../components/AppHeader";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { loadErrorText } from "../lib/api/gateErrors";
// $4.99 / £3.99 with real decimals (was rounded to "$5" / "£4").
import { COUNTRY_CODES } from "../lib/data/countryCodes";
import { formatPrice } from "../lib/billing/formatPrice";

// Custom scheme registered in AndroidManifest and passed to Stripe's
// initStripe below — the native PaymentSheet needs it for 3D Secure/bank
// redirects, and the WebView Checkout fallback reuses it as its own
// success/cancel sentinel (see CheckoutWebViewModal).
const STRIPE_URL_SCHEME = "sleepfitlearn";

type StatusTone = "primary" | "accent" | "muted" | "destructive";

function statusPill(
  subscriptionStatus: string | null,
  trialEndsAt: string | null,
  t: (key: string, values?: Record<string, string>) => string,
): { label: string; tone: StatusTone } {
  if (subscriptionStatus === "active") return { label: t("Billing:active"), tone: "primary" };
  if (subscriptionStatus === "cancelled") return { label: t("Billing:cancelled"), tone: "destructive" };
  if (subscriptionStatus === "past_due") return { label: t("Billing:paymentDue"), tone: "destructive" };

  if (subscriptionStatus === "trialing" && trialEndsAt) {
    const date = new Date(trialEndsAt);
    const isActive = date.getTime() > Date.now();
    const label = isActive
      ? t("Billing:trialEnds", { date: date.toLocaleDateString() })
      : t("Billing:trialEnded");
    return { label, tone: isActive ? "accent" : "muted" };
  }

  return { label: t("Billing:notSubscribed"), tone: "muted" };
}


export default function BillingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Billing", "Nav"]);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { initPaymentSheet, presentPaymentSheet, handleURLCallback } = useStripe();

  // iOS: hands the sleepfitlearn:// return URL from a 3D Secure / bank
  // redirect back to the Stripe SDK so PaymentSheet can finish (Stripe's
  // documented RN setup; Android handles this natively). Needs the scheme in
  // Info.plist and AppDelegate's openURL forwarding. Non-Stripe URLs (family
  // invite links) are ignored by handleURLCallback.
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      handleURLCallback(url).catch(() => {});
    });
    return () => sub.remove();
  }, [handleURLCallback]);

  const [pricing, setPricing] = useState<PricingPlan | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [webViewSource, setWebViewSource] = useState<CheckoutWebViewSource | null>(null);

  const refresh = useCallback(async () => {
    const [pricingResult, profileResult] = await Promise.all([getPricing(), getUserProfile()]);
    setPricing(pricingResult);
    setProfile(profileResult);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setErrorMessage(null);
      refresh()
        .catch((err) => setErrorMessage(loadErrorText(err, t("Billing:loadError"))))
        .finally(() => setLoading(false));
    }, [refresh, t]),
  );

  async function onSubscribe() {
    if (!pricing) return;
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (pricing.gateway === "razorpay") {
        // successUrl/cancelUrl are only meaningful for the Stripe branch —
        // harmless to send blank here, matches the web app's own comment.
        const result = await createCheckout({ successUrl: "", cancelUrl: "" });
        if (!("gateway" in result) || result.gateway !== "razorpay") {
          if ("message" in result) setInfoMessage(result.message);
          return;
        }

        const pay = await payWithRazorpay({
          keyId: result.keyId,
          subscriptionId: result.subscriptionId,
          amount: result.amount,
          currency: result.currency,
        });
        if (pay.ok) {
          await refresh();
        } else if (!pay.cancelled) {
          setWebViewSource({ html: pay.fallbackHtml });
        }
        return;
      }

      // gateway === "stripe"
      const intent = await createMobileStripeIntent();
      if (!("gateway" in intent)) {
        setInfoMessage(intent.message);
        return;
      }

      await initStripe({ publishableKey: intent.publishableKey, urlScheme: STRIPE_URL_SCHEME });
      const pay = await payWithStripe(
        { clientSecret: intent.clientSecret, customerId: intent.customerId, ephemeralKey: intent.ephemeralKey },
        { initPaymentSheet, presentPaymentSheet },
      );
      if (pay.ok) {
        await refresh();
        return;
      }
      if (pay.cancelled) return;

      // Native PaymentSheet couldn't be used — fall back to the same hosted
      // Checkout Session flow the web app uses, inside a WebView.
      const checkout = await createCheckout({ successUrl: BILLING_SUCCESS_URL, cancelUrl: BILLING_CANCEL_URL });
      if (!("gateway" in checkout)) {
        setInfoMessage(checkout.message);
        return;
      }
      if (checkout.gateway === "stripe") setWebViewSource({ uri: checkout.checkoutUrl });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("Billing:genericError"));
    } finally {
      setBusy(false);
    }
  }

  function onRazorpayMessage(message: RazorpayWebViewMessage) {
    setWebViewSource(null);
    if (message.type === "success") refresh();
  }

  function onStripeRedirect(result: "success" | "cancel") {
    setWebViewSource(null);
    if (result === "success") refresh();
  }

  const included = [t("Billing:includedLine1"), t("Billing:includedLine2"), t("Billing:includedLine3")];
  const pill = profile ? statusPill(profile.subscription_status, profile.trial_ends_at, t) : null;
  const status = profile?.subscription_status ?? null;
  const active = status === "active";
  const trialEnd = status === "trialing" && profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000)) : null;
  const country = COUNTRY_CODES.find((c) => c.code === profile?.country_code);
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppHeader title={t("Billing:pageTitle")} />
      <Text style={styles.description}>{t("Billing:pageDescription")}</Text>
      {pill && (
        <View style={[styles.pill, PILL_TONE_STYLES[pill.tone](colors)]}>
          <Text style={[styles.pillText, PILL_TONE_TEXT_STYLES[pill.tone](colors)]}>{pill.label}</Text>
        </View>
      )}

      {/* Your subscription */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t("Billing:statusCardTitle")}</Text>
        {loading && !profile ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <Text style={styles.statusText}>{pill?.label ?? "—"}</Text>
        )}
        {daysLeft !== null && daysLeft > 0 && (
          <Text style={styles.mutedText}>{t("Billing:daysLeft", { count: daysLeft })}</Text>
        )}
        <View style={styles.facts}>
          {trialEnd && profile?.trial_ends_at && <Fact styles={styles} label={t("Billing:trialEndsLabel")} value={date(profile.trial_ends_at)} />}
          {profile?.created_at ? <Fact styles={styles} label={t("Billing:memberSince")} value={date(profile.created_at)} /> : null}
        </View>
      </View>

      {/* The plan (highlighted) */}
      <View style={styles.planCard}>
        <View style={styles.planHeader}>
          <Text style={styles.planTitle}>{t("Billing:planTitle")}</Text>
          {active && (
            <View style={styles.yourPlan}>
              <Text style={styles.yourPlanText}>{t("Billing:yourPlan")}</Text>
            </View>
          )}
        </View>

        <View style={styles.priceRow}>
          {loading && !pricing ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : pricing ? (
            <View style={styles.priceGroup}>
              <Text style={styles.priceText}>{formatPrice(pricing.amount, pricing.currency)}</Text>
              <Text style={styles.intervalText}>/{pricing.interval}</Text>
            </View>
          ) : (
            <Text style={styles.planText}>{t("Billing:pricingLoadError")}</Text>
          )}
        </View>

        {included.map((line) => (
          <View key={line} style={styles.includedRow}>
            <Text style={styles.checkGlyph}>✓</Text>
            <Text style={styles.includedText}>{line}</Text>
          </View>
        ))}

        {active ? (
          <Text style={styles.subscribedNote}>{t("Billing:subscribedNote")}</Text>
        ) : (
          <AnimatedPressable style={styles.subscribeButton} onPress={onSubscribe} disabled={busy || loading}>
            {busy ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.subscribeButtonText}>{t("Billing:subscribe")}</Text>
            )}
          </AnimatedPressable>
        )}

        {infoMessage && <Text style={styles.planText}>{infoMessage}</Text>}
        {errorMessage && <Text style={styles.planErrorText}>{errorMessage}</Text>}
      </View>

      {/* Payment details */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t("Billing:paymentCardTitle")}</Text>
        <Fact styles={styles} label={t("Billing:paymentMethodLabel")} value={pricing ? pricing.gateway : "—"} capitalize />
        <Fact
          styles={styles}
          label={t("Billing:countryCurrencyLabel")}
          value={`${country ? `${country.flag} ${country.name}` : t("Billing:notSetBilling")}${pricing?.currency ? ` · ${pricing.currency}` : ""}`}
        />
        {pricing?.countryMissing && <Text style={styles.mutedText}>{t("Billing:countryMissingWarning")}</Text>}
        <View style={styles.facts}>
          <Text style={styles.link} onPress={() => navigation.navigate("Settings")}>
            {t("Billing:setCountryLink")}
          </Text>
          <Text style={styles.mutedSmall}>{t("Billing:countryNote")}</Text>
        </View>
      </View>

      <CheckoutWebViewModal
        visible={webViewSource != null}
        source={webViewSource}
        onClose={() => setWebViewSource(null)}
        onRazorpayMessage={onRazorpayMessage}
        onStripeRedirect={onStripeRedirect}
      />
    </ScrollView>
  );
}

function Fact({
  styles,
  label,
  value,
  capitalize,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, capitalize && styles.capitalize]}>{value}</Text>
    </View>
  );
}

const PILL_TONE_STYLES: Record<StatusTone, (colors: ColorPalette) => { backgroundColor: string }> = {
  primary: (colors) => ({ backgroundColor: `${colors.primary}1A` }),
  accent: (colors) => ({ backgroundColor: `${colors.primary}1A` }),
  muted: (colors) => ({ backgroundColor: colors.muted }),
  destructive: (colors) => ({ backgroundColor: `${colors.destructive}1A` }),
};
const PILL_TONE_TEXT_STYLES: Record<StatusTone, (colors: ColorPalette) => { color: string }> = {
  primary: (colors) => ({ color: colors.primary }),
  accent: (colors) => ({ color: colors.primary }),
  muted: (colors) => ({ color: colors.mutedForeground }),
  destructive: (colors) => ({ color: colors.destructive }),
};

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16, paddingBottom: 40 },
    description: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, marginTop: -8 },
    pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
    pillText: { fontSize: typography.label.fontSize, fontWeight: "700" },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    cardLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", color: colors.mutedForeground },
    loader: { alignSelf: "flex-start" },
    statusText: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    mutedText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    mutedSmall: { fontSize: 12, color: colors.mutedForeground },
    facts: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 },
    fact: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    factLabel: { fontSize: 14, color: colors.mutedForeground },
    factValue: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: "right" },
    capitalize: { textTransform: "capitalize" },
    planCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16, gap: 12 },
    planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    planTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryForeground },
    yourPlan: { backgroundColor: colors.primaryForeground, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    yourPlanText: { fontSize: 12, fontWeight: "800", color: colors.primary },
    priceRow: { minHeight: 48, justifyContent: "center" },
    priceGroup: { flexDirection: "row", alignItems: "baseline", gap: 4 },
    priceText: { fontSize: 44, fontWeight: "800", letterSpacing: -0.5, color: colors.primaryForeground },
    intervalText: { fontSize: typography.bodySmall.fontSize, color: colors.primaryForeground, opacity: 0.85 },
    includedRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    checkGlyph: { color: colors.primaryForeground, fontSize: 14, marginTop: 2 },
    includedText: { flex: 1, fontSize: typography.body.fontSize, color: colors.primaryForeground },
    link: { color: colors.primary, fontWeight: "700", fontSize: 14 },
    subscribeButton: {
      backgroundColor: colors.primaryForeground,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    subscribeButtonText: { color: colors.primary, fontSize: 16, fontWeight: "800" },
    subscribedNote: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.primaryForeground,
      borderRadius: radius.md,
      paddingVertical: 10,
      textAlign: "center",
      fontWeight: "800",
      color: colors.primaryForeground,
    },
    planText: { fontSize: typography.bodySmall.fontSize, color: colors.primaryForeground },
    planErrorText: { fontSize: typography.bodySmall.fontSize, fontWeight: "700", color: colors.primaryForeground },
  });
}
