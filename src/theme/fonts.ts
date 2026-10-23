// Шрифты Supreader.
// Интерфейс — Inter (SF Pro на iOS, ближайший честный аналог на Android),
// с живыми начертаниями 400/500/600/700: раньше в APK лежали только 400 и 700,
// а стили просили 500/600 — вес рисовался синтетикой.
// Чтение — 4 семейства с курсивом и жирным, чтобы strong/em в .smd работали.

export type ReadingFont = {
  id: string;
  name: string;
  /** ключ регулярного начертания в Font.loadAsync */
  family: string;
  bold: string;
  italic: string;
  boldItalic: string;
  /** шрифт моноширинный: формулы и код в доке показываем им */
  mono?: boolean;
  /** короткая подпись под названием в настройках */
  note: string;
};

export const readingFonts: ReadingFont[] = [
  {
    id: 'source-serif',
    name: 'Source Serif',
    note: 'Засечки, для долгого чтения',
    family: 'SourceSerifPro',
    bold: 'SourceSerifPro-Bold',
    italic: 'SourceSerifPro-Italic',
    boldItalic: 'SourceSerifPro-BoldItalic',
  },
  {
    id: 'inter',
    name: 'Inter',
    note: 'Без засечек, как интерфейс',
    family: 'Inter',
    bold: 'Inter-Bold',
    italic: 'Inter-Italic',
    boldItalic: 'Inter-BoldItalic',
  },
  {
    id: 'lora',
    name: 'Lora',
    note: 'Тёплые засечки',
    family: 'Lora',
    bold: 'Lora-Bold',
    italic: 'Lora-Italic',
    boldItalic: 'Lora-BoldItalic',
  },
  {
    id: 'mono',
    name: 'JetBrains Mono',
    note: 'Код и формулы',
    family: 'JetBrainsMono',
    bold: 'JetBrainsMono-Bold',
    italic: 'JetBrainsMono-Italic',
    boldItalic: 'JetBrainsMono-BoldItalic',
    mono: true,
  },
];

export const fontIds = readingFonts.map((f) => f.id);

export const DEFAULT_FONT_ID = 'source-serif';

// Старые имена шрифтов (15 строк из прежнего списка) → новые id.
const FONT_ALIASES: Record<string, string> = {
  Inter: 'inter',
  'Source Serif Pro': 'source-serif',
  SourceSerifPro: 'source-serif',
  Lora: 'lora',
  'JetBrains Mono': 'mono',
  JetBrainsMono: 'mono',
  'Fira Code': 'mono',
  FiraCode: 'mono',
};

export function getReadingFont(id: string | undefined): ReadingFont {
  const key = FONT_ALIASES[id ?? ''] ?? id;
  return readingFonts.find((f) => f.id === key) ?? readingFonts[0];
}

/** Совместимость со старым кодом: список названий для превью/валидации. */
export const fonts = readingFonts.map((f) => f.id);
export type FontName = string;

// Размеры по умолчанию.
export const defaultSizes = {
  fontSize: 17,
  lineHeight: 1.62,
  contentWidth: 720,
};

// Шкала размеров для шторки «Чтение» (pt).
export const FONT_SIZES = [15, 16, 17, 18, 19, 20, 22, 24];
export const LINE_HEIGHTS = [
  { id: 'tight', label: 'Плотный', value: 1.42 },
  { id: 'normal', label: 'Обычный', value: 1.62 },
  { id: 'loose', label: 'Воздушный', value: 1.82 },
];
