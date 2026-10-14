// Light palette mirrors the web app's design tokens (see theme/colors.ts's
// original comment: Frontend-Next-SleepFitLearn/src/app/globals.css :root).
// Dark palette follows the same tokens' *role*, not their literal value —
// e.g. "card" stays "the raised surface color", just inverted for a dark
// background — so any screen written against these keys works in both modes
// with zero screen-specific logic.
export type ColorPalette = {
  background: string;
  foreground: string;
  card: string;
  border: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  muted: string;
  mutedForeground: string;
  destructive: string;
  destructiveBorder: string;
  destructiveBg: string;
  // Foreground tint for nav chrome (header tint, active tab) — kept distinct
  // from `primary` because `primary` also serves as a solid-fill button
  // background (paired with `primaryForeground` text), a role where the dark
  // palette's near-black value is correct and shouldn't be lightened.
  navTint: string;
};

// Deep-forest-green + orange scheme, matched to the same reference mockup
// as the website's :root palette (globals.css) — keep these two in sync.
export const lightColors: ColorPalette = {
  background: "#F6F9F7",
  foreground: "#16211D",
  card: "#FFFFFF",
  border: "#DCE6DF",
  primary: "#1F3D30",
  primaryForeground: "#F6F9F7",
  accent: "#F2874B",
  muted: "#EDF3EF",
  mutedForeground: "#5C6D64",
  destructive: "#C0392B",
  destructiveBorder: "#E8B9B2",
  destructiveBg: "#FBEAE8",
  navTint: "#1F3D30",
};

export const darkColors: ColorPalette = {
  // Same charcoal-slate + gold scheme as the website's .dark palette
  // (globals.css) — keep these two in sync if either changes.
  background: "#2C303A",
  foreground: "#F5F5F5",
  card: "#4A4F5C",
  border: "rgba(255,255,255,0.08)",
  primary: "#1A1A1A",
  primaryForeground: "#F5F5F5",
  accent: "#D4A94A",
  muted: "#565B68",
  mutedForeground: "#9CA0AA",
  destructive: "#E5766A",
  destructiveBorder: "#6B3630",
  destructiveBg: "#2B1917",
  // primary (#1A1A1A) is only ~1.3:1 / 2.1:1 against background/card — fine
  // for a solid-fill button (paired with light primaryForeground text) but
  // near-invisible as a foreground tint on its own. This is a lighter shade
  // of the same warm-gold family as `accent`, chosen for >=4.5:1 (WCAG AA)
  // against both background (8.46:1) and card (5.25:1).
  navTint: "#E8CC8E",
};

// Shared scales — Part 3 (spacing/typography consistency) reads from these
// instead of ad-hoc numbers, same as colors read from the palette above.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: "600" as const, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 15, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodySmall: { fontSize: 13, fontWeight: "400" as const },
  label: { fontSize: 12, fontWeight: "600" as const },
  button: { fontSize: 15, fontWeight: "600" as const },
};

// Press-feedback / list-animation timing — kept short and consistent
// (150-250ms band) across every animated interaction in the app.
export const duration = {
  pressIn: 80,
  pressOut: 150,
  listChange: 220,
};
