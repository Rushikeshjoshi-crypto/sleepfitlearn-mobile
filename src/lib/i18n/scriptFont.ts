import { useTranslation } from "react-i18next";

// Ports web's Devanagari/Bengali font-loading (src/app/layout.tsx registers
// Noto Sans/Serif Devanagari and Bengali as CSS variables, applied via
// :lang(hi)/:lang(bn) selectors in globals.css) — RN has no CSS lang()
// equivalent, so this is the same lookup as a hook instead, for a component
// to apply to its own Text style(s) explicitly.
//
// The fonts themselves are bundled as static assets (assets/fonts/, linked
// via react-native.config.js + `npx react-native-asset`) — Android reads
// them from android/app/src/main/assets/fonts/, iOS from the Xcode project +
// Info.plist's UIAppFonts, both already wired. Family names below match each
// file's own PostScript name (name ID 6), which is what both platforms key
// custom fonts by.
const SCRIPT_FONTS: Partial<Record<string, string>> = {
  hi: "NotoSansDevanagari-Regular",
  bn: "NotoSansBengali-Regular",
};

// Returns the bundled font family for the current language's script, or
// undefined for languages that should use the system default font.
export function useScriptFontFamily(): string | undefined {
  const { i18n } = useTranslation();
  return SCRIPT_FONTS[i18n.language];
}
