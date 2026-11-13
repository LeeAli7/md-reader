// Таблица .smd на телефоне: как в Телеграме — вся таблица в горизонтальном
// скролле, ячейки переносят слова, шапка жирная, выделение текста работает.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { columnWidths, type TableAlign, type TableSpec } from './table';

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Мини-разметка внутри ячейки: **жирный**, *курсив*, `код`, $формула$. */
function parseRuns(cell: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*|__)([\s\S]+?)\1|(\*|_)([^*_\n]+?)\3|`([^`]+)`|\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell)) !== null) {
    if (m.index > last) out.push({ text: cell.slice(last, m.index) });
    if (m[1]) out.push({ text: m[2], bold: true });
    else if (m[3]) out.push({ text: m[4], italic: true });
    else if (m[5] !== undefined) out.push({ text: m[5], code: true });
    else if (m[6] !== undefined) out.push({ text: m[6].trim(), code: true });
    last = m.index + m[0].length;
  }
  if (last < cell.length) out.push({ text: cell.slice(last) });
  return out.length ? out : [{ text: cell }];
}

function CellText({
  cell,
  align,
  width,
  fontSize,
  color,
  muted,
  bold,
  boldFamily,
  italicFamily,
  borderColor,
  header,
  last,
}: {
  cell: string;
  align: TableAlign;
  width: number;
  fontSize: number;
  color: string;
  muted: string;
  bold: boolean;
  boldFamily?: string;
  italicFamily?: string;
  borderColor: string;
  header: boolean;
  last: boolean;
}) {
  const runs = parseRuns(cell);
  return (
    <View style={[st.cell, { width, borderColor }, last && { borderRightWidth: 0 }]}>
      <Text
        selectable
        style={{
          color,
          fontSize,
          lineHeight: Math.round(fontSize * 1.42),
          fontFamily: bold ? boldFamily : undefined,
          fontWeight: bold ? '700' : undefined,
          textAlign: align,
        }}
      >
        {runs.map((r, i) => (
          <Text
            key={i}
            style={
              r.code
                ? { fontFamily: 'JetBrainsMono', color: header ? muted : color }
                : r.bold
                  ? { fontFamily: boldFamily, fontWeight: '700' }
                  : r.italic
                    ? { fontFamily: italicFamily, fontStyle: 'italic' }
                    : undefined
            }
          >
            {r.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

export function SmdTable({
  table,
  rt,
  fontSize,
  boldFamily,
  italicFamily,
  marginVertical = 24,
}: {
  table: TableSpec;
  rt: any;
  fontSize: number;
  boldFamily?: string;
  italicFamily?: string;
  marginVertical?: number;
}) {
  const { width: winW } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const available = Math.max(240, Math.floor(measured || winW - 32));
  const cellFont = Math.round(fontSize * 0.9);
  const { widths, scroll } = columnWidths(table, available, cellFont);
  const total = widths.reduce((a, b) => a + b, 0);
  const borderColor = rt.rule ?? rt.text;
  const line = StyleSheet.hairlineWidth;

  const rows = (
    <View style={{ width: scroll ? total : available }}>
      <View style={[st.row, { backgroundColor: rt.fill }]}>
        {table.head.map((h, j) => (
          <CellText
            key={j}
            cell={h}
            align={table.align[j] ?? 'left'}
            width={widths[j]}
            last={j === table.head.length - 1}
            fontSize={cellFont}
            color={rt.text}
            muted={rt.muted}
            bold
            boldFamily={boldFamily}
            italicFamily={italicFamily}
            borderColor={borderColor}
            header
          />
        ))}
      </View>
      {table.rows.map((r, i) => (
        <View key={i} style={[st.row, { borderTopWidth: line, borderColor }]}>
          {table.head.map((_, j) => (
            <CellText
              key={j}
              cell={r[j] ?? ''}
              align={table.align[j] ?? 'left'}
              width={widths[j]}
              last={j === table.head.length - 1}
              fontSize={cellFont}
              color={rt.text}
              muted={rt.muted}
              bold={false}
              boldFamily={boldFamily}
              italicFamily={italicFamily}
              borderColor={borderColor}
              header={false}
            />
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <View
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (w > 0 && Math.abs(w - measured) > 1) setMeasured(w);
      }}
      style={[
        st.wrap,
        { marginVertical, borderColor, borderWidth: line, backgroundColor: rt.bg },
      ]}
    >
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ flexGrow: 0 }}
        >
          {rows}
        </ScrollView>
      ) : (
        rows
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});
