import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { light, dark, Theme } from '../theme/tokens';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import type { ThemeMode } from '../context/AppSettingsContext';

const THEME_KEY = 'md_theme_mode'; // legacy, только фолбэк без провайдера

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: light,
  isDark: false,
  toggleTheme: () => {},
  mode: 'auto',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const app = useAppSettingsOpt();
  const [localDark, setLocalDark] = useState(systemScheme === 'dark');

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (stored !== null) setLocalDark(stored === 'dark');
      } catch {}
    })();
  }, []);

  const mode: ThemeMode = app ? app.themeMode : 'auto';
  const isDark = app
    ? mode === 'dark' ? true : mode === 'light' ? false : systemScheme === 'dark'
    : localDark;

  const setMode = useCallback(
    (m: ThemeMode) => {
      if (app) {
        app.setThemeMode(m);
      } else {
        setLocalDark(m === 'dark' ? true : m === 'light' ? false : systemScheme === 'dark');
        AsyncStorage.setItem(THEME_KEY, m === 'dark' ? 'dark' : 'light').catch(() => {});
      }
    },
    [app, systemScheme]
  );

  const toggleTheme = useCallback(() => {
    if (app) {
      const nextIsDark = !(mode === 'dark' ? true : mode === 'light' ? false : systemScheme === 'dark');
      app.setThemeMode(nextIsDark ? 'dark' : 'light');
    } else {
      setLocalDark((prev) => {
        const next = !prev;
        AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
        return next;
      });
    }
  }, [app, mode, systemScheme]);

  const value = useMemo(
    () => ({ theme: isDark ? dark : light, isDark, toggleTheme, mode, setMode }),
    [isDark, toggleTheme, mode, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
