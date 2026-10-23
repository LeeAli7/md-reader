// Ветка-чат под задачей: переработано целиком.
// • облачка с настоящими границами (текст больше не вылезает)
// • фото из галереи и файлы из хранилища
// • запрос живёт в фоне: вышел из приложения — ответ всё равно придёт в ветку
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../hooks/useTheme';
import { type as tp, font as uiFontOf } from '../theme/type';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import {
  askTask, appendChat, chatIdFor, getPending, loadChat, saveChat, setPending,
  type AttachedImage, type ChatMsg, type PendingJob,
} from '../smd/ai';
import { prettifySpans } from '../smd/smdRender';
import { Sheet } from '../components/Sheet';

const MAX_TEXT_ATTACH = 20000;
const PENDING_TTL = 20 * 60 * 1000;
const ZW = '\u200B';

interface Attach {
  name: string;
  uri?: string;
  text?: string;
  image?: AttachedImage;
}

// Длинное слово без пробелов (ссылка, токен, base64) не переносится и лезет
// за облачко. Вставляем невидимые точки переноса, текст остаётся тем же.
function softenLongWords(input: string): string {
  if (!input) return input;
  const parts = input.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => (part.startsWith('```') ? part : part.replace(/(\S{24})(?=\S)/g, `$1${ZW}`)))
    .join('');
}

