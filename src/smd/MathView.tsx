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
              minWidth: st.size * 0.9,
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

    case 'sqrt': {
      const inner: St = { ...st, size: st.size * 0.98, depth: st.depth + 1 };
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {n.i ? (
            <View style={{ marginRight: -st.size * 0.16, marginTop: -st.size * 0.28 }}>
              <NodeView n={n.i} st={{ ...st, size: st.size * 0.58 }} />
            </View>
          ) : null}
          <Text
            style={{
              fontSize: st.size * 1.18,
              lineHeight: st.size * 1.2,
              color: st.color,
              fontFamily: st.fonts.regular,
            }}
          >
            √
          </Text>
          <View
            style={{
              borderTopWidth: RULE,
              borderColor: st.color,
              paddingTop: 1.5,
              paddingHorizontal: 2,
              marginLeft: -1,
            }}
          >
            <NodeView n={n.b} st={inner} />
          </View>
        </View>
      );
    }

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
