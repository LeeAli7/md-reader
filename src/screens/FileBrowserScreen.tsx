import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert,
  TextInput, Modal,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { getFavorites, toggleFavorite, getRecent, pushRecent as storePushRecent, getTagMap, setTags as storeSetTags, type RecentEntry } from '../utils/metaStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { FileTypeIcon } from '../components/FileTypeIcon';
import { TagChips } from '../components/TagChips';
import { OverflowMenu, type MenuAction } from '../components/OverflowMenu';

declare const require: any;

// Метаданные (избранное / недавние / теги) — единый слой src/utils/metaStore.ts, ключи md2_*.

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

type Tab = 'files' | 'fav' | 'recent' | 'tags';
type SortKey = 'name' | 'date' | 'size';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'files', label: 'Файлы', icon: 'folder-outline' },
  { key: 'fav', label: 'Избранное', icon: 'star-outline' },
  { key: 'recent', label: 'Недавние', icon: 'time-outline' },
  { key: 'tags', label: 'Теги', icon: 'pricetag-outline' },
];

const MD_READER_DIR = FileSystem.documentDirectory + 'md-reader/';

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
  // Фаза «лицо»: табы, поиск, сортировка, избранное, недавние, теги
  const [tab, setTab] = useState<Tab>('files');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showSort, setShowSort] = useState(false);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagFor, setTagFor] = useState<FileEntry | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [menuFor, setMenuFor] = useState<FileEntry | null>(null);
  const [showMove, setShowMove] = useState(false);
  const [moveDest, setMoveDest] = useState('');
  const [moveSingle, setMoveSingle] = useState(false);

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

  const recordRecentByUri = async (uri: string, title: string) => {
    try {
      const list = await storePushRecent(uri, title);
      setRecent(list);
    } catch {}
  };

  // Вычистить uri из меты: сначала removeFile стора (когда есть у Ареса),
  // локальное зеркало чистим всегда — включая вложенные при удалении папки.
  const purgeMeta = async (uri: string) => {
    const prefix = uri.endsWith('/') ? uri : uri + '/';
    try {
      const store: any = require('../utils/metaStore');
      if (store && typeof store.removeFile === 'function') {
        await store.removeFile(uri);
      }
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

  // Открытие из Избранного/Недавних: битые записи чистим сразу, без экрана ошибки.
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
    recordRecentByUri(uri, title);
    navigation.navigate('Reader', { uri, title });
  };

  const toggleFav = async (uri: string) => {
    try {
      setFavs(await toggleFavorite(uri));
    } catch {}
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

  const navigateTo = (entry: FileEntry) => {
    if (isSelecting) {
      toggleSelect(entry.uri);
      return;
    }
    if (entry.isDir) {
      setCurrentPath(entry.uri + '/');
    } else {
      openEntry(entry);
    }
  };

  const toggleSelect = (uri: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
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

  // Папки-кандидаты для перемещения: родитель + подпапки текущей (кроме выбранных и их вложенных).
  const moveTargets = React.useMemo(() => {
    const sel = [...selected];
    const insideSel = (uri: string) => sel.some((s) => uri === s || uri.startsWith(s.endsWith('/') ? s : s + '/'));
    const out: { label: string; path: string }[] = [];
    if (currentPath !== MD_READER_DIR) {
      out.push({ label: '↑ На уровень выше', path: currentPath.replace(/[^/]+\/$/, '') });
    }
    for (const e of entries) {
      if (e.isDir && !insideSel(e.uri + '/')) out.push({ label: e.name, path: e.uri + '/' });
    }
    return out;
  }, [entries, selected, currentPath]);

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

  // ⋮-меню файла/папки: все действия в одном месте.
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
    acts.push({ icon: 'folder-outline', label: 'Переместить…', onPress: () => { setSelected(new Set([entry.uri])); setIsSelecting(true); setMoveSingle(true); setMoveDest(''); setShowMove(true); } });
    acts.push({ icon: 'trash-outline', label: 'Удалить', danger: true, onPress: () => deleteEntry(entry) });
    return acts;
  };

  // Фильтр + сортировка для вкладки Файлы
  const visibleEntries = React.useMemo(() => {
    let list = entries;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    if (activeTag) list = list.filter((e) => (tags[e.uri] || []).includes(activeTag));
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sortKey === 'date') return (a.modifiedAt - b.modifiedAt) * dir;
      if (sortKey === 'size') return ((a.size || 0) - (b.size || 0)) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [entries, query, activeTag, tags, sortKey, sortAsc]);

  const favEntries = React.useMemo(
    () => favs.map((uri) => ({ uri, name: uri.split('/').pop() || uri })).filter((f) => !query || f.name.toLowerCase().includes(query.trim().toLowerCase())),
    [favs, query]
  );
  const recentShown = React.useMemo(
    () => recent.filter((r) => !query || r.title.toLowerCase().includes(query.trim().toLowerCase())),
    [recent, query]
  );
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    Object.values(tags).forEach((arr) => arr.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [tags]);
  const tagFiles = React.useMemo(
    () => (activeTag ? entries.filter((e) => (tags[e.uri] || []).includes(activeTag)) : []),
    [activeTag, entries, tags]
  );

  const s = styles(theme, insets);

  const renderItem = ({ item }: { item: FileEntry }) => {
    const isSelected = selected.has(item.uri);
    return (
      <Pressable
        onPress={() => navigateTo(item)}
        onLongPress={() => setMenuFor(item)}
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
          <Pressable onPress={() => setMenuFor(item)} hitSlop={8} style={s.itemBtn}>
            <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </Pressable>
    );
  };


  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={goBack} style={s.backBtn}>
          <Ionicons name={isSelecting ? 'close' : 'chevron-back'} size={24} color={theme.text} />
        </Pressable>
        <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>
          {isSelecting ? `${selected.size} выбрано` : (pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'Мои файлы')}
        </Text>
        {isSelecting ? (
          <View style={s.headerActions}>
            <Pressable onPress={() => { setMoveDest(''); setShowMove(true); }} style={s.iconBtn} disabled={selected.size === 0}>
              <Ionicons name="folder-outline" size={22} color={selected.size > 0 ? theme.accent : theme.border} />
            </Pressable>
            <Pressable onPress={deleteSelected} style={s.iconBtn} disabled={selected.size === 0}>
              <Ionicons name="trash" size={22} color={selected.size > 0 ? '#EF4444' : theme.border} />
            </Pressable>
          </View>
        ) : (
          <View style={s.headerActions}>
            <Pressable onPress={() => setShowSort(!showSort)} style={s.iconBtn}>
              <Ionicons name="swap-vertical-outline" size={22} color={theme.accent} />
            </Pressable>
            {tab === 'files' && (
              <Pressable onPress={() => { setIsSelecting(true); setSelected(new Set()); }} style={s.iconBtn}>
                <Ionicons name="checkmark-circle-outline" size={22} color={theme.accent} />
              </Pressable>
            )}
            <Pressable onPress={createNewFile} style={s.iconBtn}>
              <Ionicons name="document-text-outline" size={22} color={theme.accent} />
            </Pressable>
            <Pressable onPress={importFile} style={s.iconBtn}>
              <Ionicons name="add-circle-outline" size={22} color={theme.accent} />
            </Pressable>
            <Pressable onPress={() => setShowNewFolder(true)} style={s.iconBtn}>
              <Ionicons name="folder-outline" size={22} color={theme.accent} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Search */}
      {!isSelecting && (
        <View style={[s.searchRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder="Поиск по имени…"
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      )}

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

      {/* Active tag filter */}
      {activeTag && (
        <View style={[s.tagFilter, { backgroundColor: theme.accentSoft }]}>
          <Text style={[s.tagFilterText, { color: theme.accent }]}>#{activeTag}</Text>
          <Pressable onPress={() => setActiveTag(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={theme.accent} />
          </Pressable>
        </View>
      )}

      {/* Content per tab */}
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

      {tab === 'fav' && (
        favEntries.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="star-outline" size={64} color={theme.border} />
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>Нет избранного</Text>
            <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Отмечайте файлы звездой</Text>
          </View>
        ) : (
          <FlatList
            data={favEntries}
            keyExtractor={(item) => item.uri}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <Pressable onPress={() => openStoredFile(item.uri, item.name)} style={[s.item, { borderBottomColor: theme.divider }]}>
                <FileTypeIcon name={item.name} theme={theme} />
                <View style={s.info}>
                  <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                  <TagChips tags={(tags[item.uri] || []).slice(0, 3)} theme={theme} />
                </View>
                <Pressable onPress={() => toggleFav(item.uri)} hitSlop={8} style={s.itemBtn}>
                  <Ionicons name="star" size={18} color="#F59E0B" />
                </Pressable>
              </Pressable>
            )}
          />
        )
      )}

      {tab === 'recent' && (
        recentShown.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={64} color={theme.border} />
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>Пока пусто</Text>
            <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Открытые файлы появятся здесь</Text>
          </View>
        ) : (
          <FlatList
            data={recentShown}
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

      {tab === 'tags' && (
        <View style={{ flex: 1 }}>
          {allTags.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="pricetag-outline" size={64} color={theme.border} />
              <Text style={[s.emptyText, { color: theme.textSecondary }]}>Тегов пока нет</Text>
              <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Откройте ⋮ у файла, чтобы добавить тег</Text>
            </View>
          ) : (
            <FlatList
              data={allTags}
              keyExtractor={(t) => t}
              contentContainerStyle={s.list}
              renderItem={({ item: t }) => {
                const count = Object.values(tags).filter((arr) => arr.includes(t)).length;
                const active = activeTag === t;
                return (
                  <Pressable
                    onPress={() => { setActiveTag(active ? null : t); setTab(active ? 'tags' : 'files'); }}
                    style={[s.tagRow, { borderBottomColor: theme.divider, backgroundColor: active ? theme.accentSoft : 'transparent' }]}
                  >
                    <Ionicons name="pricetag" size={18} color={active ? theme.accent : theme.textSecondary} />
                    <Text style={[s.tagName, { color: theme.text }]}>#{t}</Text>
                    <Text style={[s.meta, { color: theme.textSecondary }]}>{count}</Text>
                  </Pressable>
                );
              }}
            />
          )}
          {activeTag && tagFiles.length > 0 && (
            <Text style={[s.tagFilesHint, { color: theme.textSecondary }]}>Файлы с #{activeTag} — во вкладке Файлы</Text>
          )}
        </View>
      )}

      {/* Bottom tabs */}
      <View style={[s.tabs, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={s.tabBtn}>
              <Ionicons name={t.icon as any} size={22} color={active ? theme.accent : theme.textSecondary} />
              <Text style={[s.tabLabel, { color: active ? theme.accent : theme.textSecondary }]}>{t.label}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => navigation.navigate('Settings')} style={s.tabBtn}>
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          <Text style={[s.tabLabel, { color: theme.textSecondary }]}>Настройки</Text>
        </Pressable>
      </View>

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

      {/* Move Modal */}
      <Modal visible={showMove} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modal, { backgroundColor: theme.surface, maxWidth: 360 }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Переместить ({selected.size})</Text>
            {moveTargets.length === 0 ? (
              <Text style={[s.meta, { color: theme.textSecondary, marginBottom: 16 }]}>
                Некуда перемещать — создайте папку
              </Text>
            ) : (
              <FlatList
                data={moveTargets}
                keyExtractor={(t) => t.path}
                style={{ maxHeight: 260, marginBottom: 12 }}
                renderItem={({ item: t }) => {
                  const active = moveDest === t.path;
                  return (
                    <Pressable
                      onPress={() => setMoveDest(t.path)}
                      style={[s.moveRow, { backgroundColor: active ? theme.accentSoft : 'transparent' }]}
                    >
                      <Ionicons name={t.label.startsWith('↑') ? 'arrow-up-outline' : 'folder-outline'} size={18} color={active ? theme.accent : theme.textSecondary} />
                      <Text style={[s.moveLabel, { color: active ? theme.accent : theme.text }]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                    </Pressable>
                  );
                }}
              />
            )}
            <View style={s.modalActions}>
              <Pressable onPress={() => { setShowMove(false); setMoveDest(''); if (moveSingle) { setMoveSingle(false); cancelSelecting(); } }} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: theme.textSecondary }]}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={moveSelected}
                disabled={!moveDest}
                style={[s.modalBtn, { backgroundColor: moveDest ? theme.accent : theme.border }]}
              >
                <Text style={[s.modalBtnText, { color: '#FFF' }]}>Сюда</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ⋮-меню файла/папки */}
      <OverflowMenu
        visible={!!menuFor}
        title={menuFor?.name}
        actions={menuFor ? fileMenuActions(menuFor) : []}
        theme={theme}
        onClose={() => setMenuFor(null)}
      />
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
    title: { flex: 1, fontSize: 18, fontWeight: '600' },
    headerActions: { flexDirection: 'row', gap: 4 },
    iconBtn: { padding: 8 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
    sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
    sortChip: { borderWidth: 1, borderColor: 'transparent', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
    sortText: { fontSize: 13 },
    breadcrumb: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surfaceAlt,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    crumbText: { fontSize: 13 },
    tagFilter: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', margin: 12, marginBottom: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
    tagFilterText: { fontSize: 13, fontWeight: '600' },
    list: { padding: 16, paddingBottom: 100 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '500' },
    meta: { fontSize: 12, marginTop: 2 },
    itemActions: { flexDirection: 'row', gap: 0 },
    itemBtn: { padding: 8 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    tagName: { flex: 1, fontSize: 15, fontWeight: '500' },
    tagFilesHint: { fontSize: 12, textAlign: 'center', paddingVertical: 8 },
    tabs: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 4, position: 'absolute', bottom: 0, left: 0, right: 0 },
    tabBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
    tabLabel: { fontSize: 10 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 16 },
    emptyHint: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modal: { borderRadius: 20, padding: 24, width: '80%', maxWidth: 320 },
    modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 16 },
    modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 16 },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
    modalBtnText: { fontSize: 15, fontWeight: '500' },
    existingTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    tagPill: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
    tagPillText: { fontSize: 12 },
    moveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
    moveLabel: { flex: 1, fontSize: 15 },
  });
}
