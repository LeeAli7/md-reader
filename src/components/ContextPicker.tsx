import React, { useMemo, useState } from 'react';
import {
  FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { font } from '../theme/type';
import type { ContextItem } from '../smd/contextItems';

// Выбор контекста: те же блоки можно взять и из читалки (кружок ассистента),
// и из чата («+ контекст»), поэтому компонент ничего не знает о документе.
export function ContextPicker({
  visible, items, selected, onToggle, onClose, onConfirm, title = 'Что добавить в вопрос',
}: {
  visible: boolean;
  items: ContextItem[];
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [q, setQ] = useState('');
  const chosen = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => (it.label + ' ' + it.text).toLowerCase().includes(needle));
  }, [items, q]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={onClose} />
        <View
          style={[
            s.sheet,
            {
              maxHeight: win.height * 0.62,
              backgroundColor: theme.bg,
              paddingBottom: insets.bottom + 10,
              borderColor: theme.divider,
            },
          ]}
        >
          <View style={[s.handle, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : theme.divider }]} />
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={[s.search, { backgroundColor: theme.fill, borderColor: theme.divider }]}>
            <Ionicons name="search" size={16} color={theme.textTertiary} />
            <TextInput
              style={[s.searchInput, { color: theme.text }]}
              placeholder="Найти блок"
              placeholderTextColor={theme.textTertiary}
              value={q}
              onChangeText={setQ}
            />
            {q.length > 0 ? (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={theme.textTertiary} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={shown}
            keyExtractor={(it) => it.id}
            style={{ flexGrow: 0 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            windowSize={7}
            ListEmptyComponent={
              <Text style={[s.empty, { color: theme.textSecondary }]}>
                {items.length ? 'Ничего не нашлось' : 'В этом документе не нашлось текста для контекста.'}
              </Text>
            }
            renderItem={({ item }) => {
              const on = chosen.has(item.id);
              return (
                <Pressable
                  onPress={() => onToggle(item.id)}
                  style={({ pressed }) => [
                    s.row,
                    { borderBottomColor: theme.divider, backgroundColor: pressed ? theme.fill : 'transparent' },
                  ]}
                >
                  <View
                    style={[
                      s.box,
                      { borderColor: on ? theme.text : theme.divider, backgroundColor: on ? theme.text : 'transparent' },
                    ]}
                  >
                    {on ? <Ionicons name="checkmark" size={14} color={theme.bg} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: theme.text }]} numberOfLines={1}>{item.label}</Text>
                    <Text style={[s.preview, { color: theme.textSecondary }]} numberOfLines={2}>
                      {item.text.replace(/\n+/g, ' ').slice(0, 160)}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />

          <Pressable
            onPress={onConfirm}
            disabled={!selected.length}
            style={[s.cta, { backgroundColor: selected.length ? theme.text : theme.fill }]}
          >
            <Text style={[s.ctaText, { color: selected.length ? theme.bg : theme.textSecondary }]}>
              {selected.length ? `Добавить (${selected.length})` : 'Выберите блоки'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  title: { fontSize: 19, fontFamily: font(600), letterSpacing: -0.2 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 99, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, height: 40, marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: font(400), paddingVertical: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 15, fontFamily: font(500) },
  preview: { fontSize: 12.5, fontFamily: font(400), marginTop: 2, lineHeight: 17 },
  empty: { fontSize: 14, fontFamily: font(400), paddingVertical: 24, textAlign: 'center' },
  cta: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  ctaText: { fontSize: 15, fontFamily: font(600) },
});
