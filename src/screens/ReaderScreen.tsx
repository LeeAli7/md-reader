import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Image, ScrollView,
  Modal, FlatList, NativeSyntheticEvent, NativeScrollEvent, Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { exportFile } from '../utils/importExport';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { getRecent, pushRecent, getPosition, setPosition, type RecentEntry } from '../utils/metaStore';
import { getFolderTree, type FolderNode } from '../utils/folderTree';
import { loadReadable } from '../utils/documentLoader';
import PdfView from '../components/PdfView';
import { SmdDocView } from '../smd/smdRender';
import { mockSmdDoc, mockRichDoc, mockPages } from '../smd/smdMock';
import { parseSmd } from '../smd/smdParser';
import type { SmdDoc, SheetDoc } from '../smd/smdTypes';
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

function sheetsToMarkdown(sheets: { name: string; rows: string[][] }[]): string {
  return sheets.map((sh) => {
    const head = `## ${sh.name}`;
    if (sh.rows.length === 0) return `${head}\n\n_Пустой лист_`;
    const cols = Math.max(...sh.rows.map((r) => r.length));
    const esc = (c: string) => (c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const row = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => esc(r[i] ?? '')).join(' | ')} |`;
    const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
    return `${head}\n\n${row(sh.rows[0])}\n${sep}\n${sh.rows.slice(1).map(row).join('\n')}`;
  }).join('\n\n');
}

type DocKind = 'text' | 'sheet' | 'image' | 'pdf' | 'binary' | 'smd' | 'rich' | 'pages';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

function useDoc(uri: string) {
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<DocKind>('text');
  const [rev, setRev] = useState(0);
  const [tick, setTick] = useState(0);
  // Лицо .smd / rich / pages / sheets — данные мокаются под интерфейс Ares.
  const [smdDoc, setSmdDoc] = useState<SmdDoc | null>(null);
  const [richHtml, setRichHtml] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const [sheets, setSheets] = useState<SheetDoc[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const mtimeRef = useRef(0);
  useEffect(() => {
    if (!uri) { setContent(''); setKind('text'); return; }
    let alive = true;
    (async () => {
      try {
        const ext = uri.split('.').pop()?.toLowerCase() ?? '';
        if (IMAGE_EXTS.includes(ext)) {
          if (alive) {
            setKind('image');
            setContent(uri);
            setRev((r) => r + 1);
          }
          return;
        }
        if (ext === 'pdf') {
          if (alive) {
            setKind('pdf');
            setContent('');
            setRev((r) => r + 1);
          }
          return;
        }
        const info = await FileSystem.getInfoAsync(uri);
        if (alive) mtimeRef.current = info.exists ? (info.modificationTime ?? 0) : 0;
        // .smd — лицо: мок под интерфейс Ares { meta, blocks }, парсер приедет с движком.
        if (ext === 'smd') {
          const raw = await FileSystem.readAsStringAsync(uri).catch(() => '');
          if (!alive) return;
          setKind('smd');
          setContent(raw);
          try { setSmdDoc(parseSmd(raw, uri)); } catch { setSmdDoc(mockSmdDoc(uri, raw)); }
          setRev((r) => r + 1);
          return;
        }
        // any: движок Ares добавит kind 'rich'/'pages' — лицо уже готово.
        const loaded: any = await loadReadable(uri, ext);
        if (!alive) return;
        // rich (docx с картинками: html+images) и pages (pptx/odt/epub) —
        // данные от движка, фолбэк — моки лица.
        if (loaded.kind === 'rich') {
          setKind('rich');
          setRichHtml(loaded.html ?? mockRichDoc(uri.split('/').pop() ?? '').html);
          setContent('');
        } else if (loaded.kind === 'pages') {
          const hasReal = Array.isArray((loaded as any).pages) && (loaded as any).pages.length > 0;
          const pg: string[] = hasReal ? (loaded as any).pages : mockPages(loaded.text ?? '').pages;
          setKind('pages');
          setPages(pg);
          const head = (loaded as any).note ? `*${(loaded as any).note}*\n\n` : '';
          setContent(hasReal ? head + pg.join('\n\n---\n\n') : pg.join('\n\n'));
        } else if (loaded.kind === 'text') { setKind('text'); setContent(loaded.text ?? ''); }
        else if (loaded.kind === 'sheet') {
          setKind('sheet');
          setSheets((loaded.sheets ?? []) as SheetDoc[]);
          setSheetIdx(0);
          setContent(sheetsToMarkdown(loaded.sheets ?? []));
        }
        else { setKind('binary'); setContent(`# Не предпросмотр\n\n${loaded.note ?? 'Этот формат открывается через «Поделиться».'}`); }
        setRev((r) => r + 1);
      } catch {
        if (alive) { setKind('text'); setContent('# Ошибка чтения файла\n\nНе удалось открыть файл.'); }
      }
    })();
    return () => { alive = false; };
  }, [uri, tick]);
  // Перезачитать только если файл реально изменился (правка из редактора).
  // Пустой reload при каждом фокусе сносил позицию — больше так не делаем.
  const reloadIfChanged = useCallback(async () => {
    if (!uri) return;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      const mt = info.exists ? (info.modificationTime ?? 0) : 0;
      if (mt !== mtimeRef.current) setTick((t) => t + 1);
    } catch {}
  }, [uri]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const headings = useMemo(() => parseHeadings(content), [content]);
  // Активный лист xlsx — только его таблица; .smd — один чанк (блоки целы).
  const activeSheetMd = useMemo(() => {
    if (kind !== 'sheet' || sheets.length === 0) return '';
    return sheetsToMarkdown([sheets[Math.min(sheetIdx, sheets.length - 1)]]);
  }, [kind, sheets, sheetIdx]);
  const chunks = useMemo(() => {
    if (kind === 'smd') return content ? [{ text: content, start: 0 }] : [];
    if (kind === 'sheet') return splitMarkdown(activeSheetMd);
    return splitMarkdown(content);
  }, [content, kind, activeSheetMd]);
  const stats = useMemo(() => {
    const words = content.split(/\s+/).filter(Boolean).length;
    return { words, readTime: Math.max(1, Math.ceil(words / 200)) };
  }, [content]);
  return { content, kind, rev, headings, chunks, stats, reload, reloadIfChanged, smdDoc, richHtml, pages, sheets, sheetIdx, setSheetIdx };
}

