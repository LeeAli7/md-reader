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
import { getPosition, setPosition } from '../components/readingPos';
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

interface Doc {
  uri: string;
  title: string;
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
    let alive = true;
    (async () => {
      try {
        const text = await FileSystem.readAsStringAsync(uri);
        if (alive) setContent(text);
      } catch {
        if (alive) setContent('# Ошибка чтения файла\n\nНе удалось открыть файл.');
      }
    })();
    return () => { alive = false; };
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

const MAX_DOCS = 6;
const POS_KEY = 'r3pos_timer';

// Плавающий пузырь документа: тап — переключить, удержание — режим закрытия,
// перетаскивание на крестик — закрыть.
function DocBubble({
  doc, initial, color, onTap, onMove, onHold, onDrop, closing,
}: {
  doc: Doc;
  initial: { x: number; y: number };
  color: string;
  onTap: (uri: string) => void;
  onMove: (uri: string, pos: { x: number; y: number }) => void;
  onHold: (uri: string) => void;
  onDrop: (uri: string) => void;
  closing: boolean;
}) {
  const [pos, setPos] = useState(initial);
  const st = useRef({ sx: 0, sy: 0, moved: false, timer: null as any });
  const posRef = useRef(pos);
  posRef.current = pos;

  const clearTimer = () => {
    if (st.current.timer) { clearTimeout(st.current.timer); st.current.timer = null; }
  };

  return (
    <View
      style={[bubbleStyles.bub, { left: pos.x, top: pos.y, backgroundColor: color, borderColor: closing ? '#EF4444' : 'transparent' }]}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        st.current.sx = e.nativeEvent.pageX;
        st.current.sy = e.nativeEvent.pageY;
        st.current.moved = false;
        clearTimer();
        st.current.timer = setTimeout(() => onHold(doc.uri), 550);
      }}
      onResponderMove={(e) => {
        const dx = e.nativeEvent.pageX - st.current.sx;
        const dy = e.nativeEvent.pageY - st.current.sy;
        if (Math.abs(dx) + Math.abs(dy) > 14) st.current.moved = true;
        const { width: SW, height: SH } = Dimensions.get('window');
        setPos({
          x: Math.max(4, Math.min(initial.x + dx, SW - 52)),
          y: Math.max(60, Math.min(initial.y + dy, SH - 120)),
        });
      }}
      onResponderRelease={() => {
        clearTimer();
        if (closing) {
          onDrop(doc.uri);
        } else if (!st.current.moved) {
          onTap(doc.uri);
        }
        onMove(doc.uri, posRef.current);
      }}
      onResponderTerminate={clearTimer}
    >
      <Text style={bubbleStyles.letter} numberOfLines={1}>
        {(doc.title.trim()[0] || '?').toUpperCase()}
      </Text>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  bub: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, elevation: 8,
    zIndex: 50,
  },
  letter: { color: '#FFF', fontSize: 20, fontWeight: '700' },
});

