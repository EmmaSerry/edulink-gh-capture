/**
 * Light/dark mode - the same "per-device UI preference, not application
 * data" pattern the original offline ACTRS app used (see its
 * src/hooks/useTheme.ts): read once from localStorage, applied via
 * Bootstrap 5.3's native `data-bs-theme` attribute on <html>, which both
 * Bootstrap's own precompiled CSS and this app's theme.css already have
 * matching dark rules for (see the `[data-bs-theme="dark"]` block in
 * theme.css) - so flipping the attribute is the entire mechanism, no
 * per-component dark-mode branching anywhere else in the app.
 *
 * A Context (rather than every consumer calling its own useState) so
 * there is exactly one source of truth: the topbar's toggle button and
 * the attribute-setting effect always agree, even across remounts.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";
const STORAGE_KEY = "edulink-gh.theme";

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggle: () => setMode((m) => (m === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be used within a ThemeProvider");
  return ctx;
}
