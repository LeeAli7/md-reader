import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, BackHandler, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { font } from '../theme/type';

export type DrawerRow = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
};

export type DrawerSection = { title?: string; rows: DrawerRow[] };

// Своя боковая панель: без reanimated и без нативных зависимостей.
// Modal + Animated (native driver) — предсказуемо на любом Android,
// и не тянет второй навигатор поверх стека.
export function AppDrawer({
  visible, onClose, sections, header, footer,
}: {
  visible: boolean;
  onClose: () => void;
  sections: DrawerSection[];
  header: { title: string; subtitle?: string };
  footer?: string;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const width = Math.min(Math.round(win.width * 0.86), 320);
  const slide = useRef(new Animated.Value(-width)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -width, duration: 180, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible]);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [mounted, close]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={s.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} onPress={close} />
        </Animated.View>
        <Animated.View
          style={[
            s.panel,
            {
              width,
              backgroundColor: theme.bg,
              borderRightColor: theme.divider,
              paddingTop: insets.top + 18,
              paddingBottom: insets.bottom + 14,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{header.title}</Text>
            {header.subtitle ? (
              <Text style={[s.subtitle, { color: theme.textSecondary }]}>{header.subtitle}</Text>
            ) : null}
          </View>

          {sections.map((sec, i) => (
            <View key={sec.title ?? i} style={s.section}>
              {sec.title ? (
                <Text style={[s.sectionTitle, { color: theme.textTertiary }]}>{sec.title.toUpperCase()}</Text>
              ) : null}
              {sec.rows.map((row) => (
                <Pressable
                  key={row.label}
                  onPress={() => { close(); requestAnimationFrame(row.onPress); }}
                  style={({ pressed }) => [
                    s.row,
                    { backgroundColor: pressed ? theme.fill : 'transparent' },
                  ]}
                >
                  <Ionicons
                    name={row.icon}
                    size={20}
                    color={row.danger ? theme.red : row.active ? theme.accent : theme.textSecondary}
                  />
                  <Text
                    style={[
                      s.rowLabel,
                      { color: row.danger ? theme.red : row.active ? theme.accent : theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>
                  {row.hint ? (
                    <Text style={[s.hint, { color: theme.textTertiary }]}>{row.hint}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))}

          <View style={{ flex: 1 }} />
          {footer ? <Text style={[s.footer, { color: theme.textTertiary }]}>{footer}</Text> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  panel: {
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  head: { paddingHorizontal: 10, paddingBottom: 18 },
  title: { fontSize: 24, fontFamily: font(700), letterSpacing: -0.4 },
  subtitle: { fontSize: 13, fontFamily: font(400), marginTop: 3 },
  section: { paddingTop: 6, paddingBottom: 10 },
  sectionTitle: {
    fontSize: 11, fontFamily: font(600), letterSpacing: 0.7,
    paddingHorizontal: 10, paddingBottom: 6, paddingTop: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 46, borderRadius: 12, paddingHorizontal: 10,
  },
  rowLabel: { flex: 1, fontSize: 15.5, fontFamily: font(500) },
  hint: { fontSize: 12.5, fontFamily: font(400) },
  footer: { fontSize: 11.5, fontFamily: font(400), paddingHorizontal: 10, paddingTop: 6 },
});
