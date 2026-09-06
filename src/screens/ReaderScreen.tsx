import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  Modal, FlatList, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../hooks/useTheme';
import { readingThemes } from '../theme/tokens';
import { fonts } from '../theme/fonts';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import { CodeBlock } from '../components/CodeBlock';
import { ReaderTOC, Heading } from '../components/ReaderTOC';
import { ReadingProgressBar } from '../components/ReadingProgressBar';
import { OverflowMenu, type MenuAction } from '../components/OverflowMenu';

interface Props {
  route: any;
  navigation: any;
}

function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    out.push({ level: m[1].length, title: m[2].trim(), charIndex: m.index });
  }
  return out;
}

function nodeText(node: any): string {
  if (!node) return '';
  if (typeof node.content === 'string') return node.content;
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
  if (typeof node.children === 'string') return node.children;
  return '';
}

interface Chunk {
  text: string;
  start: number;
}

// Режем по строкам (~150/чанк), заборы ``` не разрываем — иначе Markdown-парсер
// каждого чанка ломается, а это и есть причина фризов на больших файлах:
// один гигантский <Markdown> парсит и кладёт всё разом.
const LINES_PER_CHUNK = 150;

function splitMarkdown(md: string): Chunk[] {
  if (!md) return [];
  const lines = md.split('\n');
  const chunks: Chunk[] = [];
  let cur: string[] = [];
  let start = 0;
  let offset = 0;
  let inFence = false;
  const push = () => {
    if (cur.length === 0) return;
    chunks.push({ text: cur.join('\n'), start });
    offset += cur.join('\n').length + 1;
    cur = [];
    start = offset;
  };
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    cur.push(line);
    if (cur.length >= LINES_PER_CHUNK && !inFence) push();
  }
  push();
  return chunks.length > 0 ? chunks : [{ text: md, start: 0 }];
}

const ChunkView = React.memo(function ChunkView({ text, mdStyle, rules }: { text: string; mdStyle: any; rules: any }) {
  return <Markdown rules={rules} style={mdStyle}>{text}</Markdown>;
});

