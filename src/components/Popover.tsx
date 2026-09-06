import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MenuAction } from './OverflowMenu';

interface Props {
  visible: boolean;
  x: number;
  y: number;
  actions: MenuAction[];
  theme: any;
  title?: string;
  onClose: () => void;
}

const W = 248;
const ROW_H = 48;

// Попап рядом с кнопкой (плюсик, ⋮): позиционируется по точке нажатия,
// зажимается в экран, открывается вверх если точка в нижней половине.
export function Popover({ visible, x, y, actions, theme, title, onClose }: Props) {
  const { width: SW, height: SH } = Dimensions.get('window');
  const estH = (title ? 34 : 12) + actions.length * ROW_H + 20;
  const left = Math.max(8, Math.min(x, SW - W - 8));
  const openUp = y > SH * 0.55;
  const top = openUp ? Math.max(8, y - estH - 8) : Math.min(y + 8, SH - estH - 8);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.box, { left, top, width: W, backgroundColor: theme.surface, borderColor: theme.border }]}>
        {!!title && (
          <Text style={[s.title, { color: theme.textSecondary, borderBottomColor: theme.divider }]} numberOfLines={1}>
            {title}
          </Text>
        )}
        {actions.map((a, i) => (
          <Pressable
            key={i}
            onPress={() => { onClose(); setTimeout(a.onPress, 50); }}
            style={[s.row, i < actions.length - 1 && { borderBottomColor: theme.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
          >
            <Ionicons name={a.icon as any} size={19} color={a.danger ? '#EF4444' : theme.accent} />
            <Text style={[s.label, { color: a.danger ? '#EF4444' : theme.text }]} numberOfLines={1}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  box: {
    position: 'absolute', borderRadius: 14, borderWidth: 1,
    paddingVertical: 6, paddingHorizontal: 6,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  title: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, height: ROW_H },
  label: { fontSize: 14, flex: 1 },
});
