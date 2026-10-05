// Ветка-чат под задачей .smd: вопрос/ответ с контекстом задачи, аттачи,
// история переживает перезаходы (AsyncStorage на задачу).

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../hooks/useTheme';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import { askTask, chatIdFor, loadChat, saveChat, type AttachedImage, type ChatMsg } from '../smd/ai';
import { prettifySpans } from '../smd/smdRender';
import Markdown from 'react-native-markdown-display';

const MAX_TEXT_ATTACH = 20000;

interface Attach {
  name: string;
  text?: string;
  image?: AttachedImage;
}

export default function TaskChatScreen({ navigation, route }: any) {
  const { theme } = useTheme();
  const app = useAppSettingsOpt();
  const insets = useSafeAreaInsets();
  const fontSize = app?.fontSize ?? 16;
  const params = route?.params ?? {};
  const chatId: string = params.chatId ?? chatIdFor(params.uri ?? '', params.task ?? '');
  const title: string = params.title ?? 'Вопрос по задаче';
  const task: string = params.task ?? '';
  const solution: string = params.solution ?? '';

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState('');
  const [att, setAtt] = useState<Attach[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const mdStyle = {
    body: { color: theme.text, fontSize: fontSize * 0.94, lineHeight: 21 },
    paragraph: { marginVertical: 4 },
    strong: { fontWeight: '700' as const, color: theme.text },
    em: { fontStyle: 'italic' as const, color: theme.text },
    code_inline: { fontFamily: 'monospace', backgroundColor: theme.text + '12', color: theme.text },
    fence: { backgroundColor: theme.text + '0D', borderColor: theme.border, borderWidth: 1 },
    table: { borderWidth: 1, borderColor: theme.border },
    th: { padding: 6, fontWeight: '700' as const },
    td: { padding: 6 },
    tr: { borderBottomWidth: 1, borderColor: theme.border },
  };

  useEffect(() => {
    loadChat(chatId).then(setMsgs).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    saveChat(chatId, msgs).catch(() => {});
  }, [chatId, msgs]);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'text/*', 'application/json'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const name = a.name ?? 'файл';
      const mime = (a.mimeType ?? '').toLowerCase();
      if (mime.startsWith('image/')) {
        const b64 = await FileSystem.readAsStringAsync(a.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (b64.length > 4 * 1024 * 1024) {
          Alert.alert('Слишком большая картинка', 'Пришли файл до ~3 МБ.');
          return;
        }
        setAtt((p) => [...p, { name, image: { mime: mime || 'image/jpeg', base64: b64 } }]);
      } else {
        const text = await FileSystem.readAsStringAsync(a.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        setAtt((p) => [...p, { name, text: text.slice(0, MAX_TEXT_ATTACH) }]);
      }
    } catch (e: any) {
      Alert.alert('Не получилось приложить', String(e?.message ?? e));
    }
  };

  const send = async () => {
    const question = q.trim();
    if ((!question && att.length === 0) || busy) return;
    setQ('');
    setErr(null);
    setBusy(true);
    const images = att.filter((a) => a.image).map((a) => a.image as AttachedImage);
    const texts = att.filter((a) => a.text !== undefined);
    let full = question;
    for (const t of texts) full += `\n\n[Приложенный файл ${t.name}]:\n${t.text}`;
    const hist = [...msgs];
    const shown = question || `Приложено файлов: ${att.map((a) => a.name).join(', ')}`;
    setMsgs((p) => [...p, { role: 'user', text: shown }]);
    setAtt([]);
    try {
      const answer = await askTask(task, solution, hist, full || 'Объясни задачу.', { images });
      setMsgs((p) => [...p, { role: 'assistant', text: answer }]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    Alert.alert('Очистить ветку?', 'История вопросов по этой задаче удалится', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить', style: 'destructive', onPress: () => {
          setMsgs([]);
          saveChat(chatId, []).catch(() => {});
        },
      },
    ]);
  };

  return (
    <View style={[s.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={[s.head, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation?.goBack()} style={s.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[s.title, { color: theme.text, fontSize: 16 }]} numberOfLines={1}>{title}</Text>
        <Pressable onPress={clear} style={s.backBtn} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        ref={(r) => { scrollRef.current = r; }}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <View style={[s.taskCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[s.taskLabel, { color: theme.accent }]}>Задача (контекст помню)</Text>
          <Text style={{ color: theme.text, fontSize: fontSize * 0.9, lineHeight: 20 }} numberOfLines={4}>
            {task}
          </Text>
        </View>
        {msgs.map((m, i) => (
          <View
            key={i}
            style={[s.msg, m.role === 'user'
              ? { alignSelf: 'flex-end', backgroundColor: theme.accentSoft }
              : { alignSelf: 'flex-start', backgroundColor: theme.surface }]}
          >
            {m.role === 'user' ? (
              <Text style={{ color: theme.text, fontSize: fontSize * 0.94, lineHeight: 21 }}>{m.text}</Text>
            ) : (
              <Markdown style={mdStyle}>{prettifySpans(m.text)}</Markdown>
            )}
          </View>
        ))}
        {busy && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Думаю над задачей…</Text>
          </View>
        )}
        {err ? <Text style={{ color: '#EF4444', fontSize: 13, marginVertical: 4 }}>{err}</Text> : null}
      </ScrollView>

      {att.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 6 }}>
          {att.map((a, i) => (
            <Pressable
              key={i}
              onPress={() => setAtt((p) => p.filter((_, k) => k !== i))}
              style={[s.chip, { borderColor: theme.border, backgroundColor: theme.surface }]}
            >
              <Ionicons name={a.image ? 'image-outline' : 'document-text-outline'} size={14} color={theme.accent} />
              <Text style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{a.name}</Text>
              <Ionicons name="close" size={14} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={[s.bar, { borderTopColor: theme.border, paddingBottom: Math.max(10, insets.bottom) }]}>
        <Pressable onPress={pickFile} hitSlop={8} style={s.iconBtn}>
          <Ionicons name="attach-outline" size={24} color={theme.accent} />
        </Pressable>
        <TextInput
          style={[s.input, { borderColor: theme.border, color: theme.text, fontSize: fontSize * 0.94 }]}
          placeholder="Спроси по задаче…"
          placeholderTextColor={theme.textSecondary}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={send}
          returnKeyType="send"
          editable={!busy}
          multiline
        />
        <Pressable onPress={send} disabled={busy || (!q.trim() && att.length === 0)} hitSlop={8} style={s.iconBtn}>
          <Ionicons
            name="send"
            size={22}
            color={theme.accent}
            style={{ opacity: busy || (!q.trim() && att.length === 0) ? 0.4 : 1 }}
          />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  backBtn: { padding: 8 },
  title: { flex: 1, fontWeight: '600' },
  taskCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  taskLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msg: { maxWidth: '88%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 1, paddingHorizontal: 8, paddingTop: 8, gap: 4 },
  iconBtn: { padding: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 110 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 200 },
});
