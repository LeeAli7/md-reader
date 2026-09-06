import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Иконка по расширению файла. Цвета через theme, без хардкода.
const MAP: Record<string, string> = {
  md: 'document-text',
  markdown: 'document-text',
  mdown: 'document-text',
  txt: 'document-text-outline',
  text: 'document-text-outline',
  json: 'code-slash-outline',
  js: 'code-slash-outline',
  ts: 'code-slash-outline',
  tsx: 'code-slash-outline',
  py: 'code-slash-outline',
  html: 'code-slash-outline',
  css: 'code-slash-outline',
  csv: 'grid-outline',
  log: 'terminal-outline',
  pdf: 'document-attach',
};

export function FileTypeIcon({ name, theme, size = 22 }: { name: string; theme: any; size?: number }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icon = MAP[ext] || 'document-outline';
  return (
    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon as any} size={size} color={theme.accent} />
    </View>
  );
}
