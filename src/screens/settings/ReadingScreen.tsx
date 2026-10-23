import React from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAppSettingsOpt } from '../../context/AppSettingsContext';
import { readingThemes, getReadingTheme } from '../../theme/tokens';
import { readingFonts, getReadingFont, DEFAULT_FONT_ID } from '../../theme/fonts';
import { type as tp, font as uiFontOf } from '../../theme/type';
import { Group, SettingsScaffold } from './Scaffold';

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  theme,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  theme: any;
}) {
  return (
    <View style={st.stepRow}>
      <Text style={[st.stepLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[st.stepValue, { color: theme.textSecondary }]}>{value}</Text>
      <View style={st.stepBtns}>
        <Pressable onPress={onMinus} hitSlop={6} style={[st.stepBtn, { backgroundColor: theme.fill }]}>
          <Ionicons name="remove" size={17} color={theme.text} />
        </Pressable>
        <Pressable onPress={onPlus} hitSlop={6} style={[st.stepBtn, { backgroundColor: theme.fill }]}>
          <Ionicons name="add" size={17} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ReadingScreen({ navigation }: any) {
  const { theme, isDark } = useTheme();
  const app = useAppSettingsOpt();

  const fontSize = app?.fontSize ?? 16;
  const lineHeight = app?.lineHeight ?? 1.7;
  const contentWidth = app?.contentWidth ?? 720;
  const fontId = app?.font ?? DEFAULT_FONT_ID;
  const themeId = app?.readingTheme ?? 'auto';
  const face = getReadingFont(fontId);
  const scheme = useColorScheme();
  // «Системная» живёт первой карточкой: лист следует теме телефона.
  const autoSheet = getReadingTheme(scheme === 'dark' ? 'blood' : 'light');
  const options = [{ ...autoSheet, id: 'auto', name: 'Системная' }, ...readingThemes];
  const resolved = getReadingTheme(themeId === 'auto' ? (scheme === 'dark' ? 'blood' : 'light') : themeId);

  return (
    <SettingsScaffold title="Чтение" onBack={() => navigation.goBack()}>
      <Text style={[st.lead, { color: theme.textSecondary }]}>Как выглядит книга, когда вы её открываете.</Text>

      {/* Живой пример: сразу видно и шрифт, и интервал, и ширину */}
      <View style={[st.previewCard, { backgroundColor: resolved.bg, borderColor: resolved.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]}>
        <Text style={[st.previewText, { color: resolved.text, fontSize, lineHeight: fontSize * lineHeight, fontFamily: face.family }]}>
          Тишина в библиотеке держится не на запретах, а на уважении к чужому вниманию.
        </Text>
      </View>

      <Group title="Лист">
        <View style={st.themeGrid}>
          {options.map((rt) => {
            const active = themeId === rt.id;
            return (
              <Pressable
                key={rt.id}
                onPress={() => app?.setReadingTheme(rt.id)}
                style={[
                  st.themeCard,
                  { backgroundColor: rt.bg, borderColor: active ? theme.accent : rt.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                ]}
              >
                <Text style={{ color: rt.text, fontSize: 20, fontFamily: face.family }}>Аа</Text>
                <View style={[st.themeRule, { backgroundColor: rt.muted }]} />
                <Text style={{ color: rt.muted, fontSize: 10, marginTop: 4 }} numberOfLines={1}>{rt.name}</Text>
                {active && (
                  <View style={[st.themeCheck, { backgroundColor: rt.text }]}>
                    <Ionicons name="checkmark" size={10} color={rt.bg} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Group>

      <Group title="Шрифт" footer="Каждый пункт набран своим шрифтом — видно до выбора.">
        {readingFonts.map((f, i) => {
          const active = fontId === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => app?.setFont(f.id)}
              style={[st.fontRow, i < readingFonts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }]}
            >
              <Text style={[st.fontSample, { color: theme.text, fontFamily: f.family }]} numberOfLines={1}>Aa Бб</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.fontName, { color: theme.text }]}>{f.name}</Text>
                <Text style={[st.fontNote, { color: theme.textSecondary }]} numberOfLines={1}>{f.note}</Text>
              </View>
              {active && <Ionicons name="checkmark" size={19} color={theme.accent} />}
            </Pressable>
          );
        })}
      </Group>

      <Group title="Размер и строки">
        <Stepper
          label="Размер шрифта"
          value={`${fontSize} px`}
          theme={theme}
          onMinus={() => app?.setFontSize(Math.max(12, fontSize - 1))}
          onPlus={() => app?.setFontSize(Math.min(28, fontSize + 1))}
        />
        <View style={[st.sep, { backgroundColor: theme.divider }]} />
        <Stepper
          label="Межстрочный"
          value={lineHeight.toFixed(1)}
          theme={theme}
          onMinus={() => app?.setLineHeight(Math.max(1.2, +(lineHeight - 0.1).toFixed(1)))}
          onPlus={() => app?.setLineHeight(Math.min(2.5, +(lineHeight + 0.1).toFixed(1)))}
        />
        <View style={[st.sep, { backgroundColor: theme.divider }]} />
        <Stepper
          label="Ширина текста"
          value={`${contentWidth} px`}
          theme={theme}
          onMinus={() => app?.setContentWidth(Math.max(480, contentWidth - 40))}
          onPlus={() => app?.setContentWidth(Math.min(1000, contentWidth + 40))}
        />
      </Group>
    </SettingsScaffold>
  );
}

const st = StyleSheet.create({
  lead: { ...tp.footnote, marginBottom: 14 },
  previewCard: { borderRadius: 20, padding: 20, marginTop: 4 },
  previewText: {},
  themeGrid: { flexDirection: 'row', gap: 8, paddingVertical: 14 },
  themeCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 10, minHeight: 84, justifyContent: 'center' },
  themeRule: { height: 2, borderRadius: 1, marginTop: 6, opacity: 0.5 },
  themeCheck: { position: 'absolute', top: 6, right: 6, width: 15, height: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fontRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  fontSample: { fontSize: 17, width: 56 },
  fontName: { ...tp.callout, fontFamily: uiFontOf(500) },
  fontNote: { ...tp.caption, marginTop: 1 },
  stepRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 6 },
  stepLabel: { flex: 1, ...tp.body },
  stepValue: { ...tp.body },
  stepBtns: { flexDirection: 'row', gap: 6, marginLeft: 10 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth },
});
