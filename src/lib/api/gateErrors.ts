import i18n from "../../i18n";
import { MinorDataDisabledError, MinorGateUnavailableError, ProfileRequiredError } from "./client";

// The data Lambdas' minor-data gate (backend shared/minorGate.js) can refuse
// a request with 403 profile_required / 403 minor_data_disabled or 503
// minor_gate_unavailable. Screens show one of these instead of their generic
// "couldn't load" text, so the user knows it isn't a network hiccup.
export function loadErrorText(err: unknown, fallback: string): string {
  const t = i18n.getFixedT(null, "Common");
  if (err instanceof ProfileRequiredError) return t("gateErrors.profileRequired");
  if (err instanceof MinorDataDisabledError) return t("gateErrors.minorDataDisabled");
  if (err instanceof MinorGateUnavailableError) return t("gateErrors.minorGateUnavailable");
  return fallback;
}
