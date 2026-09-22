import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { solveTest, quotaConsume, quotaLeft } from '../apo/apoEngine';

interface Props {
  navigation: any;
  route: any;
}

export default function ApoSolvingScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const question: string = route?.params?.question ?? 'Вопрос';
  const options: string[] = route?.params?.options ?? [];
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = await quotaLeft();
        if (q.left <= 0) {
          if (alive) navigation.replace('Paywall');
          return;
        }
        const r = await solveTest(question, options);
        await quotaConsume();
        if (alive) {
          navigation.replace('ApoResult', {
            question,
            options,
            answerIndex: r.answerIndex,
            confidence: r.confidence,
            ms: r.ms,
            lowAccuracy: r.lowAccuracy,
          });
        }
      } catch (e) {
        if (alive) setError('Не удалось решить — попробуйте ещё раз');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={s.container}>
      <Pressable style={s.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#8A94A6" />
        <Text style={s.backText}>Отмена</Text>
      </Pressable>
      <Text style={s.title}>Решаю</Text>
      <View style={s.card}>
        <Text style={s.q}>{question}</Text>
        {error ? (
          <>
            <Text style={s.err}>{error}</Text>
            <Pressable style={s.cta} onPress={() => navigation.goBack()}>
              <Text style={s.ctaText}>Назад</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#4F7CFF" style={s.spin} />
            <Text style={s.hint}>Варианты оцениваются параллельно</Text>
          </>
        )}
      </View>
      <Text style={s.ghost}>Повторный вопрос отдаст кэш — мгновенно</Text>
    </View>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17', padding: 18, paddingTop: insets.top + 12 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backText: { color: '#8A94A6', fontSize: 13, fontWeight: '600' },
    title: { fontSize: 21, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    card: { backgroundColor: '#131A26', borderRadius: 16, padding: 16, marginTop: 12 },
    q: { fontSize: 16, fontWeight: '700', color: '#F2F5F9', lineHeight: 22 },
    spin: { marginTop: 22 },
    hint: { textAlign: 'center', fontSize: 13, color: '#8A94A6', marginTop: 10 },
    err: { fontSize: 14, color: '#FCA5A5', marginTop: 16, textAlign: 'center' },
    cta: { borderRadius: 12, padding: 12, marginTop: 12, backgroundColor: '#4F7CFF', alignItems: 'center' },
    ctaText: { fontWeight: '800', color: '#FFF' },
    ghost: { textAlign: 'center', fontSize: 13, color: '#5B6678', marginTop: 14 },
  });
}
