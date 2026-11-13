// Ветка-чат под задачей — переписана по-человечески.
// • ответ — не облачко, а текст документа: колонка во всю ширину, шрифт чтения,
//   формулы через тот же math-движок, что и в .smd
// • цветных пузырей нет: человек — серая плашка справа, помощник — чистый текст
// • запрос живёт в модуле ai.ts: выход из чата/приложения его не рвёт,
//   ответ дописывается в ветку и подхватывается при возврате
// • ввод — одно поле с действиями внутри, контекст задачи — в шапке, а не в ленте
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { type as tp, font as uiFontOf } from '../theme/type';
import { useReadingStyle } from '../context/AppSettingsContext';
import {
  abortAi, aiStartedAt, appendChat, chatIdFor, getPending, isAiRunning, loadChat,
  runAskTask, saveChat, setPending, subscribeAi,
  type AttachedImage, type ChatMsg, type PendingJob,
} from '../smd/ai';
import { RichAnswer } from '../smd/smdRender';
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
// за край. Вставляем невидимые точки переноса, текст остаётся тем же.
function softenLongWords(input: string): string {
  if (!input) return input;
  const parts = input.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => (part.startsWith('```') ? part : part.replace(/(\S{24})(?=\S)/g, `$1${ZW}`)))
    .join('');
}

function Typing({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 420, useNativeDriver: true }),
          Animated.delay(420 - i * 140),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: v }} />
      ))}
    </View>
  );
}

/** История без последнего вопроса: он уже приходит в job.full, дублировать нельзя. */
async function historyBeforeLastUser(chatId: string): Promise<ChatMsg[]> {
  const h = await loadChat(chatId);
  return h.length > 0 && h[h.length - 1].role === 'user' ? h.slice(0, -1) : h;
}

