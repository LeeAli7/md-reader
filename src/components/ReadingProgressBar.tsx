import React from 'react';
import { View } from 'react-native';

// Тонкая полоса прогресса чтения поверх Reader.
export function ReadingProgressBar({ progress, color }: { progress: number; color: string }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height: 3, backgroundColor: 'transparent' }}>
      <View style={{ height: 3, width: `${p * 100}%`, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}
