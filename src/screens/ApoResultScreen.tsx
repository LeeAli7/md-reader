import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { APO_CONFIDENCE_THRESHOLD, APO_KEYS } from '../apo/apoTypes';
import { explainText } from '../apo/apoEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const require: any;

interface Props {
  navigation: any;
  route: any;
}

function loadShare(): any | null {
  try {
    return require('expo-sharing');
  } catch {
    return null;
  }
}

function loadClipboard(): any | null {
  try {
    return require('expo-clipboard');
  } catch {
    return null;
  }
}

export default function ApoResultScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const p = route?.params ?? {};
  const historyMode = p.history === true;
  const question: string = p.question ?? 'Вопрос';
  const options: string[] = p.options ?? [];
  const answerIndex: number = p.answerIndex ?? 0;
  const confidence: number[] = p.confidence ?? [];
  const ms: number = p.ms ?? 0;
  const lowAccuracy: boolean = p.lowAccuracy ?? false;
  const answer = options[answerIndex] ?? '—';
  const top = confidence[answerIndex] ?? 0;
  const [explain, setExplain] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  React.useEffect(() => {
    if (historyMode) {
      (async () => {
        const raw = await AsyncStorage.getItem(APO_KEYS.history);
        setHistory(raw ? JSON.parse(raw) : []);
      })();
    } else if (p.question) {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(APO_KEYS.history);
          const list = raw ? JSON.parse(raw) : [];
          list.unshift({
            id: String(Date.now()),
            stem: question,
            answer,
            confidence: top,
            at: Date.now(),
          });
          await AsyncStorage.setItem(APO_KEYS.history, JSON.stringify(list.slice(0, 100)));
        } catch { /* noop */ }
      })();
    }
  }, []);

  const onExplain = async () => {
    setExplainBusy(true);
    try {
      const t = await explainText(question, answer);
      setExplain(t);
    } finally {
      setExplainBusy(false);
    }
  };

  const onCopy = async () => {
    const C = loadClipboard();
    if (C) await C.setStringAsync(`${question}\nОтвет: ${answer}`);
    Alert.alert('Скопировано', 'Ответ в буфере обмена');
  };

  const onShare = async () => {
    const Sharing = loadShare();
    if (!Sharing) {
      onCopy();
      return;
    }
    Alert.alert('Поделиться', 'Экспорт карточки — в следующей итерации');
  };

  if (historyMode) {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <Text style={s.title}>История</Text>
        {history.length === 0 && <Text style={s.ghost}>Пока пусто — решите первый тест</Text>}
        {history.map((h: any) => (
          <View key={h.id} style={s.card}>
            <Text style={s.q}>{h.stem}</Text>
            <Text style={s.ansSmall}>{h.answer} · {Math.round((h.confidence ?? 0) * 100)}%</Text>
          </View>
        ))}
        <Pressable style={s.cta} onPress={() => navigation.navigate('ApoHome')}>
          <Text style={s.ctaText}>Новый тест</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Pressable style={s.back} onPress={() => navigation.navigate('ApoHome')}>
        <Ionicons name="arrow-back" size={18} color="#8A94A6" />
        <Text style={s.backText}>К тестам</Text>
      </Pressable>

      <View style={s.ans}>
        <Text style={s.ansLab}>Ответ · {(ms / 1000).toFixed(1)} c</Text>
        <Text style={s.ansBig}>{answer}</Text>
        {options.map((o, i) => (
          <View key={i} style={s.prob}>
            <Text style={s.probText}>{o}</Text>
            <Text style={s.probVal}>{Math.round((confidence[i] ?? 0) * 100)}%</Text>
          </View>
        ))}
      </View>

      {lowAccuracy && (
        <View style={s.warn}>
          <Ionicons name="warning" size={18} color="#FCD34D" />
          <View style={s.warnTextWrap}>
            <Text style={s.warnTitle}>Точность ниже 75% — проверьте ответ</Text>
            <Text style={s.warnSub}>
              Уверенность {Math.round(top * 100)}%, порог {(APO_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%.
              Разбор — по кнопке ниже.
            </Text>
          </View>
        </View>
      )}

      <Pressable style={s.explainBtn} onPress={onExplain} disabled={explainBusy}>
        {explainBusy ? (
          <ActivityIndicator color="#B9C9EE" />
        ) : (
          <>
            <Ionicons name="document-text" size={18} color="#B9C9EE" />
            <Text style={s.explainText}>Объяснить подробнее</Text>
          </>
        )}
      </Pressable>

      {explain && (
        <View style={s.card}>
          <Text style={s.expl}>{explain}</Text>
        </View>
      )}

      <View style={s.actions}>
        <Pressable style={s.chip} onPress={onCopy}>
          <Ionicons name="copy-outline" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>Копировать</Text>
        </Pressable>
        <Pressable style={s.chip} onPress={onShare}>
          <Ionicons name="share-outline" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>Поделиться</Text>
        </Pressable>
        <Pressable style={s.chip} onPress={() => navigation.navigate('ApoHome')}>
          <Ionicons name="add" size={16} color="#D5DCE8" />
          <Text style={s.chipText}>Следующий</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17' },
    content: { padding: 18, paddingTop: insets.top + 12, paddingBottom: 40 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backText: { color: '#8A94A6', fontSize: 13, fontWeight: '600' },
    title: { fontSize: 21, fontWeight: '800', color: '#F2F5F9', marginTop: 10 },
    ans: { borderRadius: 16, padding: 16, marginTop: 12, backgroundColor: 'rgba(52,211,153,.08)', borderWidth: 1.5, borderColor: '#34D399' },
    ansLab: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#34D399', textTransform: 'uppercase' },
    ansBig: { fontSize: 18, fontWeight: '800', color: '#F2F5F9', marginTop: 4 },
    prob: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#161D2A' },
    probText: { fontSize: 13.5, color: '#B9C3D4', flex: 1 },
    probVal: { fontSize: 13.5, fontWeight: '800', color: '#F2F5F9' },
    warn: { flexDirection: 'row', gap: 10, marginTop: 10, borderWidth: 1.5, borderColor: 'rgba(251,191,36,.5)', backgroundColor: 'rgba(251,191,36,.07)', borderRadius: 14, padding: 13 },
    warnTextWrap: { flex: 1 },
    warnTitle: { fontSize: 13.5, fontWeight: '700', color: '#FCD34D' },
    warnSub: { fontSize: 12.5, color: '#B9C3D4', marginTop: 4, lineHeight: 18 },
    explainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, borderWidth: 1.5, borderColor: '#4F7CFF', borderRadius: 12, padding: 12 },
    explainText: { fontSize: 13.5, fontWeight: '800', color: '#B9C9EE' },
    card: { backgroundColor: '#131A26', borderRadius: 16, padding: 14, marginTop: 10 },
    q: { fontSize: 15, fontWeight: '700', color: '#F2F5F9' },
    ansSmall: { fontSize: 13, color: '#8A94A6', marginTop: 4 },
    expl: { fontSize: 13.5, lineHeight: 21, color: '#C6CFDD' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#131A26', borderRadius: 12, padding: 12 },
    chipText: { fontSize: 13, fontWeight: '700', color: '#D5DCE8' },
    cta: { borderRadius: 16, padding: 15, marginTop: 14, backgroundColor: '#4F7CFF', alignItems: 'center' },
    ctaText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
    ghost: { fontSize: 13, color: '#5B6678', marginTop: 12 },
  });
}
