import React from 'react';
import { View, Text, Pressable, StyleSheet, Switch, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(theme, insets);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.heading}>Настройки</Text>

      {/* Theme toggle */}
      <View style={s.row}>
        <View style={s.rowLeft}>
          <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={theme.accent} />
          <Text style={s.rowLabel}>Тёмная тема</Text>
        </View>
        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          trackColor={{ false: theme.border, true: theme.accent + '60' }}
          thumbColor={isDark ? theme.accent : '#FFF'}
        />
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>О приложении</Text>
        <Text style={s.about}>MD Reader v1.0</Text>
        <Text style={s.aboutSub}>Минималистичный ридер Markdown</Text>
      </View>
    </ScrollView>
  );
}

function styles(theme: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 20, paddingTop: insets.top + 20, paddingBottom: 100 },
    heading: { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 24 },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowLabel: { fontSize: 15, color: theme.text },
    section: { marginTop: 32 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    about: { fontSize: 15, color: theme.text },
    aboutSub: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
  });
}
