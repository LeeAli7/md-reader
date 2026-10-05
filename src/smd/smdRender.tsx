// Лицо .smd — рендер блоков SmdDoc в RN.
// Контракт данных: SmdDoc { meta, blocks } (см. smdTypes.ts, парсер — Ares).
// Интерактив локален (useState на блок): движок/статистика не трогаем.

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import type { SmdBlock, SmdDoc } from './smdTypes';
import { askTask, chatIdFor, type ChatMsg } from './ai';

interface Ctx {
  mdStyle: any;
  rt: any;
  fontSize: number;
}

export function SmdDocView({ doc, mdStyle, rt, fontSize, onBlockLayout, docKey, onAskTask }: { doc: SmdDoc; mdStyle: any; rt: any; fontSize: number; onBlockLayout?: (index: number, y: number) => void; docKey?: string; onAskTask?: (t: { chatId: string; title: string; task: string; solution: string }) => void }) {
  const ctx: Ctx = { mdStyle, rt, fontSize };
  return (
    <View>
      <SmdMetaHeader doc={doc} rt={rt} fontSize={fontSize} />
      {doc.blocks.map((b, i) => (
        <View
          key={i}
          onLayout={onBlockLayout ? (e) => onBlockLayout(i, e.nativeEvent.layout.y) : undefined}
        >
          <BlockView block={b} ctx={ctx} blocks={doc.blocks} index={i} docKey={docKey} onAskTask={onAskTask} />
        </View>
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

// --- задача + «Спросить»: вопросы с контекстом задачи через zen-прокси ---

function TaskAssist({ block, solution, ctx, docKey, onAskTask }: {
  block: Extract<SmdBlock, { type: 'task' }>; solution: string; ctx: Ctx; docKey?: string;
  onAskTask?: (t: { chatId: string; title: string; task: string; solution: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const openBranch = () => {
    if (!onAskTask) {
      setOpen(!open);
      return;
    }
    const { chatIdFor: cid } = { chatIdFor };
    onAskTask({
      chatId: cid(docKey ?? '', block.body),
      title: block.body.split('\n')[0].slice(0, 60) || 'Вопрос по задаче',
      task: block.body,
      solution,
    });
  };
  const send = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setQ('');
    setErr(null);
    setBusy(true);
    const hist = [...msgs];
    setMsgs((p) => [...p, { role: 'user', text: question }]);
    try {
      const answer = await askTask(block.body, solution, hist, question);
      setMsgs((p) => [...p, { role: 'assistant', text: answer }]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[s.card, { borderColor: '#F59E0B88', backgroundColor: '#F59E0B0D' }]}>
      <View style={s.cardHead}>
        <Ionicons name="pencil-outline" size={16} color="#F59E0B" />
        <Text style={[s.cardLabel, { color: '#F59E0B' }]}>
          Задача{block.difficulty ? ` · сложность ${block.difficulty}` : ''}{block.points ? ` · ${block.points} б.` : ''}
        </Text>
      </View>
      <RichText body={prettifySpans(block.body)} ctx={ctx} />
      <Pressable onPress={openBranch} style={s.askBtn} hitSlop={6}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color="#3B82F6" />
        <Text style={[s.askBtnText, { color: '#3B82F6' }]}>{onAskTask ? 'Спросить в ветке' : open ? 'Скрыть вопросы' : 'Спросить по задаче'}</Text>
      </Pressable>
      {open && (
        <View style={{ marginTop: 8 }}>
          {msgs.map((m, i) => (
            <View
              key={i}
              style={[s.chatMsg, m.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: '#3B82F622' }
                : { alignSelf: 'flex-start', backgroundColor: ctx.rt.text + '0D' }]}
            >
              <Text style={{ color: ctx.rt.text, fontSize: ctx.fontSize * 0.92, lineHeight: 20 }}>{m.text}</Text>
            </View>
          ))}
          {busy && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={{ color: ctx.rt.text + '60', fontSize: 13 }}>Думаю над задачей…</Text>
            </View>
          )}
          {err ? (
            <Text style={{ color: '#EF4444', fontSize: 13, marginVertical: 4 }}>{err}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <TextInput
              style={[s.freeInput, { flex: 1, borderColor: ctx.rt.text + '30', color: ctx.rt.text, fontSize: ctx.fontSize * 0.92, marginBottom: 0 }]}
              placeholder="Твой вопрос…"
              placeholderTextColor={ctx.rt.text + '50'}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={send}
              returnKeyType="send"
              editable={!busy}
            />
            <Pressable onPress={send} disabled={busy || !q.trim()} hitSlop={8} style={[s.sendBtn, { opacity: busy || !q.trim() ? 0.4 : 1 }]}>
              <Ionicons name="send" size={20} color="#3B82F6" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// --- формулы текстом: $..$ → читаемый вид (без KaTeX, офлайн) ---

const TEX_CMD: Record<string, string> = {
  to: '→', rightarrow: '→', leftarrow: '←', times: '×', cdot: '·', pm: '±',
  leq: '≤', geq: '≥', neq: '≠', approx: '≈', infty: '∞', alpha: 'α', beta: 'β',
  gamma: 'γ', delta: 'δ', Delta: 'Δ', pi: 'π', mu: 'μ', lambda: 'λ', sigma: 'σ', omega: 'ω',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ',
  '+': '₊', '-': '₋', '(': '₍', ')': '₎',
};
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ',
};
function texToText(s: string): string {
  let o = s.replace(/\\\\/g, '\\');
  o = o.replace(/\\xrightarrow\{([^}]*)\}/g, '→');
  o = o.replace(/\\([a-zA-Z]+)/g, (m, c) => TEX_CMD[c] ?? m);
  o = o.replace(/_\{([^}]+)\}/g, (_, g) => [...g].map((ch: string) => SUB[ch] ?? ch).join(''));
  o = o.replace(/\^\{([^}]+)\}/g, (_, g) => [...g].map((ch: string) => SUP[ch] ?? ch).join(''));
  o = o.replace(/_([0-9a-zA-Z+\-()])/g, (_, c) => SUB[c] ?? `_${c}`);
  o = o.replace(/\^([0-9n+\-])/g, (_, c) => SUP[c] ?? `^${c}`);
  return o;
}
// $..$ → читаемо, только если внутри похоже на формулу (иначе цены "$5 и $10" не трогаем).
export function prettifySpans(body: string): string {
  return body.replace(/\$([^$\n]+)\$/g, (m, inner) =>
    /[\\_^]/.test(inner) || /[A-Za-z]_\d/.test(inner) ? texToText(inner) : m);
}

function BlockView({ block, ctx, blocks, index, docKey, onAskTask }: {
  block: SmdBlock; ctx: Ctx; blocks?: SmdBlock[]; index?: number; docKey?: string;
  onAskTask?: (t: { chatId: string; title: string; task: string; solution: string }) => void;
}) {
  const solutionFor = (): string => {
    if (!blocks || index === undefined) return '';
    const out: string[] = [];
    for (let k = index + 1; k < blocks.length; k++) {
      if (blocks[k].type === 'solution') out.push((blocks[k] as { body: string }).body);
      else break;
    }
    return out.join('\n\n');
  };
  switch (block.type) {
    case 'theory':
      return <RichText body={block.body} ctx={ctx} />;
    case 'def':
      return (
        <View style={[s.def, { borderLeftColor: '#8B5CF6', backgroundColor: ctx.rt.text + '08' }]}>
          <Text style={[s.defTerm, { color: ctx.rt.text, fontSize: ctx.fontSize * 1.1 }]}>
            {block.term ?? 'Определение'}
          </Text>
          <RichText body={block.body} ctx={ctx} />
        </View>
      );
    case 'formula':
      return (
        <View style={[s.formula, { backgroundColor: ctx.rt.text + '0A', borderColor: ctx.rt.text + '20' }]}>
          <Text style={[s.formulaText, { color: ctx.rt.text }]} selectable>{texToText(block.body.replace(/\$/g, ''))}</Text>
        </View>
      );
    case 'task':
      return <TaskAssist block={block} solution={solutionFor()} ctx={ctx} docKey={docKey} onAskTask={onAskTask} />;
    case 'spoiler':
      return <Reveal title={block.title ?? 'Скрыто'} ctx={ctx} body={block.body} icon="eye-outline" />;
    case 'solution':
      return <Reveal title="Решение" ctx={ctx} body={block.body} icon="checkmark-circle-outline" />;
    case 'card':
      return <CardBlock front={block.front} back={block.back} ctx={ctx} />;
    case 'quiz':
      return <QuizBlock block={block} ctx={ctx} />;
    case 'cloze':
      return <ClozeBlock body={block.body} ctx={ctx} />;
    case 'callout':
      return <CalloutBlock kind={block.kind} body={block.body} ctx={ctx} />;
    case 'checklist':
      return <ChecklistBlock items={block.items} ctx={ctx} />;
    case 'compare-table':
      return <CompareTable head={block.head} rows={block.rows} ctx={ctx} />;
    case 'theorem':
      return (
        <View style={[s.def, { borderLeftColor: '#3B82F6', backgroundColor: ctx.rt.text + '08' }]}>
          <Text style={[s.defTerm, { color: ctx.rt.text, fontSize: ctx.fontSize * 1.1 }]}>
            {block.name ?? 'Теорема'}
          </Text>
          <RichText body={block.body} ctx={ctx} />
        </View>
      );
    case 'proof':
      return <Reveal title="Доказательство" body={block.body} icon="checkmark-circle-outline" ctx={ctx} />;
    case 'summary':
      return (
        <View style={[s.def, { borderLeftColor: '#22C55E', backgroundColor: ctx.rt.text + '08' }]}>
          <Text style={[s.defTerm, { color: ctx.rt.text, fontSize: ctx.fontSize * 1.1 }]}>Выжимка</Text>
          <RichText body={block.body} ctx={ctx} />
        </View>
      );
    case 'meta-links':
      return (
        <View>
          {block.links.map((l, i) => (
            <Text key={i} style={{ color: '#3B82F6', fontSize: ctx.fontSize, marginBottom: 6 }}>
              {l.text}
            </Text>
          ))}
          {block.links.length === 0 ? <RichText body={block.body} ctx={ctx} /> : null}
        </View>
      );
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
          <Markdown style={ctx.mdStyle}>{prettifySpans(body)}</Markdown>
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
    <View style={[s.card, { borderColor: ctx.rt.text + '25', backgroundColor: ctx.rt.text + '05', minHeight: 150, justifyContent: 'center' }]}>
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
        <Text style={[s.cardText, { color: ctx.rt.text, fontSize: ctx.fontSize * 1.15, textAlign: 'center', fontWeight: flipped ? '400' : '700' }]}>
          {fixArrows(flipped ? back : front)}
        </Text>
        {!flipped && <Text style={[s.revealHint, { color: ctx.rt.text + '60', textAlign: 'center' }]}>тап — ответ</Text>}
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

// --- инлайн-подсветка: ==..== и {{cN::..}} внутри theory/def (тап открывает) ---

function RichText({ body, ctx }: { body: string; ctx: Ctx }) {
  const pretty = prettifySpans(body);
  const parts = splitCloze(pretty);
  if (!parts.some((p) => p.hidden)) {
    return <Markdown style={ctx.mdStyle}>{pretty}</Markdown>;
  }
  const [open, setOpen] = useState<number[]>([]);
  return (
    <View>
      <Text style={[s.clozeText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>
        {parts.map((p, i) => p.hidden ? (
          <Text
            key={i}
            onPress={() => setOpen((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
            style={open.includes(i)
              ? { color: '#22C55E', fontWeight: '700' }
              : { backgroundColor: '#8B5CF633', color: ctx.rt.text }}
          >
            {open.includes(i) ? p.text : ' [•••] '}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ))}
      </Text>
      <Text style={[s.explain, { color: ctx.rt.text + '50' }]}>тап по выделению — открыть</Text>
    </View>
  );
}

// --- cloze: скрываемые гэпы, тап открывает ---

function ClozeBlock({ body, ctx }: { body: string; ctx: Ctx }) {
  const parts = splitCloze(body);
  const [open, setOpen] = useState<number[]>([]);
  return (
    <View style={[s.callout, { borderColor: '#8B5CF6', backgroundColor: '#8B5CF614' }]}>
      <View style={s.cardHead}>
        <Ionicons name="eye-off-outline" size={16} color="#8B5CF6" />
        <Text style={[s.calloutLabel, { color: '#8B5CF6' }]}>Пропуск · тап — открыть</Text>
      </View>
      <Text style={[s.clozeText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>
        {parts.map((p, i) => p.hidden ? (
          <Text
            key={i}
            onPress={() => setOpen((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
            style={open.includes(i)
              ? { color: '#22C55E', fontWeight: '700' }
              : { backgroundColor: ctx.rt.text + '25', color: 'transparent' }}
          >
            {open.includes(i) ? p.text : `  ${p.text.replace(/./g, '·')}  `}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ))}
      </Text>
    </View>
  );
}

function splitCloze(body: string): { text: string; hidden: boolean }[] {
  const out: { text: string; hidden: boolean }[] = [];
  const re = /\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}|==([^=\n]+)==/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), hidden: false });
    out.push({ text: (m[1] ?? m[2] ?? '').trim() || '…', hidden: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), hidden: false });
  return out.length > 0 ? out : [{ text: body, hidden: false }];
}

// Рукописные стрелки с телефона: 0'n +1 (апостроф+n вместо →) → показываем стрелкой.
// Только в квизах/карточках (в теории 'n вроде rock'n'roll не трогаем).
function fixArrows(s: string): string {
  return (s ?? '').replace(/(\S)'[nN](?=[\s),.\];:!?]|$)/g, '$1→');
}

// --- детерминированный шаффл (seed из вопроса): порядок «как в игре», стабилен ---

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.codePointAt(i) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededOrder(n: number, seed: string): number[] {
  let s = hashStr(seed) || 1;
  const rnd = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // не оставлять изначально правильный порядок — иначе это подсказка
  if (n > 1 && arr.every((v, i) => v === i)) [arr[0], arr[1]] = [arr[1], arr[0]];
  return arr;
}

// --- quiz: single/multi — кнопки, free/numeric — ввод, match — пары, order — порядок ---

function QuizBlock({ block, ctx }: { block: Extract<SmdBlock, { type: 'quiz' }>; ctx: Ctx }) {
  const [sel, setSel] = useState<number[]>([]);
  const [free, setFree] = useState('');
  const [checked, setChecked] = useState(false);
  // match: links[leftIdx] = rightPos; selL — выбранная левая
  const [selL, setSelL] = useState<number | null>(null);
  const [links, setLinks] = useState<Record<number, number>>({});
  // order: порядок позиций + выбранная для обмена
  const [order, setOrder] = useState<number[] | null>(null);
  const [orderSel, setOrderSel] = useState<number | null>(null);

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

  const normStr = (v: string) => v.trim().toLowerCase();
  const freeOk = checked && (
    normStr(free) === normStr(block.answer ?? '') ||
    (block.accept ?? []).some((a) => normStr(free) === normStr(a))
  );
  const numOk = (() => {
    if (block.quizType !== 'numeric' || !checked) return false;
    const v = parseFloat(free.replace(',', '.'));
    const a = parseFloat((block.answer ?? '').replace(',', '.'));
    if (Number.isNaN(v) || Number.isNaN(a)) return false;
    return Math.abs(v - a) <= (block.tolerance ?? 0);
  })();
  // match: правая колонка тасуется (seed из вопроса), связи по индексам
  const pairs = block.pairs ?? [];
  const matchRightOrder = useMemo(
    () => seededOrder(pairs.length, block.question),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.question, pairs.length],
  );
  const matchOk = checked && pairs.length >= 2 &&
    pairs.every((_, li) => matchRightOrder[links[li]] === li);
  const unlink = (m: Record<number, number>, pos: number) => {
    const n: Record<number, number> = {};
    for (const k of Object.keys(m)) {
      if (m[Number(k)] !== pos) n[Number(k)] = m[Number(k)];
    }
    return n;
  };
  const tapLeft = (li: number) => {
    setChecked(false);
    if (links[li] !== undefined) {
      setLinks((prev) => {
        const n = { ...prev };
        delete n[li];
        return n;
      });
      if (selL === li) setSelL(null);
      return;
    }
    setSelL((prev) => (prev === li ? null : li));
  };
  const tapRight = (pos: number) => {
    setChecked(false);
    if (selL === null) {
      // без выбранной левой — тап по занятой снимает связь
      setLinks((prev) => unlink(prev, pos));
      return;
    }
    const l = selL;
    setLinks((prev) => {
      const n = unlink(prev, pos);
      n[l] = pos;
      return n;
    });
    setSelL(null);
  };
  // order: стартуем перемешанными, тап-тап = обмен (как в игре)
  const orderItems = block.items ?? [];
  const orderInit = useMemo(
    () => seededOrder(orderItems.length, `${block.question}#ord`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.question, orderItems.length],
  );
  const curOrder = order ?? orderInit;
  const orderOk = checked && orderItems.length >= 2 &&
    curOrder.every((v, pos) => v === pos);
  const tapOrder = (pos: number) => {
    setChecked(false);
    if (orderSel === null) {
      setOrderSel(pos);
      return;
    }
    if (orderSel === pos) {
      setOrderSel(null);
      return;
    }
    const arr = [...curOrder];
    [arr[orderSel], arr[pos]] = [arr[pos], arr[orderSel]];
    setOrder(arr);
    setOrderSel(null);
  };
  const reshuffleOrder = () => {
    setChecked(false);
    setOrderSel(null);
    setOrder(seededOrder(orderItems.length, `${block.question}#${Date.now()}`));
  };

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
            <Text style={[s.optText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>{fixArrows(o.text)}</Text>
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

      {block.quizType === 'numeric' && (
        <TextInput
          style={[s.freeInput, { borderColor: ctx.rt.text + '30', color: ctx.rt.text, fontSize: ctx.fontSize }]}
          placeholder={block.unit ? `Число (в ${block.unit})…` : 'Число…'}
          placeholderTextColor={ctx.rt.text + '50'}
          value={free}
          onChangeText={(t) => { setFree(t); setChecked(false); }}
          keyboardType="numeric"
          autoCapitalize="none"
        />
      )}

      {block.quizType === 'match' && pairs.length >= 2 && (
        <View style={s.matchWrap}>
          {matchRightOrder.map((pairIdx, pos) => {
            // Строка: левая в исходном порядке, правая тасованная — высоты всегда равны.
            const li = pos;
            const linkPos = links[li];
            const leftVerdict = checked && linkPos !== undefined
              ? (matchRightOrder[linkPos] === li ? true : false) : null;
            const rightVerdict = checked && linkPos === pos
              ? (pairIdx === li ? true : false) : null;
            const badge = linkPos !== undefined ? linkPos + 1 : null;
            return (
              <View key={pos} style={s.matchRow}>
                <Pressable
                  onPress={() => tapLeft(li)}
                  style={[s.matchCell,
                    { borderColor: ctx.rt.text + '25' },
                    selL === li && { borderColor: '#3B82F6', backgroundColor: '#3B82F622' },
                    linkPos !== undefined && selL !== li && { borderColor: ctx.rt.text + '60' },
                    leftVerdict === true && { borderColor: '#22C55E', backgroundColor: '#22C55E22' },
                    leftVerdict === false && { borderColor: '#EF4444', backgroundColor: '#EF444422' },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {badge !== null ? (
                      <View style={[s.linkBadge, leftVerdict === true
                        ? { backgroundColor: '#22C55E' }
                        : leftVerdict === false ? { backgroundColor: '#EF4444' } : { backgroundColor: '#3B82F6' }]}>
                        <Text style={s.linkBadgeText}>{badge}</Text>
                      </View>
                    ) : null}
                    <Text style={[s.optText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>{fixArrows(pairs[li]?.left ?? '')}</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => tapRight(pos)}
                  style={[s.matchCell,
                    { borderColor: ctx.rt.text + '25' },
                    linkPos === pos && { borderColor: ctx.rt.text + '60' },
                    rightVerdict === true && { borderColor: '#22C55E', backgroundColor: '#22C55E22' },
                    rightVerdict === false && { borderColor: '#EF4444', backgroundColor: '#EF444422' },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {linkPos === pos ? (
                      <View style={[s.linkBadge, rightVerdict === true
                        ? { backgroundColor: '#22C55E' }
                        : rightVerdict === false ? { backgroundColor: '#EF4444' } : { backgroundColor: '#3B82F6' }]}>
                        <Text style={s.linkBadgeText}>{badge}</Text>
                      </View>
                    ) : null}
                    <Text style={[s.optText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>
                      {fixArrows(pairs[pairIdx]?.right ?? '')}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
          <Text style={[s.explain, { color: ctx.rt.text + '60' }]}>
            Тапни слева, потом справа — свяжутся одним номером. Повторный тап снимает связь.
          </Text>
        </View>
      )}

      {block.quizType === 'order' && orderItems.length >= 2 && (
        <View style={s.matchWrap}>
          {curOrder.map((itemIdx, pos) => (
            <Pressable
              key={pos}
              onPress={() => tapOrder(pos)}
              style={[s.matchRow,
                orderSel === pos && { borderColor: '#3B82F6', backgroundColor: '#3B82F622', borderWidth: 1, borderRadius: 10, padding: 4 },
                checked && orderOk && { borderColor: '#22C55E', borderWidth: 1, borderRadius: 10, padding: 4 },
                checked && !orderOk && { borderColor: '#EF4444', borderWidth: 1, borderRadius: 10, padding: 4 },
              ]}
            >
              <View style={s.orderPos}>
                <Text style={[s.orderPosText, { color: orderSel === pos ? '#FFF' : ctx.rt.text + '80', backgroundColor: orderSel === pos ? '#3B82F6' : 'transparent' }]}>
                  {pos + 1}
                </Text>
              </View>
              <Text style={[s.optText, { color: ctx.rt.text, fontSize: ctx.fontSize, flex: 1 }]}>
                {fixArrows(orderItems[itemIdx])}
              </Text>
              <Ionicons name="swap-vertical-outline" size={18} color={ctx.rt.text + '40'} />
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.explain, { color: ctx.rt.text + '60', flex: 1 }]}>
              Тапни два блока — поменяются местами
            </Text>
            <Pressable onPress={reshuffleOrder} hitSlop={8} style={s.miniBtn}>
              <Ionicons name="shuffle-outline" size={16} color={ctx.rt.text + '80'} />
              <Text style={{ color: ctx.rt.text + '80', fontSize: 13 }}>Ещё раз</Text>
            </Pressable>
          </View>
          {checked && !orderOk && (
            <View style={[s.callout, { borderColor: '#22C55E', backgroundColor: '#22C55E14' }]}>
              <Text style={[s.calloutLabel, { color: '#22C55E' }]}>Правильный порядок</Text>
              {orderItems.map((t, i) => (
                <Text key={i} style={{ color: ctx.rt.text, fontSize: ctx.fontSize * 0.92, marginTop: 2 }}>
                  {i + 1}. {t}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {(block.quizType === 'multi' || block.quizType === 'free' || block.quizType === 'numeric' || block.quizType === 'match' || block.quizType === 'order') && !checked && (
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
          ) : block.quizType === 'numeric' ? (
            <Text style={[s.verdictText, { color: numOk ? '#22C55E' : '#EF4444' }]}>
              {numOk ? '✓ Верно' : `✗ Правильно: ${block.answer ?? '—'}${block.unit ? ` ${block.unit}` : ''}`}
            </Text>
          ) : block.quizType === 'match' ? (
            <Text style={[s.verdictText, { color: matchOk ? '#22C55E' : '#EF4444' }]}>
              {matchOk ? '✓ Все пары верны' : '✗ Есть неверные пары'}
            </Text>
          ) : block.quizType === 'order' ? (
            <Text style={[s.verdictText, { color: orderOk ? '#22C55E' : '#EF4444' }]}>
              {orderOk ? '✓ Порядок верный' : '✗ Порядок неверный'}
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
  // Защита от кривых источников: режем пустые крайние колонки.
  let cols = head.map((_, j) => j);
  const colEmpty = (j: number) =>
    (head[j] ?? '').trim() === '' && rows.every((r) => (r[j] ?? '').trim() === '');
  while (cols.length > 1 && colEmpty(cols[0])) cols = cols.slice(1);
  while (cols.length > 1 && colEmpty(cols[cols.length - 1])) cols = cols.slice(0, -1);
  return (
    <View style={[s.cmpTable, { borderColor: cellBorder, marginVertical: 8 }]}>
      <View style={[s.cmpRow, { backgroundColor: ctx.rt.text + '08' }]}>
        {cols.map((j) => (
          <Text key={j} style={[s.cmpCell, s.cmpHead, { flex: 1, color: ctx.rt.text, borderColor: cellBorder, fontSize: ctx.fontSize * 0.85 }]}>{head[j]}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.cmpRow}>
          {cols.map((j) => (
            <Text key={j} style={[s.cmpCell, { flex: 1, color: ctx.rt.text, borderColor: cellBorder, fontSize: ctx.fontSize * 0.85 }]}>
              {r[j] ?? ''}
            </Text>
          ))}
        </View>
      ))}
    </View>
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
  cmpCell: { flex: 1, minWidth: 0, padding: 8, borderRightWidth: 1, borderBottomWidth: 0.5 },
  cmpHead: { fontWeight: '700' },
  clozeText: { lineHeight: 24 },
  matchWrap: { gap: 8, marginTop: 4 },
  matchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  matchCell: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 },
  linkBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  linkBadgeText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  orderNum: { fontSize: 14, fontWeight: '700', minWidth: 24 },
  orderPos: { minWidth: 28, alignItems: 'center', justifyContent: 'center' },
  orderPosText: { fontSize: 14, fontWeight: '700', minWidth: 26, height: 26, lineHeight: 26, textAlign: 'center', borderRadius: 13, overflow: 'hidden' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  askBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 8 },
  askBtnText: { fontSize: 14, fontWeight: '600' },
  chatMsg: { maxWidth: '88%', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
  sendBtn: { padding: 8 },
  orderBtn: { padding: 6 },
});
