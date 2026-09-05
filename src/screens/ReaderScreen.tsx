import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Modal, FlatList, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../hooks/useTheme';
import { readingThemes } from '../theme/tokens';
import { fonts, defaultSizes } from '../theme/fonts';

interface Props {
  route: any;
  navigation: any;
}

const STORAGE_KEYS = {
  fontSize: 'md_font_size',
  lineHeight: 'md_line_height',
  font: 'md_font',
  readingTheme: 'md_reading_theme',
};

export default function ReaderScreen({ route, navigation }: Props) {
  const { uri, title } = route.params;
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(defaultSizes.fontSize);
  const [lineHeight, setLineHeight] = useState(defaultSizes.lineHeight);
  const [selectedFont, setSelectedFont] = useState('Inter');
  const [selectedTheme, setSelectedTheme] = useState(isDark ? 'github' : 'default');
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [fs, lh, f, t] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.fontSize),
          AsyncStorage.getItem(STORAGE_KEYS.lineHeight),
          AsyncStorage.getItem(STORAGE_KEYS.font),
          AsyncStorage.getItem(STORAGE_KEYS.readingTheme),
        ]);
        if (fs) setFontSize(Number(fs));
        if (lh) setLineHeight(Number(lh));
        if (f) setSelectedFont(f);
        if (t) setSelectedTheme(t);
      } catch {}
    })();
  }, []);

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

  const saveSetting = async (key: string, value: string) => {
    try { await AsyncStorage.setItem(key, value); } catch {}
  };

  const rt = readingThemes[selectedTheme] || readingThemes.default;
  const isDarkReading = rt.text === '#C9D1D9' || rt.text === '#E7E5E4' || rt.text === '#F8F8F2' || rt.text === '#586E75';

  const s = styles(insets);

  return (
    <View style={[s.container, { backgroundColor: rt.bg }]}>
      <View style={[s.topBar, { backgroundColor: rt.bg, borderBottomColor: rt.text + '15' }]}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={rt.text} />
        </Pressable>
        <Text style={[s.title, { color: rt.text }]} numberOfLines={1}>{title}</Text>
        <View style={s.topActions}>
          <Text style={[s.meta, { color: rt.text + '60' }]}>
            {wordCount} слов · ~{readTime} мин
          </Text>
          <Pressable onPress={() => setShowSettings(true)} style={s.settingsBtn}>
            <Ionicons name="settings-outline" size={22} color={rt.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.content,
          { maxWidth: defaultSizes.contentWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
        <Markdown
          style={{
            body: {
              color: rt.text, fontSize,
              lineHeight: fontSize * lineHeight,
              fontFamily: selectedFont === 'Inter' ? 'Inter' :
                selectedFont === 'Roboto' ? 'Roboto' :
                selectedFont === 'Merriweather' ? 'Merriweather' :
                selectedFont === 'Fira Code' ? 'FiraCode' :
                selectedFont === 'Open Sans' ? 'OpenSans' :
                selectedFont === 'Lato' ? 'Lato' :
                selectedFont === 'Montserrat' ? 'Montserrat' : 'Inter',
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
            code_block: {
              backgroundColor: isDarkReading ? rt.text + '10' : rt.text + '08',
              color: rt.text, fontSize: fontSize * 0.85, borderRadius: 8,
              padding: 16, marginVertical: 8,
            },
            fence: {
              backgroundColor: isDarkReading ? rt.text + '10' : rt.text + '08',
              color: rt.text, fontSize: fontSize * 0.85, borderRadius: 8,
              padding: 16, marginVertical: 8,
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
            table: { borderWidth: 1, borderColor: rt.text + '20', borderRadius: 8, marginVertical: 8 },
            th: { backgroundColor: rt.text + '08', padding: 8, borderBottomWidth: 1, borderColor: rt.text + '20' },
            td: { padding: 8, borderBottomWidth: 0.5, borderColor: rt.text + '10' },
            hr: { backgroundColor: rt.text + '20', height: 1, marginVertical: 16 },
            list_item: { color: rt.text, fontSize, lineHeight: fontSize * lineHeight },
            strong: { fontWeight: '700' as const, color: rt.text },
            em: { fontStyle: 'italic' as const, color: rt.text },
          }}
        >
          {content}
        </Markdown>
      </ScrollView>

      <Modal visible={showSettings} transparent animationType="slide">
        <View style={s.sheetOverlay}>
          <Pressable style={s.sheetBackdrop} onPress={() => setShowSettings(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Настройки чтения</Text>

            <Text style={[s.label, { color: theme.textSecondary }]}>Размер шрифта: {fontSize}px</Text>
            <View style={s.sliderRow}>
              <Pressable onPress={() => { const v = Math.max(12, fontSize - 1); setFontSize(v); saveSetting(STORAGE_KEYS.fontSize, String(v)); }}>
                <Ionicons name="remove-circle-outline" size={28} color={theme.accent} />
              </Pressable>
              <View style={[s.sliderTrack, { backgroundColor: theme.border }]}>
                <View style={[s.sliderFill, { width: `${((fontSize - 12) / 16) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
              <Pressable onPress={() => { const v = Math.min(28, fontSize + 1); setFontSize(v); saveSetting(STORAGE_KEYS.fontSize, String(v)); }}>
                <Ionicons name="add-circle-outline" size={28} color={theme.accent} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: theme.textSecondary }]}>Межстрочный: {lineHeight.toFixed(1)}</Text>
            <View style={s.sliderRow}>
              <Pressable onPress={() => { const v = Math.max(1.2, +(lineHeight - 0.1).toFixed(1)); setLineHeight(v); saveSetting(STORAGE_KEYS.lineHeight, String(v)); }}>
                <Ionicons name="remove-circle-outline" size={28} color={theme.accent} />
              </Pressable>
              <View style={[s.sliderTrack, { backgroundColor: theme.border }]}>
                <View style={[s.sliderFill, { width: `${((lineHeight - 1.2) / 1.3) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
              <Pressable onPress={() => { const v = Math.min(2.5, +(lineHeight + 0.1).toFixed(1)); setLineHeight(v); saveSetting(STORAGE_KEYS.lineHeight, String(v)); }}>
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
                  onPress={() => { setSelectedTheme(key); saveSetting(STORAGE_KEYS.readingTheme, key); }}
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
                  onPress={() => { setSelectedFont(f); saveSetting(STORAGE_KEYS.font, f); }}
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
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    meta: { fontSize: 12 },
    settingsBtn: { padding: 8 },
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
