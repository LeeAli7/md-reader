// Скелетон загрузки: вместо пустого экрана «как будто зависло» —
// пульсирующие строки будущего текста.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

function usePulse() {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

export function SkeletonBar({ width, height = 14, radius = 7, color, style }: { width: number | `${number}%`; height?: number; radius?: number; color: string; style?: any }) {
  const opacity = usePulse();
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: color, opacity }, style]} />;
}

/** Экран ожидания документа: заголовок + абзацы. */
export function DocSkeleton({ color, bg }: { color: string; bg: string }) {
  const opacity = usePulse();
  return (
    <View style={[st.wrap, { backgroundColor: bg }]} pointerEvents="none">
      <Animated.View style={{ opacity }}>
        <SkeletonBar width="72%" height={26} radius={8} color={color} style={{ marginBottom: 18 }} />
        {['100%', '94%', '97%', '88%', '96%', '64%'].map((w, i) => (
          <SkeletonBar key={i} width={w as any} height={13} radius={6} color={color} style={{ marginBottom: 10 }} />
        ))}
        <SkeletonBar width="40%" height={13} radius={6} color={color} style={{ marginTop: 18, marginBottom: 10 }} />
        {['99%', '92%', '78%'].map((w, i) => (
          <SkeletonBar key={'b' + i} width={w as any} height={13} radius={6} color={color} style={{ marginBottom: 10 }} />
        ))}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, paddingTop: 72 },
});
