import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { quotaLeft } from '../apo/apoEngine';

interface Props {
  navigation: any;
}

const ROWS: { icon: string; title: string; sub: string; route: string; params: any }[] = [
  { icon: 'camera', title: 'Камера', sub: 'Снять вопрос прямо сейчас', route: 'ApoCapture', params: {} },
  { icon: 'image', title: 'Скриншот', sub: 'Выбрать из галереи', route: 'ApoCapture', params: { tab: 'gallery' } },
  { icon: 'document-text', title: 'Документ', sub: 'PDF, Word, изображение', route: 'ApoConvert', params: {} },
  { icon: 'text', title: 'Вставить текст', sub: 'Вопрос и варианты разложим сами', route: 'ApoConvert', params: { tab: 'text' } },
];

export default function ApoHomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [quota, setQuota] = useState({ left: 20, total: 20 });
  const s = styles(theme, insets);

  useFocusEffect(
    useCallback(() => {
      (async () => setQuota(await quotaLeft()))();
    }, []),
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.topbar}>
        <Text style={s.logo}>Apo</Text>
        <View style={s.topRight}>
          <View style={s.proBadge}><Text style={s.proText}>PRO</Text></View>
          <Pressable style={s.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={s.hero}>
        <Text style={s.heroTitle}>Решить тест</Text>
        <Text style={s.heroSub}>Фото, скриншот или документ — ответ за секунды</Text>
        <Pressable style={s.heroBtn} onPress={() => navigation.navigate('ApoCapture')}>
          <Ionicons name="scan" size={20} color="#1A1A1A" />
          <Text style={s.heroBtnText}>Сканировать</Text>
        </Pressable>
      </View>

      <Text style={s.sect}>Новый тест</Text>
      {ROWS.map((r) => (
        <Pressable key={r.title} style={s.row} onPress={() => navigation.navigate(r.route, r.params)}>
          <Ionicons name={r.icon as any} size={22} color={theme.accent} />
          <View style={s.rowText}>
            <Text style={s.rowTitle}>{r.title}</Text>
            <Text style={s.rowSub}>{r.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>
      ))}

      <View style={s.quota}>
        <Text style={s.quotaText}>Бесплатно сегодня: {quota.left} из {quota.total}</Text>
        <Pressable onPress={() => navigation.navigate('Paywall')}>
          <Text style={s.quotaLink}>PRO</Text>
        </Pressable>
      </View>

      <View style={s.tabbar}>
        <View style={s.tabOn}>
          <Ionicons name="home" size={20} color={theme.text} />
          <Text style={s.tabTextOn}>Главная</Text>
        </View>
        <Pressable style={s.tab} onPress={() => navigation.navigate('ApoResult', { history: true })}>
          <Ionicons name="time-outline" size={20} color={theme.textSecondary} />
          <Text style={s.tabText}>История</Text>
        </Pressable>
        <Pressable style={s.tab} onPress={() => navigation.navigate('Paywall')}>
          <Ionicons name="star-outline" size={20} color={theme.textSecondary} />
          <Text style={s.tabText}>PRO</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F17' },
    content: { padding: 18, paddingTop: insets.top + 12, paddingBottom: 120 },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    logo: { fontSize: 22, fontWeight: '800', color: '#F2F5F9' },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proBadge: { backgroundColor: '#E8B84B', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
    proText: { fontSize: 11, fontWeight: '800', color: '#0B0F17' },
    iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#131A26', alignItems: 'center', justifyContent: 'center' },
    hero: { marginTop: 14, borderRadius: 20, padding: 18, backgroundColor: '#2B4BD8' },
    heroTitle: { fontSize: 19, fontWeight: '800', color: '#FFF' },
    heroSub: { fontSize: 13, color: '#D5DCE8', marginTop: 4 },
    heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#FFF', borderRadius: 12, padding: 12, alignSelf: 'flex-start' },
    heroBtnText: { fontWeight: '800', fontSize: 15, color: '#1A1A1A' },
    sect: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#5B6678', marginTop: 18, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#131A26', borderRadius: 14, padding: 14, marginTop: 8 },
    rowText: { flex: 1 },
    rowTitle: { fontSize: 14, fontWeight: '600', color: '#F2F5F9' },
    rowSub: { fontSize: 12, color: '#8A94A6', marginTop: 2 },
    quota: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, backgroundColor: '#131A26', borderRadius: 14, padding: 12 },
    quotaText: { fontSize: 13, color: '#D5DCE8' },
    quotaLink: { fontSize: 13, fontWeight: '800', color: theme.accent },
    tabbar: { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderTopColor: '#161D2A', paddingTop: 12 },
    tab: { flex: 1, alignItems: 'center', gap: 3 },
    tabOn: { flex: 1, alignItems: 'center', gap: 3 },
    tabText: { fontSize: 11, color: theme.textSecondary },
    tabTextOn: { fontSize: 11, color: '#FFF', fontWeight: '700' },
  });
}
