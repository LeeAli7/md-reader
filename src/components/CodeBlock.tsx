import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

declare const require: any;

// Копирование опционально: expo-clipboard подтянется зависимостями,
// без него кнопка тихо пишет в консоль вместо падения.
function getClipboard(): any | null {
  try {
    return require('expo-clipboard');
  } catch {
    return null;
  }
}

export function CodeBlock({ code, rt }: { code: string; rt: { bg: string; text: string } }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const cb = getClipboard();
    if (cb && cb.setStringAsync) {
      try {
        await cb.setStringAsync(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {}
    }
  };

  return (
    <View style={[s.wrap, { backgroundColor: rt.text + '10' }]}>
      <Pressable onPress={copy} hitSlop={10} style={s.btn}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={rt.text + '80'} />
        {copied && <Text style={[s.hint, { color: rt.text + '80' }]}>Скопировано</Text>}
      </Pressable>
      <Text selectable style={[s.code, { color: rt.text }]}>{code}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 8, padding: 16, paddingTop: 34, marginVertical: 8, position: 'relative' },
  btn: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  hint: { fontSize: 11 },
  code: { fontSize: 13, lineHeight: 20, fontFamily: 'FiraCode' },
});
