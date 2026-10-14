// Small curated list for the phone-number country selector — not
// exhaustive. Mirrors Frontend-Next-SleepFitLearn's
// src/lib/data/countryCodes.ts so both clients offer the same choices.
export type CountryCodeOption = {
  code: string; // ISO 3166-1 alpha-2, also the libphonenumber-js CountryCode
  name: string;
  dialCode: string;
  flag: string;
};

export const COUNTRY_CODES: CountryCodeOption[] = [
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "AE", name: "UAE", dialCode: "+971", flag: "🇦🇪" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
];

export const DEFAULT_COUNTRY_CODE = "IN";