const ChunkView = React.memo(function ChunkView({ text, mdStyle, rules }: { text: string; mdStyle: any; rules: any }) {
  return <Markdown rules={rules} style={mdStyle}>{text}</Markdown>;
});

// Постраничный текст (pptx/odt/epub от Ares): одна страница + навигация.
function PagesView({ pages, mdStyle, rules, rt }: { pages: string[]; mdStyle: any; rules: any; rt: any }) {
  const [idx, setIdx] = useState(0);
  const total = Math.max(1, pages.length);
  const i = Math.min(idx, total - 1);
  const btn = (disabled: boolean) => ({ opacity: disabled ? 0.3 : 1, padding: 10 });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Markdown rules={rules} style={mdStyle}>{pages[i] ?? ''}</Markdown>
      </ScrollView>
      {total > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: rt.text + '15', backgroundColor: rt.bg }}>
          <Pressable onPress={() => setIdx(Math.max(0, i - 1))} disabled={i === 0} style={btn(i === 0)}>
            <Ionicons name="chevron-back" size={24} color={rt.text} />
          </Pressable>
          <Text style={{ color: rt.text + '80', fontSize: 13 }}>Стр. {i + 1} / {total}</Text>
          <Pressable onPress={() => setIdx(Math.min(total - 1, i + 1))} disabled={i === total - 1} style={btn(i === total - 1)}>
            <Ionicons name="chevron-forward" size={24} color={rt.text} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const MAX_DOCS = 6;

