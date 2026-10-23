// Каркас экранов настроек: крупный заголовок уезжает, шапка плавно
// набирает непрозрачность и в ней проявляется компактный заголовок.
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { type as tp, font as uiFontOf } from '../../theme/type';

interface Props {
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
}

export function SettingsScaffold({ title, onBack, children }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;

  const bgOpacity = y.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
  const largeOpacity = y.interpolate({ inputRange: [0, 26], outputRange: [1, 0], extrapolate: 'clamp' });
  const largeShift = y.interpolate({ inputRange: [0, 60], outputRange: [0, -8], extrapolate: 'clamp' });
  const lineOpacity = y.interpolate({ inputRange: [30, 60], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={[st.root, { backgroundColor: theme.bg }]}>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 52,
          paddingBottom: insets.bottom + 48,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.Text
          style={[st.large, { color: theme.text, opacity: largeOpacity, transform: [{ translateY: largeShift }] }]}
        >
          {title}
        </Animated.Text>
        {children}
      </Animated.ScrollView>

      {/* Липкая шапка: сначала прозрачная, при скролле плавно заливается фоном */}
      <View pointerEvents="box-none" style={st.header}>
        <Animated.View style={[st.headerBg, { backgroundColor: theme.bg, opacity: bgOpacity }]} />
        <Animated.View style={[st.headerLine, { backgroundColor: theme.divider, opacity: lineOpacity }]} />
        <View style={[st.headerRow, { paddingTop: insets.top, height: insets.top + 48 }]}>
          <Pressable onPress={onBack} hitSlop={10} style={st.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.accent} />
          </Pressable>
          <Animated.Text style={[st.compact, { color: theme.text, opacity: bgOpacity }]} numberOfLines={1}>
            {title}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

/** Сгруппированная карточка как в iOS Настройках. */
export function Group({ children, title, footer }: { children: React.ReactNode; title?: string; footer?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: 22 }}>
      {title ? <Text style={[st.groupTitle, { color: theme.textSecondary }]}>{title}</Text> : null}
      <View style={[st.group, { backgroundColor: theme.surface }]}>{children}</View>
      {footer ? <Text style={[st.footer, { color: theme.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  label,
  value,
  icon,
  onPress,
  right,
  danger,
  last,
}: {
  label: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  const { theme } = useTheme();
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={19} color={danger ? theme.red : theme.text} style={{ marginRight: 2 }} /> : null}
      <Text style={[st.rowLabel, { color: danger ? theme.red : theme.text }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={[st.rowValue, { color: theme.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} style={{ marginLeft: 4 }} /> : null}
    </>
  );
  if (!onPress) {
    return <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider },
        pressed && { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
      ]}
    >
      {content}
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  large: { ...tp.largeTitle, letterSpacing: -0.7, marginBottom: 4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerBg: { ...StyleSheet.absoluteFillObject },
  headerLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  backBtn: { padding: 8 },
  compact: { flex: 1, textAlign: 'center', ...tp.headline, fontFamily: uiFontOf(600), marginRight: 42 },
  groupTitle: { ...tp.footnote, fontFamily: uiFontOf(500), paddingLeft: 4, marginBottom: 6 },
  group: { borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16 },
  footer: { ...tp.caption, paddingHorizontal: 4, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 12 },
  rowLabel: { flex: 1, ...tp.body },
  rowValue: { ...tp.body, maxWidth: '55%' },
});
