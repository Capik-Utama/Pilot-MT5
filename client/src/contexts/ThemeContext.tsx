import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "blue-black" | "blue-white";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEMES: Theme[] = ["dark", "light", "blue-black", "blue-white"];
const THEME_KEY = "pilot-theme";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

function isTheme(value: string | null): value is Theme {
  return THEMES.includes(value as Theme);
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    const stored = localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark" || theme === "blue-black");
    if (switchable) localStorage.setItem(THEME_KEY, theme);
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => setTheme((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length])
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
