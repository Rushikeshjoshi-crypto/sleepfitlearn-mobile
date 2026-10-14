import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type ColorPalette } from "./palettes";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "sleepfit_theme_mode";

type ThemeContextValue = {
  colors: ColorPalette;
  mode: ThemeMode;
  resolvedScheme: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "system") setModeState(saved);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  const resolvedScheme: "light" | "dark" =
    mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  const colors = resolvedScheme === "dark" ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, mode, resolvedScheme, setMode }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, mode, resolvedScheme],
  );

  // Render immediately with the "system" default rather than blocking on
  // AsyncStorage — avoids a flash-of-unstyled-app on cold start. If the
  // stored preference differs from "system" it applies a frame or two later,
  // same tradeoff every persisted-preference screen in this app already
  // makes (see HabitComposer, RoutineBuilder, etc. — none block first paint).
  void loaded;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
