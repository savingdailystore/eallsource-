'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // Read saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    const preferred = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply(preferred);
    setThemeState(preferred);
  }, []);

  function apply(t: Theme) {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }

  function setTheme(t: Theme) {
    setThemeState(t);
    apply(t);
    localStorage.setItem('theme', t);
  }

  function toggle() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
