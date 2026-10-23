import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert,
  TextInput, Modal, Dimensions, NativeSyntheticEvent, NativeTouchEvent,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { getFavorites, toggleFavorite, getRecent, pushRecent as storePushRecent, getTagMap, setTags as storeSetTags, removeFile as storeRemoveFile, type RecentEntry } from '../utils/metaStore';
import { getFolderTree as engineGetFolderTree } from '../utils/folderTree';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { type as tp, font as uiFontOf } from '../theme/type';
import { FileTypeIcon } from '../components/FileTypeIcon';
import { TagChips } from '../components/TagChips';
import { Popover } from '../components/Popover';
import type { MenuAction } from '../components/OverflowMenu';

declare const require: any;

// Метаданные — единый слой src/utils/metaStore.ts, ключи md2_*.

export interface FileEntry {
  name: string;
  uri: string;
  isDir: boolean;
  modifiedAt: number;
  size?: number;
}

interface Props {
  navigation: any;
}

type Tab = 'files' | 'recent';
type SortKey = 'name' | 'date' | 'size';
type SearchScope = 'files' | 'tags' | 'fav';

interface FolderNode {
  name: string;
  uri: string;
  children: FolderNode[];
}

const MD_READER_DIR = FileSystem.documentDirectory + 'md-reader/';

const TRASH_DIR = MD_READER_DIR + '.trash/';

// Удаление в корзину папки: файл можно вернуть кнопкой «Вернуть»,
// и он не исчезает из «Недавних» мгновенно и безвозвратно.
async function moveToTrash(uri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(TRASH_DIR, { intermediates: true });
  const name = uri.replace(/\/$/, '').split('/').pop() || 'item';
  const dest = await uniquePath(TRASH_DIR, name);
  await FileSystem.moveAsync({ from: uri, to: dest });
  return dest;
}


// Свободное имя в папке: «Файл.md» → «Файл (1).md». Без перезаписи чужого файла.
async function uniquePath(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 0; i < 100; i++) {
    const candidate = dir + (i === 0 ? name : `${stem} (${i})${ext}`);
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (!info.exists) return candidate;
    } catch {
      return candidate;
    }
  }
  return dir + `${stem}-${Date.now()}${ext}`;
}

// Дерево папок — движок (src/utils/folderTree.ts).
async function loadFolderTree(): Promise<FolderNode[] | null> {
  try {
    const tree = await engineGetFolderTree();
    if (Array.isArray(tree)) return tree as FolderNode[];
  } catch {}
  return null;
}

