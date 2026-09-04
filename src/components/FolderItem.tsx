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

export function FolderItem({ entry, theme, onPress, onLongPress, onDelete }: Props) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[s.container, { borderBottomColor: theme.divider }]}>
      <View style={[s.iconWrap, { backgroundColor: theme.accentSoft }]}>
        <Ionicons name="folder" size={22} color={theme.accent} />
      </View>
      <View style={s.info}>
        <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{entry.name}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      <Pressable onPress={onDelete} hitSlop={10} style={s.delBtn}>
        <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
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
  delBtn: { padding: 8, marginLeft: 4 },
});
