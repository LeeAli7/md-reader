import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultSizes } from '../theme/fonts';
import { fonts as FONT_LIST } from '../theme/fonts';

export type ThemeMode = 'light' | 'dark' | 'auto';

// Новые ключи md2_*. Старые md_* подхватываются как миграция при первом запуске.
const KEYS = {
  themeMode: 'md2_theme_mode',
  readingTheme: 'md2_reading_theme',
  font: 'md2_font',
  fontSize: 'md2_font_size',
  lineHeight: 'md2_line_height',
  contentWidth: 'md2_content_width',
};
const LEGACY: Record<string, string> = {
  md2_reading_theme: 'md_reading_theme',
  md2_font: 'md_font',
  md2_font_size: 'md_font_size',
  md2_line_height: 'md_line_height',
};

interface Settings {
  themeMode: ThemeMode;
  readingTheme: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
}

interface Ctx extends Settings {
  setThemeMode: (v: ThemeMode) => void;
  setReadingTheme: (v: string) => void;
  setFont: (v: string) => void;
  setFontSize: (v: number) => void;
  setLineHeight: (v: number) => void;
  setContentWidth: (v: number) => void;
  resetAll: () => void;
}

const DEFAULTS: Settings = {
  themeMode: 'auto',
  readingTheme: 'default',
  font: 'Inter',
  fontSize: defaultSizes.fontSize,
  lineHeight: defaultSizes.lineHeight,
  contentWidth: defaultSizes.contentWidth,
};

const AppSettingsContext = createContext<Ctx | null>(null);

async function loadStr(key: string): Promise<string | null> {
  const v = await AsyncStorage.getItem(key);
  if (v !== null) return v;
  const leg = LEGACY[key];
  if (leg) return AsyncStorage.getItem(leg);
  return null;
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const [tm, rt, f, fs, lh, cw] = await Promise.all([
          loadStr(KEYS.themeMode),
          loadStr(KEYS.readingTheme),
          loadStr(KEYS.font),
          loadStr(KEYS.fontSize),
          loadStr(KEYS.lineHeight),
          AsyncStorage.getItem(KEYS.contentWidth),
        ]);
        setS({
          themeMode: tm === 'light' || tm === 'dark' ? tm : tm === 'auto' ? 'auto' : DEFAULTS.themeMode,
          readingTheme: rt || DEFAULTS.readingTheme,
          // Миграция со старого списка из 50: неизвестное имя → Inter
          font: f && (FONT_LIST as readonly string[]).includes(f) ? f : DEFAULTS.font,
          fontSize: fs ? Number(fs) || DEFAULTS.fontSize : DEFAULTS.fontSize,
          lineHeight: lh ? Number(lh) || DEFAULTS.lineHeight : DEFAULTS.lineHeight,
          contentWidth: cw ? Number(cw) || DEFAULTS.contentWidth : DEFAULTS.contentWidth,
        });
      } catch {}
    })();
  }, []);

  const save = useCallback((key: string, value: string) => {
    AsyncStorage.setItem(key, value).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...s,
      setThemeMode: (v) => { setS((p) => ({ ...p, themeMode: v })); save(KEYS.themeMode, v); },
      setReadingTheme: (v) => { setS((p) => ({ ...p, readingTheme: v })); save(KEYS.readingTheme, v); },
      setFont: (v) => { setS((p) => ({ ...p, font: v })); save(KEYS.font, v); },
      setFontSize: (v) => { setS((p) => ({ ...p, fontSize: v })); save(KEYS.fontSize, String(v)); },
      setLineHeight: (v) => { setS((p) => ({ ...p, lineHeight: v })); save(KEYS.lineHeight, String(v)); },
      setContentWidth: (v) => { setS((p) => ({ ...p, contentWidth: v })); save(KEYS.contentWidth, String(v)); },
      resetAll: () => {
        setS(DEFAULTS);
        AsyncStorage.multiRemove(Object.values(KEYS)).catch(() => {});
      },
    }),
    [s, save]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): Ctx {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings outside provider');
  return ctx;
}

// Опциональная версия для мест, где провайдера может не быть (возврат null вместо throw).
export function useAppSettingsOpt(): Ctx | null {
  return useContext(AppSettingsContext);
}