export default function ReaderScreen({ route, navigation }: Props) {
  const initDoc: Doc = { uri: route.params?.uri ?? '', title: route.params?.title ?? '' };
  const [docs, setDocs] = useState<Doc[]>([initDoc]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [splitIdx, setSplitIdx] = useState<number | null>(null);
  const { theme } = useTheme();
  const rs = useReadingStyle();
  const { fontSize, lineHeight, fontFamily, contentWidth, readingTheme, remountKey, app } = rs;
  const insets = useSafeAreaInsets();
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuAt, setMenuAt] = useState({ x: 0, y: 0 });
  const [showRecent, setShowRecent] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [progress, setProgress] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [closingUri, setClosingUri] = useState<string | null>(null);
  const [bubPos, setBubPos] = useState<Record<string, { x: number; y: number }>>({});
  const touchY = useRef(0);

  const active = docs[activeIdx] ?? initDoc;
  const splitDoc = splitIdx !== null ? docs[splitIdx] : null;

  const main = useDoc(active.uri);
  const split = useDoc(splitDoc?.uri ?? '');

  // Позиции чтения: карта uri→доля, грузится один раз, пишется троттлом.
  const posMap = useRef<Record<string, number>>({});
  const posLoaded = useRef(false);
  const restored = useRef<Set<string>>(new Set());
  const lastFrac = useRef<Record<string, number>>({});
  const saveTimer = useRef<any>(null);
  const listRefs = useRef<Record<string, FlatList | null>>({});

  useEffect(() => {
    posLoaded.current = true;
    return () => {
      // Unmount любым способом — дописываем последнее известное.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      Object.entries(lastFrac.current).forEach(([u, f]) => { setPosition(u, f); });
    };
  }, []);

  const flushLater = useCallback(() => {
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      Object.entries(lastFrac.current).forEach(([u, f]) => { setPosition(u, f); });
    }, 500);
  }, []);

  const trackScroll = useCallback((uri: string, frac: number) => {
    const f = Math.max(0, Math.min(1, frac));
    lastFrac.current[uri] = f;
    if (Math.abs(f - (posMap.current[uri] ?? -1)) > 0.02) {
      posMap.current[uri] = f;
      flushLater();
    }
    return f;
  }, [flushLater]);

  const restoreFor = useCallback((uri: string, height: number) => {
    if (!uri || restored.current.has(uri) || !posLoaded.current) return;
    restored.current.add(uri);
    (async () => {
      try {
        const f = await getPosition(uri);
        posMap.current[uri] = f;
        lastFrac.current[uri] = f;
        if (f > 0.005 && height > 0) {
          setTimeout(() => {
            try { listRefs.current[uri]?.scrollToOffset({ offset: f * height, animated: false }); } catch {}
          }, 150);
        }
      } catch {}
    })();
  }, []);

  const rt = readingThemes[readingTheme] || readingThemes.default;
  const isDarkReading = rt.text === '#C9D1D9' || rt.text === '#E7E5E4' || rt.text === '#F8F8F2' || rt.text === '#586E75';

  const loadRecent = useCallback(async () => {
    try { setRecent(await getRecent()); } catch {}
  }, []);

  // Перечитываем файлы при возврате из редактора — правки видны сразу.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      main.reload();
      if (splitDoc) split.reload();
      loadRecent();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, active.uri, splitDoc?.uri]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const openDoc = async (uri: string, title: string) => {
    setDocs((prev) => {
      const i = prev.findIndex((d) => d.uri === uri);
      if (i >= 0) {
        setActiveIdx(i);
        return prev;
      }
      const next = [...prev, { uri, title }].slice(-MAX_DOCS);
      setActiveIdx(next.findIndex((d) => d.uri === uri));
      return next;
    });
    setShowRecent(false);
    try { setRecent(await pushRecent(uri, title)); } catch {}
  };

  const closeDoc = useCallback((uri: string) => {
    setClosingUri(null);
    setDocs((prev) => {
      const i = prev.findIndex((d) => d.uri === uri);
      if (i < 0) return prev;
      const next = prev.filter((d) => d.uri !== uri);
      if (next.length === 0) {
        setTimeout(() => navigation.goBack(), 50);
        return prev;
      }
      setActiveIdx((a) => {
        if (i < a) return a - 1;
        if (i === a) return Math.min(a, next.length - 1);
        return a;
      });
      setSplitIdx((sIdx) => {
        if (sIdx === null) return null;
        if (i === sIdx) return null;
        return i < sIdx ? sIdx - 1 : sIdx;
      });
      return next;
    });
  }, [navigation]);

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

  const makeOnScroll = (uri: string, isMain: boolean) => (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max = Math.max(1, contentSize.height - layoutMeasurement.height);
    const frac = Math.max(0, Math.min(1, contentOffset.y / max));
    trackScroll(uri, frac);
    if (isMain) setProgress(frac);
  };

  const makeContentSize = (uri: string) => (_w: number, h: number) => restoreFor(uri, h);

  const jumpToHeading = (h: Heading) => {
    setShowTOC(false);
    let idx = 0;
    main.chunks.forEach((c, i) => { if (c.start <= h.charIndex) idx = i; });
    setTimeout(() => {
      try {
        listRefs.current[active.uri]?.scrollToIndex({ index: idx, viewPosition: 0, animated: true });
      } catch {}
    }, 100);
  };

  const openEditor = () => {
    navigation.navigate('Editor', { uri: active.uri, title: active.title });
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
  if (splitIdx === null) {
    menuActions.push({ icon: 'columns-outline', label: 'Второй документ рядом', onPress: () => setShowRecent(true) });
  } else {
    menuActions.push({ icon: 'close-outline', label: 'Закрыть второй документ', onPress: () => setSplitIdx(null) });
  }
  menuActions.push({ icon: 'layers-outline', label: 'Быстрое переключение', onPress: () => setShowRecent(true) });
  menuActions.push(showUI
    ? { icon: 'eye-off-outline', label: 'Скрыть интерфейс', onPress: () => setShowUI(false) }
    : { icon: 'eye-outline', label: 'Показать интерфейс', onPress: () => setShowUI(true) });
  menuActions.push({ icon: 'settings-outline', label: 'Настройки чтения', onPress: () => setShowSettings(true) });

  const s = styles(insets);
  const { width: SW, height: SH } = Dimensions.get('window');

  const renderPane = (
    doc: Doc,
    chunks: Chunk[],
    isSplit: boolean,
    onCloseSplit?: () => void,
    onSwap?: () => void,
  ) => (
    <View style={[s.pane, isSplit && { borderLeftWidth: 1, borderLeftColor: rt.text + '20' }]}>
      {isSplit && (
        <View style={[s.splitBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
          <Text style={[s.splitTitle, { color: rt.text }]} numberOfLines={1}>{doc.title}</Text>
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
          ref={(r) => { listRefs.current[doc.uri] = r; }}
          key={remountKey + '|' + doc.uri}
          data={chunks}
          keyExtractor={(_, i) => String(i)}
          style={s.scroll}
          contentContainerStyle={[s.content, { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}
          renderItem={({ item }) => <ChunkView text={item.text} mdStyle={mdStyle} rules={rules} />}
          onScroll={makeOnScroll(doc.uri, !isSplit)}
          onContentSizeChange={makeContentSize(doc.uri)}
          scrollEventThrottle={16}
          removeClippedSubviews={true}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
        />
      </View>
    </View>
  );

  const bubbleDocs = docs.filter((d) => d.uri !== active.uri);
  const closeZone = { x: SW / 2 - 40, y: SH - 150, w: 80, h: 80 };

  return (
    <View style={[s.container, { backgroundColor: rt.bg }]}>
      {showUI && (
        <>
          <View style={[s.topBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
            <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="chevron-back" size={24} color={rt.text} />
            </Pressable>
            <Text style={[s.title, { color: rt.text }]} numberOfLines={1}>{active.title}</Text>
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

      <View style={{ flex: 1, flexDirection: splitDoc ? 'row' : 'column' }}>
        {renderPane(active, main.chunks, false)}
        {splitDoc && renderPane(
          splitDoc,
          split.chunks,
          true,
          () => setSplitIdx(null),
          () => {
            const a = activeIdx, sp = splitIdx;
            if (sp === null) return;
            setDocs((prev) => {
              const next = [...prev];
              const t = next[a];
              next[a] = next[sp];
              next[sp] = t;
              return next;
            });
            setActiveIdx(sp);
            setSplitIdx(a);
          },
        )}
      </View>

      {/* Плавающие доки */}
      {bubbleDocs.map((d, i) => (
        <DocBubble
          key={d.uri}
          doc={d}
          initial={bubPos[d.uri] ?? { x: SW - 60, y: 150 + i * 62 }}
          color={theme.accent}
          closing={closingUri === d.uri}
          onTap={(uri) => {
            const idx = docs.findIndex((x) => x.uri === uri);
            if (idx >= 0) setActiveIdx(idx);
          }}
          onMove={(uri, pos) => setBubPos((p) => ({ ...p, [uri]: pos }))}
          onHold={(uri) => setClosingUri(uri)}
          onDrop={(uri) => {
            const bx = (bubPos[uri] ?? { x: 0, y: 0 }).x + 24;
            const by = (bubPos[uri] ?? { x: 0, y: 0 }).y + 24;
            if (bx >= closeZone.x && bx <= closeZone.x + closeZone.w && by >= closeZone.y && by <= closeZone.y + closeZone.h) {
              closeDoc(uri);
            } else {
              setClosingUri(null);
            }
          }}
        />
      ))}
      {closingUri && (
        <View style={[s.closeZone, { left: closeZone.x, top: closeZone.y, width: closeZone.w, height: closeZone.h }]}>
          <Ionicons name="close-circle" size={56} color="#EF4444" />
        </View>
      )}

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
        title={active.title}
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
              renderItem={({ item }) => {
                const isOpen = docs.some((d) => d.uri === item.uri);
                return (
                  <View style={[s.recentRow, { borderBottomColor: theme.divider }]}>
                    <Pressable onPress={() => openDoc(item.uri, item.title)} style={{ flex: 1 }}>
                      <Text style={[s.recentName, { color: theme.text }]} numberOfLines={1}>
                        {isOpen ? '● ' : ''}{item.title}
                      </Text>
                      <Text style={[s.recentMeta, { color: theme.textSecondary }]}>
                        {new Date(item.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Pressable>
                    {splitIdx === null && item.uri !== active.uri && (
                      <Pressable
                        onPress={() => {
                          let idx = docs.findIndex((d) => d.uri === item.uri);
                          if (idx < 0) {
                            const next = [...docs, { uri: item.uri, title: item.title }].slice(-MAX_DOCS);
                            setDocs(next);
                            idx = next.findIndex((d) => d.uri === item.uri);
                          }
                          setSplitIdx(idx);
                          setShowRecent(false);
                        }}
                        hitSlop={8}
                        style={s.iconBtn}
                      >
                        <Ionicons name="columns-outline" size={20} color={theme.accent} />
                      </Pressable>
                    )}
                  </View>
                );
              }}
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
    closeZone: {
      position: 'absolute', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 40, zIndex: 40,
    },
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
