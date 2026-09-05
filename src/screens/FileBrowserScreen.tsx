import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert,
  TextInput, Modal, Animated,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

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

const MD_READER_DIR = FileSystem.documentDirectory + 'md-reader/';

export default function FileBrowserScreen({ navigation }: Props) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(MD_READER_DIR);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRename, setShowRename] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

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
          modifiedAt: itemInfo.modificationTime ?? 0,
          size: itemInfo.size,
        });
      }
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(result);
      setCurrentPath(path);
    } catch (e) {
      console.warn('loadDir error:', e);
    }
  }, []);

  React.useEffect(() => { loadDir(currentPath); }, [currentPath]);

  const pathParts = currentPath.replace(MD_READER_DIR, '').split('/').filter(Boolean);

  const navigateTo = (entry: FileEntry) => {
    if (isSelecting) {
      toggleSelect(entry.uri);
      return;
    }
    if (entry.isDir) {
      setCurrentPath(entry.uri + '/');
    } else if (entry.name.endsWith('.md')) {
      navigation.navigate('Reader', { uri: entry.uri, title: entry.name });
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

  const startSelecting = (uri: string) => {
    setIsSelecting(true);
    setSelected(new Set([uri]));
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
            }
            cancelSelecting();
            loadDir(currentPath);
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
            loadDir(currentPath);
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
    navigation.navigate('Reader', { uri: path, title: name });
  };

  const s = styles(theme, isDark, insets);

  const renderItem = ({ item }: { item: FileEntry }) => {
    const isSelected = selected.has(item.uri);
    return (
      <Pressable
        onPress={() => navigateTo(item)}
        onLongPress={() => startSelecting(item.uri)}
        style={[
          s.item,
          isSelected && { backgroundColor: theme.accent + '15' },
          { borderBottomColor: theme.divider },
        ]}
      >
        {isSelecting && (
          <View style={[s.checkbox, isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
        )}
        <View style={[s.iconWrap, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name={item.isDir ? 'folder' : 'document-text'} size={22} color={theme.accent} />
        </View>
        <View style={s.info}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
          {!item.isDir && (
            <Text style={[s.meta, { color: theme.textSecondary }]}>
              {item.size ? formatSize(item.size) : ''}
            </Text>
          )}
        </View>
        {!isSelecting && (
          <View style={s.itemActions}>
            <Pressable onPress={() => { setShowRename(item); setRenameName(item.name.replace('.md', '')); }} hitSlop={8} style={s.itemBtn}>
              <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => deleteEntry(item)} hitSlop={8} style={s.itemBtn}>
              <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
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
          <Pressable onPress={deleteSelected} style={s.iconBtn} disabled={selected.size === 0}>
            <Ionicons name="trash" size={22} color={selected.size > 0 ? '#EF4444' : theme.border} />
          </Pressable>
        ) : (
          <View style={s.headerActions}>
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

      {/* Breadcrumb */}
      {!isSelecting && pathParts.length > 0 && (
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

      {/* File list */}
      {entries.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="folder-open-outline" size={64} color={theme.border} />
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>Папка пуста</Text>
          <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Нажмите + чтобы создать файл или импортировать</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.uri}
          contentContainerStyle={s.list}
          renderItem={renderItem}
        />
      )}

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
    </View>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1048576).toFixed(1)} МБ`;
}

function styles(theme: any, isDark: boolean, insets: any) {
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
    breadcrumb: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surfaceAlt,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    crumbText: { fontSize: 13 },
    list: { padding: 16, paddingBottom: 100 },
    item: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2,
      borderColor: theme.border, alignItems: 'center', justifyContent: 'center',
    },
    iconWrap: {
      width: 40, height: 40, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '500' },
    meta: { fontSize: 12, marginTop: 2 },
    itemActions: { flexDirection: 'row', gap: 4 },
    itemBtn: { padding: 8 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 16 },
    emptyHint: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center',
    },
    modal: {
      borderRadius: 20, padding: 24, width: '80%', maxWidth: 320,
    },
    modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 16 },
    modalInput: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
      marginBottom: 16,
    },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
    modalBtnText: { fontSize: 15, fontWeight: '500' },
  });
}