function Typing({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 2 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: 0.35 + i * 0.2 }} />
      ))}
    </View>
  );
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
  const [ctxOpen, setCtxOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const aliveRef = useRef(true);
  const resumedRef = useRef(false);

  const bubbleText = { color: theme.text, fontSize: fontSize * 0.94, lineHeight: fontSize * 1.36 };

  const mdStyle: any = {
    body: { color: theme.text, fontSize: fontSize * 0.94, lineHeight: fontSize * 1.4 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    strong: { fontWeight: '700', color: theme.text },
    em: { fontStyle: 'italic', color: theme.text },
    bullet_list: { marginVertical: 2 },
    ordered_list: { marginVertical: 2 },
    code_inline: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, paddingHorizontal: 4, borderRadius: 4 },
    code_block: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 10, padding: 10, marginVertical: 4 },
    fence: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 10, padding: 10, marginVertical: 4 },
    table: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 8 },
    th: { padding: 6, fontWeight: '700', color: theme.text },
    td: { padding: 6, color: theme.text },
    tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.divider },
    link: { color: theme.accent },
    blockquote: { backgroundColor: theme.fill, borderLeftWidth: 3, borderLeftColor: theme.divider, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 4 },
  };

  useEffect(() => {
    aliveRef.current = true;
    loadChat(chatId).then((h) => { if (aliveRef.current) setMsgs(h); }).catch(() => {});
    return () => { aliveRef.current = false; };
  }, [chatId]);

  useEffect(() => {
    if (msgs.length > 0) saveChat(chatId, msgs).catch(() => {});
  }, [chatId, msgs]);

  // Продолжение запроса: если в прошлый раз человек вышел, а ответ не пришёл,
  // поднимаем вопрос и досылаем его ещё раз — ответ допишется в ветку.
  const resumePending = useCallback(async () => {
    if (resumedRef.current) return;
    const job = await getPending(chatId);
    if (!job || Date.now() - job.ts > PENDING_TTL) {
      if (job) await setPending(chatId, null);
      return;
    }
    resumedRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const answer = await askTask(task, solution, await loadChat(chatId), job.full, { images: job.images });
      await appendChat(chatId, { role: 'assistant', text: answer });
      if (aliveRef.current) setMsgs((p) => [...p, { role: 'assistant', text: answer }]);
    } catch (e: any) {
      if (aliveRef.current) setErr(e?.message ?? String(e));
    } finally {
      await setPending(chatId, null);
      if (aliveRef.current) setBusy(false);
    }
  }, [chatId, task, solution]);

  useEffect(() => {
    resumePending();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') resumePending();
    });
    return () => sub.remove();
  }, [resumePending]);

  const pickPhotos = async () => {
    setMenu(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа к фото', 'Разрешите доступ в настройках телефона.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.6,
        base64: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const next: Attach[] = [];
      for (const a of res.assets) {
        if (!a.base64) continue;
        if (a.base64.length > 4 * 1024 * 1024) {
          Alert.alert('Слишком большая картинка', `${a.fileName ?? 'фото'} — больше 3 МБ, пропустил.`);
          continue;
        }
        next.push({
          name: a.fileName ?? `фото-${next.length + 1}.jpg`,
          uri: a.uri,
          image: { mime: a.mimeType ?? 'image/jpeg', base64: a.base64 },
        });
      }
      if (next.length) setAtt((p) => [...p, ...next]);
    } catch (e: any) {
      Alert.alert('Не получилось приложить фото', String(e?.message ?? e));
    }
  };

  const pickFiles = async () => {
    setMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const next: Attach[] = [];
      for (const a of res.assets) {
        const name = a.name ?? 'файл';
        const mime = (a.mimeType ?? '').toLowerCase();
        if (mime.startsWith('image/')) {
          const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
          if (b64.length <= 4 * 1024 * 1024) {
            next.push({ name, uri: a.uri, image: { mime: mime || 'image/jpeg', base64: b64 } });
          }
          continue;
        }
        const text = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.UTF8 });
        next.push({ name, text: text.slice(0, MAX_TEXT_ATTACH) });
      }
      if (next.length) setAtt((p) => [...p, ...next]);
    } catch (e: any) {
      Alert.alert('Не получилось приложить', String(e?.message ?? e));
    }
  };

  const send = async () => {
    const question = q.trim();
    if ((!question && att.length === 0) || busy) return;
    const images = att.filter((a) => a.image).map((a) => a.image as AttachedImage);
    const texts = att.filter((a) => a.text !== undefined);
    let full = question;
    for (const t of texts) full += `\n\n[Приложенный файл ${t.name}]:\n${t.text}`;
    const shown = question || `Приложено: ${att.map((a) => a.name).join(', ')}`;
    const history = [...msgs];

    const userMsg: ChatMsg = { role: 'user', text: shown, images: att.filter((a) => a.uri).map((a) => a.uri!) } as ChatMsg;
    setMsgs((p) => [...p, userMsg]);
    appendChat(chatId, userMsg).catch(() => {});
    setQ('');
    setAtt([]);
    setErr(null);
    setBusy(true);

    const job: PendingJob = { question, full: full || 'Объясни задачу.', shown, images, ts: Date.now() };
    await setPending(chatId, job);

    // Не привязываем запрос к экрану: он продолжится, даже если экран закрыт.
    askTask(task, solution, history, job.full, { images })
      .then(async (answer) => {
        await appendChat(chatId, { role: 'assistant', text: answer });
        if (aliveRef.current) setMsgs((p) => [...p, { role: 'assistant', text: answer }]);
      })
      .catch((e: any) => {
        if (aliveRef.current) setErr(e?.message ?? String(e));
      })
      .finally(async () => {
        await setPending(chatId, null);
        if (aliveRef.current) setBusy(false);
      });
  };

  const clear = () => {
    setMenu(false);
    Alert.alert('Очистить ветку?', 'История вопросов по этой задаче удалится', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить',
        style: 'destructive',
        onPress: () => {
          setMsgs([]);
          saveChat(chatId, []).catch(() => {});
          setPending(chatId, null).catch(() => {});
        },
      },
    ]);
  };

  const canSend = (!!q.trim() || att.length > 0) && !busy;

  return (
    <View style={[s.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Шапка без полосы: заголовок и тихая кнопка меню */}
      <View style={s.head}>
        <Pressable onPress={() => navigation?.goBack()} hitSlop={10} style={s.headBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.accent} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[s.sub, { color: theme.textSecondary }]} numberOfLines={1}>ветка по задаче</Text>
        </View>
        <Pressable onPress={() => setMenu(true)} hitSlop={10} style={s.headBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={(r) => { scrollRef.current = r; }}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 18 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {/* Контекст задачи: свёрнут в две строки, разворачивается тапом */}
          {task ? (
            <Pressable
              onPress={() => setCtxOpen((v) => !v)}
              style={[s.ctx, { backgroundColor: theme.surfaceAlt, borderColor: theme.divider }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.ctxLabel, { color: theme.textSecondary }]}>ЗАДАЧА</Text>
                <Ionicons name={ctxOpen ? 'chevron-up' : 'chevron-down'} size={13} color={theme.textSecondary} />
              </View>
              <Text style={[bubbleText, { color: theme.text }]} numberOfLines={ctxOpen ? undefined : 2}>
                {task}
              </Text>
            </Pressable>
          ) : null}

          {msgs.length === 0 && !busy ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={30} color={theme.textTertiary} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>Спросите по задаче</Text>
              <Text style={[s.emptySub, { color: theme.textSecondary }]}>
                Можно приложить фото условия или текстовый файл.
              </Text>
              <View style={s.hints}>
                {['Объясни проще', 'Реши по шагам', 'Где я ошибся?'].map((h) => (
                  <Pressable key={h} onPress={() => setQ(h)} style={[s.hint, { borderColor: theme.divider }]}>
                    <Text style={{ color: theme.accent, fontSize: 13 }}>{h}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {msgs.map((m, i) => {
            const mine = m.role === 'user';
            return (
              <View
                key={i}
                style={[
                  s.row,
                  mine ? s.rowMine : s.rowTheirs,
                ]}
              >
                <View
                  style={[
                    s.bubble,
                    mine
                      ? { backgroundColor: theme.accent, borderBottomRightRadius: 6 }
                      : { backgroundColor: theme.surface, borderBottomLeftRadius: 6, borderColor: theme.divider, borderWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  {m.images && m.images.length > 0 ? (
                    <View style={{ gap: 6, marginBottom: m.text ? 8 : 0 }}>
                      {m.images.map((uri, k) => (
                        <Image key={k} source={{ uri }} style={s.msgImage} resizeMode="cover" />
                      ))}
                    </View>
                  ) : null}
                  {mine ? (
                    <Text
                      style={[bubbleText, { color: theme.onAccent }]}
                      selectable
                    >
                      {softenLongWords(m.text)}
                    </Text>
                  ) : (
                    <Markdown style={mdStyle}>{softenLongWords(prettifySpans(m.text, true))}</Markdown>
                  )}
                </View>
              </View>
            );
          })}

          {busy ? (
            <View style={[s.row, s.rowTheirs]}>
              <View style={[s.bubble, { backgroundColor: theme.surface, borderColor: theme.divider, borderWidth: StyleSheet.hairlineWidth }]}>
                <Typing color={theme.textSecondary} />
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 6 }}>
                  Думаю. Можно выйти — ответ придёт в ветку.
                </Text>
              </View>
            </View>
          ) : null}

          {err ? (
            <View style={[s.errBox, { borderColor: theme.red }]}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.red} />
              <Text style={{ color: theme.red, fontSize: 13, flex: 1 }}>{err}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Вложения до отправки */}
        {att.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tray}>
            {att.map((a, i) => (
              <Pressable
                key={i}
                onPress={() => setAtt((p) => p.filter((_, k) => k !== i))}
                style={[s.chip, { borderColor: theme.divider, backgroundColor: theme.surface }]}
              >
                {a.uri ? (
                  <Image source={{ uri: a.uri }} style={s.chipThumb} />
                ) : (
                  <Ionicons name="document-text-outline" size={15} color={theme.accent} />
                )}
                <Text style={{ color: theme.text, fontSize: 12, maxWidth: 130 }} numberOfLines={1}>{a.name}</Text>
                <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* Поле ввода: капсула, «+» и отправка */}
        <View style={[s.bar, { paddingBottom: Math.max(10, insets.bottom) }]}>
          <Pressable onPress={() => setMenu(true)} hitSlop={6} style={[s.round, { backgroundColor: theme.fill }]}>
            <Ionicons name="add" size={24} color={theme.text} />
          </Pressable>
          <TextInput
            style={[s.input, { backgroundColor: theme.fill, color: theme.text, fontSize: fontSize * 0.94 }]}
            placeholder="Сообщение…"
            placeholderTextColor={theme.textSecondary}
            value={q}
            onChangeText={setQ}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            hitSlop={6}
            style={[s.round, { backgroundColor: canSend ? theme.accent : theme.fill }]}
          >
            <Ionicons name={busy ? 'hourglass-outline' : 'arrow-up'} size={20} color={canSend ? theme.onAccent : theme.textSecondary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={menu} onClose={() => setMenu(false)} bg={theme.surface} paddingBottom={insets.bottom + 10}>
        <View style={s.sheetBody}>
          <View style={[s.grabber, { backgroundColor: theme.textTertiary }]} />
          <Pressable onPress={pickPhotos} style={[s.action, { borderBottomColor: theme.divider }]}>
            <Ionicons name="image-outline" size={21} color={theme.text} />
            <Text style={[s.actionText, { color: theme.text }]}>Фото из галереи</Text>
          </Pressable>
          <Pressable onPress={pickFiles} style={[s.action, { borderBottomColor: theme.divider }]}>
            <Ionicons name="document-outline" size={21} color={theme.text} />
            <Text style={[s.actionText, { color: theme.text }]}>Файл с телефона</Text>
          </Pressable>
          <Pressable onPress={clear} style={s.action}>
            <Ionicons name="trash-outline" size={21} color={theme.red} />
            <Text style={[s.actionText, { color: theme.red }]}>Очистить ветку</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, minHeight: 48 },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...tp.headline, fontFamily: uiFontOf(600), maxWidth: 240 },
  sub: { fontSize: 11, marginTop: 1 },
  ctx: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 16 },
  ctxLabel: { fontSize: 10, letterSpacing: 0.6, fontFamily: uiFontOf(600), marginBottom: 4 },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyTitle: { ...tp.headline, marginTop: 12 },
  emptySub: { ...tp.footnote, textAlign: 'center', marginTop: 6 },
  hints: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 },
  hint: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  row: { flexDirection: 'row', marginBottom: 10 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  // maxWidth + flexShrink: облачко не может вырасти шире экрана,
  // а текст внутри переносится, а не вылезает за скругление.
  bubble: { maxWidth: '84%', minWidth: 44, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, flexShrink: 1 },
  msgImage: { width: 200, height: 160, borderRadius: 12, backgroundColor: 'rgba(120,120,128,0.15)' },
  errBox: { flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, marginTop: 4 },
  tray: { gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  chipThumb: { width: 28, height: 28, borderRadius: 7 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, maxHeight: 120, minHeight: 38 },
  sheetBody: { paddingHorizontal: 18 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.5 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  actionText: { ...tp.body },
});
