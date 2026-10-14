// Ports src/lib/i18n/localizedName.ts from the web app directly. Subjects
// (study) and activities (exercise) both store a per-locale name map from
// the backend (name_i18n: { en, fr?, de?, it?, ... }) — every mobile call
// site was hardcoding .en regardless of the active UI language. This
// resolves the real active language first, falling back to English when a
// language's translation hasn't been added for that row yet.
export function localizedName(
  nameI18n: { en: string; [locale: string]: string | undefined } | null | undefined,
  language: string,
): string {
  if (!nameI18n) return "";
  return nameI18n[language] ?? nameI18n.en;
}
