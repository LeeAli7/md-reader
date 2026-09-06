import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert,
  TextInput, Modal, Dimensions, NativeSyntheticEvent, NativeTouchEvent,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { getFavorites, toggleFavorite, getRecent, pushRecent as storePushRecent, getTagMap, setTags as storeSetTags, removeFile as storeRemoveFile, type RecentEntry } from '../utils/metaStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
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

// Дерево папок: getFolderTree движка, если уже есть у Ареса, иначе строим сами.
async function loadFolderTree(): Promise<FolderNode[] | null> {
  for (const mod of ['../utils/folderTree', '../utils/fileSystem', '../utils/fileTypes']) {
    try {
      const eng: any = require(mod);
      if (eng && typeof eng.getFolderTree === 'function') {
        const tree = await eng.getFolderTree();
        if (Array.isArray(tree)) return tree as FolderNode[];
      }
    } catch {}
  }
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
  const [moveSubs, setMoveSubs] = useState<FileEntry[]>([]);

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
      `Удалить ${selected.size} файл(ов)?`,
      'Это действие необратимо',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => {
            for (const uri of selected) {
              await FileSystem.deleteAsync(uri, { idempotent: true });
              await purgeMeta(uri);
            }
            cancelSelecting();
            loadDir(currentPath);
            loadMeta();
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
        const dest = currentPath + file.name;
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
      entry.name,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => {
            await FileSystem.deleteAsync(entry.uri, { idempotent: true });
            await purgeMeta(entry.uri);
            loadDir(currentPath);
            loadMeta();
          },
        },
      ],
    );
  };

  const renameEntry = async () => {
    if (!showRename || !renameName.trim()) return;
    const parentPath = showRename.uri.replace(/[^/]+\/?$/, '');
    const newPath = parentPath + renameName.trim() + (showRename.isDir ? '/' : '');
    await FileSystem.moveAsync({ from: showRename.uri, to: newPath });
    setShowRename(null);
    setRenameName('');
    loadDir(currentPath);
  };

  const createNewFile = async () => {
    const name = 'Новый файл.md';
    const path = currentPath + name;
    await FileSystem.writeAsStringAsync(path, `# ${name.replace('.md', '')}\n\n`);
    const entry = { name, uri: path, isDir: false, modifiedAt: Date.now() / 1000 };
    recordRecent(entry);
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
    setMoveTree(await loadFolderTree());
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
    return [...entries].sort((a, b) => {
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
          {!item.isDir && <TagChips tags={(tags[item.uri] || []).slice(0, 3)} theme={theme} />}
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
    <View style={s.container}>
      {/* Header: назад только внутри папок / в мультивыборе */}
      <View style={s.header}>
        {(pathParts.length > 0 || isSelecting) ? (
          <Pressable onPress={goBack} style={s.backBtn}>
            <Ionicons name={isSelecting ? 'close' : 'chevron-back'} size={24} color={theme.text} />
          </Pressable>
        ) : (
          <View style={s.backSpacer} />
        )}
        <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>
          {isSelecting ? `${selected.size} выбрано` : (pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'Мои файлы')}
        </Text>
        {isSelecting ? (
          <View style={s.headerActions}>
            <Pressable onPress={() => openMove()} style={s.iconBtn} disabled={selected.size === 0}>
              <Ionicons name="folder-outline" size={22} color={selected.size > 0 ? theme.accent : theme.border} />
            </Pressable>
            <Pressable onPress={deleteSelected} style={s.iconBtn} disabled={selected.size === 0}>
              <Ionicons name="trash" size={22} color={selected.size > 0 ? '#EF4444' : theme.border} />
            </Pressable>
          </View>
        ) : (
          <View style={s.headerActions}>
            <Pressable onPress={() => { setQuery(''); setScope('files'); setSearchTag(null); setShowSearch(true); }} style={s.iconBtn}>
              <Ionicons name="search-outline" size={22} color={theme.accent} />
            </Pressable>
            <Pressable onPress={() => setShowSort(!showSort)} style={s.iconBtn}>
              <Ionicons name="swap-vertical-outline" size={22} color={theme.accent} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Sort bar */}
      {showSort && !isSelecting && (
        <View style={[s.sortRow, { backgroundColor: theme.surfaceAlt, borderBottomColor: theme.border }]}>
          {(['name', 'date', 'size'] as SortKey[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => { if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(true); } }}
              style={[s.sortChip, sortKey === k && { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}
            >
              <Text style={[s.sortText, { color: sortKey === k ? theme.accent : theme.textSecondary }]}>
                {k === 'name' ? 'Имя' : k === 'date' ? 'Дата' : 'Размер'}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Breadcrumb */}
      {!isSelecting && tab === 'files' && pathParts.length > 0 && (
        <View style={s.breadcrumb}>
          <Pressable onPress={() => setCurrentPath(MD_READER_DIR)}>
            <Text style={[s.crumbText, { color: theme.accent }]}>Мои файлы</Text>
          </Pressable>
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              <Text style={[s.crumbText, { color: theme.textSecondary }]}> / </Text>
              <Pressable onPress={() => {
                const target = MD_READER_DIR + pathParts.slice(0, i + 1).join('/') + '/';
                setCurrentPath(target);
              }}>
                <Text style={[s.crumbText, { color: i === pathParts.length - 1 ? theme.text : theme.accent }]}>
                  {part}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      )}

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

      {/* Bottom tabs + FAB */}
      <View style={[s.tabs, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={() => setTab('files')} style={s.tabBtn}>
          <Ionicons name={tab === 'files' ? 'folder' : 'folder-outline'} size={22} color={tab === 'files' ? theme.accent : theme.textSecondary} />
          <Text style={[s.tabLabel, { color: tab === 'files' ? theme.accent : theme.textSecondary }]}>Файлы</Text>
        </Pressable>
        <Pressable onPress={() => setTab('recent')} style={s.tabBtn}>
          <Ionicons name={tab === 'recent' ? 'time' : 'time-outline'} size={22} color={tab === 'recent' ? theme.accent : theme.textSecondary} />
          <Text style={[s.tabLabel, { color: tab === 'recent' ? theme.accent : theme.textSecondary }]}>Недавние</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Settings')} style={s.tabBtn}>
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          <Text style={[s.tabLabel, { color: theme.textSecondary }]}>Настройки</Text>
        </Pressable>
      </View>
      {tab === 'files' && !isSelecting && (
        <Pressable
          onPress={(e) => {
            const { pageX, pageY } = e.nativeEvent;
            const { width: SW, height: SH } = Dimensions.get('window');
            setFabAt({
              x: (typeof pageX === 'number' ? pageX : SW) - 256,
              y: (typeof pageY === 'number' ? pageY : SH) - 320,
            });
            setShowFab(true);
          }}
          style={[s.fab, { backgroundColor: theme.accent, bottom: insets.bottom + 76 }]}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </Pressable>
      )}
      <Popover
        visible={showFab}
        x={fabAt.x}
        y={fabAt.y}
        title="Создать"
        theme={theme}
        onClose={() => setShowFab(false)}
        actions={[
          { icon: 'document-text-outline', label: 'Новый файл', onPress: createNewFile },
          { icon: 'folder-outline', label: 'Новая папка', onPress: () => setShowNewFolder(true) },
          { icon: 'download-outline', label: 'Импорт из хранилища', onPress: importFile },
        ]}
      />

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
                    {!item.isDir && <TagChips tags={(tags[item.uri] || []).slice(0, 3)} theme={theme} />}
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
            <FlatList
              data={moveTree ? flatTree.filter(({ node }) => {
                const p = node.uri;
                return ![...selected].some((u) => p === u || p === u + '/' || p.startsWith(u.endsWith('/') ? u : u + '/'));
              }) : moveSubs.filter((e) => ![...selected].includes(e.uri))}
              keyExtractor={(item: any) => moveTree ? item.node.uri : item.uri}
              style={{ maxHeight: 300, marginBottom: 8 }}
              renderItem={({ item }: any) => {
                if (moveTree) {
                  const { node, depth } = item as { node: FolderNode; depth: number };
                  const active = moveDest === node.uri;
                  return (
                    <Pressable onPress={() => setMoveDest(node.uri)} style={[s.moveRow, { paddingLeft: 10 + depth * 16, backgroundColor: active ? theme.accentSoft : 'transparent' }]}>
                      <Ionicons name="folder-outline" size={18} color={active ? theme.accent : theme.textSecondary} />
                      <Text style={[s.moveLabel, { color: active ? theme.accent : theme.text }]} numberOfLines={1}>{node.name}</Text>
                      {active && <Ionicons name="checkmark" size={18} color={theme.accent} />}
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
    sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
    sortChip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
    sortText: { fontSize: 13 },
    breadcrumb: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surfaceAlt,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    crumbText: { fontSize: 13 },
    list: { padding: 16, paddingBottom: 160 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '500' },
    meta: { fontSize: 12, marginTop: 2 },
    itemBtn: { padding: 8 },
    tabs: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 4, position: 'absolute', bottom: 0, left: 0, right: 0 },
    tabBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
    tabLabel: { fontSize: 10 },
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
