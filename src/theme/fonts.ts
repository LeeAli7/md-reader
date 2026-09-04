// 50 Google Fonts for reading
export const fonts = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'PT Serif', 'Merriweather', 'Source Serif Pro', 'Playfair Display', 'Libre Baskerville',
  'Nunito', 'Poppins', 'Raleway', 'Work Sans', 'Rubik',
  'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'IBM Plex Mono', 'Ubuntu Mono',
  'Noto Serif', 'Crimson Text', 'EB Garamond', 'Spectral', 'Bitter',
  'Karla', 'Quicksand', 'DM Sans', 'Manrope', 'Outfit',
  'Space Grotesk', 'Plus Jakarta Sans', 'Figtree', 'Satoshi', 'General Sans',
  'Atkinson Hyperlegible', 'Lexend', 'Readable', 'Atkinson', 'Literata',
  'Newsreader', 'Fraunces', 'Cormorant Garamond', 'Lora', 'Vollkorn',
  'Zilla Slab', 'Arvo', 'Old Standard TT', 'Alegreya', 'Cardo',
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
