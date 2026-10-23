import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAppSettingsOpt } from '../../context/AppSettingsContext';
import type { ThemeMode } from '../../context/AppSettingsContext';
import { type as tp } from '../../theme/type';
import { Group, Row, SettingsScaffold } from './Scaffold';

const MODES: { key: ThemeMode; label: string; sub: string }[] = [
  { key: 'light', label: 'Светлая', sub: 'Чистый iOS, белый лист' },
  { key: 'dark', label: 'Тёмная', sub: 'Чёрный лист, белый текст' },
  { key: 'auto', label: 'Как в системе', sub: 'Переключается вместе с телефоном' },
];

export default function InterfaceScreen({ navigation }: any) {
  const { theme, mode, setMode, isDark } = useTheme();

  return (
    <SettingsScaffold title="Интерфейс" onBack={() => navigation.goBack()}>
      <Text style={[st.lead, { color: theme.textSecondary }]}>
        Сейчас: {isDark ? 'тёмная' : 'светлая'}{mode === 'auto' ? ' · по системе' : ''}
      </Text>

      <Group
        title="Оформление"
        footer="Интерфейс и лист при чтении — разные настройки: книгу можно читать на сепии, пока приложение светлое."
      >
        {MODES.map((m, i) => {
          const active = mode === m.key;
          return (
            <Row
              key={m.key}
              label={m.label}
              value={active ? undefined : m.sub}
              last={i === MODES.length - 1}
              onPress={() => setMode(m.key)}
              right={active ? <Ionicons name="checkmark" size={19} color={theme.accent} /> : undefined}
            />
          );
        })}
      </Group>

      <Group title="Лист при чтении">
        <Row label="Тема, шрифт, размер" value="Открыть" onPress={() => navigation.navigate('SettingsReading')} last />
      </Group>
    </SettingsScaffold>
  );
}

const st = StyleSheet.create({
  lead: { ...tp.footnote, marginBottom: 4, marginTop: 2 },
});
