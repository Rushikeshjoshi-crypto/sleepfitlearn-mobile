import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as RNLocalize from "react-native-localize";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";

// Each locale file's top-level keys (App, Auth, Nav, Study, ...) become
// i18next namespaces directly — same 16 (now 15, Billing excluded)
// namespaces web's src/messages/*.json already used, so t("Study")/t(key)
// call sites port over unchanged in spirit (useTranslations("Study") -> t
// there, useTranslation("Study") -> t here).
export const SUPPORTED_LANGUAGES = ["en", "fr", "de", "it", "es", "hi", "bn"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const resources = { en, fr, de, it, es, hi, bn };

const LANGUAGE_STORAGE_KEY = "sleepfit_language";

function resolveInitialLanguage(): SupportedLanguage {
  const deviceLocales = RNLocalize.getLocales();
  for (const locale of deviceLocales) {
    const code = locale.languageCode.toLowerCase();
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
      return code as SupportedLanguage;
    }
  }
  return "en";
}

export async function initI18n(): Promise<void> {
  let initialLanguage: SupportedLanguage;
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    initialLanguage =
      stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)
        ? (stored as SupportedLanguage)
        : resolveInitialLanguage();
  } catch {
    initialLanguage = resolveInitialLanguage();
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    // Same protective intent as web's src/i18n/request.ts deepMerge (a
    // translation file missing a key shows English instead of a blank
    // string or the raw key) — i18next's native fallbackLng achieves the
    // identical outcome as the idiomatic mechanism for this library,
    // without needing to pre-merge every locale's object against en's.
    fallbackLng: "en",
    ns: [
      "App",
      "Auth",
      "Nav",
      "Dashboard",
      "LogTodayModal",
      "Common",
      "Sleep",
      "Study",
      "Exercise",
      "Personal",
      "Habits",
      "Trends",
      "Insights",
      "Settings",
      "UI",
      "Family",
      "Vitals",
      "Watch",
      "HeartCamera",
    ],
    defaultNS: "Common",
    // Ported message files use next-intl's single-brace interpolation
    // ("Sleep logged — {hours}h") — matching that here means the values
    // port unchanged instead of needing every {x} rewritten to {{x}}.
    interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
    returnEmptyString: false,
    compatibilityJSON: "v4",
  });
}

// Persists the choice so it survives app restarts (web's equivalent is a
// cookie next-intl reads on the next request; there's no request cycle
// here, so this is read back by resolveInitialLanguage() above on next launch).
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Non-fatal — the language still changes for this session, it just
    // won't be remembered on next launch.
  }
}

export default i18n;