async function scanTree(path: string, depth: number): Promise<FolderNode[]> {
  if (depth <= 0) return [];
  try {
    const items = await FileSystem.readDirectoryAsync(path);
    const out: FolderNode[] = [];
    for (const name of items) {
      const uri = path + name;
      const info = await FileSystem.getInfoAsync(uri);
      if (info.isDirectory) {
        out.push({ name, uri: uri + '/', children: await scanTree(uri + '/', depth - 1) });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  } catch {
    return [];
  }
}

function flattenTree(nodes: FolderNode[], depth: number): { node: FolderNode; depth: number }[] {
  const out: { node: FolderNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

export default function FileBrowserScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(MD_READER_DIR);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRename, setShowRename] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [tab, setTab] = useState<Tab>('files');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showSort, setShowSort] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [tagFor, setTagFor] = useState<FileEntry | null>(null);
  const [tagInput, setTagInput] = useState('');
  // ⋮-попап у кнопки: точка нажатия
  const [pop, setPop] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const [showFab, setShowFab] = useState(false);
  const [fabAt, setFabAt] = useState({ x: 0, y: 0 });
  // Поиск-оверлей
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('files');
  const [searchTag, setSearchTag] = useState<string | null>(null);
  // Перемещение
  const [showMove, setShowMove] = useState(false);
  const [moveDest, setMoveDest] = useState('');
  const [moveSingle, setMoveSingle] = useState(false);
  const [movePath, setMovePath] = useState(MD_READER_DIR);
  const [moveTree, setMoveTree] = useState<FolderNode[] | null>(null);
  const [moveView, setMoveView] = useState<'tree' | 'nav'>('tree');
  const [moveSubs, setMoveSubs] = useState<FileEntry[]>([]);
  // iOS-шторки действий вместо попапов у кнопок
  const [showCreate, setShowCreate] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // Удаление безвозвратное только из корзины; здесь — откат и тост на 6 секунд.
  const [undo, setUndo] = useState<{ label: string; moves: { from: string; to: string }[] } | null>(null);
  const undoTimer = useRef<any>(null);
  const offerUndo = (label: string, moves: { from: string; to: string }[]) => {
    setUndo({ label, moves });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };
  const undoDelete = async () => {
    if (!undo) return;
    for (const m of undo.moves) {
      try { await FileSystem.moveAsync({ from: m.to, to: m.from }); } catch {}
    }
    setUndo(null);
    loadDir(currentPath);
    loadMeta();
  };

  const loadDir = useCallback(async (path: string) => {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(path, { intermediates: true });
      }
      const items = await FileSystem.readDirectoryAsync(path);
      const result: FileEntry[] = [];
      for (const name of items) {
        const itemInfo = await FileSystem.getInfoAsync(path + name);
        result.push({
          name,
          uri: path + name,
          isDir: itemInfo.isDirectory ?? false,
          modifiedAt: itemInfo.exists ? (itemInfo.modificationTime ?? 0) : 0,
          size: itemInfo.exists ? itemInfo.size : undefined,
        });
      }
      setEntries(result);
      setCurrentPath(path);
    } catch (e) {
      console.warn('loadDir error:', e);
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [f, r, t] = await Promise.all([getFavorites(), getRecent(), getTagMap()]);
      setFavs(f);
      setRecent(r);
      setTags(t);
    } catch {}
  }, []);

  React.useEffect(() => { loadDir(currentPath); }, [currentPath]);
  React.useEffect(() => { loadMeta(); }, [loadMeta]);
  React.useEffect(() => {
    const unsub = navigation.addListener('focus', () => { loadMeta(); loadDir(currentPath); });
    return unsub;
  }, [navigation, currentPath, loadDir, loadMeta]);

  const pathParts = currentPath.replace(MD_READER_DIR, '').split('/').filter(Boolean);

  const recordRecent = async (entry: FileEntry) => {
    try {
      setRecent(await storePushRecent(entry.uri, entry.name));
    } catch {}
  };

  const toggleFav = async (uri: string) => {
    try {
      setFavs(await toggleFavorite(uri));
      Haptics.selectionAsync().catch(() => {});
    } catch {}
  };

  // Вычистить uri из меты: removeFile стора + локальное зеркало
  // (зеркало покрывает и вложенные пути при удалении папки).
  const purgeMeta = async (uri: string) => {
    const prefix = uri.endsWith('/') ? uri : uri + '/';
    try {
      await storeRemoveFile(uri);
    } catch {}
    setFavs((prev) => prev.filter((u) => u !== uri && !u.startsWith(prefix)));
    setRecent((prev) => prev.filter((r) => r.uri !== uri && !r.uri.startsWith(prefix)));
    setTags((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k === uri || k.startsWith(prefix)) delete next[k];
      });
      return next;
    });
  };

  const openStoredFile = async (uri: string, title: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        await purgeMeta(uri);
        await loadMeta();
        Alert.alert('Файл удалён', 'Убрал его из избранного и истории.');
        return;
      }
    } catch {}
    try {
      setRecent(await storePushRecent(uri, title));
    } catch {}
    navigation.navigate('Reader', { uri, title });
  };

  const addTag = async () => {
    if (!tagFor || !tagInput.trim()) return;
    const t = tagInput.trim().toLowerCase();
    try {
      const cur = tags[tagFor.uri] || [];
      if (!cur.includes(t)) {
        const clean = await storeSetTags(tagFor.uri, [...cur, t]);
        setTags({ ...tags, [tagFor.uri]: clean });
      }
    } catch {}
    setTagFor(null);
    setTagInput('');
  };

  const removeTag = async (uri: string, tag: string) => {
    try {
      const clean = await storeSetTags(uri, (tags[uri] || []).filter((x) => x !== tag));
      const next = { ...tags };
      if (clean.length === 0) delete next[uri];
      else next[uri] = clean;
      setTags(next);
    } catch {}
  };

  const openEntry = (entry: FileEntry) => {
    if (entry.isDir) return;
    recordRecent(entry);
    navigation.navigate('Reader', { uri: entry.uri, title: entry.name });
  };

  const startSelecting = (uri: string) => {
    setIsSelecting(true);
    setSelected(new Set([uri]));
  };

  const navigateTo = (entry: FileEntry) => {
    if (isSelecting) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(entry.uri)) next.delete(entry.uri);
        else next.add(entry.uri);
        return next;
      });
      return;
    }
    if (entry.isDir) {
      setCurrentPath(entry.uri + '/');
    } else {
      openEntry(entry);
    }
  };

  const cancelSelecting = () => {
    setIsSelecting(false);
    setSelected(new Set());
  };

  const deleteSelected = () => {
    Alert.alert(
      `Удалить ${selected.size}?`,
      'Файлы уйдут в корзину — можно будет вернуть.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => {
            const moves: { from: string; to: string }[] = [];
            for (const uri of selected) {
              try { moves.push({ from: uri, to: await moveToTrash(uri) }); await purgeMeta(uri); } catch {}
            }
            cancelSelecting();
            loadDir(currentPath);
            loadMeta();
            if (moves.length) offerUndo(`Удалено: ${moves.length}`, moves);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          },
        },
      ],
    );
  };

  const goBack = () => {
    if (isSelecting) { cancelSelecting(); return; }
    if (currentPath === MD_READER_DIR) return;
    const parent = currentPath.replace(/[^/]+\/$/, '');
    setCurrentPath(parent);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const path = currentPath + newFolderName.trim() + '/';
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    setShowNewFolder(false);
    setNewFolderName('');
    loadDir(currentPath);
  };

  const importFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!res.canceled && res.assets[0]) {
        const file = res.assets[0];
        // Не перезаписываем одноимённый файл — даём суффикс.
        const dest = await uniquePath(currentPath, file.name);
        await FileSystem.copyAsync({ from: file.uri, to: dest });
        loadDir(currentPath);
      }
    } catch (e) {
      console.warn('import error:', e);
    }
  };

  const deleteEntry = (entry: FileEntry) => {
    Alert.alert(
      entry.isDir ? 'Удалить папку?' : 'Удалить файл?',
      `${entry.name}\nФайл уйдёт в корзину — можно будет вернуть.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => {
            try {
              const trashUri = await moveToTrash(entry.uri);
              await purgeMeta(entry.uri);
              offerUndo(entry.name, [{ from: entry.uri, to: trashUri }]);
            } catch (e) { console.warn('delete error', e); }
            loadDir(currentPath);
            loadMeta();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          },
        },
      ],
    );
  };

  const renameEntry = async () => {
    if (!showRename || !renameName.trim()) return;
    const clean = renameName.trim().replace(/[\/\\]/g, '-');
    const parentPath = showRename.uri.replace(/[^\/]+\/?$/, '');
    const newPath = parentPath + clean + (showRename.isDir ? '/' : '');
    if (newPath === showRename.uri) { setShowRename(null); return; }
    try {
      const info = await FileSystem.getInfoAsync(newPath);
      if (info.exists) {
        Alert.alert('Имя занято', `«${clean}» уже есть в этой папке.`);
        return;
      }
      await FileSystem.moveAsync({ from: showRename.uri, to: newPath });
      setShowRename(null);
      setRenameName('');
      loadDir(currentPath);
      loadMeta();
    } catch (e) {
      Alert.alert('Не удалось переименовать', String(e));
    }
  };

  const createNewFile = async () => {
    const path = await uniquePath(currentPath, 'Новый файл.md');
    const name = path.split('/').pop() || 'Новый файл.md';
    await FileSystem.writeAsStringAsync(path, `# ${name.replace(/\.md$/, '')}\n\n`);
    const entry = { name, uri: path, isDir: false, modifiedAt: Date.now() / 1000 };
    await recordRecent(entry);
    navigation.navigate('Reader', { uri: path, title: name });
  };

  // --- Перемещение: дерево целиком + крошки, один заход ---
  const openMove = async (single?: FileEntry) => {
    if (single) {
      setSelected(new Set([single.uri]));
      setIsSelecting(true);
      setMoveSingle(true);
    } else {
      setMoveSingle(false);
    }
    setMoveDest('');
    setMovePath(MD_READER_DIR);
    const tree = await loadFolderTree();
    setMoveTree(tree);
    setMoveView(tree ? 'tree' : 'nav');
    await refreshMoveSubs(MD_READER_DIR);
    setShowMove(true);
  };

  const refreshMoveSubs = async (path: string) => {
    try {
      const items = await FileSystem.readDirectoryAsync(path);
      const out: FileEntry[] = [];
      for (const name of items) {
        const info = await FileSystem.getInfoAsync(path + name);
        if (info.isDirectory) out.push({ name, uri: path + name, isDir: true, modifiedAt: 0 });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      setMoveSubs(out);
    } catch {
      setMoveSubs([]);
    }
  };

  const navMovePath = (path: string) => {
    setMovePath(path);
    setMoveView('nav');
    refreshMoveSubs(path);
  };

  const backToTree = () => {
    setMoveView('tree');
    navMovePathKeepView(MD_READER_DIR);
  };

  const navMovePathKeepView = (path: string) => {
    setMovePath(path);
    refreshMoveSubs(path);
  };

  const moveSelected = async () => {
    if (!moveDest || selected.size === 0) return;
    const dest = moveDest.endsWith('/') ? moveDest : moveDest + '/';
    for (const uri of selected) {
      const clean = uri.endsWith('/') ? uri.slice(0, -1) : uri;
      const base = clean.split('/').pop() || 'file';
      if (dest === currentPath && selected.size === 1) continue;
      let target = dest + base;
      let n = 1;
      while (n < 50) {
        const info = await FileSystem.getInfoAsync(target);
        if (!info.exists) break;
        const dot = base.lastIndexOf('.');
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : '';
        target = `${dest}${stem} (${n})${ext}`;
        n++;
      }
      try {
        await FileSystem.moveAsync({ from: uri, to: target });
        await purgeMeta(uri);
      } catch (e) {
        console.warn('move error:', e);
      }
    }
    setShowMove(false);
    setMoveDest('');
    setMoveSingle(false);
    cancelSelecting();
    loadDir(currentPath);
    loadMeta();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // ⋮-меню файла/папки — попап у кнопки.
  const fileMenuActions = (entry: FileEntry): MenuAction[] => {
    const isFav = favs.includes(entry.uri);
    const acts: MenuAction[] = [];
    if (entry.isDir) {
      acts.push({ icon: 'folder-open-outline', label: 'Открыть', onPress: () => setCurrentPath(entry.uri + '/') });
    } else {
      acts.push({ icon: 'document-text-outline', label: 'Открыть', onPress: () => openEntry(entry) });
      acts.push(isFav
        ? { icon: 'star', label: 'Убрать из избранного', onPress: () => toggleFav(entry.uri) }
        : { icon: 'star-outline', label: 'В избранное', onPress: () => toggleFav(entry.uri) });
      acts.push({ icon: 'pricetag-outline', label: 'Теги…', onPress: () => setTagFor(entry) });
    }
    acts.push({ icon: 'pencil-outline', label: 'Переименовать…', onPress: () => { setShowRename(entry); setRenameName(entry.name.replace(/\.md$/, '')); } });
    acts.push({ icon: 'folder-outline', label: 'Переместить…', onPress: () => openMove(entry) });
    acts.push({ icon: 'trash-outline', label: 'Удалить', danger: true, onPress: () => deleteEntry(entry) });
    return acts;
  };

  const openPop = (entry: FileEntry, e: NativeSyntheticEvent<NativeTouchEvent>) => {
    Haptics.selectionAsync().catch(() => {});
    const { pageX, pageY } = e.nativeEvent;
    const { width: SW } = Dimensions.get('window');
    setPop({
      x: typeof pageX === 'number' ? pageX - 248 : SW - 256,
      y: typeof pageY === 'number' ? pageY : 120,
      entry,
    });
  };

  // --- Списки ---
  const visibleEntries = React.useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const base = entries;
    return [...base].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sortKey === 'date') return (a.modifiedAt - b.modifiedAt) * dir;
      if (sortKey === 'size') return ((a.size || 0) - (b.size || 0)) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [entries, sortKey, sortAsc]);

  // --- Поиск: имя + теги + избранное ---
  const q = query.trim().toLowerCase();
  const searchFiles = React.useMemo(() => {
    if (!q) return [];
    let list = entries.filter((e) => !e.isDir && e.name.toLowerCase().includes(q));
    if (scope === 'fav') list = list.filter((e) => favs.includes(e.uri));
    if (scope === 'tags' && searchTag) list = list.filter((e) => (tags[e.uri] || []).includes(searchTag));
    return list;
  }, [entries, q, scope, favs, tags, searchTag]);
  const searchTags = React.useMemo(() => {
    const set = new Set<string>();
    Object.values(tags).forEach((arr) => arr.forEach((t) => { if (!q || t.includes(q)) set.add(t); }));
    return [...set].sort();
  }, [tags, q]);
  const tagFiles = React.useMemo(() => {
    if (!searchTag) return [];
    const out: { uri: string; name: string }[] = [];
    Object.entries(tags).forEach(([uri, arr]) => {
      if (arr.includes(searchTag)) out.push({ uri, name: uri.split('/').pop() || uri });
    });
    return out;
  }, [tags, searchTag]);

  const s = styles(theme, insets);

  const renderItem = ({ item }: { item: FileEntry }) => {
    const isSelected = selected.has(item.uri);
    return (
      <Pressable
        onPress={() => navigateTo(item)}
        onLongPress={() => startSelecting(item.uri)}
        style={[s.item, isSelected && { backgroundColor: theme.accent + '15' }, { borderBottomColor: theme.divider }]}
      >
        {isSelecting && (
          <View style={[s.checkbox, isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
        )}
        {item.isDir ? (
          <View style={[s.iconWrap, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="folder" size={22} color={theme.accent} />
          </View>
        ) : (
          <FileTypeIcon name={item.name} theme={theme} />
        )}
        <View style={s.info}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
          {!item.isDir && (
            <Text style={[s.meta, { color: theme.textSecondary }]}>
              {item.size ? formatSize(item.size) + ' · ' : ''}{formatDate(item.modifiedAt)}
            </Text>
          )}
          {!item.isDir && <TagChips tags={(tags[item.uri] || [])} theme={theme} />}
        </View>
        {!isSelecting && (
          <Pressable onPress={(e) => openPop(item, e)} hitSlop={10} style={s.itemBtn}>
            <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </Pressable>
    );
  };

  const moveParts = movePath.replace(MD_READER_DIR, '').split('/').filter(Boolean);
  const selInsideMove = [...selected].some((u) => movePath === u || movePath === u + '/' || movePath.startsWith(u.endsWith('/') ? u : u + '/'));
  const flatTree = moveTree ? flattenTree(moveTree, 0) : [];

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16 }}>
        {/* Крупный заголовок + действия в строке навбара */}
        <View style={s.navRow}>
          {pathParts.length > 0 && !isSelecting ? (
            <Pressable onPress={goBack} hitSlop={10} style={s.backChevron}>
              <Ionicons name="chevron-back" size={26} color={theme.accent} />
            </Pressable>
          ) : null}
          <Text style={[s.navTitle, { color: theme.text }]} numberOfLines={1}>
            {isSelecting ? `Выбрано ${selected.size}` : 'Файлы'}
          </Text>
          {isSelecting ? (
            <View style={s.navActions}>
              <Pressable onPress={cancelSelecting} hitSlop={8} style={s.navBtn}>
                <Text style={[s.navBtnText, { color: theme.accent }]}>Готово</Text>
              </Pressable>
              <Pressable onPress={() => openMove()} hitSlop={8} style={s.navBtn} disabled={selected.size === 0}>
                <Ionicons name="folder-outline" size={22} color={selected.size ? theme.accent : theme.textTertiary} />
              </Pressable>
              <Pressable onPress={deleteSelected} hitSlop={8} style={s.navBtn} disabled={selected.size === 0}>
                <Ionicons name="trash-outline" size={22} color={selected.size ? theme.red : theme.textTertiary} />
              </Pressable>
            </View>
          ) : (
            <View style={s.navActions}>
              <Pressable onPress={() => setShowCreate(true)} hitSlop={8} style={s.navBtn}>
                <Ionicons name="add" size={26} color={theme.accent} />
              </Pressable>
              <Pressable onPress={() => setShowMore(true)} hitSlop={8} style={s.navBtn}>
                <Ionicons name="ellipsis-horizontal" size={22} color={theme.accent} />
              </Pressable>
            </View>
          )}
        </View>

        {/* Крошки одной строкой — вместо отдельной панели */}
        {!isSelecting && tab === 'files' && (
          <View style={s.crumbRow}>
            <Pressable onPress={() => setCurrentPath(MD_READER_DIR)} hitSlop={6}>
              <Text style={[s.crumb, { color: pathParts.length > 0 ? theme.accent : theme.textSecondary }]}>Мои файлы</Text>
            </Pressable>
            {pathParts.map((part, i) => (
              <React.Fragment key={i}>
                <Text style={[s.crumb, { color: theme.textTertiary }]}>›</Text>
                <Pressable
                  hitSlop={6}
                  onPress={() => setCurrentPath(MD_READER_DIR + pathParts.slice(0, i + 1).join('/') + '/')}
                >
                  <Text style={[s.crumb, { color: i === pathParts.length - 1 ? theme.text : theme.accent }]} numberOfLines={1}>
                    {part}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Поиск — настоящим полем, а не иконкой */}
        {!isSelecting && (
          <Pressable
            onPress={() => { setQuery(''); setScope('files'); setSearchTag(null); setShowSearch(true); }}
            style={[s.searchField, { backgroundColor: theme.fill }]}
          >
            <Ionicons name="search" size={17} color={theme.textSecondary} />
            <Text style={[s.searchHint, { color: theme.textSecondary }]}>Поиск по файлам и тегам</Text>
          </Pressable>
        )}

        {/* Строка списка: секция + сортировка текстом */}
        {!isSelecting && (
          <View style={s.listHead}>
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>
              {tab === 'files' ? (entries.length ? `${entries.length} объектов` : 'Пусто') : `${recent.length} недавних`}
            </Text>
            {tab === 'files' && (
              <Pressable onPress={() => setShowSort(!showSort)} hitSlop={8} style={s.sortBtn}>
                <Text style={[s.sortText, { color: theme.accent }]}>
                  {sortKey === 'name' ? 'Имя' : sortKey === 'date' ? 'Дата' : 'Размер'}
                </Text>
                <Ionicons name={sortAsc ? 'chevron-up' : 'chevron-down'} size={13} color={theme.accent} />
              </Pressable>
            )}
          </View>
        )}

        {showSort && !isSelecting && (
          <View style={[s.sortMenu, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
            {(['name', 'date', 'size'] as SortKey[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => { if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(true); } setShowSort(false); }}
                style={s.sortRow}
              >
                <Text style={[s.sortItem, { color: sortKey === k ? theme.accent : theme.text }]}>
                  {k === 'name' ? 'По имени' : k === 'date' ? 'По дате' : 'По размеру'}
                </Text>
                {sortKey === k && <Ionicons name="checkmark" size={16} color={theme.accent} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Content */}
      {tab === 'files' && (
        visibleEntries.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="folder-open-outline" size={64} color={theme.border} />
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>Папка пуста</Text>
            <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Нажмите + чтобы создать файл или импортировать</Text>
          </View>
        ) : (
          <FlatList data={visibleEntries} keyExtractor={(item) => item.uri} contentContainerStyle={s.list} renderItem={renderItem} />
        )
      )}

      {tab === 'recent' && (
        recent.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={64} color={theme.border} />
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>Пока пусто</Text>
            <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Открытые файлы появятся здесь</Text>
          </View>
        ) : (
          <FlatList
            data={recent}
            keyExtractor={(item) => item.uri}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <Pressable onPress={() => openStoredFile(item.uri, item.title)} style={[s.item, { borderBottomColor: theme.divider }]}>
                <FileTypeIcon name={item.title} theme={theme} />
                <View style={s.info}>
                  <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[s.meta, { color: theme.textSecondary }]}>{new Date(item.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </Pressable>
            )}
          />
        )
      )}

      {/* Тост с откатом: удаление больше не «необратимо» */}
      {undo && (
        <View pointerEvents="box-none" style={[s.undoWrap, { bottom: insets.bottom + 84 }]}>
          <View style={[s.undoBar, { backgroundColor: theme.isDark ? '#2C2C2E' : '#1C1C1E' }]}>
            <Text style={s.undoText} numberOfLines={1}>{undo.label}</Text>
            <Pressable onPress={undoDelete} hitSlop={10}><Text style={s.undoBtn}>Вернуть</Text></Pressable>
          </View>
        </View>
      )}

      {/* Плавающая капсула вместо приклеенного таббара */}
      <View pointerEvents="box-none" style={[s.tabWrap, { bottom: insets.bottom + 10 }]}>
        <View style={[s.tabBar, { backgroundColor: theme.glass, borderColor: theme.glassLine }]}>
          {([
            ['files', 'Файлы', 'folder'],
            ['recent', 'Недавние', 'time'],
            ['settings', 'Настройки', 'settings'],
          ] as const).map(([key, label, icon]) => {
            const active = key === 'settings' ? false : tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  if (key === 'settings') { navigation.navigate('Settings'); return; }
                  setTab(key as Tab);
                  cancelSelecting();
                }}
                style={[s.tabItem, active && { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF' }]}
              >
                <Ionicons
                  name={(active ? icon : `${icon}-outline`) as any}
                  size={21}
                  color={active ? theme.text : theme.textSecondary}
                />
                <Text style={[s.tabLabel, { color: active ? theme.text : theme.textSecondary }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Создать: шторка снизу */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowCreate(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[s.sheetHandle, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.22)' : theme.textTertiary }]} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Создать</Text>
            {([
              ['document-text-outline', 'Новый файл', createNewFile],
              ['folder-outline', 'Новая папка', () => setShowNewFolder(true)],
              ['download-outline', 'Импорт из хранилища', importFile],
            ] as const).map(([icon, label, onPress]) => (
              <Pressable
                key={label}
                onPress={() => { setShowCreate(false); setTimeout(onPress as any, 180); }}
                style={[s.actionRow, { borderBottomColor: theme.divider }]}
              >
                <Ionicons name={icon as any} size={22} color={theme.text} />
                <Text style={[s.actionText, { color: theme.text }]}>{label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowCreate(false)} style={[s.cancelRow, { backgroundColor: theme.fill }]}>
              <Text style={[s.actionText, { color: theme.text }]}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Ещё: служебные действия экрана */}
      <Modal visible={showMore} transparent animationType="fade" onRequestClose={() => setShowMore(false)}>
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowMore(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[s.sheetHandle, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.22)' : theme.textTertiary }]} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>{pathParts.length ? pathParts[pathParts.length - 1] : 'Мои файлы'}</Text>
            <Pressable
              onPress={() => { setShowMore(false); setTab('recent'); }}
              style={[s.actionRow, { borderBottomColor: theme.divider }]}
            >
              <Ionicons name="time-outline" size={22} color={theme.text} />
              <Text style={[s.actionText, { color: theme.text }]}>Недавние файлы</Text>
            </Pressable>
            <Pressable
              onPress={() => { setShowMore(false); setIsSelecting(true); }}
              style={[s.actionRow, { borderBottomColor: theme.divider }]}
            >
              <Ionicons name="checkmark-circle-outline" size={22} color={theme.text} />
              <Text style={[s.actionText, { color: theme.text }]}>Выбрать файлы</Text>
            </Pressable>
            <Pressable
              onPress={() => { setShowMore(false); navigation.navigate('Settings'); }}
              style={[s.actionRow, { borderBottomColor: theme.divider }]}
            >
              <Ionicons name="options-outline" size={22} color={theme.text} />
              <Text style={[s.actionText, { color: theme.text }]}>Настройки</Text>
            </Pressable>
            <Pressable onPress={() => setShowMore(false)} style={[s.cancelRow, { backgroundColor: theme.fill }]}>
              <Text style={[s.actionText, { color: theme.text }]}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ⋮-попап у кнопки */}
      <Popover
        visible={!!pop}
        x={pop?.x ?? 0}
        y={pop?.y ?? 0}
        title={pop?.entry.name}
        theme={theme}
        onClose={() => setPop(null)}
        actions={pop ? fileMenuActions(pop.entry) : []}
      />

      {/* Поиск-оверлей: имя + теги + избранное */}
      <Modal visible={showSearch} animationType="slide" onRequestClose={() => setShowSearch(false)}>
        <View style={[s.searchWrap, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
          <View style={s.searchBar}>
            <Pressable onPress={() => setShowSearch(false)} style={s.iconBtn}>
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </Pressable>
            <TextInput
              style={[s.searchInputBig, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              placeholder="Имя, #тег…"
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>
          <View style={s.scopeRow}>
            {([['files', 'Файлы'], ['tags', 'Теги'], ['fav', '★ Избранное']] as [SearchScope, string][]).map(([k, label]) => (
              <Pressable
                key={k}
                onPress={() => { setScope(k); setSearchTag(null); }}
                style={[s.scopeChip, scope === k && { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}
              >
                <Text style={[s.scopeText, { color: scope === k ? theme.accent : theme.textSecondary }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {scope === 'tags' && !searchTag && (
            <FlatList
              data={searchTags}
              keyExtractor={(t) => t}
              contentContainerStyle={s.list}
              renderItem={({ item: t }) => {
                const count = Object.values(tags).filter((arr) => arr.includes(t)).length;
                return (
                  <Pressable onPress={() => setSearchTag(t)} style={[s.tagRow, { borderBottomColor: theme.divider }]}>
                    <Ionicons name="pricetag" size={18} color={theme.textSecondary} />
                    <Text style={[s.tagName, { color: theme.text }]}>#{t}</Text>
                    <Text style={[s.meta, { color: theme.textSecondary }]}>{count}</Text>
                  </Pressable>
                );
              }}
            />
          )}
          {scope === 'tags' && searchTag && (
            <View style={{ flex: 1 }}>
              <Pressable onPress={() => setSearchTag(null)} style={s.backRow}>
                <Ionicons name="chevron-back" size={18} color={theme.accent} />
                <Text style={[s.backRowText, { color: theme.accent }]}>#{searchTag}</Text>
              </Pressable>
              <FlatList
                data={tagFiles}
                keyExtractor={(f) => f.uri}
                contentContainerStyle={s.list}
                renderItem={({ item: f }) => (
                  <Pressable onPress={() => { setShowSearch(false); openStoredFile(f.uri, f.name); }} style={[s.item, { borderBottomColor: theme.divider }]}>
                    <FileTypeIcon name={f.name} theme={theme} />
                    <View style={s.info}>
                      <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{f.name}</Text>
                    </View>
                  </Pressable>
                )}
              />
            </View>
          )}
          {scope !== 'tags' && q.length > 0 && (
            <FlatList
              data={scope === 'fav'
                ? entries.filter((e) => !e.isDir && favs.includes(e.uri) && e.name.toLowerCase().includes(q))
                : searchFiles}
              keyExtractor={(item) => item.uri}
              contentContainerStyle={s.list}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setShowSearch(false);
                    if (item.isDir) { setCurrentPath(item.uri + '/'); setTab('files'); }
                    else openEntry(item);
                  }}
                  style={[s.item, { borderBottomColor: theme.divider }]}
                >
                  {item.isDir ? (
                    <View style={[s.iconWrap, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name="folder" size={22} color={theme.accent} />
                    </View>
                  ) : (
                    <FileTypeIcon name={item.name} theme={theme} />
                  )}
                  <View style={s.info}>
                    <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                    {!item.isDir && <TagChips tags={(tags[item.uri] || [])} theme={theme} />}
                  </View>
                </Pressable>
              )}
            />
          )}
          {scope !== 'tags' && q.length === 0 && (
            <View style={{ flex: 1 }}>
              <Text style={[s.recentHint, { color: theme.textSecondary }]}>Недавние</Text>
              <FlatList
                data={recent.slice(0, 10)}
                keyExtractor={(item) => item.uri}
                contentContainerStyle={s.list}
                renderItem={({ item }) => (
                  <Pressable onPress={() => { setShowSearch(false); openStoredFile(item.uri, item.title); }} style={[s.item, { borderBottomColor: theme.divider }]}>
                    <FileTypeIcon name={item.title} theme={theme} />
                    <View style={s.info}>
                      <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    </View>
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* New Folder Modal */}
      <Modal visible={showNewFolder} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: theme.surface }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Новая папка</Text>
            <TextInput
              style={[s.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
              placeholder="Имя папки"
              placeholderTextColor={theme.textSecondary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={s.modalActions}>
              <Pressable onPress={() => setShowNewFolder(false)} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: theme.textSecondary }]}>Отмена</Text>
              </Pressable>
              <Pressable onPress={createFolder} style={[s.modalBtn, { backgroundColor: theme.accent }]}>
                <Text style={[s.modalBtnText, { color: '#FFF' }]}>Создать</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={!!showRename} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: theme.surface }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Переименовать</Text>
            <TextInput
              style={[s.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
              placeholder="Новое имя"
              placeholderTextColor={theme.textSecondary}
              value={renameName}
              onChangeText={setRenameName}
              autoFocus
            />
            <View style={s.modalActions}>
              <Pressable onPress={() => setShowRename(null)} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: theme.textSecondary }]}>Отмена</Text>
              </Pressable>
              <Pressable onPress={renameEntry} style={[s.modalBtn, { backgroundColor: theme.accent }]}>
                <Text style={[s.modalBtnText, { color: '#FFF' }]}>Готово</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Tag Modal */}
      <Modal visible={!!tagFor} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: theme.surface }]}>
            <Text style={[s.modalTitle, { color: theme.text }]} numberOfLines={1}>Тег: {tagFor?.name}</Text>
            {(tags[tagFor?.uri || ''] || []).length > 0 && (
              <View style={s.existingTags}>
                {(tags[tagFor?.uri || ''] || []).map((t) => (
                  <Pressable key={t} onPress={() => tagFor && removeTag(tagFor.uri, t)} style={[s.tagPill, { borderColor: theme.border }]}>
                    <Text style={[s.tagPillText, { color: theme.text }]}>#{t} ✕</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              style={[s.modalInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
              placeholder="Новый тег (без #)"
              placeholderTextColor={theme.textSecondary}
              value={tagInput}
              onChangeText={setTagInput}
              autoFocus
              autoCapitalize="none"
              onSubmitEditing={addTag}
            />
            <View style={s.modalActions}>
              <Pressable onPress={() => { setTagFor(null); setTagInput(''); }} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: theme.textSecondary }]}>Закрыть</Text>
              </Pressable>
              <Pressable onPress={addTag} style={[s.modalBtn, { backgroundColor: theme.accent }]}>
                <Text style={[s.modalBtnText, { color: '#FFF' }]}>Добавить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move Modal: дерево целиком + крошки */}
      <Modal visible={showMove} transparent animationType="fade" onRequestClose={() => setShowMove(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.moveModal, { backgroundColor: theme.surface }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Переместить ({selected.size})</Text>
            <View style={s.moveCrumbs}>
              <Pressable onPress={() => navMovePath(MD_READER_DIR)}>
                <Text style={[s.crumbText, { color: moveParts.length === 0 ? theme.text : theme.accent }]}>Корень</Text>
              </Pressable>
              {moveParts.map((part, i) => (
                <React.Fragment key={i}>
                  <Text style={[s.crumbText, { color: theme.textSecondary }]}> / </Text>
                  <Pressable onPress={() => navMovePath(MD_READER_DIR + moveParts.slice(0, i + 1).join('/') + '/')}>
                    <Text style={[s.crumbText, { color: i === moveParts.length - 1 ? theme.text : theme.accent }]}>{part}</Text>
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
            {moveView === 'nav' && moveTree && (
              <Pressable onPress={backToTree} style={s.backTreeRow}>
                <Ionicons name="git-network-outline" size={18} color={theme.accent} />
                <Text style={[s.moveLabel, { color: theme.accent }]}>Всё дерево</Text>
              </Pressable>
            )}
            <FlatList
              data={moveView === 'tree' && moveTree ? flatTree.filter(({ node }) => {
                const p = node.uri;
                return ![...selected].some((u) => p === u || p === u + '/' || p.startsWith(u.endsWith('/') ? u : u + '/'));
              }) : moveSubs.filter((e) => ![...selected].includes(e.uri))}
              keyExtractor={(item: any) => moveView === 'tree' && moveTree ? item.node.uri : item.uri}
              style={{ maxHeight: 300, marginBottom: 8 }}
              renderItem={({ item }: any) => {
                if (moveView === 'tree' && moveTree) {
                  const { node, depth } = item as { node: FolderNode; depth: number };
                  const active = moveDest === node.uri;
                  // Тап — провалиться внутрь (2-3 папки за один заход), выбор — через «Сюда».
                  return (
                    <Pressable onPress={() => { navMovePath(node.uri); setMoveDest(node.uri); }} style={[s.moveRow, { paddingLeft: 10 + depth * 16, backgroundColor: active ? theme.accentSoft : 'transparent' }]}>
                      <Ionicons name="folder-outline" size={18} color={active ? theme.accent : theme.textSecondary} />
                      <Text style={[s.moveLabel, { color: active ? theme.accent : theme.text }]} numberOfLines={1}>{node.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                    </Pressable>
                  );
                }
                const e = item as FileEntry;
                const target = e.uri + '/';
                const active = moveDest === target;
                return (
                  <Pressable onPress={() => navMovePath(target)} style={[s.moveRow, { backgroundColor: 'transparent' }]}>
                    <Ionicons name="folder-outline" size={18} color={theme.textSecondary} />
                    <Text style={[s.moveLabel, { color: theme.text }]} numberOfLines={1}>{e.name}</Text>
                    <Pressable onPress={() => setMoveDest(target)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={active ? theme.accent : theme.textSecondary} />
                    </Pressable>
                  </Pressable>
                );
              }}
            />
            <Pressable
              onPress={() => setMoveDest(movePath)}
              style={[s.hereRow, moveDest === movePath && { backgroundColor: theme.accentSoft }]}
            >
              <Ionicons name="enter-outline" size={18} color={theme.accent} />
              <Text style={[s.moveLabel, { color: theme.accent }]}>В текущую папку</Text>
            </Pressable>
            {selInsideMove && (
              <Text style={[s.warn, { color: '#EF4444' }]}>Нельзя переместить папку в саму себя</Text>
            )}
            <View style={s.modalActions}>
              <Pressable onPress={() => { setShowMove(false); setMoveDest(''); if (moveSingle) { setMoveSingle(false); cancelSelecting(); } }} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: theme.textSecondary }]}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={moveSelected}
                disabled={!moveDest || selInsideMove}
                style={[s.modalBtn, { backgroundColor: moveDest && !selInsideMove ? theme.accent : theme.border }]}
              >
                <Text style={[s.modalBtnText, { color: '#FFF' }]}>Сюда</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1048576).toFixed(1)} МБ`;
}

function formatDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    // --- новый навбар: крупный заголовок, крошки строкой, поиск полем ---
    navRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42 },
    backChevron: { marginLeft: -8, marginRight: 2, padding: 4 },
    navTitle: { flex: 1, ...tp.largeTitle, letterSpacing: -0.6 },
    navActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    navBtn: { padding: 7 },
    navBtnText: { ...tp.callout, fontFamily: uiFontOf(600) },
    crumbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 12 },
    crumb: { ...tp.footnote, fontFamily: uiFontOf(500), maxWidth: 150 },
    searchField: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 36, borderRadius: 10, paddingHorizontal: 8, marginBottom: 14,
    },
    searchHint: { ...tp.callout },
    listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    sectionTitle: { ...tp.caption, fontFamily: uiFontOf(500), textTransform: 'uppercase', letterSpacing: 0.4 },
    sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingLeft: 8 },
    sortMenu: {
      borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 8,
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
    },
    sortItem: { ...tp.callout },

    // --- плавающая капсула ---
    undoWrap: { position: 'absolute', left: 16, right: 16 },
    undoBar: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
    undoText: { flex: 1, ...tp.footnote, fontFamily: uiFontOf(400), color: '#FFFFFF' },
    undoBtn: { ...tp.footnote, fontFamily: uiFontOf(600), color: '#0A84FF' },
    tabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    tabBar: {
      flexDirection: 'row', alignItems: 'center', gap: 2,
      padding: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    tabItem: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    },

    // --- шторки действий ---
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)' },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16,
    },
    sheetHandle: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
    sheetTitle: { ...tp.title3, marginBottom: 8 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    actionText: { ...tp.body },
    cancelRow: { marginTop: 10, borderRadius: 12, alignItems: 'center', paddingVertical: 13 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8,
      backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn: { padding: 8, marginRight: 4 },
    backSpacer: { width: 40 },
    title: { flex: 1, fontSize: 18, fontWeight: '600' },
    headerActions: { flexDirection: 'row', gap: 4 },
    iconBtn: { padding: 8 },
    sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
    sortChip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
    sortText: { ...tp.footnote, fontFamily: uiFontOf(500) },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderBottomWidth: 1, borderBottomColor: theme.border },
    breadcrumb: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surfaceAlt,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    crumbText: { fontSize: 13 },
    list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 140 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1 },
    name: { ...tp.body, fontFamily: uiFontOf(400) },
    meta: { ...tp.caption, marginTop: 1 },
    itemBtn: { padding: 8 },
    tabs: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 4, position: 'absolute', bottom: 0, left: 0, right: 0 },
    tabBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
    tabLabel: { ...tp.caption2, fontFamily: uiFontOf(500) },
    fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 16 },
    emptyHint: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modal: { borderRadius: 20, padding: 24, width: '80%', maxWidth: 320 },
    moveModal: { borderRadius: 20, padding: 20, width: '88%', maxWidth: 380, maxHeight: '80%' },
    modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
    modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 16 },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
    modalBtnText: { fontSize: 15, fontWeight: '500' },
    existingTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    tagPill: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
    tagPillText: { fontSize: 12 },
    moveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10 },
    moveLabel: { flex: 1, fontSize: 15 },
    backTreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
    moveCrumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, backgroundColor: theme.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
    hereRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
    warn: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
    searchWrap: { flex: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
    searchInputBig: { flex: 1, fontSize: 16, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8 },
    scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    scopeChip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
    scopeText: { fontSize: 13, fontWeight: '500' },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    tagName: { flex: 1, fontSize: 15, fontWeight: '500' },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
    backRowText: { fontSize: 15, fontWeight: '600' },
    recentHint: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  });
}
