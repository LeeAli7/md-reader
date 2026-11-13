// Видео в .smd: :::video{src="video/opyt.mp4" caption="Опыт"}:::
// Источник может быть ссылкой, файлом рядом с документом ИЛИ data:-URI
// (видео, вложенное прямо в .smd). Android-плеер не умеет data:, поэтому
// такое видео один раз выгружаем в кэш и играем как обычный файл.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { resolveAsset } from './media';

const MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 97) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36) + s.length.toString(36);
}

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
  const source = useMemo(() => resolveAsset(src, docKey), [src, docKey]);
  const posterUri = useMemo(() => (poster ? resolveAsset(poster, docKey) : undefined), [poster, docKey]);
  const ref = useRef<Video>(null);
  const [uri, setUri] = useState<string | undefined>(
    source.startsWith('data:') ? undefined : source,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!source.startsWith('data:')) {
      setUri(source);
      return;
    }
    const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(source);
    if (!m || !m[2]) {
      setFailed(true);
      return;
    }
    const ext = MIME_EXT[(m[1] || 'video/mp4').toLowerCase()] || 'mp4';
    const dir = (FileSystem.cacheDirectory ?? '') + 'smd-media/';
    const path = `${dir}${hash(source)}.${ext}`;
    let alive = true;
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          await FileSystem.writeAsStringAsync(path, m[3], {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        if (alive) setUri(path);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [source]);

  return (
    <View style={{ marginVertical: 10 }}>
      <View style={[s.frame, { borderColor: color + '14', backgroundColor: '#000' }]}>
        {failed ? (
          <View style={s.fail}>
            <Ionicons name="videocam-off-outline" size={20} color={muted} />
            <Text style={[s.failText, { color: muted }]} numberOfLines={2}>
              Видео не открылось: {src.startsWith('data:') ? 'встроенное видео' : src}
            </Text>
          </View>
        ) : uri ? (
          <Video
            ref={ref}
            source={{ uri }}
            posterSource={posterUri ? { uri: posterUri } : undefined}
            usePoster={!!posterUri}
            posterStyle={{ resizeMode: 'cover' }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            style={s.video}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[s.video, s.loading]}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={s.loadingText}>готовим видео…</Text>
          </View>
        )}
      </View>
      {caption ? <Text style={[s.cap, { color: muted }]}>{caption}</Text> : null}
      {uri && !failed ? (
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
  loading: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5 },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, minHeight: 88 },
  failText: { flex: 1, fontSize: 12.5 },
  cap: { fontSize: 12.5, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  fullBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, minHeight: 32, marginTop: 2 },
  fullText: { fontSize: 11.5 },
});
