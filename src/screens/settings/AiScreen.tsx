import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { type as tp, font as uiFontOf } from '../../theme/type';
import { AI_DEFAULTS, checkConnection, getAiConfig, saveAiConfig } from '../../smd/ai';
import { Group, SettingsScaffold } from './Scaffold';

export default function AiScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [base, setBase] = useState('');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    getAiConfig().then((c) => {
      setBase(c.base);
      setKey(c.key);
      setModel(c.model);
    }).catch(() => {});
  }, []);

  const save = async () => {
    await saveAiConfig({ base: base || AI_DEFAULTS.base, key, model: model || AI_DEFAULTS.model });
    setSaved(true);
    setStatus('Сохранено');
    setTimeout(() => setSaved(false), 1400);
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
    <SettingsScaffold title="Помощник" onBack={() => navigation.goBack()}>
      <Text style={[st.lead, { color: theme.textSecondary }]}>
        Модель отвечает на вопросы под задачами в .smd. Ключ хранится только на телефоне.
      </Text>

      <Group
        title="Подключение"
        footer="Подойдёт любой OpenAI-совместимый сервис: свой ключ, адрес API и имя модели. Адрес — база, без /chat/completions: например https://api.openai.com/v1 или https://api.deepseek.com/v1."
      >
        <Text style={[st.fieldLabel, { color: theme.textSecondary }]}>Сервер</Text>
        <TextInput
          style={[st.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.divider }]}
          value={base}
          onChangeText={setBase}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={AI_DEFAULTS.base}
          placeholderTextColor={theme.textSecondary}
        />
        <Text style={[st.fieldLabel, { color: theme.textSecondary }]}>API-ключ</Text>
        <View style={[st.keyRow, { borderColor: theme.divider, backgroundColor: theme.bg }]}>
          <TextInput
            style={[st.keyInput, { color: theme.text }]}
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showKey}
            placeholder="Вставь ключ"
            placeholderTextColor={theme.textSecondary}
          />
          <Pressable onPress={() => setShowKey((v) => !v)} hitSlop={10} style={st.eye}>
            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <Text style={[st.hint, { color: theme.textTertiary }]}>Ключ остаётся на телефоне и уходит только на указанный сервер.</Text>
        <Text style={[st.fieldLabel, { color: theme.textSecondary }]}>Модель</Text>
        <TextInput
          style={[st.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.divider, marginBottom: 14 }]}
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={AI_DEFAULTS.model}
          placeholderTextColor={theme.textSecondary}
        />
      </Group>

      <View style={st.actions}>
        <Pressable onPress={save} style={[st.primary, { backgroundColor: theme.accent }]}>
          <Text style={[st.primaryText, { color: theme.isDark ? '#000' : '#FFF' }]}>
            {saved ? 'Сохранено' : 'Сохранить'}
          </Text>
        </Pressable>
        <Pressable onPress={check} disabled={checking} style={[st.secondary, { opacity: checking ? 0.55 : 1 }]}>
          <Ionicons name="pulse-outline" size={17} color={theme.accent} />
          <Text style={[st.secondaryText, { color: theme.accent }]}>{checking ? 'Проверяю…' : 'Проверить связь'}</Text>
        </Pressable>
      </View>

      {status ? (
        <Text style={[st.status, { color: theme.textSecondary }]} selectable>{status}</Text>
      ) : null}
    </SettingsScaffold>
  );
}

const st = StyleSheet.create({
  lead: { ...tp.footnote, marginBottom: 6 },
  fieldLabel: { ...tp.caption, fontFamily: uiFontOf(500), textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  primary: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...tp.callout, fontFamily: uiFontOf(600) },
  secondary: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  secondaryText: { ...tp.callout, fontFamily: uiFontOf(500) },
  status: { ...tp.footnote, marginTop: 14, lineHeight: 19 },
  keyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingLeft: 12 },
  keyInput: { flex: 1, fontSize: 15, paddingVertical: 11 },
  eye: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hint: { ...tp.caption, marginTop: 6, lineHeight: 16 },
});
