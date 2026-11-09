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
  // Tokens added with the web redesign (globals.css): hot orange for fills,
  // bars and big numbers (never small text on light), grey bars and tracks
  // for charts, and health status colours kept apart from the orange.
  orange: string;
  orangeForeground: string;
  soft: string;
  input: string;
  bar: string;
  track: string;
  statusGood: string;
  statusWatch: string;
  statusHigh: string;
};

// Sporty orange scheme, same values as the website's :root and .dark tokens
// (Frontend-Next-SleepFitLearn/src/app/globals.css) — keep these in sync.
// primary is the text-safe orange (5.4:1 on white); orange (#FC4C02) is for
// fills, bars, icons and large text only.
export const lightColors: ColorPalette = {
  background: "#F5F5F5",
  foreground: "#171717",
  card: "#FFFFFF",
  border: "#E3E3E3",
  primary: "#C23B00",
  primaryForeground: "#FFFFFF",
  accent: "#FC4C02",
  muted: "#F0F0F0",
  mutedForeground: "#595959",
  destructive: "#B91C1C",
  destructiveBorder: "#F2C2C2",
  destructiveBg: "#FDECEC",
  navTint: "#C23B00",
  orange: "#FC4C02",
  orangeForeground: "#171717",
  soft: "#F0F0F0",
  input: "#D4D4D4",
  bar: "#8F8F8F",
  track: "#EDEDED",
  statusGood: "#15803D",
  statusWatch: "#A16207",
  statusHigh: "#B91C1C",
};

export const darkColors: ColorPalette = {
  background: "#121212",
  foreground: "#F5F5F5",
  card: "#1E1E1E",
  border: "#2E2E2E",
  primary: "#FC4C02",
  primaryForeground: "#121212",
  accent: "#FC4C02",
  muted: "#262626",
  mutedForeground: "#A6A6A6",
  destructive: "#F87171",
  destructiveBorder: "#6B2A2A",
  destructiveBg: "#2A1515",
  navTint: "#FC4C02",
  orange: "#FC4C02",
  orangeForeground: "#121212",
  soft: "#262626",
  input: "#3A3A3A",
  bar: "#6E6E6E",
  track: "#2E2E2E",
  statusGood: "#4ADE80",
  statusWatch: "#FACC15",
  statusHigh: "#F87171",
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

// Small corners, same as the web (4-8px).
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 8,
  full: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.3 },
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
