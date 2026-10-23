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
import { parseSmd, smdToc } from '../smd/smdParser';
import type { SmdDoc, SheetDoc } from '../smd/smdTypes';
import { useTheme } from '../hooks/useTheme';
import { readingThemes, getReadingTheme } from '../theme/tokens';
import { readingFonts, getReadingFont, LINE_HEIGHTS } from '../theme/fonts';
import { type as tp, font as uiFontOf, mono } from '../theme/type';
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
// Номер страницы переживает выходы/переключения (доля в metaStore).
function PagesView({ uri, pages, mdStyle, rules, rt }: { uri: string; pages: string[]; mdStyle: any; rules: any; rt: any }) {
  const [idx, setIdx] = useState(0);
  const total = Math.max(1, pages.length);
  const i = Math.min(idx, total - 1);
  useEffect(() => {
    let alive = true;
    getPosition(uri).then((f) => {
      if (alive && f > 0 && total > 1) setIdx(Math.min(total - 1, Math.round(f * (total - 1))));
    }).catch(() => {});
    return () => { alive = false; };
  }, [uri]);
  const go = (n: number) => {
    setIdx(n);
    setPosition(uri, total <= 1 ? 0 : n / (total - 1)).catch(() => {});
  };
  const btn = (disabled: boolean) => ({ opacity: disabled ? 0.3 : 1, padding: 10 });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Markdown rules={rules} style={mdStyle}>{pages[i] ?? ''}</Markdown>
      </ScrollView>
      {total > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: rt.text + '15', backgroundColor: rt.bg }}>
          <Pressable onPress={() => go(Math.max(0, i - 1))} disabled={i === 0} style={btn(i === 0)}>
            <Ionicons name="chevron-back" size={24} color={rt.text} />
          </Pressable>
          <Text style={{ color: rt.text + '80', fontSize: 13 }}>Стр. {i + 1} / {total}</Text>
          <Pressable onPress={() => go(Math.min(total - 1, i + 1))} disabled={i === total - 1} style={btn(i === total - 1)}>
            <Ionicons name="chevron-forward" size={24} color={rt.text} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const MAX_DOCS = 6;

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
  const richRefs = useRef<Record<string, WebView | null>>({});
  const contentH = useRef<Record<string, number>>({});
  const viewportH = useRef<Record<string, number>>({});
  // .smd: uri → индекс блока → Y (точные прыжки оглавления).
  const smdBlockY = useRef<Record<string, Record<number, number>>>({});
  // Рестор: сохранённая доля + высота, на которой отресторились (рост контента дотягиваем).
  const restoredFrac = useRef<Record<string, number>>({});
  const restoredCh = useRef<Record<string, number>>({});

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
      restoredFrac.current[uri] = 0;
      restoredCh.current[uri] = ch;
      return;
    }
    restored.current[uri] = rev;
    (async () => {
      try {
        const f = await getPosition(uri);
        posMap.current[uri] = f;
        lastFrac.current[uri] = f;
        restoredFrac.current[uri] = f;
        restoredCh.current[uri] = ch;
        if (f > 0.005) {
          const y = f * (ch - vh);
          setTimeout(() => {
            try { listRefs.current[uri]?.scrollToOffset({ offset: y, animated: false }); } catch {}
          }, 120);
        }
      } catch {}
    })();
  }, []);

  // Тема листа — объект по id, тёмность берём из флага, а не из сравнения hex.
  const rt = getReadingTheme(readingTheme);
  const isDarkReading = rt.dark;

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
      paragraph: { marginVertical: 8 },
      heading1: { ...h(1.55, '700', 26, 10), fontFamily: rs.boldFamily, letterSpacing: -0.4 },
      heading2: { ...h(1.32, '700', 22, 8), fontFamily: rs.boldFamily, letterSpacing: -0.3 },
      heading3: { ...h(1.14, '700', 18, 6), fontFamily: rs.boldFamily },
      heading4: { ...h(1.02, '700', 14, 4), fontFamily: rs.boldFamily },
      heading5: { ...h(0.96, '700', 12, 4), fontFamily: rs.boldFamily },
      heading6: { color: rt.muted, fontSize: fontSize * 0.88, fontFamily: rs.boldFamily, marginTop: 10, marginBottom: 4 },
      // Ссылки — единственный акцент: белый на КРОВИ, системный синий на светлом.
      link: { color: rt.dark ? '#FFFFFF' : '#0A84FF', textDecorationLine: 'underline' as const },
      code_inline: {
        backgroundColor: rt.fill,
        color: rt.text, fontSize: fontSize * 0.88, borderRadius: 5,
        paddingHorizontal: 6, paddingVertical: 2, fontFamily: 'JetBrainsMono',
      },
      // Цитата: вертикальная линейка на весь тон текста, без плашки — как в книге.
      blockquote: {
        borderLeftColor: rt.rule,
        borderLeftWidth: 2,
        paddingLeft: 16,
        marginLeft: 0,
        marginVertical: 14,
        paddingVertical: 2,
        paddingRight: 4,
      },
      table: { borderWidth: 1, borderColor: cellBorder, borderRadius: 10, marginVertical: 10, overflow: 'hidden' as const },
      thead: {},
      tbody: {},
      th: { backgroundColor: rt.fill, padding: 10, fontFamily: rs.boldFamily, borderBottomWidth: 1, borderColor: cellBorder },
      td: { padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: cellBorder },
      tr: { borderBottomWidth: 0 },
      hr: { backgroundColor: rt.fill, height: 1, marginVertical: 20 },
      list_item: { color: rt.text, fontSize, lineHeight: fontSize * lineHeight, marginVertical: 2 },
      bullet_list: { marginVertical: 8 },
      ordered_list: { marginVertical: 8 },
      // strong/em — реальные начертания, а не синтетический вес.
      strong: { fontFamily: rs.boldFamily, color: rt.text },
      em: { fontFamily: rs.italicFamily, color: rt.text },
    };
  }, [rt, fontSize, lineHeight, fontFamily, rs.boldFamily, rs.italicFamily, isDarkReading]);

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
    // Контент дорос ПОСЛЕ ресторa (картинки, раскладка markdown) — ранний рестор
    // попал мимо (доля от меньшей высоты). Дотягиваем, если юзер сам не крутил.
    const rf = restoredFrac.current[uri];
    const rc = restoredCh.current[uri] ?? 0;
    if (rf !== undefined && rf > 0.005 && rc > 0 && h > rc * 1.15) {
      const lf = lastFrac.current[uri] ?? rf;
      restoredCh.current[uri] = h;
      if (Math.abs(lf - rf) < 0.02) {
        const vh = viewportH.current[uri] ?? 0;
        const y = rf * Math.max(0, h - vh);
        setTimeout(() => {
          try { listRefs.current[uri]?.scrollToOffset({ offset: y, animated: false }); } catch {}
        }, 60);
      }
    }
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
    setTimeout(() => {
      try {
        // .smd: точный прыжок по замеренной координате блока.
        // Дальние блоки виртуализированы (не замерены) — едем оценкой по доле.
        if (h.blockIdx !== undefined && h.blockIdx >= 0) {
          let y = smdBlockY.current[active.uri]?.[h.blockIdx];
          if (typeof y !== 'number') {
            const n = Math.max(1, main.smdDoc?.blocks.length ?? 1);
            const ch = contentH.current[active.uri] ?? 0;
            const vh = viewportH.current[active.uri] ?? 0;
            y = (Math.min(h.blockIdx, n - 1) / n) * Math.max(0, ch - vh);
          }
          listRefs.current[active.uri]?.scrollToOffset({ offset: Math.max(0, y - 60), animated: true });
          return;
        }
        // md/text/sheet: scrollToIndex на виртуализированном списке падает молча —
        // едем долей от charIndex (замеров не требует, мимо не бьёт).
        const len = Math.max(1, main.content.length);
        const frac = Math.max(0, Math.min(1, h.charIndex / len));
        const ch = contentH.current[active.uri] ?? 0;
        const vh = viewportH.current[active.uri] ?? 0;
        listRefs.current[active.uri]?.scrollToOffset({ offset: frac * Math.max(0, ch - vh), animated: true });
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
  // .smd: оглавление из блоков (термины, вопросы, задачи), md/text/sheet — из #.
  const tocHeadings: Heading[] = main.kind === 'smd' && main.smdDoc
    ? smdToc(main.smdDoc).map((e: { level: number; title: string; blockIdx: number }) => ({ level: e.level, title: e.title, charIndex: -1, blockIdx: e.blockIdx }))
    : main.headings;
  if (tocHeadings.length > 0) {
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
            ref={(r) => { richRefs.current[doc.uri] = r; }}
            originWhitelist={['*']}
            source={{ html: dd.richHtml }}
            style={{ flex: 1, backgroundColor: rt.bg }}
            injectedJavaScript={`(function(){var last=0;window.addEventListener('scroll',function(){var h=document.documentElement.scrollHeight-window.innerHeight;if(h<=0)return;var f=window.scrollY/h;var n=Date.now();if(n-last>500){last=n;window.ReactNativeWebView.postMessage(JSON.stringify({t:'pos',f:f}));}},{passive:true});})();true;`}
            onMessage={(e) => {
              try {
                const d = JSON.parse(e.nativeEvent.data);
                if (d && d.t === 'pos' && typeof d.f === 'number') trackScroll(doc.uri, d.f);
              } catch {}
            }}
            onLoadEnd={() => {
              const wv = richRefs.current[doc.uri];
              if (!wv) return;
              getPosition(doc.uri).then((f) => {
                if (f > 0.005) {
                  try {
                    wv.injectJavaScript(`window.scrollTo(0,(${f})*Math.max(0,document.documentElement.scrollHeight-window.innerHeight));true;`);
                  } catch {}
                }
              }).catch(() => {});
            }}
          />
        </View>
      ) : dd.kind === 'pages' ? (
        <PagesView key={doc.uri} uri={doc.uri} pages={dd.pages} mdStyle={mdStyle} rules={rules} rt={rt} />
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
              return (
                <SmdDocView
                  doc={dd.smdDoc}
                  mdStyle={mdStyle}
                  rt={rt}
                  fontSize={fontSize}
                  docKey={doc.uri}
                  onAskTask={(t) => navigation.navigate('TaskChat', t)}
                  onBlockLayout={(i, y) => {
                    const m = smdBlockY.current[doc.uri] ?? {};
                    m[i] = y;
                    smdBlockY.current[doc.uri] = m;
                  }}
                />
              );
            }
            return <ChunkView text={item.text} mdStyle={mdStyle} rules={rules} />;
          }}
          onScroll={makeOnScroll(doc.uri, !isSplit)}
          onContentSizeChange={makeContentSize(doc.uri, dd.chunks.length, dd.rev)}
          scrollEventThrottle={16}
          removeClippedSubviews={true}
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          windowSize={11}
          persistentScrollbar={true}
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

  // Превью открытых документов для свитчера: первые строки текста.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!showRecent) return;
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const d of docs) {
        try {
          const raw = await FileSystem.readAsStringAsync(d.uri);
          const clean = raw
            .replace(/^---[\s\S]*?---/, '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/[#>*_`~\-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          out[d.uri] = clean.slice(0, 220);
        } catch {
          out[d.uri] = '';
        }
      }
      if (alive) setPreviews(out);
    })();
    return () => { alive = false; };
  }, [showRecent, docs]);

  return (
    <View style={[s.container, { backgroundColor: rt.bg }]}>
      {showUI && (
        <>
          <View style={[s.topBar, { backgroundColor: rt.bg }]}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={s.backBtn}>
              <Ionicons name="chevron-back" size={26} color={rt.text} />
            </Pressable>
            <View style={s.titleCol}>
              <Text style={[s.title, { color: rt.text }]} numberOfLines={1}>{active.title}</Text>
              <Text style={[s.meta, { color: rt.muted }]} numberOfLines={1}>
                {main.stats.words} сл. · ~{main.stats.readTime} мин
              </Text>
            </View>
            <Pressable onPress={() => setShowSettings(true)} hitSlop={12} style={s.iconBtn}>
              <Text style={[s.aa, { color: rt.text }]}>Aa</Text>
            </Pressable>
            <Pressable onPress={openMenuAt} hitSlop={12} style={s.iconBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color={rt.text} />
            </Pressable>
          </View>
          <ReadingProgressBar progress={progress} color={isDarkReading ? '#FFFFFF' : theme.accent} />
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

      {/* Док: содержание · чтение · документы. Вместо плавающих пузырей,
          которые закрывали текст и требовали перетаскивания. */}
      {showUI && (
        <View style={[s.dockWrap, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
          <View style={[s.dock, { backgroundColor: theme.isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.94)', borderColor: rt.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <Pressable
              disabled={tocHeadings.length === 0}
              onPress={() => setShowTOC(true)}
              style={s.dockBtn}
            >
              <Ionicons name="list" size={21} color={tocHeadings.length ? rt.text : rt.muted} />
            </Pressable>
            <Pressable onPress={() => setShowSettings(true)} style={s.dockBtn}>
              <Text style={[s.dockAa, { color: rt.text }]}>Aa</Text>
            </Pressable>
            <Pressable
              onPress={() => { setSplitPick(false); setShowRecent(true); }}
              style={s.dockBtn}
            >
              <Ionicons name="albums-outline" size={20} color={rt.text} />
              {docs.length > 1 && (
                <View style={[s.dockBadge, { backgroundColor: theme.isDark ? '#FFFFFF' : '#007AFF' }]}>
                  <Text style={[s.dockBadgeText, { color: theme.isDark ? '#000' : '#FFF' }]}>{docs.length}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <ReaderTOC
        visible={showTOC}
        headings={tocHeadings}
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

      {/* Документы: свитчер в стиле Safari — живые превью открытых документов,
          закрытие крестиком, ниже — недавние и файлы. */}
      <Modal visible={showRecent} transparent animationType="slide" onRequestClose={closeSwitcher}>
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={closeSwitcher} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.22)' : '#C7C7CC' }]} />
            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { color: theme.text }]}>{splitPick ? 'В какой файл разделить?' : 'Документы'}</Text>
              <Pressable onPress={closeSwitcher} hitSlop={10}>
                <Text style={[s.sheetLink, { color: theme.textSecondary }]}>Закрыть</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.docRow}>
              {docs.map((d, i) => (
                <Pressable
                  key={d.uri}
                  onPress={() => { activateIdx(i); setShowRecent(false); }}
                  style={[s.docCard, {
                    backgroundColor: rt.dark ? '#1C1C1E' : '#F7F7F8',
                    borderColor: i === activeIdx ? (theme.isDark ? '#FFFFFF' : theme.accent) : 'transparent',
                  }]}
                >
                  <Text
                    style={[s.docPreview, { color: rt.dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.58)', fontFamily: rs.fontFamily }]}
                    numberOfLines={7}
                  >
                    {previews[d.uri] || d.title}
                  </Text>
                  <View style={[s.docFoot, { borderTopColor: rt.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}>
                    <Text style={[s.docName, { color: theme.text }]} numberOfLines={1}>{d.title}</Text>
                    <Pressable hitSlop={12} onPress={() => closeDoc(d.uri)}>
                      <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <View style={[s.seg, { backgroundColor: theme.fill }]}>
              {([['recent', 'Недавние'], ['files', 'Файлы']] as const).map(([k, label]) => (
                <Pressable
                  key={k}
                  onPress={() => openSwitcherTab(k)}
                  style={[s.segItem, switchTab === k && { backgroundColor: theme.isDark ? '#2C2C2E' : '#FFFFFF' }]}
                >
                  <Text style={[s.segText, { color: switchTab === k ? theme.text : theme.textSecondary }]}>{label}</Text>
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
                    <View style={[s.row, { borderBottomColor: theme.divider }]}>
                      <Pressable onPress={() => pickFromSwitcher(item.uri, item.title)} style={{ flex: 1 }}>
                        <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                        <Text style={[s.rowMeta, { color: theme.textSecondary }]}>
                          {isOpen ? 'Открыт · ' : ''}
                          {new Date(item.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </Pressable>
                      {splitIdx === null && !splitPick && item.uri !== active.uri && (
                        <Pressable onPress={() => openSplitDoc(item.uri, item.title)} hitSlop={10} style={s.iconBtn}>
                          <Ionicons name="copy-outline" size={19} color={theme.accent} />
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
                    <Ionicons name="chevron-back" size={17} color={theme.accent} />
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
                        style={[s.row, { borderBottomColor: theme.divider, paddingLeft: item.depth * 16 }]}
                      >
                        <Ionicons name="folder" size={18} color={theme.textSecondary} />
                        <Text style={[s.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>{item.node.name}</Text>
                        <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
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
                        <View style={[s.row, { borderBottomColor: theme.divider }]}>
                          <Pressable onPress={() => pickFromSwitcher(item.uri, item.title)} style={{ flex: 1 }}>
                            <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                            {isOpen && <Text style={[s.rowMeta, { color: theme.textSecondary }]}>Открыт</Text>}
                          </Pressable>
                          {splitIdx === null && !splitPick && item.uri !== active.uri && (
                            <Pressable onPress={() => openSplitDoc(item.uri, item.title)} hitSlop={10} style={s.iconBtn}>
                              <Ionicons name="copy-outline" size={19} color={theme.accent} />
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

      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowSettings(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[s.sheetHandle, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.22)' : '#C7C7CC' }]} />
            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { color: theme.text }]}>Чтение</Text>
              <Pressable onPress={() => setShowSettings(false)} hitSlop={10}>
                <Text style={[s.sheetLink, { color: theme.textSecondary }]}>Готово</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {/* Размер: одна строка, без ползунка — крупные кнопки по краям */}
              <View style={s.ctlRow}>
                <Pressable
                  onPress={() => app?.setFontSize(Math.max(13, fontSize - 1))}
                  style={[s.stepBtn, { backgroundColor: theme.fill }]}
                >
                  <Text style={[s.stepText, { color: theme.text, fontSize: 15 }]}>A</Text>
                </Pressable>
                <View style={[s.stepTrack, { backgroundColor: theme.fill }]}>
                  <View style={[s.stepFill, { width: `${((fontSize - 13) / 13) * 100}%`, backgroundColor: theme.text }]} />
                </View>
                <Pressable
                  onPress={() => app?.setFontSize(Math.min(26, fontSize + 1))}
                  style={[s.stepBtn, { backgroundColor: theme.fill }]}
                >
                  <Text style={[s.stepText, { color: theme.text, fontSize: 21 }]}>A</Text>
                </Pressable>
              </View>

              {/* Межстрочный интервал — три положения */}
              <View style={[s.seg, { backgroundColor: theme.fill, marginTop: 14 }]}>
                {LINE_HEIGHTS.map((lh) => {
                  const on = Math.abs(lineHeight - lh.value) < 0.05;
                  return (
                    <Pressable
                      key={lh.id}
                      onPress={() => app?.setLineHeight(lh.value)}
                      style={[s.segItem, on && { backgroundColor: theme.isDark ? '#2C2C2E' : '#FFFFFF' }]}
                    >
                      <Text style={[s.segText, { color: on ? theme.text : theme.textSecondary }]}>{lh.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[s.ctlLabel, { color: theme.textSecondary }]}>Шрифт</Text>
              {readingFonts.map((f) => {
                const on = rs.font === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => app?.setFont(f.id)}
                    style={[s.fontRow, { borderBottomColor: theme.divider }]}
                  >
                    <Text style={[s.fontName, { color: theme.text, fontFamily: f.family }]} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text style={[s.fontSample, { color: theme.textSecondary, fontFamily: f.family }]}>Аа Бб 123</Text>
                    {on && <Ionicons name="checkmark" size={19} color={rt.dark ? '#FFFFFF' : theme.accent} />}
                  </Pressable>
                );
              })}

              <Text style={[s.ctlLabel, { color: theme.textSecondary }]}>Лист</Text>
              <View style={s.themeRow}>
                {readingThemes.map((t) => {
                  const on = readingTheme === t.id;
                  return (
                    <Pressable key={t.id} onPress={() => app?.setReadingTheme(t.id)} style={s.themeCell}>
                      <View
                        style={[
                          s.themeCard,
                          { backgroundColor: t.bg, borderColor: on ? (t.dark ? '#FFFFFF' : '#007AFF') : t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)' },
                        ]}
                      >
                        <Text style={{ color: t.text, fontSize: 19, fontFamily: rs.boldFamily }}>Aa</Text>
                        <View style={[s.themeLines, { backgroundColor: t.text, opacity: 0.22 }]} />
                        <View style={[s.themeLines, { backgroundColor: t.text, opacity: 0.22, width: '58%' }]} />
                      </View>
                      <Text style={[s.themeName, { color: on ? theme.text : theme.textSecondary }]} numberOfLines={1}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function styles(insets: any) {
  return StyleSheet.create({
    container: { flex: 1 },
    // Шапка без нижней границы: воздух вместо линии, как в iOS Books.
    topBar: {
      flexDirection: 'row', alignItems: 'center', gap: 2,
      paddingTop: insets.top + 6, paddingHorizontal: 6, paddingBottom: 6,
    },
    backBtn: { padding: 6 },
    titleCol: { flex: 1, paddingHorizontal: 2 },
    title: { ...tp.headline },
    meta: { ...tp.caption, marginTop: 1 },
    aa: { ...tp.subheadStrong, letterSpacing: 0.2 },
    iconBtn: { padding: 8 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 120 },
    pane: { flex: 1 },
    splitBar: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
      paddingTop: insets.top > 0 ? 4 : 8, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    splitTitle: { flex: 1, ...tp.footnote, fontFamily: uiFontOf(600), marginHorizontal: 4 },
    imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    image: { width: '100%', height: '100%' },
    openVia: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginHorizontal: 20, marginBottom: 24, paddingVertical: 14, borderRadius: 14,
    },
    openViaText: { ...tp.subheadStrong, color: '#FFF' },

    // --- док ---
    dockWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    dock: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    dockBtn: { width: 52, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
    dockAa: { ...tp.subheadStrong, letterSpacing: 0.3 },
    dockBadge: {
      position: 'absolute', top: 4, right: 8, minWidth: 15, height: 15, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    dockBadgeText: { fontSize: 9, fontFamily: uiFontOf(600) },

    // --- шторки ---
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, maxHeight: '86%',
    },
    sheetHandle: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    sheetTitle: { ...tp.title3 },
    sheetLink: { ...tp.callout },
    seg: { flexDirection: 'row', borderRadius: 10, padding: 2, gap: 2 },
    segItem: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
    segText: { ...tp.footnote, fontFamily: uiFontOf(500) },
    docRow: { gap: 12, paddingVertical: 14, paddingHorizontal: 2 },
    docCard: {
      width: 148, height: 196, borderRadius: 16, borderWidth: 1.5, padding: 12, justifyContent: 'space-between',
    },
    docPreview: { fontSize: 11, lineHeight: 17, flex: 1 },
    docFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
    docName: { flex: 1, ...tp.caption, fontFamily: uiFontOf(600) },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowTitle: { ...tp.callout },
    rowMeta: { ...tp.caption, marginTop: 2 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10 },
    backRowText: { ...tp.subhead, fontFamily: uiFontOf(600) },

    // --- настройки чтения ---
    ctlRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    ctlLabel: { ...tp.footnote, marginTop: 18, marginBottom: 8 },
    stepBtn: { width: 46, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    stepText: { fontFamily: uiFontOf(600), lineHeight: 24 },
    stepTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
    stepFill: { height: '100%', borderRadius: 2 },
    fontRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    fontName: { ...tp.callout, flex: 1 },
    fontSample: { ...tp.footnote },
    themeRow: { flexDirection: 'row', gap: 10 },
    themeCell: { flex: 1, gap: 6 },
    themeCard: {
      height: 74, borderRadius: 12, borderWidth: 1.5, padding: 9, gap: 5, justifyContent: 'flex-start',
    },
    themeLines: { height: 2, borderRadius: 1, width: '86%' },
    themeName: { ...tp.caption, textAlign: 'center' },
  });
}
