// Лицо .smd — рендер блоков SmdDoc в RN.
// Контракт данных: SmdDoc { meta, blocks } (см. smdTypes.ts, парсер — Ares).
// Интерактив локален (useState на блок): движок/статистика не трогаем.

import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import type { SmdBlock, SmdDoc } from './smdTypes';

interface Ctx {
  mdStyle: any;
  rt: any;
  fontSize: number;
}

export function SmdDocView({ doc, mdStyle, rt, fontSize }: { doc: SmdDoc; mdStyle: any; rt: any; fontSize: number }) {
  const ctx: Ctx = { mdStyle, rt, fontSize };
  return (
    <View>
      <SmdMetaHeader doc={doc} rt={rt} fontSize={fontSize} />
      {doc.blocks.map((b, i) => (
        <BlockView key={i} block={b} ctx={ctx} />
      ))}
    </View>
  );
}

function SmdMetaHeader({ doc, rt, fontSize }: { doc: SmdDoc; rt: any; fontSize: number }) {
  const m = doc.meta;
  return (
    <View style={[s.meta, { borderBottomColor: rt.text + '20' }]}>
      <Text style={[s.metaTitle, { color: rt.text, fontSize: fontSize * 1.5 }]}>{m.title}</Text>
      <View style={s.metaRow}>
        {m.subject ? (
          <View style={[s.chip, { backgroundColor: rt.text + '10' }]}>
            <Text style={[s.chipText, { color: rt.text }]}>{m.subject}</Text>
          </View>
        ) : null}
        <View style={[s.chip, { backgroundColor: rt.text + '10' }]}>
          <Text style={[s.chipText, { color: rt.text }]}>{m.level}</Text>
          </View>
        {(m.tags ?? []).map((t) => (
          <View key={t} style={[s.chip, { backgroundColor: rt.text + '10' }]}>
            <Text style={[s.chipText, { color: rt.text }]}>#{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function BlockView({ block, ctx }: { block: SmdBlock; ctx: Ctx }) {
  switch (block.type) {
    case 'theory':
      return <Markdown style={ctx.mdStyle}>{block.body}</Markdown>;
    case 'def':
      return (
        <View style={[s.def, { borderLeftColor: '#8B5CF6', backgroundColor: ctx.rt.text + '08' }]}>
          <Text style={[s.defTerm, { color: ctx.rt.text, fontSize: ctx.fontSize * 1.1 }]}>
            {block.term ?? 'Определение'}
          </Text>
          <Markdown style={ctx.mdStyle}>{block.body}</Markdown>
        </View>
      );
    case 'formula':
      return (
        <View style={[s.formula, { backgroundColor: ctx.rt.text + '0A', borderColor: ctx.rt.text + '20' }]}>
          <Text style={[s.formulaText, { color: ctx.rt.text }]} selectable>{`$$ ${block.body} $$`}</Text>
        </View>
      );
    case 'spoiler':
      return <Reveal title={block.title ?? 'Скрыто'} ctx={ctx} body={block.body} icon="eye-outline" />;
    case 'solution':
      return <Reveal title="Решение" ctx={ctx} body={block.body} icon="checkmark-circle-outline" />;
    case 'card':
      return <CardBlock front={block.front} back={block.back} ctx={ctx} />;
    case 'quiz':
      return <QuizBlock block={block} ctx={ctx} />;
    case 'callout':
      return <CalloutBlock kind={block.kind} body={block.body} ctx={ctx} />;
    case 'checklist':
      return <ChecklistBlock items={block.items} ctx={ctx} />;
    case 'compare-table':
      return <CompareTable head={block.head} rows={block.rows} ctx={ctx} />;
    case 'unknown':
      return (
        <View style={[s.callout, { borderColor: '#9CA3AF', backgroundColor: ctx.rt.text + '05' }]}>
          <Text style={[s.calloutLabel, { color: '#9CA3AF' }]}>:::{block.rawType} (неизвестный тип)</Text>
          <Markdown style={ctx.mdStyle}>{block.body}</Markdown>
        </View>
      );
  }
}

// --- spoiler / solution: тап-раскрытие ---

function Reveal({ title, body, icon, ctx }: { title: string; body: string; icon: any; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.reveal, { borderColor: ctx.rt.text + '25', backgroundColor: ctx.rt.text + '05' }]}>
      <Pressable onPress={() => setOpen(!open)} style={s.revealHead} hitSlop={6}>
        <Ionicons name={open ? 'chevron-down' : icon} size={18} color={ctx.rt.text} />
        <Text style={[s.revealTitle, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>{title}</Text>
        <Text style={[s.revealHint, { color: ctx.rt.text + '60' }]}>{open ? 'скрыть' : 'показать'}</Text>
      </Pressable>
      {open && (
        <View style={s.revealBody}>
          <Markdown style={ctx.mdStyle}>{body}</Markdown>
        </View>
      )}
    </View>
  );
}

// --- card: вопрос → тап-переворот → Знаю / Не знаю ---

function CardBlock({ front, back, ctx }: { front: string; back: string; ctx: Ctx }) {
  const [flipped, setFlipped] = useState(false);
  const [mark, setMark] = useState<'know' | 'dont' | null>(null);
  return (
    <View style={[s.card, { borderColor: ctx.rt.text + '25', backgroundColor: ctx.rt.text + '05' }]}>
      <View style={s.cardHead}>
        <Ionicons name="layers-outline" size={16} color={ctx.rt.text + '80'} />
        <Text style={[s.cardLabel, { color: ctx.rt.text + '80' }]}>Карточка</Text>
        {mark && (
          <Text style={[s.cardMark, { color: mark === 'know' ? '#22C55E' : '#EF4444' }]}>
            {mark === 'know' ? '✓ Знаю' : '✗ Повторить'}
          </Text>
        )}
      </View>
      <Pressable onPress={() => setFlipped(!flipped)}>
        <Text style={[s.cardText, { color: ctx.rt.text, fontSize: ctx.fontSize * 1.05 }]}>
          {flipped ? back : front}
        </Text>
        {!flipped && <Text style={[s.revealHint, { color: ctx.rt.text + '60' }]}>тап — ответ</Text>}
      </Pressable>
      {flipped && (
        <View style={s.cardBtns}>
          <Pressable
            onPress={() => setMark('dont')}
            style={[s.cardBtn, { borderColor: '#EF4444' }, mark === 'dont' && { backgroundColor: '#EF444422' }]}
          >
            <Text style={[s.cardBtnText, { color: '#EF4444' }]}>Не знаю</Text>
          </Pressable>
          <Pressable
            onPress={() => setMark('know')}
            style={[s.cardBtn, { borderColor: '#22C55E' }, mark === 'know' && { backgroundColor: '#22C55E22' }]}
          >
            <Text style={[s.cardBtnText, { color: '#22C55E' }]}>Знаю</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- quiz: single/multi — кнопки, free — TextInput ---

function QuizBlock({ block, ctx }: { block: Extract<SmdBlock, { type: 'quiz' }>; ctx: Ctx }) {
  const [sel, setSel] = useState<number[]>([]);
  const [free, setFree] = useState('');
  const [checked, setChecked] = useState(false);

  const opts = block.options ?? [];
  const toggle = (i: number) => {
    setChecked(false);
    if (block.quizType === 'single') setSel([i]);
    else setSel((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  const correctIdx = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  const isRight = (i: number) => {
    if (!checked) return null;
    const o = opts[i];
    if (block.quizType === 'single') return sel[0] === i ? o.correct : (o.correct ? true : null);
    return sel.includes(i) ? o.correct : (o.correct ? true : null);
  };
  const multiOk = [...sel].sort().join(',') === [...correctIdx].sort().join(',');

  const freeOk = checked && free.trim().toLowerCase() === (block.answer ?? '').trim().toLowerCase();

  return (
    <View style={[s.quiz, { borderColor: ctx.rt.text + '25', backgroundColor: ctx.rt.text + '05' }]}>
      <View style={s.cardHead}>
        <Ionicons name="help-circle-outline" size={16} color={ctx.rt.text + '80'} />
        <Text style={[s.cardLabel, { color: ctx.rt.text + '80' }]}>
          Вопрос{block.points ? ` · ${block.points} б.` : ''}
        </Text>
      </View>
      <Text style={[s.quizQ, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>{block.question}</Text>

      {(block.quizType === 'single' || block.quizType === 'multi') && opts.map((o, i) => {
        const r = isRight(i);
        return (
          <Pressable
            key={i}
            onPress={() => toggle(i)}
            style={[
              s.opt,
              { borderColor: ctx.rt.text + '25' },
              sel.includes(i) && { borderColor: '#3B82F6', backgroundColor: '#3B82F622' },
              r === true && { borderColor: '#22C55E', backgroundColor: '#22C55E22' },
              r === false && { borderColor: '#EF4444', backgroundColor: '#EF444422' },
            ]}
          >
            <Ionicons
              name={block.quizType === 'single'
                ? (sel.includes(i) ? 'radio-button-on' : 'radio-button-off')
                : (sel.includes(i) ? 'checkbox' : 'square-outline')}
              size={18}
              color={r === true ? '#22C55E' : r === false ? '#EF4444' : ctx.rt.text + '80'}
            />
            <Text style={[s.optText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>{o.text}</Text>
          </Pressable>
        );
      })}

      {block.quizType === 'free' && (
        <TextInput
          style={[s.freeInput, { borderColor: ctx.rt.text + '30', color: ctx.rt.text, fontSize: ctx.fontSize }]}
          placeholder="Твой ответ…"
          placeholderTextColor={ctx.rt.text + '50'}
          value={free}
          onChangeText={(t) => { setFree(t); setChecked(false); }}
          autoCapitalize="none"
        />
      )}

      {(block.quizType === 'multi' || block.quizType === 'free') && !checked && (
        <Pressable onPress={() => setChecked(true)} style={[s.checkBtn, { backgroundColor: '#3B82F6' }]}>
          <Text style={s.checkBtnText}>Проверить</Text>
        </Pressable>
      )}
      {block.quizType === 'single' && sel.length > 0 && !checked && (
        <Pressable onPress={() => setChecked(true)} style={[s.checkBtn, { backgroundColor: '#3B82F6' }]}>
          <Text style={s.checkBtnText}>Проверить</Text>
        </Pressable>
      )}

      {checked && (
        <View style={s.verdict}>
          {block.quizType === 'free' ? (
            <Text style={[s.verdictText, { color: freeOk ? '#22C55E' : '#EF4444' }]}>
              {freeOk ? '✓ Верно' : `✗ Правильно: ${block.answer ?? '—'}`}
            </Text>
          ) : block.quizType === 'single' ? (
            <Text style={[s.verdictText, { color: opts[sel[0]]?.correct ? '#22C55E' : '#EF4444' }]}>
              {opts[sel[0]]?.correct ? '✓ Верно' : '✗ Неверно'}
            </Text>
          ) : (
            <Text style={[s.verdictText, { color: multiOk ? '#22C55E' : '#EF4444' }]}>
              {multiOk ? '✓ Точно' : '✗ Нужно точное совпадение'}
            </Text>
          )}
          {block.explain ? (
            <Text style={[s.explain, { color: ctx.rt.text + '80', fontSize: ctx.fontSize * 0.9 }]}>{block.explain}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// --- callout: цветные плашки mistake / exam-tip / intuition ---

const CALLOUT_STYLE: Record<string, { color: string; icon: any; label: string }> = {
  'mistake': { color: '#EF4444', icon: 'alert-circle-outline', label: 'Ошибка' },
  'exam-tip': { color: '#F59E0B', icon: 'star-outline', label: 'К экзамену' },
  'intuition': { color: '#3B82F6', icon: 'bulb-outline', label: 'Интуиция' },
};

function CalloutBlock({ kind, body, ctx }: { kind: string; body: string; ctx: Ctx }) {
  const st = CALLOUT_STYLE[kind] ?? { color: '#9CA3AF', icon: 'information-circle-outline', label: kind };
  return (
    <View style={[s.callout, { borderColor: st.color, backgroundColor: st.color + '14' }]}>
      <View style={s.cardHead}>
        <Ionicons name={st.icon} size={16} color={st.color} />
        <Text style={[s.calloutLabel, { color: st.color }]}>{st.label}</Text>
      </View>
      <Markdown style={ctx.mdStyle}>{body}</Markdown>
    </View>
  );
}

// --- checklist: чекбоксы ---

function ChecklistBlock({ items, ctx }: { items: string[]; ctx: Ctx }) {
  const [done, setDone] = useState<number[]>([]);
  return (
    <View style={[s.checklist, { borderColor: ctx.rt.text + '20' }]}>
      <View style={s.cardHead}>
        <Ionicons name="checkmark-done-outline" size={16} color={ctx.rt.text + '80'} />
        <Text style={[s.cardLabel, { color: ctx.rt.text + '80' }]}>
          Самопроверка · {done.length}/{items.length}
        </Text>
      </View>
      {items.map((t, i) => {
        const on = done.includes(i);
        return (
          <Pressable
            key={i}
            onPress={() => setDone((p) => (on ? p.filter((x) => x !== i) : [...p, i]))}
            style={s.checkRow}
            hitSlop={4}
          >
            <Ionicons
              name={on ? 'checkbox' : 'square-outline'}
              size={20}
              color={on ? '#22C55E' : ctx.rt.text + '60'}
            />
            <Text style={[
              s.checkText,
              { color: on ? ctx.rt.text + '60' : ctx.rt.text, fontSize: ctx.fontSize },
              on && { textDecorationLine: 'line-through' },
            ]}>
              {t}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- compare-table: горизонтальный скролл ---

function CompareTable({ head, rows, ctx }: { head: string[]; rows: string[][]; ctx: Ctx }) {
  const cellBorder = ctx.rt.text + '25';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.cmpWrap}>
      <View style={[s.cmpTable, { borderColor: cellBorder }]}>
        <View style={[s.cmpRow, { backgroundColor: ctx.rt.text + '08' }]}>
          {head.map((h, i) => (
            <Text key={i} style={[s.cmpCell, s.cmpHead, { color: ctx.rt.text, borderColor: cellBorder, fontSize: ctx.fontSize * 0.92 }]}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={s.cmpRow}>
            {head.map((_, j) => (
              <Text key={j} style={[s.cmpCell, { color: ctx.rt.text, borderColor: cellBorder, fontSize: ctx.fontSize * 0.92 }]}>
                {r[j] ?? ''}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  meta: { borderBottomWidth: 1, paddingBottom: 12, marginBottom: 12 },
  metaTitle: { fontWeight: '700', marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  def: { borderLeftWidth: 3, borderRadius: 8, padding: 12, marginVertical: 8 },
  defTerm: { fontWeight: '700', marginBottom: 4 },
  formula: {
    borderWidth: 1, borderRadius: 8, padding: 12, marginVertical: 8,
  },
  formulaText: { fontFamily: 'monospace', fontSize: 15, lineHeight: 22 },
  reveal: { borderWidth: 1, borderRadius: 10, marginVertical: 8, overflow: 'hidden' },
  revealHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  revealTitle: { flex: 1, fontWeight: '600' },
  revealHint: { fontSize: 12 },
  revealBody: { paddingHorizontal: 12, paddingBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  cardMark: { fontSize: 12, fontWeight: '700' },
  cardText: { lineHeight: 24, marginBottom: 4 },
  cardBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cardBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cardBtnText: { fontSize: 14, fontWeight: '700' },
  quiz: { borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 8 },
  quizQ: { fontWeight: '600', marginBottom: 10, lineHeight: 24 },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8,
  },
  optText: { flex: 1, lineHeight: 22 },
  freeInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  checkBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
  checkBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  verdict: { marginTop: 10 },
  verdictText: { fontSize: 15, fontWeight: '700' },
  explain: { marginTop: 4, lineHeight: 20 },
  callout: { borderLeftWidth: 4, borderRadius: 8, padding: 12, marginVertical: 8 },
  calloutLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  checklist: { borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkText: { flex: 1, lineHeight: 22 },
  cmpWrap: { marginVertical: 8 },
  cmpTable: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  cmpRow: { flexDirection: 'row' },
  cmpCell: { minWidth: 110, maxWidth: 220, padding: 8, borderRightWidth: 1, borderBottomWidth: 0.5 },
  cmpHead: { fontWeight: '700' },
});
