import React from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export interface Heading {
  level: number;
  title: string;
  charIndex: number;
}

interface Props {
  visible: boolean;
  headings: Heading[];
  theme: any;
  rtText: string;
  rtBg: string;
  onClose: () => void;
  onSelect: (h: Heading) => void;
}

// Оглавление: список заголовков H1–H3, тап прыгает к месту в тексте.
export function ReaderTOC({ visible, headings, theme, rtText, rtBg, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.drawer, { backgroundColor: rtBg, paddingTop: insets.top + 12 }]}>
          <View style={s.head}>
            <Text style={[s.title, { color: rtText }]}>Оглавление</Text>
            <Pressable onPress={onClose} hitSlop={10} style={s.close}>
              <Ionicons name="close" size={22} color={rtText} />
            </Pressable>
          </View>
          {headings.length === 0 ? (
            <Text style={[s.empty, { color: rtText + '70' }]}>Заголовков нет</Text>
          ) : (
            <FlatList
              data={headings}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Pressable onPress={() => onSelect(item)} style={s.row}>
                  <Text
                    style={[{ color: rtText, fontSize: item.level === 1 ? 15 : 14, fontWeight: item.level === 1 ? '600' : '400', marginLeft: (item.level - 1) * 14 }]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer: { width: '78%', maxWidth: 320, height: '100%', paddingHorizontal: 16, paddingBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  close: { padding: 6 },
  empty: { fontSize: 14, marginTop: 20, textAlign: 'center' },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8884' },
});
