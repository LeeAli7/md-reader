import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  tags: string[];
  theme: any;
  selected?: string | null;
  onPress?: (tag: string) => void;
}

// Ряд чипсов тегов. Без onPress — только отображение.
export function TagChips({ tags, theme, selected, onPress }: Props) {
  if (!tags || tags.length === 0) return null;
  return (
    <View style={s.row}>
      {tags.map((t) => {
        const active = selected === t;
        return (
          <Pressable
            key={t}
            disabled={!onPress}
            onPress={() => onPress && onPress(t)}
            style={[
              s.chip,
              { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : 'transparent' },
            ]}
          >
            <Text style={[s.text, { color: active ? theme.accent : theme.textSecondary }]} numberOfLines={1}>
              #{t}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, maxWidth: 140 },
  text: { fontSize: 12 },
});
