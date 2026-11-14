import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useTheme } from '../hooks/useTheme';
import { font as uiFontOf } from '../theme/type';

// Обновление прямо из приложения: GitHub Releases — единственный источник,
// поэтому никакого сервера и пушей не надо. Проверяем один раз за запуск.
const REPO = 'LeeAli7/md-reader';
const SKIP_KEY = 'supreader.update.skip';

type Release = { version: string; url: string; notes?: string; published?: string };

function parseVer(v: string): number[] {
  return v.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
}

function isNewer(remote: string, local: string): boolean {
  const a = parseVer(remote);
  const b = parseVer(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchLatest(): Promise<Release | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const list = (await res.json()) as any[];
    for (const r of list) {
      const apk = (r.assets ?? []).find((a: any) => typeof a.name === 'string' && a.name.endsWith('.apk'));
      if (r.tag_name && apk) {
        return { version: String(r.tag_name), url: apk.browser_download_url, notes: r.body, published: r.published_at };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function UpdatePrompt() {
  const { theme } = useTheme();
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const local = Constants.expoConfig?.version ?? '0.0.0';
      const skip = await AsyncStorage.getItem(SKIP_KEY).catch(() => null);
      const latest = await fetchLatest();
      if (!alive || !latest) return;
      if (!isNewer(latest.version, local)) return;
      if (skip && !isNewer(latest.version, skip)) return;
      setRelease(latest);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!release) return null;
  const ver = release.version.replace(/^v/i, '');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setRelease(null)}>
      <View style={s.backdrop}>
        <View style={[s.card, { backgroundColor: theme.surface }]}>
          <Text style={[s.title, { color: theme.text }]}>Версия {ver}</Text>
          <Text style={[s.body, { color: theme.textSecondary }]}>
            Вышло обновление читалки. Файлы и настройки сохранятся — APK ставится поверх.
          </Text>
          <Pressable
            onPress={() => {
              Linking.openURL(release.url).catch(() => {});
              setRelease(null);
            }}
            style={[s.primary, { backgroundColor: theme.accent }]}
          >
            <Text style={s.primaryText}>Скачать обновление</Text>
          </Pressable>
          <Pressable onPress={() => setRelease(null)} style={s.secondary}>
            <Text style={[s.secondaryText, { color: theme.text }]}>Позже</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              AsyncStorage.setItem(SKIP_KEY, release.version).catch(() => {});
              setRelease(null);
            }}
            hitSlop={8}
          >
            <Text style={[s.skip, { color: theme.textTertiary }]}>Не напоминать об этой версии</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { width: '100%', borderRadius: 20, padding: 22 },
  title: { fontSize: 20, fontFamily: uiFontOf(600), marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 21, fontFamily: uiFontOf(400), marginBottom: 18 },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: uiFontOf(600) },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontFamily: uiFontOf(500) },
  skip: { textAlign: 'center', fontSize: 12.5, fontFamily: uiFontOf(400), marginTop: 2 },
});
