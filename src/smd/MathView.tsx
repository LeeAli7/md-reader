// Рендер формулы в RN: дерево из math.ts → нативные View/Text.
// Никакого WebView и KaTeX: дроби, корни и степени рисуются раскладкой,
// поэтому формула масштабируется вместе с размером шрифта и живёт офлайн.

import React from 'react';
import { View, Text } from 'react-native';
import { parseMath, stripDelims, type MathNode } from './math';

export interface MathFonts {
  regular: string;
  italic: string;
  bold?: string;
}

interface St {
  size: number;
  color: string;
  fonts: MathFonts;
  depth: number;
}

const RULE = 1.2;

function TextRun({ v, it, up, st }: { v: string; it?: boolean; up?: boolean; st: St }) {
  return (
    <Text
      style={{
        fontSize: st.size,
        lineHeight: st.size * 1.28,
        color: st.color,
        includeFontPadding: false,
        textAlignVertical: 'center',
        fontFamily: up ? st.fonts.regular : it ? st.fonts.italic : st.fonts.regular,
      }}
    >
      {v}
    </Text>
  );
}

function NodeView({ n, st }: { n: MathNode; st: St }) {
  switch (n.k) {
    case 'text':
      return <TextRun v={n.v} it={n.it} up={n.up} st={st} />;

    case 'row':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          {n.items.map((it, i) => (
            <NodeView key={i} n={it} st={st} />
          ))}
        </View>
      );

    case 'big':
      return (
        <Text
          style={{
            fontSize: st.size * 1.45,
            lineHeight: st.size * 1.45,
            color: st.color,
            includeFontPadding: false,
            fontFamily: st.fonts.regular,
            marginHorizontal: st.size * 0.06,
          }}
        >
          {n.v}
        </Text>
      );

    case 'frac': {
      const inner: St = { ...st, size: st.size * (st.depth === 0 ? 0.92 : 0.9), depth: st.depth + 1 };
      return (
        <View style={{ alignItems: 'center', marginHorizontal: st.size * 0.14 }}>
          <View style={{ paddingHorizontal: 2 }}>
            <NodeView n={n.a} st={inner} />
          </View>
          <View
            style={{
              height: RULE,
              alignSelf: 'stretch',
              minWidth: st.size * 0.5,
              backgroundColor: st.color,
              marginVertical: 2,
            }}
          />
          <View style={{ paddingHorizontal: 2 }}>
            <NodeView n={n.b} st={inner} />
          </View>
        </View>
      );
    }

    case 'sqrt':
      return <SqrtView n={n} st={st} />;


    case 'script': {
      const small: St = { ...st, size: st.size * 0.62, depth: st.depth };
      if (n.sup && n.sub) {
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <NodeView n={n.base} st={st} />
            <View style={{ marginLeft: 1 }}>
              <NodeView n={n.sup} st={small} />
              <View style={{ height: 1 }} />
              <NodeView n={n.sub} st={small} />
            </View>
          </View>
        );
      }
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <NodeView n={n.base} st={st} />
          {n.sup ? (
            <View style={{ alignSelf: 'flex-start', marginTop: -st.size * 0.06 }}>
              <NodeView n={n.sup} st={small} />
            </View>
          ) : null}
          {n.sub ? (
            <View style={{ alignSelf: 'flex-end', marginBottom: -st.size * 0.1 }}>
              <NodeView n={n.sub} st={small} />
            </View>
          ) : null}
        </View>
      );
    }

    default:
      return null;
  }
}

// Корень рисуется вектором (две линии), а не глифом «√»:
// глиф не тянется на высоту дроби и его лапка висит в воздухе.
function Radical({ h, w, t, color }: { h: number; w: number; t: number; color: string }) {
  const seg = (ax: number, ay: number, bx: number, by: number, key: string) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          left: (ax + bx) / 2 - len / 2,
          top: (ay + by) / 2 - t / 2,
          width: len,
          height: t,
          backgroundColor: color,
          transform: [{ rotate: `${ang}deg` }],
        }}
      />
    );
  };
  return (
    <View style={{ width: w, height: h }}>
      {seg(0, h * 0.58, w * 0.2, h, 'a')}
      {seg(w * 0.2, h, w, 0, 'b')}
    </View>
  );
}

function SqrtView({ n, st }: { n: Extract<MathNode, { k: 'sqrt' }>; st: St }) {
  const [h, setH] = React.useState(0);
  const inner: St = { ...st, size: st.size * 0.98, depth: st.depth + 1 };
  const tall = n.b.k === 'frac';
  const est = st.size * (tall ? 2.45 : 1.05);
  const hh = h || est;
  const w = Math.max(st.size * 0.38, hh * 0.44);
  const t = Math.max(1, st.size * 0.055);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {n.i ? (
        <View style={{ alignSelf: 'flex-start', marginTop: -st.size * 0.14, marginRight: -st.size * 0.04 }}>
          <NodeView n={n.i} st={{ ...st, size: st.size * 0.48 }} />
        </View>
      ) : null}
      <Radical h={hh} w={w} t={t} color={st.color} />
      <View
        onLayout={(e) => {
          const nh = e.nativeEvent.layout.height;
          if (nh > 0 && Math.abs(nh - h) > 0.5) setH(nh);
        }}
        style={{
          borderTopWidth: RULE,
          borderColor: st.color,
          paddingTop: 2,
          paddingHorizontal: 2,
          marginLeft: -1,
        }}
      >
        <NodeView n={n.b} st={inner} />
      </View>
    </View>
  );
}


/** Блочная формула: строки — по \\ в исходнике. */
export function MathView({
  source,
  size,
  color,
  fonts,
  align = 'center',
}: {
  source: string;
  size: number;
  color: string;
  fonts: MathFonts;
  align?: 'center' | 'left';
}) {
  const rows = React.useMemo(() => {
    try {
      return parseMath(stripDelims(source));
    } catch {
      return [];
    }
  }, [source]);

  const st: St = { size, color, fonts, depth: 0 };

  if (rows.length === 0) {
    return (
      <Text style={{ fontSize: size, lineHeight: size * 1.4, color }} selectable>
        {source}
      </Text>
    );
  }

  return (
    <View style={{ alignItems: align === 'left' ? 'flex-start' : 'center', width: '100%' }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginVertical: 1 }}>
          {row.map((n, j) => (
            <NodeView key={j} n={n} st={st} />
          ))}
        </View>
      ))}
    </View>
  );
}
