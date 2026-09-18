// Supreader — engine: offline PDF viewer (WebView + inlined pdf.js).
// Contract: PdfView({uri}) reads the file itself and renders pages with scroll.
// No network at runtime — viewer HTML (pdf.js 3.11.174) is baked into pdfViewerHtml.ts.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../hooks/useTheme';
import { buildPdfHtml } from './pdfViewerHtml';

const MAX_PDF_BYTES = 30 * 1024 * 1024;

export default function PdfView({ uri }: { uri: string }) {
  const { theme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info: any = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory) throw new Error('missing');
        if (typeof info.size === 'number' && info.size > MAX_PDF_BYTES) throw new Error('too-big');
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const page = buildPdfHtml(b64);
        if (alive) setHtml(page);
      } catch (e: any) {
        if (!alive) return;
        const msg = String((e && e.message) || e || '');
        setError(
          msg === 'too-big'
            ? 'PDF больше 30 МБ — откройте через «Поделиться» / «Открыть через…».'
            : 'Не удалось открыть PDF.',
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri]);

  if (error) {
    return (
      <View style={[s.center, { backgroundColor: theme.bg }]}>
        <Text style={[s.err, { color: theme.textSecondary }]}>{error}</Text>
      </View>
    );
  }
  if (!html) {
    return (
      <View style={[s.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[s.hint, { color: theme.textSecondary }]}>Открываю PDF…</Text>
      </View>
    );
  }
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      style={{ flex: 1, backgroundColor: '#3a3f44' }}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  hint: { fontSize: 14 },
  err: { fontSize: 15, textAlign: 'center' },
});
