import { enUS, fr, de, it, es, hi, bn } from "date-fns/locale";
import type { Locale } from "date-fns";

// Ports src/lib/i18n/dateFnsLocale.ts from the web app — maps our i18next
// language code to date-fns's locale object for format() calls that render
// month/weekday names (CalendarModal). Web's version only listed en/fr/de/it
// (written before es/hi/bn had real translations); all 7 are filled in here
// since date-fns ships locale data for all of them regardless.
const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, fr, de, it, es, hi, bn };

export function getDateFnsLocale(language: string): Locale {
  return DATE_FNS_LOCALES[language] ?? enUS;
}
