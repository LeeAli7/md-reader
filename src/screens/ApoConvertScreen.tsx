import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../hooks/useTheme';
import { ingestFile, parsePastedTest } from '../apo/apoEngine';

interface Props {
  navigation: any;
  route: any;
}

export default function ApoConvertScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);
  const incoming = (route?.params?.files ?? []) as { name: string; uri: string }[];
  const [files, setFiles] = useState(incoming);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const pickDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        const f = res.assets[0];
        setFiles((prev) => [...prev, { name: f.name, uri: f.uri }]);
      }
    } catch (e) {
      console.warn('doc pick error:', e);
    }
  };

  const startSolve = async () => {
    if (files.length === 0 && !text.trim()) {
      Alert.alert('Нет материала', 'Добавьте фото, документ или вставьте текст');
      return;
    }
    setBusy(true);
    try {
      // Текст идёт напрямую; файлы — через ingestFile (OCR/парсеры подключит Ares).
      const fromText = text.trim() ? [parsePastedTest(text)] : [];
      let fileQs: { id: string; stem: string; options: { key: string; text: string }[] }[] = [];
      const warns: string[] = [];
      for (const f of files) {
        const r = await ingestFile(f.name, '');
        warns.push(...r.warnings.map((w) => `${f.name}: ${w}`));
        fileQs = fileQs.concat(r.questions as any);
      }
      const all = fromText.concat(fileQs);
      if (all.length === 0) {
        // Файлы без извлекаемого текста: ведём на ручной ввод текста.
        setWarnings(warns.length ? warns : ['Файлы пока без текста — вставьте текст вручную']);
        setBusy(false);
        return;
      }
      setWarnings(warns);
      const q = all[0];
      navigation.navigate('ApoSolving', {
        question: q.stem,
        options: q.options.map((o) => o.text),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Pressable style={s.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#8A94A6" />
        <Text style={s.backText}>Назад</Text>
      </Pressable>
      <Text style={s.title}>Подготовка</Text>

      {files.map((f, i) => (
        <View key={i} style={s.file}>
          <Ionicons name="document-text" size={20} color={theme.accent} />
          <View style={s.fileText}>
            <Text style={s.fileName}>{f.name}</Text>
            <Text style={s.fileSub}>к решению</Text>
          </View>
          <Pressable onPress={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
            <Ionicons name="close" size={18} color="#5B6678" />
          </Pressable>
        </View>
      ))}

      <Pressable style={s.addBtn} onPress={pickDoc}>
        <Ionicons name="add" size={18} color={theme.accent} />
        <Text style={s.addText}>Добавить PDF / Word / изображение</Text>
      </Pressable>

      <Text style={s.sect}>Или вставьте текст</Text>
      <TextInput
        style={s.input}
        multiline
        placeholder="Вопрос и варианты — разложим сами"
        placeholderTextColor="#5B6678"
        value={text}
        onChangeText={setText}
      />

      {warnings.map((w, i) => (
        <View key={i} style={s.warn}>
          <Ionicons name="warning" size={16} color="#FCD34D" />
          <Text style={s.warnText}>{w}</Text>
        </View>
      ))}

      <Pressable style={s.cta} onPress={startSolve} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={s.ctaText}>Решить</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </>
        )}
      </Pressable>
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
    file: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D121C', borderRadius: 12, padding: 12, marginTop: 8 },
    fileText: { flex: 1 },
    fileName: { fontSize: 13.5, fontWeight: '600', color: '#F2F5F9' },
    fileSub: { fontSize: 11.5, color: '#8A94A6', marginTop: 2 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#131A26', borderRadius: 12, padding: 13 },
    addText: { fontSize: 13.5, fontWeight: '600', color: theme.accent },
    sect: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#5B6678', marginTop: 16 },
    input: { backgroundColor: '#0D121C', borderRadius: 12, padding: 12, fontSize: 14, color: '#F2F5F9', minHeight: 110, marginTop: 8, textAlignVertical: 'top' },
    warn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(251,191,36,.07)', borderRadius: 12, padding: 11, marginTop: 8 },
    warnText: { fontSize: 12.5, color: '#B9C3D4', flex: 1 },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 15, marginTop: 14, backgroundColor: '#4F7CFF' },
    ctaText: { fontWeight: '800', fontSize: 16, color: '#FFF' },
  });
}
