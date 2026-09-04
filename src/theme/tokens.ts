// MD Reader — Design Tokens
export const light = {
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F0',
  text: '#1A1A1A',
  textSecondary: '#6B6B6B',
  accent: '#2563EB',
  accentSoft: '#EFF3FF',
  border: '#E5E5E0',
  divider: '#F0F0EB',
  shadow: 'rgba(0,0,0,0.06)',
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 99 },
};

export const dark = {
  bg: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceAlt: '#242424',
  text: '#F0F0F0',
  textSecondary: '#8A8A8A',
  accent: '#60A5FA',
  accentSoft: '#1E293B',
  border: '#2A2A2A',
  divider: '#1F1F1F',
  shadow: 'rgba(0,0,0,0.3)',
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 99 },
};

export type Theme = typeof light;

// 9 reading themes (inspired by Markdown Viewer extension)
export const readingThemes: Record<string, { bg: string; text: string; name: string }> = {
  default:  { bg: '#FAFAF8', text: '#1A1A1A', name: 'Default' },
  github:   { bg: '#0D1117', text: '#C9D1D9', name: 'GitHub Dark' },
  medium:   { bg: '#FFFFFF', text: '#242424', name: 'Medium' },
  notion:   { bg: '#FFFFFF', text: '#37352F', name: 'Notion' },
  sepia:    { bg: '#F4ECD8', text: '#5B4636', name: 'Sepia' },
  newspaper:{ bg: '#F5F0E8', text: '#333333', name: 'Newspaper' },
  elegant:  { bg: '#1C1917', text: '#E7E5E4', name: 'Elegant Dark' },
  solarized:{ bg: '#FDF6E3', text: '#586E75', name: 'Solarized Light' },
  dracula:  { bg: '#282A36', text: '#F8F8F2', name: 'Dracula' },
};
