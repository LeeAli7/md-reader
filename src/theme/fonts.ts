// 15 Google Fonts для чтения — ровно те, что грузятся в App.tsx.
// Family-ключ = имя без пробелов (Open Sans → OpenSans), см. ReaderScreen.
export const fonts = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Merriweather', 'Fira Code',
  'Lora', 'Playfair Display', 'PT Serif', 'Source Serif Pro',
  'Nunito', 'Poppins', 'Raleway', 'JetBrains Mono',
] as const;

export type FontName = typeof fonts[number];

// Map font name to expo-google-fonts package (snake_case)
export function fontToExpoKey(name: string): string {
  return name.replace(/\s+/g, '_').toLowerCase();
}

// Default reading sizes
export const defaultSizes = {
  fontSize: 16,
  lineHeight: 1.7,
  contentWidth: 720, // px, max reading column width
};