export default function TaskChatScreen({ navigation, route }: any) {
  const { theme, isDark } = useTheme();
  const rs = useReadingStyle();
  const insets = useSafeAreaInsets();
  const fontSize = rs.fontSize ?? 17;
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
  const [elapsed, setElapsed] = useState(0);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const aliveRef = useRef(true);
  const atBottomRef = useRef(true);
  const resumedRef = useRef(false);
  const lastJobRef = useRef<PendingJob | null>(null);

  // Цвета ответа — из интерфейсной темы, шрифт — из настроек чтения.
  const rtChat = {
    bg: theme.bg,
    text: theme.text,
    muted: theme.textSecondary,
    rule: theme.divider,
    fill: theme.fill,
    dark: isDark,
  };
  const mathFonts = {
    regular: rs.fontFamily,
    italic: rs.italicFamily,
    bold: rs.boldFamily,
    mono: 'JetBrainsMono',
  };

  const mdStyle: any = {
    body: { color: theme.text, fontSize: fontSize * 0.97, lineHeight: fontSize * 1.52, fontFamily: rs.fontFamily },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontFamily: rs.boldFamily, fontWeight: '700', color: theme.text },
    em: { fontFamily: rs.italicFamily, fontStyle: 'italic', color: theme.text },
    bullet_list: { marginVertical: 3 },
    ordered_list: { marginVertical: 3 },
    list_item: { marginBottom: 2 },
    code_inline: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, paddingHorizontal: 4, borderRadius: 4 },
    code_block: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 10, padding: 10, marginVertical: 4 },
    fence: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 10, padding: 10, marginVertical: 4 },
    table: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 8 },
    th: { padding: 6, fontFamily: rs.boldFamily, color: theme.text },
    td: { padding: 6, color: theme.text },
    tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.divider },
    link: { color: theme.accent },
    blockquote: { backgroundColor: theme.fill, borderLeftWidth: 2, borderLeftColor: theme.divider, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 6, borderRadius: 6 },
  };

  const reload = useCallback(async () => {
    const h = await loadChat(chatId);
    if (aliveRef.current) setMsgs(h);
  }, [chatId]);

  // Подписка на фоновый запрос: экран — просто наблюдатель.
  useEffect(() => {
    aliveRef.current = true;
    reload();
    const un = subscribeAi((e) => {
      if (e.chatId !== chatId || !aliveRef.current) return;
      if (e.kind === 'start') {
        setBusy(true);
        setErr(null);
      } else if (e.kind === 'done') {
        setBusy(false);
        reload();
      } else {
        setBusy(false);
        setErr(e.error);
      }
    });
    return () => {
      aliveRef.current = false;
      un();
    };
  }, [chatId, reload]);

  // Запрос уже идёт в модуле — показываем это; иначе поднимаем недосланный.
  const resumePending = useCallback(async () => {
    if (isAiRunning(chatId)) {
      setBusy(true);
      const t0 = aiStartedAt(chatId);
      if (t0) setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000)));
      return;
    }
    if (resumedRef.current) return;
    const job = await getPending(chatId);
    if (!job || Date.now() - job.ts > PENDING_TTL) {
      if (job) await setPending(chatId, null);
      return;
    }
    resumedRef.current = true;
    lastJobRef.current = job;
    runAskTask(chatId, task, solution, await historyBeforeLastUser(chatId), job).catch(() => {});
  }, [chatId, task, solution]);

  useEffect(() => {
    resumePending();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') resumePending();
    });
    return () => sub.remove();
  }, [resumePending]);

  // Секундомер под «думаю» — чтобы ожидание не было немым.
  useEffect(() => {
    if (!busy) return;
    const start = aiStartedAt(chatId) ?? Date.now();
    setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    const id = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(id);
  }, [busy, chatId]);

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 1400);
  };

  const copy = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Haptics.selectionAsync().catch(() => {});
      flash('Скопировано');
    } catch {}
  };

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

  const dispatch = async (job: PendingJob, userMsg: ChatMsg) => {
    lastJobRef.current = job;
    setErr(null);
    setMsgs((p) => [...p, userMsg]);
    await appendChat(chatId, userMsg);
    setBusy(true);
    setElapsed(0);
    runAskTask(chatId, task, solution, await historyBeforeLastUser(chatId), job).catch(() => {});
  };

  const send = async () => {
    const question = q.trim();
    if ((!question && att.length === 0) || isAiRunning(chatId) || busy) return;
    const images = att.filter((a) => a.image).map((a) => a.image as AttachedImage);
    const texts = att.filter((a) => a.text !== undefined);
    let full = question;
    for (const t of texts) full += `\n\n[Приложенный файл ${t.name}]:\n${t.text}`;
    const shown = question || `Приложено: ${att.map((a) => a.name).join(', ')}`;
    const job: PendingJob = { question, full: full || 'Объясни задачу.', shown, images, ts: Date.now() };
    const userMsg: ChatMsg = { role: 'user', text: shown, images: att.filter((a) => a.uri).map((a) => a.uri!) } as ChatMsg;
    setQ('');
    setAtt([]);
    await dispatch(job, userMsg);
  };

  const retry = async () => {
    const job = lastJobRef.current;
    if (!job) return;
    setErr(null);
    setBusy(true);
    runAskTask(chatId, task, solution, await historyBeforeLastUser(chatId), job).catch(() => {});
  };

  const stop = () => {
    abortAi(chatId);
    setBusy(false);
  };

  const confirmClear = () => {
    if (msgs.length === 0) return;
    setMenu(false);
    Alert.alert('Очистить ветку?', 'История переписки по этой задаче удалится.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить',
        style: 'destructive',
        onPress: async () => {
          abortAi(chatId);
          setBusy(false);
          setMsgs([]);
          await saveChat(chatId, []);
          await setPending(chatId, null);
        },
      },
    ]);
  };

  const canSend = (!!q.trim() || att.length > 0) && !busy;

  return (
    <View style={[s.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={s.head}>
        <Pressable onPress={() => navigation?.goBack()} hitSlop={12} style={s.headBtn}>
          <Ionicons name="chevron-back" size={25} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {task ? (
            <Pressable onPress={() => setCtxOpen(true)} hitSlop={8} style={s.subRow}>
              <Text style={[s.sub, { color: theme.textSecondary }]} numberOfLines={1}>условие и разбор</Text>
              <Ionicons name="chevron-forward" size={10} color={theme.textTertiary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={confirmClear} hitSlop={12} style={s.headBtn}>
          <MaterialCommunityIcons name="broom" size={21} color={theme.textSecondary} />
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
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            atBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 90;
          }}
          onContentSizeChange={() => {
            if (atBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {msgs.length === 0 && !busy ? (
            <View style={s.empty}>
              <Text style={[s.emptyTitle, { color: theme.text, fontFamily: rs.fontFamily }]}>Спросить по задаче</Text>
              <Text style={[s.emptySub, { color: theme.textSecondary }]}>
                Ответ придёт в эту ветку, даже если выйти.
              </Text>
              <View style={s.hints}>
                {['Объясни проще', 'Реши по шагам', 'Где я ошибся?'].map((h) => (
                  <Pressable key={h} onPress={() => setQ(h)} style={[s.hint, { borderColor: theme.divider }]}>
                    <Text style={{ color: theme.text, fontSize: 13 }}>{h}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {msgs.map((m, i) => {
            if (m.role === 'user') {
              return (
                <View key={i} style={s.mineRow}>
                  {m.images && m.images.length > 0 ? (
                    <View style={{ gap: 6, marginBottom: 6, alignItems: 'flex-end' }}>
                      {m.images.map((uri, k) => (
                        <Image key={k} source={{ uri }} style={s.msgImage} resizeMode="cover" />
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    onLongPress={() => copy(m.text)}
                    delayLongPress={320}
                    style={[s.mine, { backgroundColor: theme.fill }]}
                  >
                    <Text style={[s.mineText, { color: theme.text, fontSize: fontSize * 0.94 }]}>
                      {softenLongWords(m.text)}
                    </Text>
                  </Pressable>
                </View>
              );
            }
            return (
              <View key={i} style={s.theirs}>
                <Text style={[s.who, { color: theme.textTertiary, fontFamily: uiFontOf(600) }]}>ПОМОЩНИК</Text>
                <Pressable onLongPress={() => copy(m.text)} delayLongPress={320}>
                  <RichAnswer
                    body={softenLongWords(m.text)}
                    mdStyle={mdStyle}
                    rt={rtChat}
                    fontSize={fontSize * 0.97}
                    fonts={mathFonts}
                  />
                </Pressable>
              </View>
            );
          })}

          {busy ? (
            <View style={s.busyRow}>
              <Typing color={theme.textSecondary} />
              <Text style={[s.busyText, { color: theme.textSecondary }]}>
                {elapsed > 2 ? `${elapsed} с` : 'думаю'}
              </Text>
              <Pressable onPress={stop} hitSlop={10}>
                <Text style={[s.stop, { color: theme.textSecondary }]}>Стоп</Text>
              </Pressable>
            </View>
          ) : null}

          {err ? (
            <View style={s.errRow}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.red} />
              <Text style={[s.errText, { color: theme.red }]} selectable>{err}</Text>
              {lastJobRef.current ? (
                <Pressable onPress={retry} hitSlop={8}>
                  <Text style={[s.errRetry, { color: theme.text }]}>Ещё раз</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {att.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tray}>
            {att.map((a, i) => (
              <Pressable
                key={i}
                onPress={() => setAtt((p) => p.filter((_, k) => k !== i))}
                style={[s.chip, { borderColor: theme.divider, backgroundColor: theme.bg }]}
              >
                {a.uri ? (
                  <Image source={{ uri: a.uri }} style={s.chipThumb} />
                ) : (
                  <Ionicons name="document-text-outline" size={15} color={theme.textSecondary} />
                )}
                <Text style={{ color: theme.text, fontSize: 12, maxWidth: 130 }} numberOfLines={1}>{a.name}</Text>
                <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* Одно поле: «+» слева, отправка справа, всё внутри скругления */}
        <View style={[s.bar, { paddingBottom: Math.max(8, insets.bottom) }]}>
          <View style={[s.field, { backgroundColor: theme.fill, borderColor: theme.divider }]}>
            <Pressable onPress={() => setMenu(true)} hitSlop={8} style={s.plus}>
              <Ionicons name="add" size={22} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              style={[s.input, { color: theme.text, fontSize: fontSize * 0.94 }]}
              placeholder="Вопрос по задаче…"
              placeholderTextColor={theme.textTertiary}
              value={q}
              onChangeText={setQ}
              multiline
            />
            {canSend ? (
              <Pressable onPress={send} hitSlop={6} style={[s.send, { backgroundColor: theme.text }]}>
                <Ionicons name="arrow-up" size={17} color={theme.bg} />
              </Pressable>
            ) : (
              <View style={s.sendGhost}>
                <Ionicons name="arrow-up" size={17} color={theme.textTertiary} />
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {toast ? (
        <View style={[s.toast, { backgroundColor: theme.text }]}>
          <Text style={[s.toastText, { color: theme.bg }]}>{toast}</Text>
        </View>
      ) : null}

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
          <Pressable onPress={confirmClear} style={s.action}>
            <Ionicons name="trash-outline" size={21} color={theme.red} />
            <Text style={[s.actionText, { color: theme.red }]}>Очистить ветку</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Условие и разбор — по тапу на подпись под заголовком */}
      <Sheet visible={ctxOpen} onClose={() => setCtxOpen(false)} bg={theme.surface} paddingBottom={insets.bottom + 12}>
        <View style={s.sheetBody}>
          <View style={[s.grabber, { backgroundColor: theme.textTertiary }]} />
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <Text style={[s.ctxLabel, { color: theme.textSecondary, fontFamily: uiFontOf(600) }]}>УСЛОВИЕ</Text>
            <Text style={[s.ctxText, { color: theme.text, fontFamily: rs.fontFamily, fontSize: fontSize * 0.95 }]}>
              {task || '—'}
            </Text>
            {solution.trim() ? (
              <>
                <Text style={[s.ctxLabel, { color: theme.textSecondary, marginTop: 18, fontFamily: uiFontOf(600) }]}>РАЗБОР</Text>
                <Text style={[s.ctxText, { color: theme.textSecondary, fontFamily: rs.fontFamily, fontSize: fontSize * 0.92 }]}>
                  {solution}
                </Text>
              </>
            ) : null}
          </ScrollView>
          <Pressable onPress={() => setCtxOpen(false)} style={[s.ctxDone, { backgroundColor: theme.fill }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontFamily: uiFontOf(600) }}>Закрыть</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 4, paddingVertical: 2, minHeight: 44,
  },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...tp.headline, fontFamily: uiFontOf(600) },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  sub: { fontSize: 11.5 },

  list: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },

  empty: { paddingTop: 56, paddingHorizontal: 8, alignItems: 'center' },
  emptyTitle: { fontSize: 21, letterSpacing: -0.2 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 7, lineHeight: 19 },
  hints: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 22 },
  hint: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },

  mineRow: { alignItems: 'flex-end', marginTop: 16 },
  mine: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  mineText: { lineHeight: 21 },

  theirs: { marginTop: 22 },
  who: { fontSize: 9.5, letterSpacing: 1.1, marginBottom: 7 },

  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingLeft: 2 },
  busyText: { fontSize: 12.5, flex: 1 },
  stop: { fontSize: 12.5 },

  errRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 18 },
  errText: { fontSize: 12.5, flex: 1, lineHeight: 18 },
  errRetry: { fontSize: 12.5, fontFamily: uiFontOf(600) },

  msgImage: { width: 210, height: 165, borderRadius: 14 },
  tray: { gap: 8, paddingHorizontal: 18, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6 },
  chipThumb: { width: 26, height: 26, borderRadius: 7 },

  bar: { paddingHorizontal: 14, paddingTop: 6 },
  field: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderRadius: 23, borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 4, paddingRight: 5, paddingVertical: 4,
  },
  plus: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, paddingTop: 9, paddingBottom: 9, paddingHorizontal: 2, maxHeight: 130, minHeight: 36 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2, marginLeft: 4 },
  sendGhost: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 2, marginLeft: 4 },

  toast: { position: 'absolute', alignSelf: 'center', bottom: 96, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  toastText: { fontSize: 12.5 },

  sheetBody: { paddingHorizontal: 18 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.5 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  actionText: { ...tp.body },
  ctxLabel: { fontSize: 10, letterSpacing: 0.9, marginBottom: 8 },
  ctxText: { lineHeight: 24 },
  ctxDone: { marginTop: 18, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