// Плавающий пузырь документа на пружинах: появление scale-spring, drag за пальцем,
// над крестиком — магнит (scale 1.3 + красная рамка). Тап — переключить,
// удержание 550мс — режим закрытия, дроп на крестик — закрыть.
function DocBubble({
  doc, initial, color, onTap, onMove, onHold, onDrop, onDragLive, closing,
}: {
  doc: Doc;
  initial: { x: number; y: number };
  color: string;
  onTap: (uri: string) => void;
  onMove: (uri: string, pos: { x: number; y: number }) => void;
  onHold: (uri: string) => void;
  onDrop: (uri: string) => void;
  onDragLive: (uri: string, cx: number, cy: number) => void;
  closing: boolean;
}) {
  const base = useRef({ ...initial });
  const [at, setAt] = useState({ ...initial });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(0)).current;
  const st = useRef({ sx: 0, sy: 0, moved: false, timer: null as any, over: false });

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [scale]);

  const clearTimer = () => {
    if (st.current.timer) { clearTimeout(st.current.timer); st.current.timer = null; }
  };

  const setOver = (over: boolean) => {
    if (st.current.over === over) return;
    st.current.over = over;
    Animated.spring(scale, { toValue: over ? 1.3 : 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  };

  return (
    <Animated.View
      style={[
        bubbleStyles.bub,
        {
          left: at.x,
          top: at.y,
          backgroundColor: color,
          borderColor: closing ? '#EF4444' : 'transparent',
          transform: [...(pan as any).getTranslateTransform(), { scale }],
        },
      ]}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        st.current.sx = e.nativeEvent.pageX;
        st.current.sy = e.nativeEvent.pageY;
        st.current.moved = false;
        clearTimer();
        st.current.timer = setTimeout(() => onHold(doc.uri), 550);
      }}
      onResponderMove={(e) => {
        const { width: SW, height: SH } = Dimensions.get('window');
        const dx = e.nativeEvent.pageX - st.current.sx;
        const dy = e.nativeEvent.pageY - st.current.sy;
        if (Math.abs(dx) + Math.abs(dy) > 14) st.current.moved = true;
        const nx = Math.max(-base.current.x + 4, Math.min(dx, SW - 52 - base.current.x));
        const ny = Math.max(-base.current.y + 60, Math.min(dy, SH - 120 - base.current.y));
        pan.setValue({ x: nx, y: ny });
        const cx = base.current.x + nx + 24;
        const cy = base.current.y + ny + 24;
        onDragLive(doc.uri, cx, cy);
        if (closing) {
          const zx = SW / 2, zy = SH - 110;
          setOver(Math.hypot(cx - zx, cy - zy) < 70);
        }
      }}
      onResponderRelease={() => {
        clearTimer();
        pan.stopAnimation((v: any) => {
          base.current = { x: base.current.x + (v.x || 0), y: base.current.y + (v.y || 0) };
          pan.setValue({ x: 0, y: 0 });
          setAt({ ...base.current });
          onMove(doc.uri, { ...base.current });
        });
        if (closing) {
          setOver(false);
          onDrop(doc.uri);
        } else if (!st.current.moved) {
          onTap(doc.uri);
        }
      }}
      onResponderTerminate={clearTimer}
    >
      <Text style={bubbleStyles.letter} numberOfLines={1}>
        {(doc.title.trim()[0] || '?').toUpperCase()}
      </Text>
    </Animated.View>
  );
}

