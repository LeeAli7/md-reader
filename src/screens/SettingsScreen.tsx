import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { readingThemes, DEFAULT_READING_THEME } from '../theme/tokens';
import { readingFonts, getReadingFont, DEFAULT_FONT_ID } from '../theme/fonts';
import { type as tp, font as uiFontOf } from '../theme/type';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import type { ThemeMode } from '../context/AppSettingsContext';
import { exportVaultBackup } from '../utils/backup';
import { AI_DEFAULTS, checkConnection, getAiConfig, saveAiConfig } from '../smd/ai';

const MODES: { key: ThemeMode; label: string; sub: string }[] = [
  { key: 'light', label: 'iOS', sub: 'Светлый' },
  { key: 'dark', label: 'КРОВЬ', sub: 'Тёмный' },
  { key: 'auto', label: 'Система', sub: 'Как в телефоне' },
];

export default function SettingsScreen({ navigation }: any) {
  const { theme, isDark, mode, setMode } = useTheme();
  const app = useAppSettingsOpt();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);

  const fontSize = app?.fontSize ?? 16;
  const lineHeight = app?.lineHeight ?? 1.7;
  const contentWidth = app?.contentWidth ?? 720;
  const selectedFont = app?.font ?? DEFAULT_FONT_ID;
  const selectedTheme = app?.readingTheme ?? DEFAULT_READING_THEME;
  const selFace = getReadingFont(selectedFont);

  const step = (fn: () => void) => fn;
  const [backingUp, setBackingUp] = useState(false);

  const onBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const { files } = await exportVaultBackup();
      Alert.alert('Резервная копия готова', `Упаковано файлов: ${files}. Выберите, куда сохранить.`);
    } catch (e) {
      Alert.alert('Не удалось создать копию', String((e as Error)?.message ?? e));
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.headRow}>
        <Pressable onPress={() => navigation?.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={s.heading}>Настройки</Text>
      </View>

      {/* Тема приложения: два интерфейса */}
      <Text style={s.sectionTitle}>Интерфейс</Text>
      <View style={s.modeRow}>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[s.modeCard, { borderColor: active ? theme.text : theme.divider, backgroundColor: theme.surface }]}
            >
              <Text style={[s.modeLabel, { color: theme.text }]}>{m.label}</Text>
              <Text style={[s.modeSub, { color: theme.textSecondary }]}>{m.sub}</Text>
              {active && (
                <View style={[s.modeCheck, { backgroundColor: theme.text }]}>
                  <Ionicons name="checkmark" size={11} color={theme.onAccent} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={s.hint}>Сейчас: {isDark ? 'КРОВЬ' : 'iOS'}{mode === 'auto' ? ' · по системе' : ''}</Text>

      {/* Тема листа при чтении */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Лист при чтении</Text>
      <View style={s.themeGrid}>
        {readingThemes.map((rt) => {
          const active = selectedTheme === rt.id;
          return (
            <Pressable
              key={rt.id}
              onPress={() => app?.setReadingTheme(rt.id)}
              style={[
                s.themeCard,
                { backgroundColor: rt.bg, borderColor: active ? theme.text : rt.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
              ]}
            >
              <Text style={{ color: rt.text, fontSize: 19, fontFamily: selFace.family }}>Аа</Text>
              <View style={[s.themeRule, { backgroundColor: rt.muted }]} />
              <Text style={{ color: rt.muted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{rt.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Шрифт — каждый пункт набран своим шрифтом */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Шрифт чтения</Text>
      <View style={[s.card, { backgroundColor: theme.surface }]}>
        {readingFonts.map((f, i) => {
          const active = selectedFont === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => app?.setFont(f.id)}
              style={[s.fontRow, i < readingFonts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }]}
            >
              <Text style={[s.fontSample, { color: theme.text, fontFamily: f.family }]} numberOfLines={1}>Aa Бб</Text>
              <View style={s.fontInfo}>
                <Text style={[s.fontName, { color: theme.text }]}>{f.name}</Text>
                <Text style={[s.fontNote, { color: theme.textSecondary }]}>{f.note}</Text>
              </View>
              {active && <Ionicons name="checkmark" size={19} color={theme.text} />}
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
        <Text style={[s.preview, { color: theme.text, fontSize, lineHeight: fontSize * lineHeight, fontFamily: selectedFont.replace(/\s+/g, '') }]}>
          Пример текста для чтения — так будет выглядеть файл
        </Text>
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

      {/* Резервная копия */}
      <Pressable
        onPress={onBackup}
        disabled={backingUp}
        style={[s.backupBtn, { borderColor: theme.accent, opacity: backingUp ? 0.6 : 1 }]}
      >
        <Ionicons name="archive-outline" size={18} color={theme.accent} />
        <Text style={[s.backupText, { color: theme.accent }]}>
          {backingUp ? 'Упаковываю…' : 'Резервная копия'}
        </Text>
      </Pressable>
      <Text style={s.hint}>Вся папка хранилища — в один zip через диалог «Поделиться»</Text>

      {/* Помощник (ИИ) под задачами */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Помощник (ИИ)</Text>
      <AiSettings theme={theme} s={s} />

      {/* Сброс */}
      <Pressable
        onPress={() => Alert.alert('Сбросить настройки?', 'Вернуть все значения по умолчанию', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сбросить', style: 'destructive', onPress: () => app?.resetAll() },
        ])}
        style={[s.resetBtn, { borderColor: theme.border }]}
      >
        <Ionicons name="refresh-outline" size={18} color={theme.red} />
        <Text style={s.resetText}>Сбросить всё</Text>
      </Pressable>

      <View style={s.about}>
        <Text style={s.sectionTitle}>О приложении</Text>
        <Text style={[s.aboutText, { color: theme.text }]}>Supreader · v2</Text>
        <Text style={[s.aboutSub, { color: theme.textSecondary }]}>Читалка и хранитель текстовых знаний</Text>
      </View>
    </ScrollView>
  );
}

function AiSettings({ theme, s }: { theme: any; s: any }) {
  const [base, setBase] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    getAiConfig().then((c) => {
      setBase(c.base);
      setKey(c.key);
      setModel(c.model);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = () => {
    saveAiConfig({ base: base || AI_DEFAULTS.base, key, model: model || AI_DEFAULTS.model }).catch(() => {});
    setStatus('Сохранено');
  };
  const check = async () => {
    if (checking) return;
    setChecking(true);
    setStatus(null);
    try {
      await saveAiConfig({ base: base || AI_DEFAULTS.base, key, model: model || AI_DEFAULTS.model });
      setStatus(await checkConnection());
    } catch (e: any) {
      setStatus(`Ошибка: ${e?.message ?? e}`);
    } finally {
      setChecking(false);
    }
  };
  return (
    <View>
      <Text style={[s.hint, { marginTop: 0, marginBottom: 6 }]}>Сервер</Text>
      <TextInput
        style={[s.aiInput, { borderColor: theme.border, color: theme.text }]}
        value={base}
        onChangeText={setBase}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={AI_DEFAULTS.base}
        placeholderTextColor={theme.textSecondary}
      />
      <Text style={[s.hint, { marginTop: 10, marginBottom: 6 }]}>API-ключ</Text>
      <TextInput
        style={[s.aiInput, { borderColor: theme.border, color: theme.text }]}
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Вставь ключ"
        placeholderTextColor={theme.textSecondary}
      />
      <Text style={[s.hint, { marginTop: 10, marginBottom: 6 }]}>Модель</Text>
      <TextInput
        style={[s.aiInput, { borderColor: theme.border, color: theme.text }]}
        value={model}
        onChangeText={setModel}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={AI_DEFAULTS.model}
        placeholderTextColor={theme.textSecondary}
      />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable onPress={save} style={[s.backupBtn, { flex: 1, borderColor: theme.border }]}>
          <Text style={[s.backupText, { color: theme.text }]}>Сохранить</Text>
        </Pressable>
        <Pressable
          onPress={check}
          disabled={checking}
          style={[s.backupBtn, { flex: 1, borderColor: theme.accent, opacity: checking ? 0.6 : 1 }]}
        >
          <Text style={[s.backupText, { color: theme.accent }]}>{checking ? 'Проверяю…' : 'Проверить связь'}</Text>
        </Pressable>
      </View>
      {status ? <Text style={[s.hint, { marginTop: 8 }]}>{status}</Text> : null}
    </View>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 80 },
    headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 22, marginLeft: -8 },
    backBtn: { padding: 8 },
    heading: { ...tp.largeTitle, color: theme.text, letterSpacing: -0.6 },
    sectionTitle: { ...tp.footnote, fontFamily: uiFontOf(500), color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
    hint: { ...tp.caption, color: theme.textSecondary, marginTop: 8 },
    modeRow: { flexDirection: 'row', gap: 10 },
    modeCard: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
    modeLabel: { ...tp.headline },
    modeSub: { ...tp.caption },
    modeCheck: {
      position: 'absolute', top: 8, right: 8, width: 17, height: 17, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
    },
    themeGrid: { flexDirection: 'row', gap: 8 },
    themeCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 9, minHeight: 82, justifyContent: 'center' },
    themeRule: { height: 1.5, borderRadius: 1, marginTop: 5, opacity: 0.5 },
    card: { borderRadius: 14, overflow: 'hidden', paddingHorizontal: 14 },
    fontRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    fontSample: { fontSize: 17, width: 54 },
    fontInfo: { flex: 1 },
    fontName: { ...tp.callout, fontFamily: uiFontOf(500) },
    fontNote: { ...tp.caption, marginTop: 1 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: 14, padding: 14 },
    stepBtn: { borderWidth: 1, borderRadius: 10, padding: 8 },
    stepVal: { flex: 1, textAlign: 'center', ...tp.headline },
    preview: { flex: 1, textAlign: 'center' },
    resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 28 },
    resetText: { ...tp.callout, fontFamily: uiFontOf(500), color: theme.red },
    backupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, marginTop: 28 },
    backupText: { fontSize: 15, fontWeight: '600' },
    aiInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    about: { marginTop: 32 },
    aboutText: { fontSize: 15 },
    aboutSub: { fontSize: 13, marginTop: 4 },
  });
}
