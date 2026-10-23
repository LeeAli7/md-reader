import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Иконка по расширению. Нейтральная плитка, красный — только у «своих» .smd:
// радуги по типам файлов больше нет, акцент один.
const MAP: Record<string, string> = {
  md: 'document-text-outline',
  markdown: 'document-text-outline',
  mdown: 'document-text-outline',
  smd: 'school-outline',
  txt: 'document-outline',
  text: 'document-outline',
  json: 'code-slash-outline',
  js: 'code-slash-outline',
  ts: 'code-slash-outline',
  tsx: 'code-slash-outline',
  py: 'code-slash-outline',
  html: 'code-slash-outline',
  css: 'code-slash-outline',
  csv: 'grid-outline',
  log: 'terminal-outline',
  pdf: 'document-attach-outline',
  epub: 'book-outline',
  docx: 'document-text-outline',
  xlsx: 'grid-outline',
  pptx: 'easel-outline',
};

export function FileTypeIcon({ name, theme, size = 21 }: { name: string; theme: any; size?: number }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icon = MAP[ext] || 'document-outline';
  const own = ext === 'smd';
  const color = own ? theme.red : (theme.isDark ? '#C7C7CC' : '#8E8E93');
  return (
    <View
      style={{
        width: 36, height: 36, borderRadius: 9,
        backgroundColor: own
          ? (theme.isDark ? 'rgba(255,59,48,0.16)' : 'rgba(255,59,48,0.10)')
          : (theme.isDark ? 'rgba(255,255,255,0.07)' : '#F1F1F4'),
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name={icon as any} size={size} color={color} />
    </View>
  );
}
