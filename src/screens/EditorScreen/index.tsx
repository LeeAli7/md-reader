// Редактор: нормальная работа с текстом вместо «поля на весь экран».
// • панель markdown-действий с отменой и повтором
// • переименование по тапу на заголовок
// • автосохранение, в том числе при уходе в фон, защита от случайного выхода
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../../hooks/useTheme';
import { useAppSettingsOpt } from '../../context/AppSettingsContext';
import { pushRecent } from '../../utils/metaStore';
import { type as tp, font as uiFontOf } from '../../theme/type';
import { Sheet } from '../../components/Sheet';

interface Props {
  route: { params: { uri: string; title: string } };
  navigation: any;
}

type Mode = 'edit' | 'preview' | 'split';

const AUTOSAVE_MS = 1200;

export default function EditorScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const app = useAppSettingsOpt();
  const insets = useSafeAreaInsets();
  const initialUri: string = route.params.uri;
  const [uri, setUri] = useState(initialUri);
  const [title, setTitle] = useState(route.params.title);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('edit');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<TextInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef('');
  const savedRef = useRef('');
  const dirtyRef = useRef(false);
  contentRef.current = content;
  dirtyRef.current = dirty;

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [histVer, setHistVer] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const text = await FileSystem.readAsStringAsync(uri);
        if (!alive) return;
        setContent(text);
        savedRef.current = text;
        pushRecent(uri, title).catch(() => {});
      } catch {
        Alert.alert('Не открывается', 'Файл не удалось прочитать.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uri, title]);

  const saveNow = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (contentRef.current === savedRef.current) { setDirty(false); return; }
    setSaving(true);
    try {
      await FileSystem.writeAsStringAsync(uri, contentRef.current);
      savedRef.current = contentRef.current;
      setDirty(false);
      setLastSaved(Date.now());
    } catch {
      Alert.alert('Не сохранилось', 'Проверьте свободное место и попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }, [uri]);

  const onChange = useCallback((text: string) => {
    if (contentRef.current !== text) {
      undoStack.current = [...undoStack.current.slice(-40), contentRef.current];
      redoStack.current = [];
      setHistVer((v) => v + 1);
    }
    setContent(text);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveNow().catch(() => {}); }, AUTOSAVE_MS);
  }, [saveNow]);

  // Уход в фон и возврат: сохраняем, чтобы ничего не потерялось
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' && dirtyRef.current) saveNow().catch(() => {});
    });
    return () => sub.remove();
  }, [saveNow]);

  // Случайный выход с несохранённым текстом — спрашиваем
  useEffect(() => {
    const unsub = navigation.addListener?.('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Сохранить изменения?', 'В файле есть правки.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти без сохранения',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
        {
          text: 'Сохранить',
          onPress: async () => {
            await saveNow();
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsub;
  }, [navigation, saveNow]);

  const undo = () => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    redoStack.current = [...redoStack.current, contentRef.current];
    setContent(prev);
    setDirty(true);
    setHistVer((v) => v + 1);
    saveNow().catch(() => {});
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current = [...undoStack.current, contentRef.current];
    setContent(next);
    setDirty(true);
    setHistVer((v) => v + 1);
    saveNow().catch(() => {});
  };

  const splice = (text: string, start: number, end: number, insert: string, cursor?: number) => {
    const a = Math.max(0, Math.min(start, text.length));
    const b = Math.max(a, Math.min(end, text.length));
    return { next: text.slice(0, a) + insert + text.slice(b), cursor: cursor ?? a + insert.length };
  };

  const wrapSelection = (before: string, after: string, placeholder = 'текст') => {
    const t = contentRef.current;
    const { start, end } = sel;
    const selected = t.slice(start, end) || placeholder;
    onChange(splice(t, start, end, before + selected + after).next);
  };

  const prefixLines = (prefix: string) => {
    const t = contentRef.current;
    const { start, end } = sel;
    const lineStart = t.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const idx = t.indexOf('\n', end);
    const lineEnd = idx === -1 ? t.length : idx;
    const block = t.slice(lineStart, lineEnd);
    const prefixed = block.split('\n').map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line)).join('\n');
    onChange(splice(t, lineStart, lineEnd, prefixed).next);
  };

  const insertBlock = (text: string) => {
    const t = contentRef.current;
    const { start, end } = sel;
    onChange(splice(t, start, end, text).next);
  };

  const doRename = async () => {
    const clean = renameValue.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!clean) { setRenameOpen(false); return; }
    const dir = uri.slice(0, uri.lastIndexOf('/'));
    const ext = uri.slice(uri.lastIndexOf('.'));
    const target = `${dir}/${clean}${ext}`;
    if (target === uri) { setRenameOpen(false); return; }
    try {
      await FileSystem.moveAsync({ from: uri, to: target });
      setUri(target);
      setTitle(`${clean}${ext}`);
      navigation.setParams?.({ uri: target, title: `${clean}${ext}` });
      setRenameOpen(false);
    } catch (e: any) {
      Alert.alert('Не переименовалось', String(e?.message ?? e));
    }
  };

  const words = useMemo(() => (content ? content.trim().split(/\s+/).filter(Boolean).length : 0), [content]);
  const chars = content.length;
  const s = styles(theme, insets);
  const fontSize = app?.fontSize ?? 16;

  const preview = (compact = false) => (
    <ScrollView style={[s.preview, compact && s.previewHalf]} contentContainerStyle={s.previewContent}>
      <Markdown
        style={{
          body: { color: theme.text, fontSize: 15, lineHeight: 24 },
          heading1: { color: theme.text, fontSize: 26, fontFamily: uiFontOf(700), marginBottom: 10 },
          heading2: { color: theme.text, fontSize: 21, fontFamily: uiFontOf(600), marginBottom: 8 },
          heading3: { color: theme.text, fontSize: 18, fontFamily: uiFontOf(600), marginBottom: 6 },
          paragraph: { marginBottom: 10 },
          link: { color: theme.accent },
          code_inline: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderRadius: 4, paddingHorizontal: 5 },
          fence: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderRadius: 10, padding: 12, marginVertical: 8 },
          code_block: { fontFamily: 'JetBrainsMono', backgroundColor: theme.fill, color: theme.text, borderRadius: 10, padding: 12, marginVertical: 8 },
          blockquote: { borderLeftColor: theme.divider, borderLeftWidth: 3, paddingLeft: 12, marginVertical: 8 },
          table: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.divider, borderRadius: 8, marginVertical: 8 },
          list_item: { color: theme.text, fontSize: 15, lineHeight: 24 },
        }}
      >
        {content || '*Пусто — начните писать в режиме правки*'}
      </Markdown>
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.accent} />
        <Text style={{ color: theme.textSecondary, marginTop: 10, fontSize: 13 }}>Открываю файл…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable
          onPress={() => {
            if (dirty) { saveNow().catch(() => {}); }
            navigation.goBack();
          }}
          hitSlop={10}
          style={s.iconBtn}
        >
          <Ionicons name="chevron-back" size={26} color={theme.accent} />
        </Pressable>
        <Pressable
          onPress={() => { setRenameValue(title.replace(/\.[a-z]+$/i, '')); setRenameOpen(true); }}
          style={{ flex: 1, alignItems: 'center' }}
        >
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[s.status, { color: theme.textSecondary }]} numberOfLines={1}>
            {saving ? 'Сохраняю…' : dirty ? 'Не сохранено' : lastSaved ? 'Сохранено' : `${words} слов · ${chars} знаков`}
          </Text>
        </Pressable>
        <Pressable onPress={() => saveNow().catch(() => {})} hitSlop={10} style={s.iconBtn}>
          <Text style={[s.done, { color: dirty ? theme.accent : theme.textSecondary }]}>Готово</Text>
        </Pressable>
      </View>

      <View style={s.modes}>
        {(['edit', 'preview', 'split'] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <Pressable key={m} onPress={() => setMode(m)} style={[s.modeBtn, active && { backgroundColor: theme.fill }]}>
              <Text style={[s.modeText, { color: active ? theme.text : theme.textSecondary }]}>
                {m === 'edit' ? 'Правка' : m === 'preview' ? 'Просмотр' : 'Сплит'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {mode === 'preview' ? (
          preview()
        ) : mode === 'split' ? (
          <View style={{ flex: 1 }}>
            <TextInput
              ref={(r) => { inputRef.current = r; }}
              style={[s.input, s.inputHalf, { fontSize }]}
              value={content}
              onChangeText={onChange}
              onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
              multiline
              textAlignVertical="top"
              placeholder="Пишите markdown…"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="sentences"
            />
            {preview(true)}
          </View>
        ) : (
          <TextInput
            ref={(r) => { inputRef.current = r; }}
            style={[s.input, { fontSize }]}
            value={content}
            onChangeText={onChange}
            onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
            multiline
            textAlignVertical="top"
            placeholder="Пишите markdown…"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="sentences"
            scrollEnabled
          />
        )}

        {mode !== 'preview' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[s.toolbar, { paddingBottom: Math.max(8, insets.bottom - 2) }]}
            contentContainerStyle={{ gap: 6, alignItems: 'center', paddingHorizontal: 12 }}
            keyboardShouldPersistTaps="always"
          >
            <Tool icon="arrow-undo" onPress={undo} theme={theme} dim={undoStack.current.length === 0} />
            <Tool icon="arrow-redo" onPress={redo} theme={theme} dim={redoStack.current.length === 0} />
            <View style={[s.tSep, { backgroundColor: theme.divider }]} />
            <Tool icon="text" label="H1" onPress={() => prefixLines('# ')} theme={theme} />
            <Tool icon="text" label="H2" onPress={() => prefixLines('## ')} theme={theme} />
            <Tool icon="bold" onPress={() => wrapSelection('**', '**')} theme={theme} />
            <Tool icon="italic" onPress={() => wrapSelection('_', '_')} theme={theme} />
            <Tool icon="list" onPress={() => prefixLines('- ')} theme={theme} />
            <Tool icon="checkbox-outline" onPress={() => prefixLines('- [ ] ')} theme={theme} />
            <Tool icon="code-slash" onPress={() => wrapSelection('\n```\n', '\n```\n', 'код')} theme={theme} />
            <Tool icon="link" onPress={() => wrapSelection('[', '](https://)')} theme={theme} />
            <Tool icon="chatbox-ellipses-outline" onPress={() => prefixLines('> ')} theme={theme} />
            <Tool icon="remove" onPress={() => insertBlock('\n---\n')} theme={theme} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <Sheet visible={renameOpen} onClose={() => setRenameOpen(false)} bg={theme.surface} paddingBottom={insets.bottom + 12}>
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={[s.sheetTitle, { color: theme.text }]}>Имя файла</Text>
          <TextInput
            style={[s.sheetInput, { color: theme.text, backgroundColor: theme.fill }]}
            value={renameValue}
            onChangeText={setRenameValue}
            autoFocus
            placeholder="Название"
            placeholderTextColor={theme.textTertiary}
            onSubmitEditing={doRename}
            returnKeyType="done"
          />
          <View style={s.sheetActions}>
            <Pressable onPress={() => setRenameOpen(false)} hitSlop={8}>
              <Text style={{ color: theme.textSecondary, fontSize: 16 }}>Отмена</Text>
            </Pressable>
            <Pressable onPress={doRename} hitSlop={8}>
              <Text style={{ color: theme.accent, fontSize: 16, fontFamily: uiFontOf(600) }}>Переименовать</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function Tool({
  icon, label, onPress, theme, dim,
}: { icon: string; label?: string; onPress: () => void; theme: any; dim?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.tool, { backgroundColor: pressed ? theme.fill : 'transparent', opacity: dim ? 0.3 : 1 }]}
    >
      {label ? (
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: uiFontOf(600) }}>{label}</Text>
      ) : (
        <Ionicons name={icon as never} size={19} color={theme.text} />
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  tool: { width: 38, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: insets.top + 2,
      paddingHorizontal: 6,
      paddingBottom: 2,
    },
    iconBtn: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { ...tp.headline, fontFamily: uiFontOf(600), maxWidth: 240 },
    status: { fontSize: 11, marginTop: 1 },
    done: { fontSize: 15, fontFamily: uiFontOf(600), paddingHorizontal: 6 },
    modes: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
    modeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    modeText: { fontSize: 13, fontFamily: uiFontOf(500) },
    input: {
      flex: 1,
      textAlignVertical: 'top',
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 120,
      lineHeight: 25,
      color: theme.text,
      backgroundColor: theme.bg,
      fontFamily: uiFontOf(400),
    },
    inputHalf: { flex: 0.5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider, paddingBottom: 10 },
    preview: { flex: 1, backgroundColor: theme.bg },
    previewHalf: { flex: 0.5, backgroundColor: theme.surfaceAlt },
    previewContent: { padding: 18, paddingBottom: 120 },
    toolbar: {
      flexGrow: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.divider,
      backgroundColor: theme.bg,
      paddingTop: 6,
    },
    tSep: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 4 },
    sheetTitle: { ...tp.headline, fontFamily: uiFontOf(600), marginTop: 10, marginBottom: 14 },
    sheetInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
    sheetActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
  });
}
