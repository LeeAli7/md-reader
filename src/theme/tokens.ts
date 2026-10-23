// Supreader — дизайн-токены. Два интерфейса: «чистый iOS» (светлый) и КРОВЬ (тёмный).
// Никакого синего в тёмной теме: единственный цветной сигнал — красный (#FF3B30).

export type Palette = {
  bg: string;
  page: string;
  surface: string;
  surfaceAlt: string;
  glass: string;
  glassLine: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  border: string;
  divider: string;
  fill: string;
  fill2: string;
  red: string;
  green: string;
  shadow: string;
  isDark: boolean;
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
};

const radius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 };

export const light: Palette = {
  bg: '#FFFFFF',
  page: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F2F7',
  glass: 'rgba(255,255,255,0.62)',
  glassLine: 'rgba(255,255,255,0.7)',
  text: '#000000',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',
  accent: '#007AFF',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(0,122,255,0.10)',
  border: 'rgba(60,60,67,0.29)',
  divider: 'rgba(60,60,67,0.18)',
  fill: 'rgba(118,118,128,0.12)',
  fill2: 'rgba(118,118,128,0.20)',
  red: '#FF3B30',
  green: '#34C759',
  shadow: 'rgba(0,0,0,0.12)',
  isDark: false,
  radius,
};

// КРОВЬ: чёрный лист, карточка #141416, белый как единственный акцент, красный — только смысл.
export const dark: Palette = {
  bg: '#000000',
  page: '#000000',
  surface: '#141416',
  surfaceAlt: '#0B0B0C',
  glass: 'rgba(28,28,30,0.62)',
  glassLine: 'rgba(255,255,255,0.09)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.62)',
  textTertiary: 'rgba(235,235,245,0.38)',
  accent: '#FFFFFF',
  onAccent: '#000000',
  accentSoft: 'rgba(255,255,255,0.10)',
  border: 'rgba(84,84,88,0.50)',
  divider: 'rgba(84,84,88,0.35)',
  fill: 'rgba(120,120,128,0.26)',
  fill2: 'rgba(120,120,128,0.36)',
  red: '#FF3B30',
  green: '#30D158',
  shadow: 'rgba(0,0,0,0.55)',
  isDark: true,
  radius,
};

export type Theme = Palette;

export const palettes: Record<'light' | 'dark', Palette> = { light, dark };

// Четыре листа для чтения. dark — флаг, а не сравнение hex (из-за этого раньше
// Solarized считался тёмной темой и красил ссылки не тем цветом).
export type ReadingTheme = {
  id: string;
  name: string;
  bg: string;
  text: string;
  muted: string;
  rule: string;
  fill: string;
  dark: boolean;
};

export const readingThemes: ReadingTheme[] = [
  {
    id: 'light',
    name: 'Светлый',
    bg: '#FFFFFF',
    text: '#101012',
    muted: 'rgba(16,16,18,0.55)',
    rule: 'rgba(16,16,18,0.9)',
    fill: 'rgba(118,118,128,0.12)',
    dark: false,
  },
  {
    id: 'blood',
    name: 'КРОВЬ',
    bg: '#000000',
    text: '#FAFAFA',
    muted: 'rgba(250,250,250,0.55)',
    rule: 'rgba(250,250,250,0.9)',
    fill: 'rgba(120,120,128,0.24)',
    dark: true,
  },
  {
    id: 'sepia',
    name: 'Сепия',
    bg: '#F4ECD8',
    text: '#5B4636',
    muted: 'rgba(91,70,54,0.62)',
    rule: 'rgba(91,70,54,0.85)',
    fill: 'rgba(91,70,54,0.10)',
    dark: false,
  },
  {
    id: 'graphite',
    name: 'Графит',
    bg: '#1C1C1E',
    text: '#EDEDED',
    muted: 'rgba(235,235,245,0.55)',
    rule: 'rgba(235,235,245,0.85)',
    fill: 'rgba(120,120,128,0.26)',
    dark: true,
  },
];

export const DEFAULT_READING_THEME = 'light';

// Старые идентификаторы (9 тем) → новые.
const READING_ALIASES: Record<string, string> = {
  default: 'light',
  medium: 'light',
  notion: 'light',
  newspaper: 'light',
  solarized: 'light',
  github: 'blood',
  elegant: 'graphite',
  dracula: 'graphite',
  sepia: 'sepia',
  light: 'light',
  blood: 'blood',
  graphite: 'graphite',
};

export function getReadingTheme(id: string | undefined): ReadingTheme {
  const key = READING_ALIASES[id ?? ''] ?? DEFAULT_READING_THEME;
  return readingThemes.find((t) => t.id === key) ?? readingThemes[0];
}
