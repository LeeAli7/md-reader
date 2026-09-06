import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface MenuAction {
  icon: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  theme: any;
  accentText?: string;
  onClose: () => void;
}

// Нижнее ⋮-меню: единый список действий для файла и Reader.
export function OverflowMenu({ visible, title, actions, theme, accentText, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={s.handle} />
          {!!title && (
            <Text style={[s.title, { color: accentText || theme.textSecondary }]} numberOfLines={1}>
              {title}
            </Text>
          )}
          <ScrollView style={s.list}>
            {actions.map((a, i) => (
              <Pressable
                key={i}
                onPress={() => { onClose(); setTimeout(a.onPress, 50); }}
                style={[s.row, { borderBottomColor: theme.divider }]}
              >
                <Ionicons
                  name={a.icon as any}
                  size={20}
                  color={a.danger ? '#EF4444' : theme.accent}
                />
                <Text style={[s.label, { color: a.danger ? '#EF4444' : theme.text }]}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CCC', alignSelf: 'center', marginBottom: 12 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '70%' },
  title: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 15 },
});
