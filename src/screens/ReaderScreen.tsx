import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  Modal, FlatList, NativeSyntheticEvent, NativeScrollEvent, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { getRecent, pushRecent, type RecentEntry } from '../utils/metaStore';
import { useTheme } from '../hooks/useTheme';
import { readingThemes } from '../theme/tokens';
import { fonts } from '../theme/fonts';
import { useReadingStyle } from '../context/AppSettingsContext';
import { CodeBlock } from '../components/CodeBlock';
import { ReaderTOC, Heading } from '../components/ReaderTOC';
import { ReadingProgressBar } from '../components/ReadingProgressBar';
import { Popover } from '../components/Popover';
import type { MenuAction } from '../components/OverflowMenu';

interface Props {
  route: any;
  navigation: any;
}

function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  const re = /^(#{1,6})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    out.push({ level: Math.min(3, m[1].length), title: m[2].trim(), charIndex: m.index });
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

// Режем по строкам (~150/чанк), заборы ``` не разрываем.
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

function useDoc(uri: string) {
  const [content, setContent] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!uri) { setContent(''); return; }
    (async () => {
      try {
        setContent(await FileSystem.readAsStringAsync(uri));
      } catch {
        setContent('# Ошибка чтения файла\n\nНе удалось открыть файл.');
      }
    })();
  }, [uri, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const headings = useMemo(() => parseHeadings(content), [content]);
  const chunks = useMemo(() => splitMarkdown(content), [content]);
  const stats = useMemo(() => {
    const words = content.split(/\s+/).filter(Boolean).length;
    return { words, readTime: Math.max(1, Math.ceil(words / 200)) };
  }, [content]);
  return { content, headings, chunks, stats, reload };
}

const ChunkView = React.memo(function ChunkView({ text, mdStyle, rules }: { text: string; mdStyle: any; rules: any }) {
  return <Markdown rules={rules} style={mdStyle}>{text}</Markdown>;
});

