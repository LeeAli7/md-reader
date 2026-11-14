import React from 'react';
import { View, Animated } from 'react-native';

// Тонкая полоса прогресса чтения поверх Reader.
export function ReadingProgressBar(
  { progress, animated, color }: { progress?: number; animated?: Animated.Value; color: string },
) {
  if (animated) {
    const width = animated.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <View style={{ height: 3, backgroundColor: 'transparent' }}>
        <Animated.View style={{ height: 3, width, backgroundColor: color, borderRadius: 2 }} />
      </View>
    );
  }
  const p = Math.max(0, Math.min(1, progress ?? 0));
  return (
    <View style={{ height: 3, backgroundColor: 'transparent' }}>
      <View style={{ height: 3, width: `${p * 100}%`, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}