// Крестик с пружинным появлением, зона минимум 88pt.
function CloseX() {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
  }, [s]);
  return (
    <Animated.View style={{ transform: [{ scale: s }] }}>
      <Ionicons name="close-circle" size={64} color="#EF4444" />
    </Animated.View>
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
  // Свитчер в режиме «в сплит»: выбор файла открывает его второй панелью.
  const [splitPick, setSplitPick] = useState(false);
  const [switchTab, setSwitchTab] = useState<'recent' | 'files'>('recent');
  const [treeData, setTreeData] = useState<FolderNode[] | null>(null);
  const [treeFolder, setTreeFolder] = useState<string | null>(null);
  const [treeFiles, setTreeFiles] = useState<{ uri: string; title: string }[]>([]);
  const [showUI, setShowUI] = useState(true);
  const [progress, setProgress] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [closingUri, setClosingUri] = useState<string | null>(null);
  const dragLive = useRef<Record<string, { x: number; y: number }>>({});
  const [bubPos, setBubPos] = useState<Record<string, { x: number; y: number }>>({});
  const touchY = useRef(0);

  const active = docs[activeIdx] ?? initDoc;
  const splitDoc = splitIdx !== null ? docs[splitIdx] : null;

  const main = useDoc(active.uri);
  const split = useDoc(splitDoc?.uri ?? '');

  // Позиции чтения: доля 0..1 на uri. Пишем троттлом, читаем когда известны
  // ОБЕ высоты (контент + вьюпорт) и контент загружен — иначе рестор мимо.
  const posMap = useRef<Record<string, number>>({});
  // Гейт ресторa: uri→rev, на котором рестор уже отработал.
  // Пустой список (контент ещё грузится) рестор не маркирует — ждём чанки той же ревизии.
  const restored = useRef<Record<string, number>>({});
  const lastFrac = useRef<Record<string, number>>({});
  const saveTimer = useRef<any>(null);
  const listRefs = useRef<Record<string, FlatList | null>>({});
  const contentH = useRef<Record<string, number>>({});
  const viewportH = useRef<Record<string, number>>({});

  useEffect(() => {
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

  const tryRestore = useCallback((uri: string, chunkCount: number, rev: number) => {
    if (!uri || chunkCount === 0) return;
    if ((restored.current[uri] ?? -1) >= rev) return;
    const ch = contentH.current[uri] ?? 0;
    const vh = viewportH.current[uri] ?? 0;
    if (vh <= 0 || ch <= 0) return;
    if (ch <= vh + 4) {
      // Крутить нечего (всё влезает) — помечаем готовым, позиция 0.
      restored.current[uri] = rev;
      posMap.current[uri] = 0;
      lastFrac.current[uri] = 0;
      return;
    }
    restored.current[uri] = rev;
    (async () => {
      try {
        const f = await getPosition(uri);
        posMap.current[uri] = f;
        lastFrac.current[uri] = f;
        if (f > 0.005) {
          const y = f * (ch - vh);
          setTimeout(() => {
            try { listRefs.current[uri]?.scrollToOffset({ offset: y, animated: false }); } catch {}
          }, 120);
        }
      } catch {}
    })();
  }, []);

  const rt = readingThemes[readingTheme] || readingThemes.default;
  const isDarkReading = rt.text === '#C9D1D9' || rt.text === '#E7E5E4' || rt.text === '#F8F8F2' || rt.text === '#586E75';

  const loadRecent = useCallback(async () => {
    try { setRecent(await getRecent()); } catch {}
  }, []);

  // Возврат из редактора: перезачитываем только реально изменившиеся файлы,
  // иначе позиция жива. Новый контент сносит restored — tryRestore отрабатывает заново.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      main.reloadIfChanged();
      if (splitDoc) split.reloadIfChanged();
      loadRecent();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, active.uri, splitDoc?.uri]);

  // (rev-эффекты больше не нужны: гейт tryRestore сам ключуется ревизией.)

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const openSplitDoc = (uri: string, title: string) => {
    const ix = docs.findIndex((d) => d.uri === uri);
    if (ix < 0) {
      const next = [...docs, { uri, title }].slice(-MAX_DOCS);
      const ni = next.findIndex((d) => d.uri === uri);
      setDocs(next);
      setSplitIdx(ni);
    } else {
      setSplitIdx(ix);
    }
    Haptics.selectionAsync().catch(() => {});
    setShowRecent(false);
  };

  const openDoc = async (uri: string, title: string) => {
    const i = docs.findIndex((d) => d.uri === uri);
    if (i >= 0) {
      activateIdx(i);
    } else {
      const next = [...docs, { uri, title }].slice(-MAX_DOCS);
      const ni = next.findIndex((d) => d.uri === uri);
      setDocs(next);
      setActiveIdx(ni);
    }
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

  const makeContentSize = (uri: string, chunkCount: number, rev: number) => (_w: number, h: number) => {
    contentH.current[uri] = h;
    tryRestore(uri, chunkCount, rev);
  };

  const makeLayout = (uri: string, chunkCount: number, rev: number) => (e: any) => {
    viewportH.current[uri] = e.nativeEvent.layout.height;
    tryRestore(uri, chunkCount, rev);
  };

  // Активация дока: рестор отработает заново по гейту rev (флаг сбрасывать не надо).
  const activateIdx = useCallback((i: number) => {
    setActiveIdx(i);
  }, []);

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

  // Выбор из свитчера: обычный режим — открыть, режим «в сплит» — второй панелью.
  const pickFromSwitcher = (uri: string, title: string) => {
    if (splitPick) {
      setSplitPick(false);
      openSplitDoc(uri, title);
    } else {
      openDoc(uri, title);
    }
  };

  const closeSwitcher = () => {
    setSplitPick(false);
    setShowRecent(false);
  };

  const openSwitcherTab = async (tab: 'recent' | 'files') => {
    setSwitchTab(tab);
    if (tab === 'files' && !treeData) {
      try {
        setTreeData(await getFolderTree());
      } catch {
        setTreeData([]);
      }
    }
  };

  const pickTreeFolder = async (uri: string | null) => {
    setTreeFolder(uri);
    if (!uri) { setTreeFiles([]); return; }
    try {
      const items = await FileSystem.readDirectoryAsync(uri);
      const out: { uri: string; title: string }[] = [];
      for (const name of items) {
        const furi = uri + name;
        const info = await FileSystem.getInfoAsync(furi);
        if (!info.isDirectory) out.push({ uri: furi, title: name });
      }
      out.sort((a, b) => a.title.localeCompare(b.title));
      setTreeFiles(out);
    } catch {
      setTreeFiles([]);
    }
  };

  const flatFolders = useMemo(() => {
    const out: { node: FolderNode; depth: number }[] = [];
    const walk = (nodes: FolderNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        walk(n.children ?? [], depth + 1);
      }
    };
    if (treeData) walk(treeData, 0);
    return out;
  }, [treeData]);

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
    menuActions.push({ icon: 'copy-outline', label: 'Разделить экран', onPress: () => { setSplitPick(true); setShowRecent(true); } });
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
    dd: ReturnType<typeof useDoc>,
    isSplit: boolean,
    onCloseSplit?: () => void,
    onSwap?: () => void,
  ) => (
    <View style={[s.pane, isSplit && { borderTopWidth: 1, borderTopColor: rt.text + '20' }]}>
      {isSplit && (
        <View style={[s.splitBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
          <Text style={[s.splitTitle, { color: rt.text }]} numberOfLines={1}>{doc.title}</Text>
          {onSwap && (
            <Pressable onPress={onSwap} hitSlop={8} style={s.iconBtn}>
              <Ionicons name="swap-vertical-outline" size={18} color={rt.text} />
            </Pressable>
          )}
          <Pressable onPress={onCloseSplit} hitSlop={8} style={s.iconBtn}>
            <Ionicons name="close" size={18} color={rt.text} />
          </Pressable>
        </View>
      )}
      {dd.kind === 'image' ? (
        <View style={[s.imageWrap, { backgroundColor: '#000' }]}>
          <Image source={{ uri: doc.uri }} style={s.image} resizeMode="contain" />
        </View>
      ) : dd.kind === 'pdf' ? (
        <View style={{ flex: 1 }}>
          <PdfView uri={doc.uri} />
        </View>
      ) : dd.kind === 'rich' ? (
        <View style={{ flex: 1 }}>
          <WebView
            originWhitelist={['*']}
            source={{ html: dd.richHtml }}
            style={{ flex: 1, backgroundColor: rt.bg }}
          />
        </View>
      ) : dd.kind === 'pages' ? (
        <PagesView key={doc.uri} pages={dd.pages} mdStyle={mdStyle} rules={rules} rt={rt} />
      ) : (
      <View
        style={{ flex: 1 }}
        onLayout={makeLayout(doc.uri, dd.chunks.length, dd.rev)}
        onTouchStart={(e) => { touchY.current = e.nativeEvent.pageY; }}
        onTouchEnd={(e) => {
          // Тап без скролла — вкл/выкл иммерсив. Свайпы не трогаем.
          // В .smd тапы заняты интерактивом блоков — иммерсив не трогаем.
          if (dd.kind !== 'smd' && Math.abs(e.nativeEvent.pageY - touchY.current) < 10) setShowUI((v) => !v);
        }}
      >
        {dd.kind === 'sheet' && dd.sheets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderBottomWidth: 1, borderBottomColor: rt.text + '15', maxHeight: 48 }}>
            <View style={{ flexDirection: 'row', gap: 4, padding: 8 }}>
              {dd.sheets.map((sh, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    dd.setSheetIdx(i);
                    try { listRefs.current[doc.uri]?.scrollToOffset({ offset: 0, animated: false }); } catch {}
                  }}
                  style={{ borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: i === dd.sheetIdx ? theme.accentSoft : 'transparent' }}
                >
                  <Text style={{ color: i === dd.sheetIdx ? theme.accent : rt.text + '80', fontSize: 13, fontWeight: '600' }}>
                    {sh.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
        <FlatList
          ref={(r) => { listRefs.current[doc.uri] = r; }}
          key={remountKey + '|' + doc.uri}
          data={dd.chunks}
          keyExtractor={(_, i) => String(i)}
          style={s.scroll}
          contentContainerStyle={[s.content, { maxWidth: contentWidth, alignSelf: 'center', width: '100%' }]}
          renderItem={({ item, index }) => {
            if (dd.kind === 'smd') {
              if (index > 0 || !dd.smdDoc) return null;
              return <SmdDocView doc={dd.smdDoc} mdStyle={mdStyle} rt={rt} fontSize={fontSize} />;
            }
            return <ChunkView text={item.text} mdStyle={mdStyle} rules={rules} />;
          }}
          onScroll={makeOnScroll(doc.uri, !isSplit)}
          onContentSizeChange={makeContentSize(doc.uri, dd.chunks.length, dd.rev)}
          scrollEventThrottle={16}
          removeClippedSubviews={true}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={5}
        />
        {dd.kind === 'binary' && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              exportFile(doc.uri, doc.title).catch(() => {});
            }}
            style={[s.openVia, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="share-outline" size={18} color="#FFF" />
            <Text style={s.openViaText}>Открыть через…</Text>
          </Pressable>
        )}
      </View>
      )}
    </View>
  );

  const bubbleDocs = docs.filter((d) => d.uri !== active.uri);
  const closeZone = { x: SW / 2 - 44, y: SH - 158, w: 88, h: 88 };

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

      <View style={{ flex: 1, flexDirection: 'column' }}>
        {renderPane(active, main, false)}
        {splitDoc && renderPane(
          splitDoc,
          split,
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
            if (idx >= 0) {
              Haptics.selectionAsync().catch(() => {});
              activateIdx(idx);
            }
          }}
          onMove={(uri, pos) => setBubPos((p) => ({ ...p, [uri]: pos }))}
          onDragLive={(uri, cx, cy) => { dragLive.current[uri] = { x: cx, y: cy }; }}
          onHold={(uri) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setClosingUri(uri);
          }}
          onDrop={(uri) => {
            const p = dragLive.current[uri] ?? { x: -999, y: -999 };
            if (p.x >= closeZone.x && p.x <= closeZone.x + closeZone.w && p.y >= closeZone.y && p.y <= closeZone.y + closeZone.h) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              closeDoc(uri);
            } else {
              setClosingUri(null);
            }
          }}
        />
      ))}
      {closingUri && (
        <View style={[s.closeZone, { left: closeZone.x, top: closeZone.y, width: closeZone.w, height: closeZone.h }]}>
          <CloseX />
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
      <Modal visible={showRecent} transparent animationType="slide" onRequestClose={closeSwitcher}>
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={closeSwitcher} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>
              {splitPick ? 'В какой файл разделить?' : 'Документы'}
            </Text>
            <View style={s.switchTabs}>
              {([['recent', 'Недавние'], ['files', 'Файлы']] as const).map(([k, label]) => (
                <Pressable
                  key={k}
                  onPress={() => openSwitcherTab(k)}
                  style={[s.switchTab, switchTab === k && { backgroundColor: theme.accentSoft }]}
                >
                  <Text style={[s.switchTabText, { color: switchTab === k ? theme.accent : theme.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {switchTab === 'recent' ? (
            <FlatList
              data={recent}
              keyExtractor={(item) => item.uri}
              renderItem={({ item }) => {
                const isOpen = docs.some((d) => d.uri === item.uri);
                return (
                  <View style={[s.recentRow, { borderBottomColor: theme.divider }]}>
                    <Pressable onPress={() => pickFromSwitcher(item.uri, item.title)} style={{ flex: 1 }}>
                      <Text style={[s.recentName, { color: theme.text }]} numberOfLines={1}>
                        {isOpen ? '● ' : ''}{item.title}
                      </Text>
                      <Text style={[s.recentMeta, { color: theme.textSecondary }]}>
                        {new Date(item.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Pressable>
                    {splitIdx === null && !splitPick && item.uri !== active.uri && (
                      <Pressable
                        onPress={() => openSplitDoc(item.uri, item.title)}
                        hitSlop={8}
                        style={s.iconBtn}
                      >
                        <Ionicons name="copy-outline" size={20} color={theme.accent} />
                      </Pressable>
                    )}
                  </View>
                );
              }}
            />
            ) : (
            <View style={{ flex: 1 }}>
              {treeFolder && (
                <Pressable onPress={() => pickTreeFolder(null)} style={s.backRow}>
                  <Ionicons name="chevron-back" size={18} color={theme.accent} />
                  <Text style={[s.backRowText, { color: theme.accent }]}>Все папки</Text>
                </Pressable>
              )}
              {!treeFolder ? (
              <FlatList
                data={flatFolders}
                keyExtractor={(item) => item.node.uri}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => pickTreeFolder(item.node.uri)}
                    style={[s.tagRow, { borderBottomColor: theme.divider, paddingLeft: 4 + item.depth * 16 }]}
                  >
                    <Ionicons name="folder-outline" size={18} color={theme.textSecondary} />
                    <Text style={[s.tagName, { color: theme.text }]} numberOfLines={1}>{item.node.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                  </Pressable>
                )}
              />
              ) : (
              <FlatList
                data={treeFiles}
                keyExtractor={(item) => item.uri}
                renderItem={({ item }) => {
                  const isOpen = docs.some((d) => d.uri === item.uri);
                  return (
                    <View style={[s.recentRow, { borderBottomColor: theme.divider }]}>
                      <Pressable onPress={() => pickFromSwitcher(item.uri, item.title)} style={{ flex: 1 }}>
                        <Text style={[s.recentName, { color: theme.text }]} numberOfLines={1}>
                          {isOpen ? '● ' : ''}{item.title}
                        </Text>
                      </Pressable>
                      {splitIdx === null && !splitPick && item.uri !== active.uri && (
                        <Pressable
                          onPress={() => openSplitDoc(item.uri, item.title)}
                          hitSlop={8}
                          style={s.iconBtn}
                        >
                          <Ionicons name="copy-outline" size={20} color={theme.accent} />
                        </Pressable>
                      )}
                    </View>
                  );
                }}
              />
              )}
            </View>
            )}
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
    imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    image: { width: '100%', height: '100%' },
    openVia: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginHorizontal: 20, marginBottom: 24, paddingVertical: 14, borderRadius: 12,
    },
    openViaText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
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
    sheetTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    switchTabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    switchTab: { borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 },
    switchTabText: { fontSize: 14, fontWeight: '600' },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    tagName: { flex: 1, fontSize: 15, fontWeight: '500' },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
    backRowText: { fontSize: 15, fontWeight: '600' },
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
