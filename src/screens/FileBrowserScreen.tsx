import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert,
  TextInput, Modal, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { FileItem } from '../components/FileItem';
import { FolderItem } from '../components/FolderItem';

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
      // Dirs first, then files, alphabetical
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
    if (entry.isDir) {
      setCurrentPath(entry.uri + '/');
    } else if (entry.name.endsWith('.md')) {
      navigation.navigate('Reader', { uri: entry.uri, title: entry.name });
    }
  };

  const goBack = () => {
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
      const res = await DocumentPicker.getDocumentAsync({
        type: 'text/markdown',
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        const file = res.assets[0];
        const dest = currentPath + file.name;
        await FileSystem.copyAsync({ from: file.uri, to: dest });
        loadDir(currentPath);
      }
    } catch (e) {
      // Fallback: pick any file
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!res.canceled && res.assets[0]) {
        const file = res.assets[0];
        const dest = currentPath + file.name;
        await FileSystem.copyAsync({ from: file.uri, to: dest });
        loadDir(currentPath);
      }
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

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={goBack} style={s.backBtn} disabled={currentPath === MD_READER_DIR}>
          <Ionicons name="chevron-back" size={24} color={currentPath === MD_READER_DIR ? theme.border : theme.text} />
        </Pressable>
        <Text style={s.title} numberOfLines={1}>
          {pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'Мои файлы'}
        </Text>
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
      </View>

      {/* Breadcrumb */}
      {pathParts.length > 0 && (
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
          <Text style={s.emptyText}>Папка пуста</Text>
          <Text style={s.emptyHint}>Нажмите + чтобы создать файл или импортировать .md</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.uri}
          contentContainerStyle={s.list}
          renderItem={({ item }) => item.isDir ? (
            <FolderItem
              entry={item}
              theme={theme}
              onPress={() => navigateTo(item)}
              onLongPress={() => { setShowRename(item); setRenameName(item.name); }}
              onDelete={() => deleteEntry(item)}
            />
          ) : (
            <FileItem
              entry={item}
              theme={theme}
              onPress={() => navigateTo(item)}
              onLongPress={() => { setShowRename(item); setRenameName(item.name.replace('.md', '')); }}
              onDelete={() => deleteEntry(item)}
            />
          )}
        />
      )}

      {/* New Folder Modal */}
      <Modal visible={showNewFolder} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Новая папка</Text>
            <TextInput
              style={s.modalInput}
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
          <View style={s.modal}>
            <Text style={s.modalTitle}>Переименовать</Text>
            <TextInput
              style={s.modalInput}
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

function styles(theme: any, isDark: boolean, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8,
      backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn: { padding: 8, marginRight: 4 },
    title: { flex: 1, fontSize: 18, fontWeight: '600', color: theme.text },
    headerActions: { flexDirection: 'row', gap: 4 },
    iconBtn: { padding: 8 },
    breadcrumb: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.surfaceAlt,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    crumbText: { fontSize: 13 },
    list: { padding: 16, paddingBottom: 100 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 16, color: theme.textSecondary },
    emptyHint: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center',
    },
    modal: {
      backgroundColor: theme.surface, borderRadius: theme.radius.lg,
      padding: 24, width: '80%', maxWidth: 320,
    },
    modalTitle: { fontSize: 17, fontWeight: '600', color: theme.text, marginBottom: 16 },
    modalInput: {
      borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.text,
      backgroundColor: theme.bg, marginBottom: 16,
    },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    modalBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: theme.radius.md },
    modalBtnText: { fontSize: 15, fontWeight: '500' },
  });
}
