import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { readingThemes } from '../theme/tokens';
import { fonts } from '../theme/fonts';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import type { ThemeMode } from '../context/AppSettingsContext';

const MODES: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'light', label: 'Светлая', icon: 'sunny-outline' },
  { key: 'dark', label: 'Тёмная', icon: 'moon-outline' },
  { key: 'auto', label: 'Авто', icon: 'contrast-outline' },
];

export default function SettingsScreen() {
  const { theme, isDark, mode, setMode } = useTheme();
  const app = useAppSettingsOpt();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);

  const fontSize = app?.fontSize ?? 16;
  const lineHeight = app?.lineHeight ?? 1.7;
  const contentWidth = app?.contentWidth ?? 720;
  const selectedFont = app?.font ?? 'Inter';
  const selectedTheme = app?.readingTheme ?? 'default';

  const step = (fn: () => void) => fn;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.heading}>Настройки</Text>

      {/* Тема приложения */}
      <Text style={s.sectionTitle}>Оформление</Text>
      <View style={s.modeRow}>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[s.modeCard, { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : theme.surface }]}
            >
              <Ionicons name={m.icon as any} size={22} color={active ? theme.accent : theme.textSecondary} />
              <Text style={[s.modeLabel, { color: active ? theme.accent : theme.text }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.hint}>Сейчас: {isDark ? 'тёмная' : 'светлая'}{mode === 'auto' ? ' (по системе)' : ''}</Text>

      {/* Тема чтения */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Тема чтения</Text>
      <View style={s.themeGrid}>
        {Object.entries(readingThemes).map(([key, rt]) => {
          const active = selectedTheme === key;
          return (
            <Pressable
              key={key}
              onPress={() => app?.setReadingTheme(key)}
              style={[s.themeCard, { backgroundColor: rt.bg, borderColor: active ? theme.accent : rt.text + '25', borderWidth: active ? 2 : 1 }]}
            >
              <Text style={{ color: rt.text, fontSize: 16, fontWeight: '700' }}>Аа</Text>
              <Text style={{ color: rt.text, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{rt.name}</Text>
              {active && <Ionicons name="checkmark-circle" size={16} color={theme.accent} style={s.check} />}
            </Pressable>
          );
        })}
      </View>

      {/* Шрифт */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Шрифт: {selectedFont}</Text>
      <View style={s.fontWrap}>
        {[...fonts].map((f) => {
          const active = selectedFont === f;
          return (
            <Pressable
              key={f}
              onPress={() => app?.setFont(f)}
              style={[s.fontChip, { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : 'transparent' }]}
            >
              <Text style={[s.fontText, { color: active ? theme.accent : theme.text }]}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Размер */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Размер шрифта: {fontSize}px</Text>
      <View style={s.stepRow}>
        <Pressable onPress={() => step(() => app?.setFontSize(Math.max(12, fontSize - 1)))} style={[s.stepBtn, { borderColor: theme.border }]}>
          <Ionicons name="remove" size={20} color={theme.text} />
        </Pressable>
        <Text style={[s.preview, { color: theme.text, fontSize }]}>Пример текста для чтения</Text>
        <Pressable onPress={() => step(() => app?.setFontSize(Math.min(28, fontSize + 1)))} style={[s.stepBtn, { borderColor: theme.border }]}>
          <Ionicons name="add" size={20} color={theme.text} />
        </Pressable>
      </View>

      {/* Межстрочный */}
      <Text style={[s.sectionTitle, { marginTop: 20 }]}>Межстрочный интервал: {lineHeight.toFixed(1)}</Text>
      <View style={s.stepRow}>
        <Pressable onPress={() => step(() => app?.setLineHeight(Math.max(1.2, +(lineHeight - 0.1).toFixed(1))))} style={[s.stepBtn, { borderColor: theme.border }]}>
          <Ionicons name="remove" size={20} color={theme.text} />
        </Pressable>
        <Text style={[s.stepVal, { color: theme.text }]}>{lineHeight.toFixed(1)}</Text>
        <Pressable onPress={() => step(() => app?.setLineHeight(Math.min(2.5, +(lineHeight + 0.1).toFixed(1))))} style={[s.stepBtn, { borderColor: theme.border }]}>
          <Ionicons name="add" size={20} color={theme.text} />
        </Pressable>
      </View>

      {/* Ширина колонки */}
      <Text style={[s.sectionTitle, { marginTop: 20 }]}>Ширина текста: {contentWidth}px</Text>
      <View style={s.stepRow}>
        <Pressable onPress={() => step(() => app?.setContentWidth(Math.max(480, contentWidth - 40)))} style={[s.stepBtn, { borderColor: theme.border }]}>
          <Ionicons name="remove" size={20} color={theme.text} />
        </Pressable>
        <Text style={[s.stepVal, { color: theme.text }]}>{contentWidth}</Text>
        <Pressable onPress={() => step(() => app?.setContentWidth(Math.min(1000, contentWidth + 40)))} style={[s.stepBtn, { borderColor: theme.border }]}>
          <Ionicons name="add" size={20} color={theme.text} />
        </Pressable>
      </View>

      {/* Сброс */}
      <Pressable
        onPress={() => Alert.alert('Сбросить настройки?', 'Вернуть все значения по умолчанию', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сбросить', style: 'destructive', onPress: () => app?.resetAll() },
        ])}
        style={[s.resetBtn, { borderColor: theme.border }]}
      >
        <Ionicons name="refresh-outline" size={18} color="#EF4444" />
        <Text style={s.resetText}>Сбросить всё</Text>
      </Pressable>

      <View style={s.about}>
        <Text style={s.sectionTitle}>О приложении</Text>
        <Text style={[s.aboutText, { color: theme.text }]}>MD Vault Pro · v2</Text>
        <Text style={[s.aboutSub, { color: theme.textSecondary }]}>Читалка и хранитель текстовых знаний</Text>
      </View>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 20, paddingTop: insets.top + 20, paddingBottom: 60 },
    heading: { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    hint: { fontSize: 12, color: theme.textSecondary, marginTop: 8 },
    modeRow: { flexDirection: 'row', gap: 10 },
    modeCard: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6 },
    modeLabel: { fontSize: 13, fontWeight: '500' },
    themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    themeCard: { width: '30%', borderRadius: 12, padding: 10, alignItems: 'center', minHeight: 74, justifyContent: 'center' },
    check: { position: 'absolute', top: 6, right: 6 },
    fontWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    fontChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    fontText: { fontSize: 13 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: 14, padding: 14 },
    stepBtn: { borderWidth: 1, borderRadius: 10, padding: 8 },
    stepVal: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
    preview: { flex: 1, textAlign: 'center' },
    resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 28 },
    resetText: { fontSize: 15, color: '#EF4444', fontWeight: '500' },
    about: { marginTop: 32 },
    aboutText: { fontSize: 15 },
    aboutSub: { fontSize: 13, marginTop: 4 },
  });
}
