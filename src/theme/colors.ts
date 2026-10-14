// Deprecated static import — every screen/component now reads colors from
// useTheme() (see ThemeContext.tsx) so they react to the light/dark/system
// toggle. This re-export is kept only as a safety net for anything not yet
// migrated; new code should use useTheme(), not this file.
export { lightColors as colors } from "./palettes";
