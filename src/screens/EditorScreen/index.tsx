// MD Vault Pro — engine: EditorScreen (Edit / Preview / Split + autosave)
// New dir screen; navigation wiring stays with Marcel (App.tsx integration).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../../hooks/useTheme';
import { pushRecent } from '../../utils/metaStore';

interface Props {
  route: { params: { uri: string; title: string } };
  navigation: { goBack: () => void };
}

type Mode = 'edit' | 'preview' | 'split';

const AUTOSAVE_MS = 1500;

export default function EditorScreen({ route, navigation }: Props) {
  const { uri, title } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('edit');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef('');
  contentRef.current = content;

  useEffect(() => {
    (async () => {
      try {
        const text = await FileSystem.readAsStringAsync(uri);
        setContent(text);
        pushRecent(uri, title).catch(() => {});
      } catch {
        Alert.alert('Ошибка', 'Не удалось открыть файл для редактирования');
      } finally {
        setLoading(false);
      }
    })();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [uri, title]);

  const saveNow = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setSaving(true);
    try {
      await FileSystem.writeAsStringAsync(uri, contentRef.current);
      setDirty(false);
      setLastSaved(Date.now());
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить файл');
    } finally {
      setSaving(false);
    }
  }, [uri]);

  const onChange = useCallback((text: string) => {
    setContent(text);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveNow().catch(() => {}); }, AUTOSAVE_MS);
  }, [saveNow]);

  // --- toolbar transforms (selection-aware, fallback: append at end) ---

  const splice = (text: string, start: number, end: number, insert: string): { next: string; cursor: number } => {
    const s = Math.max(0, Math.min(start, text.length));
    const e = Math.max(s, Math.min(end, text.length));
    return { next: text.slice(0, s) + insert + text.slice(e), cursor: s + insert.length };
  };

  const wrapSelection = (before: string, after: string, placeholder = 'текст') => {
    const t = contentRef.current;
    const { start, end } = sel;
    const selected = t.slice(start, end) || placeholder;
    const { next } = splice(t, start, end, before + selected + after);
    onChange(next);
  };

  const prefixLines = (prefix: string) => {
    const t = contentRef.current;
    const { start, end } = sel;
    const lineStart = t.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIdx = t.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? t.length : lineEndIdx;
    const block = t.slice(lineStart, lineEnd);
    const prefixed = block.split('\n').map(line => {
      if (line.startsWith(prefix)) return line.slice(prefix.length);
      return prefix + line;
    }).join('\n');
    const { next } = splice(t, lineStart, lineEnd, prefixed);
    onChange(next);
  };

  const words = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const s = styles(theme, insets);

  const renderPreview = (compact = false) => (
    <ScrollView style={[s.preview, compact && s.previewHalf]} contentContainerStyle={s.previewContent}>
      <Markdown
        style={{
          body: { color: theme.text, fontSize: 15, lineHeight: 23 },
          heading1: { color: theme.text, fontSize: 26, fontWeight: '700', marginBottom: 10 },
          heading2: { color: theme.text, fontSize: 21, fontWeight: '600', marginBottom: 8 },
          heading3: { color: theme.text, fontSize: 18, fontWeight: '600', marginBottom: 6 },
          link: { color: theme.accent },
          code_inline: { backgroundColor: theme.accentSoft, color: theme.text, borderRadius: 4, paddingHorizontal: 5 },
          fence: { backgroundColor: theme.accentSoft, color: theme.text, borderRadius: 8, padding: 12, marginVertical: 8 },
          code_block: { backgroundColor: theme.accentSoft, color: theme.text, borderRadius: 8, padding: 12, marginVertical: 8 },
          blockquote: { borderLeftColor: theme.accent, borderLeftWidth: 3, paddingLeft: 12, marginVertical: 8 },
          table: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, marginVertical: 8 },
          list_item: { color: theme.text, fontSize: 15, lineHeight: 23 },
        }}
      >
        {content || '*Пусто — начните писать в режиме правки*'}
      </Markdown>
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* header */}
      <View style={s.header}>
        <Pressable onPress={() => { if (timer.current) clearTimeout(timer.current); navigation.goBack(); }} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={s.titleWrap}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[s.status, { color: theme.textSecondary }]}>
            {saving ? 'Сохранение…' : dirty ? 'Есть несохранённые изменения' : lastSaved ? 'Сохранено ✓' : `${words} слов`}
          </Text>
        </View>
        <Pressable onPress={() => saveNow().catch(() => {})} style={s.saveBtn} hitSlop={8}>
          <Ionicons name="checkmark" size={22} color={dirty ? theme.accent : theme.textSecondary} />
        </Pressable>
      </View>

      {/* mode switch */}
      <View style={s.modes}>
        {(['edit', 'preview', 'split'] as Mode[]).map(m => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[s.modeBtn, mode === m && { backgroundColor: theme.accentSoft }]}
          >
            <Ionicons
              name={(m === 'edit' ? 'create-outline' : m === 'preview' ? 'eye-outline' : 'copy-outline') as never}
              size={17}
              color={mode === m ? theme.accent : theme.textSecondary}
            />
            <Text style={[s.modeText, { color: mode === m ? theme.accent : theme.textSecondary }]}>
              {m === 'edit' ? 'Правка' : m === 'preview' ? 'Просмотр' : 'Сплит'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* body */}
      {mode === 'preview' ? (
        renderPreview()
      ) : mode === 'split' ? (
        <View style={s.splitWrap}>
          <TextInput
            style={[s.input, s.inputHalf]}
            value={content}
            onChangeText={onChange}
            onSelectionChange={e => setSel(e.nativeEvent.selection)}
            multiline
            textAlignVertical="top"
            placeholder="Пишите markdown…"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="sentences"
          />
          {renderPreview(true)}
        </View>
      ) : (
        <TextInput
          style={s.input}
          value={content}
          onChangeText={onChange}
          onSelectionChange={e => setSel(e.nativeEvent.selection)}
          multiline
          textAlignVertical="top"
          placeholder="Пишите markdown…"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="sentences"
        />
      )}

      {/* toolbar (only in edit/split) */}
      {mode !== 'preview' && (
        <View style={s.toolbar}>
          <ToolbarBtn icon="text" label="H1" onPress={() => prefixLines('# ')} theme={theme} />
          <ToolbarBtn icon="bold" label="B" onPress={() => wrapSelection('**', '**')} theme={theme} />
          <ToolbarBtn icon="code-slash" label="Code" onPress={() => wrapSelection('\n```\n', '\n```\n', 'код')} theme={theme} />
          <ToolbarBtn icon="list" label="List" onPress={() => prefixLines('- ')} theme={theme} />
        </View>
      )}
    </View>
  );
}

function ToolbarBtn({ icon, label, onPress, theme }: { icon: string; label: string; onPress: () => void; theme: any }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.accentSoft, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={icon as never} size={16} color={theme.accent} />
      <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8,
      backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn: { padding: 8 },
    titleWrap: { flex: 1, marginHorizontal: 4 },
    title: { fontSize: 16, fontWeight: '600' },
    status: { fontSize: 12, marginTop: 1 },
    saveBtn: { padding: 8 },
    modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surface },
    modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
    modeText: { fontSize: 13, fontWeight: '500' },
    input: {
      flex: 1, textAlignVertical: 'top', padding: 16,
      fontSize: 15, lineHeight: 23, color: theme.text, backgroundColor: theme.bg,
    },
    inputHalf: { flex: 1, borderBottomWidth: 1, borderBottomColor: theme.border },
    splitWrap: { flex: 1 },
    preview: { flex: 1, backgroundColor: theme.bg },
    previewHalf: { flex: 1, backgroundColor: theme.surfaceAlt },
    previewContent: { padding: 16, paddingBottom: 120 },
    toolbar: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 12,
      paddingVertical: 10, paddingBottom: insets.bottom + 10,
      backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border,
    },
  });
}