export default function ReaderScreen({ route, navigation }: Props) {
  const [mainUri, setMainUri] = useState<string>(route.params?.uri ?? '');
  const [mainTitle, setMainTitle] = useState<string>(route.params?.title ?? '');
  const [splitUri, setSplitUri] = useState<string | null>(null);
  const [splitTitle, setSplitTitle] = useState('');
  const { theme } = useTheme();
  const rs = useReadingStyle();
  const { fontSize, lineHeight, fontFamily, contentWidth, readingTheme, remountKey, app } = rs;
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuAt, setMenuAt] = useState({ x: 0, y: 0 });
  const [showRecent, setShowRecent] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [progress, setProgress] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const touchY = useRef(0);

  const main = useDoc(mainUri);
  const split = useDoc(splitUri ?? '');

  const rt = readingThemes[readingTheme] || readingThemes.default;
  const isDarkReading = rt.text === '#C9D1D9' || rt.text === '#E7E5E4' || rt.text === '#F8F8F2' || rt.text === '#586E75';

  const loadRecent = useCallback(async () => {
    try { setRecent(await getRecent()); } catch {}
  }, []);

  // Перечитываем файл при возврате из редактора — правки видны сразу.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      main.reload();
      if (splitUri) split.reload();
      loadRecent();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, mainUri, splitUri]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const openMain = async (uri: string, title: string) => {
    setMainUri(uri);
    setMainTitle(title);
    setShowRecent(false);
    try { setRecent(await pushRecent(uri, title)); } catch {}
  };

  const openSplit = async (uri: string, title: string) => {
    if (uri === mainUri) return;
    setSplitUri(uri);
    setSplitTitle(title);
    setShowRecent(false);
    try { setRecent(await pushRecent(uri, title)); } catch {}
  };

  const rules = useMemo(() => ({
    fence: (node: any) => <CodeBlock key={node.key} code={nodeText(node)} rt={rt} />,
    code_block: (node: any) => <CodeBlock key={node.key} code={nodeText(node)} rt={rt} />,
  }), [rt]);

  // Явная лесенка H1–H6: размер + жирность + отступы, каши нет.
  const mdStyle = useMemo(() => {
    const h = (scale: number, weight: '700' | '600', mt: number, mb: number) => ({
      color: rt.text, fontSize: fontSize * scale, fontWeight: weight, marginTop: mt, marginBottom: mb,
    });
    const cellBorder = rt.text + '35';
    return {
      body: {
        color: rt.text, fontSize,
        lineHeight: fontSize * lineHeight,
        fontFamily,
      },
      paragraph: { marginVertical: 7 },
      heading1: h(1.9, '700', 18, 12),
      heading2: h(1.6, '700', 16, 10),
      heading3: h(1.35, '600', 14, 8),
      heading4: h(1.15, '600', 12, 6),
      heading5: h(1.0, '600', 10, 6),
      heading6: { color: rt.text + 'AA', fontSize: fontSize * 0.9, fontWeight: '600', marginTop: 10, marginBottom: 6 },
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
      table: { borderWidth: 1, borderColor: cellBorder, borderRadius: 8, marginVertical: 8 },
      thead: {},
      tbody: {},
      th: { backgroundColor: rt.text + '08', padding: 8, borderBottomWidth: 1, borderRightWidth: 1, borderColor: cellBorder },
      td: { padding: 8, borderBottomWidth: 0.5, borderRightWidth: 1, borderColor: cellBorder },
      tr: { borderBottomWidth: 0 },
      hr: { backgroundColor: rt.text + '20', height: 1, marginVertical: 16 },
      list_item: { color: rt.text, fontSize, lineHeight: fontSize * lineHeight },
      bullet_list: { marginVertical: 6 },
      ordered_list: { marginVertical: 6 },
      strong: { fontWeight: '700' as const, color: rt.text },
      em: { fontStyle: 'italic' as const, color: rt.text },
    };
  }, [rt, fontSize, lineHeight, fontFamily, isDarkReading]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max = Math.max(1, contentSize.height - layoutMeasurement.height);
    setProgress(Math.max(0, Math.min(1, contentOffset.y / max)));
  };

  const jumpToHeading = (h: Heading) => {
    setShowTOC(false);
    let idx = 0;
    main.chunks.forEach((c, i) => { if (c.start <= h.charIndex) idx = i; });
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: true });
      } catch {}
    }, 100);
  };

  const openEditor = () => {
    navigation.navigate('Editor', { uri: mainUri, title: mainTitle });
  };

  const openMenuAt = (e: any) => {
    const { pageX, pageY } = e.nativeEvent ?? {};
    const { width: SW } = Dimensions.get('window');
    setMenuAt({
      x: (typeof pageX === 'number' ? pageX : SW) - 256,
      y: (typeof pageY === 'number' ? pageY : 0) + 8,
    });
    setShowMenu(true);
  };

  const menuActions: MenuAction[] = [];
  if (main.headings.length > 0) {
    menuActions.push({ icon: 'list-outline', label: 'Оглавление', onPress: () => setShowTOC(true) });
  }
  menuActions.push({ icon: 'pencil-outline', label: 'Редактировать', onPress: openEditor });
  if (!splitUri) {
    menuActions.push({ icon: 'columns-outline', label: 'Второй документ рядом', onPress: () => setShowRecent(true) });
  }
  menuActions.push({ icon: 'layers-outline', label: 'Быстрое переключение', onPress: () => setShowRecent(true) });
  menuActions.push(showUI
    ? { icon: 'eye-off-outline', label: 'Скрыть интерфейс', onPress: () => setShowUI(false) }
    : { icon: 'eye-outline', label: 'Показать интерфейс', onPress: () => setShowUI(true) });
  menuActions.push({ icon: 'settings-outline', label: 'Настройки чтения', onPress: () => setShowSettings(true) });

  const s = styles(insets);

  const renderPane = (
    chunks: Chunk[],
    title: string,
    isSplit: boolean,
    onCloseSplit?: () => void,
    onSwap?: () => void,
  ) => (
    <View style={[s.pane, isSplit && { borderLeftWidth: 1, borderLeftColor: rt.text + '20' }]}>
      {isSplit && (
        <View style={[s.splitBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
          <Text style={[s.splitTitle, { color: rt.text }]} numberOfLines={1}>{title}</Text>
          {onSwap && (
            <Pressable onPress={onSwap} hitSlop={8} style={s.iconBtn}>
              <Ionicons name="swap-horizontal-outline" size={18} color={rt.text} />
            </Pressable>
          )}
          <Pressable onPress={onCloseSplit} hitSlop={8} style={s.iconBtn}>
            <Ionicons name="close" size={18} color={rt.text} />
          </Pressable>
        </View>
      )}
      <View
        style={{ flex: 1 }}
        onTouchStart={(e) => { touchY.current = e.nativeEvent.pageY; }}
        onTouchEnd={(e) => {
          // Тап без скролла — вкл/выкл иммерсив. Свайпы не трогаем.
          if (Math.abs(e.nativeEvent.pageY - touchY.current) < 10) setShowUI((v) => !v);
        }}
      >
        <FlatList
          ref={isSplit ? undefined : listRef}
          key={remountKey + (isSplit ? '|split' : '|main')}
          data={chunks}
          keyExtractor={(_, i) => String(i)}
          style={s.scroll}
          contentContainerStyle={[s.content, { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}
          renderItem={({ item }) => <ChunkView text={item.text} mdStyle={mdStyle} rules={rules} />}
          onScroll={isSplit ? undefined : onScroll}
          scrollEventThrottle={16}
          removeClippedSubviews={true}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
        />
      </View>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: rt.bg }]}>
      {showUI && (
        <>
          <View style={[s.topBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
            <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="chevron-back" size={24} color={rt.text} />
            </Pressable>
            <Text style={[s.title, { color: rt.text }]} numberOfLines={1}>{mainTitle}</Text>
            <Text style={[s.meta, { color: rt.text + '60' }]}>
              {main.stats.words} сл. · ~{main.stats.readTime} мин
            </Text>
            <Pressable onPress={openMenuAt} style={s.iconBtn}>
              <Ionicons name="ellipsis-vertical" size={22} color={rt.text} />
            </Pressable>
          </View>
          <ReadingProgressBar progress={progress} color={theme.accent} />
        </>
      )}

      <View style={{ flex: 1, flexDirection: splitUri ? 'row' : 'column' }}>
        {renderPane(main.chunks, mainTitle, false)}
        {splitUri && renderPane(
          split.chunks,
          splitTitle,
          true,
          () => setSplitUri(null),
          () => {
            const u = mainUri, t = mainTitle;
            setMainUri(splitUri); setMainTitle(splitTitle);
            setSplitUri(u); setSplitTitle(t);
          },
        )}
      </View>

      <ReaderTOC
        visible={showTOC}
        headings={main.headings}
        theme={theme}
        rtText={rt.text}
        rtBg={rt.bg}
        onClose={() => setShowTOC(false)}
        onSelect={jumpToHeading}
      />

      <Popover
        visible={showMenu}
        x={menuAt.x}
        y={menuAt.y}
        title={mainTitle}
        theme={theme}
        onClose={() => setShowMenu(false)}
        actions={menuActions}
      />

      {/* Быстрое переключение + второй документ */}
      <Modal visible={showRecent} transparent animationType="slide" onRequestClose={() => setShowRecent(false)}>
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowRecent(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Недавние документы</Text>
            <FlatList
              data={recent}
              keyExtractor={(item) => item.uri}
              renderItem={({ item }) => (
                <View style={[s.recentRow, { borderBottomColor: theme.divider }]}>
                  <Pressable onPress={() => openMain(item.uri, item.title)} style={{ flex: 1 }}>
                    <Text style={[s.recentName, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[s.recentMeta, { color: theme.textSecondary }]}>
                      {new Date(item.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </Pressable>
                  {!splitUri && item.uri !== mainUri && (
                    <Pressable onPress={() => openSplit(item.uri, item.title)} hitSlop={8} style={s.iconBtn}>
                      <Ionicons name="copy-outline" size={20} color={theme.accent} />
                    </Pressable>
                  )}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showSettings} transparent animationType="slide">
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowSettings(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Настройки чтения</Text>

            <Text style={[s.label, { color: theme.textSecondary }]}>Размер шрифта: {fontSize}px</Text>
            <View style={s.sliderRow}>
              <Pressable onPress={() => app?.setFontSize(Math.max(12, fontSize - 1))}>
                <Ionicons name="remove-circle-outline" size={28} color={theme.accent} />
              </Pressable>
              <View style={[s.sliderTrack, { backgroundColor: theme.border }]}>
                <View style={[s.sliderFill, { width: `${((fontSize - 12) / 16) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
              <Pressable onPress={() => app?.setFontSize(Math.min(28, fontSize + 1))}>
                <Ionicons name="add-circle-outline" size={28} color={theme.accent} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: theme.textSecondary }]}>Межстрочный: {lineHeight.toFixed(1)}</Text>
            <View style={s.sliderRow}>
              <Pressable onPress={() => app?.setLineHeight(Math.max(1.2, +(lineHeight - 0.1).toFixed(1)))}>
                <Ionicons name="remove-circle-outline" size={28} color={theme.accent} />
              </Pressable>
              <View style={[s.sliderTrack, { backgroundColor: theme.border }]}>
                <View style={[s.sliderFill, { width: `${((lineHeight - 1.2) / 1.3) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
              <Pressable onPress={() => app?.setLineHeight(Math.min(2.5, +(lineHeight + 0.1).toFixed(1)))}>
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
                  onPress={() => app?.setReadingTheme(key)}
                  style={[
                    s.themeChip,
                    { backgroundColor: rt2.bg, borderColor: readingTheme === key ? theme.accent : rt2.text + '20' },
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
                  onPress={() => app?.setFont(f)}
                  style={[
                    s.fontChip,
                    { borderColor: rs.font === f ? theme.accent : theme.border },
                    { backgroundColor: rs.font === f ? theme.accentSoft : 'transparent' },
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
    pane: { flex: 1 },
    splitBar: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
      paddingTop: insets.top > 0 ? 4 : 8, paddingBottom: 4, borderBottomWidth: 1,
    },
    splitTitle: { flex: 1, fontSize: 13, fontWeight: '600', marginHorizontal: 4 },
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
    sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
    recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    recentName: { fontSize: 15, fontWeight: '500' },
    recentMeta: { fontSize: 12, marginTop: 2 },
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
