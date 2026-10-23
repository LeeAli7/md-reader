import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAppSettingsOpt } from '../context/AppSettingsContext';
import { type as tp, font as uiFontOf } from '../theme/type';
import { exportVaultBackup } from '../utils/backup';
import { Group, Row, SettingsScaffold } from './settings/Scaffold';

export default function SettingsScreen({ navigation }: any) {
  const { theme, mode } = useTheme();
  const app = useAppSettingsOpt();
  const [backingUp, setBackingUp] = useState(false);

  const modeLabel = mode === 'light' ? 'Светлая' : mode === 'dark' ? 'Тёмная' : 'Как в системе';

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
    <SettingsScaffold title="Настройки" onBack={() => navigation.goBack()}>
      <Group title="Внешний вид">
        <Row label="Интерфейс" value={modeLabel} icon="contrast-outline" onPress={() => navigation.navigate('SettingsInterface')} />
        <Row label="Чтение" value="Шрифт и лист" icon="book-outline" onPress={() => navigation.navigate('SettingsReading')} last />
      </Group>

      <Group title="Помощник">
        <Row label="ИИ под задачами" icon="sparkles-outline" onPress={() => navigation.navigate('SettingsAi')} last />
      </Group>

      <Group title="Данные" footer="Копия собирает всю папку хранилища в один zip и открывает системное «Поделиться».">
        <Row
          label={backingUp ? 'Упаковываю…' : 'Резервная копия'}
          icon="archive-outline"
          onPress={onBackup}
          last
        />
      </Group>

      <Group title="Служебное">
        <Row
          label="Сбросить всё"
          icon="refresh-outline"
          danger
          onPress={() =>
            Alert.alert('Сбросить настройки?', 'Вернуть все значения по умолчанию', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Сбросить', style: 'destructive', onPress: () => app?.resetAll() },
            ])
          }
          last
        />
      </Group>

      <View style={st.about}>
        <Text style={[st.version, { color: theme.text }]}>Supreader</Text>
        <Text style={[st.aboutSub, { color: theme.textSecondary }]}>Читалка и хранитель текстовых знаний</Text>
      </View>
    </SettingsScaffold>
  );
}

const st = StyleSheet.create({
  about: { marginTop: 34, alignItems: 'center' },
  version: { ...tp.headline, fontFamily: uiFontOf(600) },
  aboutSub: { ...tp.footnote, marginTop: 3, textAlign: 'center' },
});
