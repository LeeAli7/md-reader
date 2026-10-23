// Типографика интерфейса. Каждый вес — реальный файл шрифта, не синтетика.
import type { TextStyle } from 'react-native';

export const uiFont = {
  regular: 'Inter',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

type W = 400 | 500 | 600 | 700;
export const font = (w: W = 400) =>
  w === 700 ? uiFont.bold : w === 600 ? uiFont.semibold : w === 500 ? uiFont.medium : uiFont.regular;

const t = (size: number, weight: W, lineHeight: number, tracking = 0): TextStyle => ({
  fontFamily: font(weight),
  fontSize: size,
  lineHeight,
  letterSpacing: tracking,
});

export const type = {
  largeTitle: t(34, 700, 41, -0.6),
  title1: t(28, 700, 34, -0.5),
  title2: t(22, 600, 28, -0.3),
  title3: t(20, 600, 25, -0.2),
  headline: t(17, 600, 22, -0.2),
  body: t(17, 400, 22),
  callout: t(16, 400, 21),
  subhead: t(15, 400, 20),
  subheadStrong: t(15, 600, 20),
  footnote: t(13, 400, 18),
  caption: t(12, 400, 16),
  caption2: t(11, 400, 13, 0.06),
  tab: t(10, 500, 12, 0.1),
} as const;

// Моноширинный — для кода, номеров шагов, формул.
export const mono = {
  fontFamily: 'JetBrainsMono',
  regular: { fontFamily: 'JetBrainsMono' } as TextStyle,
  bold: { fontFamily: 'JetBrainsMono-Bold' } as TextStyle,
};
