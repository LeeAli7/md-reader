// Схема в .smd: инлайновый SVG прямо в теле блока, без файлов и без сети.
// Рисуем в WebView фиксированной высоты (пропорции из viewBox), поэтому
// картинка тянется по ширине отступа и не ломает скролл: тачи уходят в ScrollView.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

function svgBox(svg: string): { w: number; h: number } {
  const vb = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(svg);
  if (vb) {
    const w = parseFloat(vb[3]);
    const h = parseFloat(vb[4]);
    if (w > 0 && h > 0) return { w, h };
  }
  const wA = /\bwidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const hA = /\bheight\s*=\s*["']([\d.]+)/i.exec(svg);
  const w = wA ? parseFloat(wA[1]) : 320;
  const h = hA ? parseFloat(hA[1]) : 200;
  return { w: w > 0 ? w : 320, h: h > 0 ? h : 200 };
}

function clean(svg: string, color: string, fonts: { regular: string; bold: string }): string {
  let s = svg
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  // currentColor → цвет темы: схема живёт и в тёмной, и в светлой.
  s = s.replace(/currentColor/gi, color);
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

export const SmdFigure = React.memo(function SmdFigure({
  svg,
  caption,
  color,
  muted,
  fonts,
}: {
  svg: string;
  caption?: string;
  color: string;
  muted: string;
  fonts: { regular: string; bold: string };
}) {
  const [w, setW] = useState(0);
  const box = useMemo(() => svgBox(svg), [svg]);
  const maxH = 460;
  const h = w > 0 ? Math.min(maxH, (w * box.h) / box.w) : 0;

  const html = useMemo(() => {
    const body = clean(svg, color, fonts);
    return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
svg{display:block;width:100%;height:100%}
text{font-family:-apple-system,Roboto,sans-serif}
</style></head><body>${body}</body></html>`;
  }, [svg, color, fonts]);

  return (
    <View style={{ marginVertical: 10 }}>
      <View
        style={[s.frame, { borderColor: color + '1A' }]}
        onLayout={(e) => {
          const width = Math.round(e.nativeEvent.layout.width);
          if (width > 0 && width !== w) setW(width);
        }}
      >
        {w > 0 && h > 0 ? (
          <View style={{ height: h }} pointerEvents="none">
            <WebView
              source={{ html }}
              style={{ backgroundColor: 'transparent' }}
              containerStyle={{ backgroundColor: 'transparent' }}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              originWhitelist={['*']}
              javaScriptEnabled={false}
              setBuiltInZoomControls={false}
              overScrollMode="never"
            />
          </View>
        ) : (
          <View style={{ height: 120 }} />
        )}
      </View>
      {caption ? (
        <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18, marginTop: 6, textAlign: 'center' }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  frame: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