export default function ReaderScreen({ route, navigation }: Props) {
  const { uri, title } = route.params;
  const { theme } = useTheme();
  const appSettings = useAppSettingsOpt();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [content, setContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(0);

  // Настройки чтения из AppContext (Settings правит то же место).
  const fontSize = appSettings?.fontSize ?? 16;
  const lineHeight = appSettings?.lineHeight ?? 1.7;
  const selectedFont = appSettings?.font ?? 'Inter';
  const selectedTheme = appSettings?.readingTheme ?? 'default';
  const contentWidth = appSettings?.contentWidth ?? 720;

  useEffect(() => {
    (async () => {
      try {
        const text = await FileSystem.readAsStringAsync(uri);
        setContent(text);
        const words = text.split(/\s+/).filter(Boolean).length;
        setWordCount(words);
        setReadTime(Math.max(1, Math.ceil(words / 200)));
      } catch {
        setContent('# Ошибка чтения файла\n\nНе удалось открыть файл.');
      }
    })();
  }, [uri]);

  const headings = useMemo(() => parseHeadings(content), [content]);
  const chunks = useMemo(() => splitMarkdown(content), [content]);

  const rt = readingThemes[selectedTheme] || readingThemes.default;
  const isDarkReading = rt.text === '#C9D1D9' || rt.text === '#E7E5E4' || rt.text === '#F8F8F2' || rt.text === '#586E75';

  // Один источник истины: family-ключ = имя из theme/fonts.ts без пробелов,
  // грузится в App.tsx под тем же ключом.
  const fontFamily = selectedFont.replace(/\s+/g, '');

  const rules = useMemo(() => ({
    fence: (node: any) => <CodeBlock key={node.key} code={nodeText(node)} rt={rt} />,
    code_block: (node: any) => <CodeBlock key={node.key} code={nodeText(node)} rt={rt} />,
  }), [rt]);

  const mdStyle = useMemo(() => ({
    body: {
      color: rt.text, fontSize,
      lineHeight: fontSize * lineHeight,
      fontFamily,
    },
    heading1: { color: rt.text, fontSize: fontSize * 1.8, fontWeight: '700', marginBottom: 12 },
    heading2: { color: rt.text, fontSize: fontSize * 1.5, fontWeight: '600', marginBottom: 10 },
    heading3: { color: rt.text, fontSize: fontSize * 1.25, fontWeight: '600', marginBottom: 8 },
    link: { color: isDarkReading ? '#60A5FA' : '#2563EB' },
    code_inline: {
      backgroundColor: isDarkReading ? rt.text + '15' : rt.text + '0A',
      color: rt.text, fontSize: fontSize * 0.9, borderRadius: 4,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    blockquote: {
      borderLeftColor: isDarkReading ? '#60A5FA' : '#2563EB',
      borderLeftWidth: 3,
      paddingLeft: 14,
      marginLeft: 0,
      marginVertical: 10,
      backgroundColor: isDarkReading ? rt.text + '08' : rt.text + '05',
      paddingVertical: 10,
      paddingRight: 12,
      borderRadius: 0,
    },
    hr: { backgroundColor: rt.text + '20', height: 1, marginVertical: 16 },
    list_item: { color: rt.text, fontSize, lineHeight: fontSize * lineHeight },
    strong: { fontWeight: '700' as const, color: rt.text },
    em: { fontStyle: 'italic' as const, color: rt.text },
  }), [rt, fontSize, lineHeight, fontFamily, isDarkReading]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max = Math.max(1, contentSize.height - layoutMeasurement.height);
    setProgress(Math.max(0, Math.min(1, contentOffset.y / max)));
  };

  const jumpToHeading = (h: Heading) => {
    setShowTOC(false);
    let idx = 0;
    chunks.forEach((c, i) => { if (c.start <= h.charIndex) idx = i; });
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: true });
      } catch {}
    }, 100);
  };

  const openEditor = () => {
    navigation.navigate('Editor', { uri, title });
  };

  const menuActions: MenuAction[] = [];
  if (headings.length > 0) {
    menuActions.push({ icon: 'list-outline', label: 'Оглавление', onPress: () => setShowTOC(true) });
  }
  menuActions.push({ icon: 'pencil-outline', label: 'Редактировать', onPress: openEditor });
  menuActions.push({ icon: 'settings-outline', label: 'Настройки чтения', onPress: () => setShowSettings(true) });

  const s = styles(insets);

  return (
    <View style={[s.container, { backgroundColor: rt.bg }]}>
      <View style={[s.topBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={rt.text} />
        </Pressable>
        <Text style={[s.title, { color: rt.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[s.meta, { color: rt.text + '60' }]}>
          {wordCount} сл. · ~{readTime} мин
        </Text>
        <Pressable onPress={() => setShowMenu(true)} style={s.iconBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={rt.text} />
        </Pressable>
      </View>
      <ReadingProgressBar progress={progress} color={theme.accent} />

      <FlatList
        ref={listRef}
        data={chunks}
        keyExtractor={(_, i) => String(i)}
        style={s.scroll}
        contentContainerStyle={[s.content, { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}
        renderItem={({ item }) => <ChunkView text={item.text} mdStyle={mdStyle} rules={rules} />}
        onScroll={onScroll}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
      />

      <ReaderTOC
        visible={showTOC}
        headings={headings}
        theme={theme}
        rtText={rt.text}
        rtBg={rt.bg}
        onClose={() => setShowTOC(false)}
        onSelect={jumpToHeading}
      />

      <OverflowMenu
        visible={showMenu}
        title={title}
        actions={menuActions}
        theme={theme}
        accentText={rt.text}
        onClose={() => setShowMenu(false)}
      />

      <Modal visible={showSettings} transparent animationType="slide">
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowSettings(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Настройки чтения</Text>

            <Text style={[s.label, { color: theme.textSecondary }]}>Размер шрифта: {fontSize}px</Text>
            <View style={s.sliderRow}>
              <Pressable onPress={() => appSettings?.setFontSize(Math.max(12, fontSize - 1))}>
                <Ionicons name="remove-circle-outline" size={28} color={theme.accent} />
              </Pressable>
              <View style={[s.sliderTrack, { backgroundColor: theme.border }]}>
                <View style={[s.sliderFill, { width: `${((fontSize - 12) / 16) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
              <Pressable onPress={() => appSettings?.setFontSize(Math.min(28, fontSize + 1))}>
                <Ionicons name="add-circle-outline" size={28} color={theme.accent} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: theme.textSecondary }]}>Межстрочный: {lineHeight.toFixed(1)}</Text>
            <View style={s.sliderRow}>
              <Pressable onPress={() => appSettings?.setLineHeight(Math.max(1.2, +(lineHeight - 0.1).toFixed(1)))}>
                <Ionicons name="remove-circle-outline" size={28} color={theme.accent} />
              </Pressable>
              <View style={[s.sliderTrack, { backgroundColor: theme.border }]}>
                <View style={[s.sliderFill, { width: `${((lineHeight - 1.2) / 1.3) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
              <Pressable onPress={() => appSettings?.setLineHeight(Math.min(2.5, +(lineHeight + 0.1).toFixed(1)))}>
                <Ionicons name="add-circle-outline" size={28} color={theme.accent} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: theme.textSecondary, marginTop: 16 }]}>Тема чтения</Text>
            <FlatList
              data={Object.entries(readingThemes)}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={([k]) => k}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              renderItem={({ item: [key, rt2] }) => (
                <Pressable
                  onPress={() => appSettings?.setReadingTheme(key)}
                  style={[
                    s.themeChip,
                    { backgroundColor: rt2.bg, borderColor: selectedTheme === key ? theme.accent : rt2.text + '20' },
                  ]}
                >
                  <Text style={{ color: rt2.text, fontSize: 12, fontWeight: '500' }}>{rt2.name}</Text>
                </Pressable>
              )}
            />

            <Text style={[s.label, { color: theme.textSecondary, marginTop: 16 }]}>Шрифт</Text>
            <FlatList
              data={[...fonts]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(f) => f}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              renderItem={({ item: f }) => (
                <Pressable
                  onPress={() => appSettings?.setFont(f)}
                  style={[
                    s.fontChip,
                    { borderColor: selectedFont === f ? theme.accent : theme.border },
                    { backgroundColor: selectedFont === f ? theme.accentSoft : 'transparent' },
                  ]}
                >
                  <Text style={{ color: theme.text, fontSize: 12 }}>{f}</Text>
                </Pressable>
              )}
            />

            <Pressable onPress={() => setShowSettings(false)} style={[s.closeBtn, { backgroundColor: theme.accent }]}>
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>Готово</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function styles(insets: any) {
  return StyleSheet.create({
    container: { flex: 1 },
    topBar: {
      flexDirection: 'row', alignItems: 'center',
      paddingTop: insets.top + 4, paddingHorizontal: 12, paddingBottom: 8,
      borderBottomWidth: 1,
    },
    backBtn: { padding: 8 },
    title: { flex: 1, fontSize: 16, fontWeight: '600', marginHorizontal: 4 },
    meta: { fontSize: 12 },
    iconBtn: { padding: 8 },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 100 },
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 24, paddingBottom: 40, maxHeight: '85%',
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: '#CCC',
      alignSelf: 'center', marginBottom: 16,
    },
    sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    sliderTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
    sliderFill: { height: '100%', borderRadius: 2 },
    themeChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
      borderWidth: 1.5,
    },
    fontChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    },
    closeBtn: {
      marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    },
  });
}
