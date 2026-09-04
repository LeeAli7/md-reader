import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FileEntry } from '../screens/FileBrowserScreen';

interface Props {
  entry: FileEntry;
  theme: any;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
}

export function FileItem({ entry, theme, onPress, onLongPress, onDelete }: Props) {
  const ext = entry.name.split('.').pop()?.toLowerCase();
  const icon = ext === 'md' ? 'document-text' : 'document';

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[s.container, { borderBottomColor: theme.divider }]}>
      <View style={[s.iconWrap, { backgroundColor: theme.accentSoft }]}>
        <Ionicons name={icon as any} size={22} color={theme.accent} />
      </View>
      <View style={s.info}>
        <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{entry.name}</Text>
        <Text style={[s.meta, { color: theme.textSecondary }]}>
          {formatSize(entry.size)} · {formatDate(entry.modifiedAt)}
        </Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} style={s.delBtn}>
        <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1048576).toFixed(1)} МБ`;
}

function formatDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '500' },
  meta: { fontSize: 12, marginTop: 2 },
  delBtn: { padding: 8 },
});
