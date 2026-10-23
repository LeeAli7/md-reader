import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  tags: string[];
  theme: any;
  selected?: string | null;
  onPress?: (tag: string) => void;
  max?: number;
}

// Ряд чипсов тегов. Без onPress — только отображение.
// Лишние не обрезаются молча: показываем «+N», иначе теги теряются визуально.
export function TagChips({ tags, theme, selected, onPress, max = 2 }: Props) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <View style={s.row}>
      {shown.map((t) => {
        const active = selected === t;
        return (
          <Pressable
            key={t}
            disabled={!onPress}
            onPress={() => onPress && onPress(t)}
            style={[
              s.chip,
              { borderColor: active ? theme.accent : theme.divider, backgroundColor: active ? theme.accentSoft : 'transparent' },
            ]}
          >
            <Text style={[s.text, { color: active ? theme.accent : theme.textSecondary }]} numberOfLines={1}>
              #{t}
            </Text>
          </Pressable>
        );
      })}
      {rest > 0 && (
        <View style={[s.chip, { borderColor: 'transparent', backgroundColor: theme.fill }]}>
          <Text style={[s.text, { color: theme.textSecondary }]}>+{rest}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 130 },
  text: { fontSize: 11, lineHeight: 15 },
});
