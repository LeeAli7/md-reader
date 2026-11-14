// Картинка в .smd: фото, готовый график, скан.
// Тянется по ширине текста (высота из пропорций, максимум 460), тап —
// полноэкранный просмотр. Если файла нет — честная плашка с путём,
// а не пустое место.

import React, { useMemo, useState } from 'react';
import {
  View, Text, Image, Pressable, Modal, StyleSheet, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveAsset } from './media';

export const SmdImage = React.memo(function SmdImage({
  src,
  alt,
  caption,
  docKey,
  color,
  muted,
  knownRatio,
}: {
  src: string;
  alt?: string;
  caption?: string;
  docKey?: string;
  color: string;
  muted: string;
  knownRatio?: number;
}) {
  const uri = useMemo(() => resolveAsset(src, docKey), [src, docKey]);
  const win = useWindowDimensions();
  const maxW = Math.max(200, Math.min(win.width - 60, win.height * 0.9));
  const [ratio, setRatio] = useState(knownRatio ?? 0);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const w = win.width - 60;
  const h = ratio > 0 ? Math.min(460, w / ratio) : 180;

  return (
    <View style={{ marginVertical: 10 }}>
      <Pressable
        onPress={() => !failed && setOpen(true)}
        style={[s.frame, { borderColor: color + '14', backgroundColor: color + '06' }]}
      >
        {failed ? (
          <View style={s.fail}>
            <Ionicons name="image-outline" size={20} color={muted} />
            <Text style={[s.failText, { color: muted }]} numberOfLines={2}>
              Файл не найден: {src}
            </Text>
          </View>
        ) : (
          <View style={{ height: h, justifyContent: 'center' }}>
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
              onLoad={(e) => {
                const { width: iw, height: ih } = e.nativeEvent.source;
                if (iw > 0 && ih > 0) setRatio(iw / ih);
              }}
              onError={() => setFailed(true)}
              accessibilityLabel={alt || caption || 'рисунок'}
            />
            {ratio === 0 ? (
              <ActivityIndicator style={StyleSheet.absoluteFill} color={muted} />
            ) : null}
          </View>
        )}
      </Pressable>
      {caption ? (
        <Text style={[s.cap, { color: muted }]}>{caption}</Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.modal}>
          <Pressable style={s.modalClose} onPress={() => setOpen(false)} hitSlop={12}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <Image
            source={{ uri }}
            style={{ width: maxW, height: win.height * 0.8 }}
            resizeMode="contain"
          />
          {caption ? <Text style={s.modalCap}>{caption}</Text> : null}
        </View>
      </Modal>
    </View>
  );
});

const s = StyleSheet.create({
  frame: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  failText: { flex: 1, fontSize: 12.5 },
  cap: { fontSize: 12.5, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  modalClose: { position: 'absolute', top: 48, right: 20, padding: 8 },
  modalCap: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, marginTop: 14, paddingHorizontal: 24, textAlign: 'center' },
});
