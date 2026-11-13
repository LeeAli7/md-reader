// Видео в .smd: :::video{src="video/opyt.mp4" caption="Опыт"}:::
// Нативный плеер (expo-av): пауза/звук/полный экран без WebView-костылей.
// Файл рядом с документом или ссылка https — оба случая работают офлайн-первым.

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { resolveAsset } from './media';

export const SmdVideo = React.memo(function SmdVideo({
  src,
  poster,
  caption,
  docKey,
  color,
  muted,
}: {
  src: string;
  poster?: string;
  caption?: string;
  docKey?: string;
  color: string;
  muted: string;
}) {
  const uri = useMemo(() => resolveAsset(src, docKey), [src, docKey]);
  const posterUri = useMemo(() => (poster ? resolveAsset(poster, docKey) : undefined), [poster, docKey]);
  const ref = useRef<Video>(null);
  const [failed, setFailed] = useState(false);

  return (
    <View style={{ marginVertical: 10 }}>
      <View style={[s.frame, { borderColor: color + '14', backgroundColor: '#000' }]}>
        {failed ? (
          <View style={s.fail}>
            <Ionicons name="videocam-off-outline" size={20} color={muted} />
            <Text style={[s.failText, { color: muted }]} numberOfLines={2}>
              Видео не найдено: {src}
            </Text>
          </View>
        ) : (
          <Video
            ref={ref}
            source={{ uri }}
            posterSource={posterUri ? { uri: posterUri } : undefined}
            usePoster={!!posterUri}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            style={s.video}
            onError={() => setFailed(true)}
          />
        )}
      </View>
      {caption ? <Text style={[s.cap, { color: muted }]}>{caption}</Text> : null}
      {!failed ? (
        <Pressable
          onPress={() => ref.current?.presentFullscreenPlayer()}
          style={s.fullBtn}
          hitSlop={8}
        >
          <Ionicons name="expand-outline" size={13} color={muted} />
          <Text style={[s.fullText, { color: muted }]}>На весь экран</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  frame: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, minHeight: 88 },
  failText: { flex: 1, fontSize: 12.5 },
  cap: { fontSize: 12.5, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  fullBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, minHeight: 32, marginTop: 2 },
  fullText: { fontSize: 11.5 },
});
