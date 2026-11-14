// Лицо .smd — рендер блоков SmdDoc в RN.
// Контракт данных: SmdDoc { meta, blocks } (см. smdTypes.ts, парсер — Ares).
// Интерактив локален (useState на блок): движок/статистика не трогаем.

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { SmdTable } from './SmdTable';
import { splitTables } from './table';
import type { SmdBlock, SmdDoc } from './smdTypes';
import { chatIdFor } from './ai';
import { MathView } from './MathView';
import { SmdFigure } from './SmdFigure';
import { SmdImage } from './SmdImage';
import { SmdVideo } from './SmdVideo';
import { SmdPlot } from './SmdPlot';
import { repairText } from './textFix';

interface Ctx {
  mdStyle: any;
  rt: any;
  fontSize: number;
  fonts: MathFontsLike;
  rules?: any;
  docKey?: string;
}

export interface MathFontsLike {
  regular: string;
  italic: string;
  bold: string;
  mono: string;
}


// Семантические цвета блоков: в тёмной теме единственный акцент — белый,
// зелёный/красный остаются только как смысл «верно/неверно».
export function colors(rt: any) {
  const d = !!rt?.dark;
  return {
    blue: d ? '#FFFFFF' : '#007AFF',
    blueBg: d ? 'rgba(255,255,255,0.12)' : 'rgba(0,122,255,0.13)',
    ok: d ? '#30D158' : '#248A3D',
    okBg: d ? 'rgba(48,209,88,0.16)' : 'rgba(36,138,61,0.12)',
    no: d ? '#FF453A' : '#D70015',
    noBg: d ? 'rgba(255,69,58,0.16)' : 'rgba(215,0,21,0.10)',
    gold: d ? '#FFD60A' : '#B25000',
    goldBg: d ? 'rgba(255,214,10,0.14)' : 'rgba(178,80,0,0.10)',
    goldLine: d ? 'rgba(255,214,10,0.45)' : 'rgba(178,80,0,0.40)',
    mute: d ? '#98989F' : '#8E8E93',
    muteBg: d ? 'rgba(152,152,159,0.18)' : 'rgba(142,142,147,0.12)',
  };
}

export function SmdDocView({ doc, mdStyle, rt, fontSize, fonts, rules, onBlockLayout, docKey, onAskTask }: { doc: SmdDoc; mdStyle: any; rt: any; fontSize: number; fonts: MathFontsLike; rules?: any; onBlockLayout?: (index: number, y: number) => void; docKey?: string; onAskTask?: (t: { chatId: string; title: string; task: string; solution: string }) => void }) {
  const ctx: Ctx = { mdStyle, rt, fontSize, fonts, rules, docKey };
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

// --- задача: условие + решение + уход в ветку чата ---

function TaskAssist({ block, solution, ctx, docKey, onAskTask }: {
  block: Extract<SmdBlock, { type: 'task' }>; solution: string; ctx: Ctx; docKey?: string;
  onAskTask?: (t: { chatId: string; title: string; task: string; solution: string }) => void;
}) {
  const cl = colors(ctx.rt);
  const [showSolution, setShowSolution] = useState(false);
  const openBranch = () => {
    if (!onAskTask) return;
    onAskTask({
      chatId: chatIdFor(docKey ?? '', block.body),
      title: block.body.split('\n')[0].slice(0, 60) || 'Вопрос по задаче',
      task: block.body,
      solution,
    });
  };
  return (
    <View style={[s.block, { borderColor: ctx.rt.rule }]}>
      <View style={s.cardHead}>
        <Text style={[s.cardLabel, { color: ctx.rt.muted }]}>
          Задача
        </Text>
        <Text style={[s.cardMeta, { color: ctx.rt.muted }]}>
          {block.difficulty ? `${block.difficulty}` : ''}
          {block.difficulty && block.points ? ' · ' : ''}
          {block.points ? `${block.points} б.` : ''}
        </Text>
      </View>
      <RichText body={block.body} ctx={ctx} />

      {solution ? (
        <Pressable
          onPress={() => setShowSolution((v) => !v)}
          style={s.actionRow}
          hitSlop={4}
        >
          <Ionicons
            name={showSolution ? 'chevron-up' : 'reader-outline'}
            size={17}
            color={ctx.rt.text}
          />
          <Text style={[s.actionText, { color: ctx.rt.text }]}>
            {showSolution ? 'Скрыть решение' : 'Показать решение'}
          </Text>
        </Pressable>
      ) : null}

      {showSolution && solution ? (
        <View style={[s.solutionBody, { borderColor: ctx.rt.rule }]}>
          <RichText body={solution} ctx={ctx} />
        </View>
      ) : null}

      {onAskTask ? (
        <Pressable onPress={openBranch} style={s.actionRow} hitSlop={4}>
          <Ionicons name="chatbubble-ellipses-outline" size={17} color={cl.blue} />
          <Text style={[s.actionText, { color: cl.blue }]}>Спросить в ветке</Text>
        </Pressable>
      ) : null}
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
  o = o.replace(/\\d?frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)');
  o = o.replace(/\\([a-zA-Z]+)/g, (m, c) => TEX_CMD[c] ?? m.replace(/^\\/, ''));
  o = o.replace(/_\{([^}]+)\}/g, (_, g) => [...g].map((ch: string) => SUB[ch] ?? ch).join(''));
  o = o.replace(/\^\{([^}]+)\}/g, (_, g) => [...g].map((ch: string) => SUP[ch] ?? ch).join(''));
  o = o.replace(/_([0-9a-zA-Z+\-()])/g, (_, c) => SUB[c] ?? `_${c}`);
  o = o.replace(/\^([0-9n+\-])/g, (_, c) => SUP[c] ?? `^${c}`);
  return o;
}
// $..$ → читаемо, только если внутри похоже на формулу (иначе цены "$5 и $10" не трогаем).
// aggressive=true (чат ИИ): срывать парные $ всегда, брать многострочные.
export function prettifySpans(body: string, aggressive = false): string {
  const isMath = (inner: string) =>
    aggressive || /[\\_^]/.test(inner) || /[A-Za-z]_\d/.test(inner);
  // Сначала витринные $$..$$ (могут быть многострочными).
  let o = body.replace(/\$\$([\s\S]+?)\$\$/g, (m, inner) =>
    isMath(inner) || aggressive ? texToText(inner) : m);
  o = o.replace(/\$([^$]+?)\$/gs, (m, inner) =>
    isMath(inner) ? texToText(inner) : aggressive ? inner : m);
  return o;
}

function BlockView({ block, ctx, blocks, index, docKey, onAskTask }: {
  block: SmdBlock; ctx: Ctx; blocks?: SmdBlock[]; index?: number; docKey?: string;
  onAskTask?: (t: { chatId: string; title: string; task: string; solution: string }) => void;
}) {
  const solutionFor = (): string => {
    const own = block.type === 'task' ? (block.solutions ?? []).join('\n\n') : '';
    if (own) return own;
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
        <View style={[s.def, { borderLeftColor: ctx.rt.rule }]}>
          <Text style={[s.cardLabel, { color: ctx.rt.muted }]}>
            {block.term ?? 'Определение'}
          </Text>
          <RichText body={block.body} ctx={ctx} />
        </View>
      );
    case 'formula':
      return (
        <View style={[s.formula, { backgroundColor: ctx.rt.text + '0A', borderColor: ctx.rt.text + '20' }]}>
          <MathView
            source={block.body}
            size={ctx.fontSize * 1.1}
            color={ctx.rt.text}
            fonts={{ regular: ctx.fonts.regular, italic: ctx.fonts.italic, bold: ctx.fonts.bold }}
          />
        </View>
      );
    case 'figure':
      if (block.src) {
        return (
          <SmdImage
            src={block.src}
            alt={block.alt}
            caption={block.caption}
            docKey={ctx.docKey}
            color={ctx.rt.text}
            muted={ctx.rt.muted ?? ctx.rt.text + '80'}
          />
        );
      }
      if (!block.svg) return null;
      return (
        <SmdFigure
          svg={block.svg}
          caption={block.caption}
          color={ctx.rt.text}
          muted={ctx.rt.muted ?? ctx.rt.text + '80'}
          fonts={{ regular: ctx.fonts.regular, bold: ctx.fonts.bold }}
        />
      );
    case 'video':
      return (
        <SmdVideo
          src={block.src}
          poster={block.poster}
          caption={block.caption}
          docKey={ctx.docKey}
          color={ctx.rt.text}
          muted={ctx.rt.muted ?? ctx.rt.text + '80'}
        />
      );
    case 'plot':
      return (
        <SmdPlot
          exprs={block.exprs}
          xmin={block.xmin}
          xmax={block.xmax}
          ymin={block.ymin}
          ymax={block.ymax}
          title={block.title}
          color={ctx.rt.text}
          muted={ctx.rt.muted ?? ctx.rt.text + '80'}
          dark={!!ctx.rt.dark}
        />
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
        <View style={[s.block, { borderColor: ctx.rt.rule, backgroundColor: ctx.rt.fill }]}>
          <Text style={[s.cardLabel, { color: ctx.rt.muted }]}>
            Теорема{block.name ? ` · ${block.name}` : ''}
          </Text>
          <RichText body={block.body} ctx={ctx} />
        </View>
      );
    case 'proof':
      return <Reveal title="Доказательство" body={block.body} icon="document-text-outline" ctx={ctx} />;
    case 'summary':
      return (
        <View style={[s.block, { borderColor: ctx.rt.rule, backgroundColor: ctx.rt.fill }]}>
          <Text style={[s.cardLabel, { color: ctx.rt.muted }]}>Выжимка</Text>
          <RichText body={block.body} ctx={ctx} />
        </View>
      );
    case 'meta-links':
      return (
        <View>
          {block.links.map((l, i) => (
            <Text key={i} style={{ color: colors(ctx.rt).blue, fontSize: ctx.fontSize, marginBottom: 6 }}>
              {l.text}
            </Text>
          ))}
          {block.links.length === 0 ? <RichText body={block.body} ctx={ctx} /> : null}
        </View>
      );
    case 'unknown':
      return (
        <View style={[s.callout, { borderColor: colors(ctx.rt).mute, backgroundColor: ctx.rt.text + '05' }]}>
          <Text style={[s.calloutLabel, { color: colors(ctx.rt).mute }]}>:::{block.rawType} (неизвестный тип)</Text>
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
          <RichText body={body} ctx={ctx} />
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
          <Text style={[s.cardMark, { color: mark === 'know' ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
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
            style={[s.cardBtn, { borderColor: colors(ctx.rt).no }, mark === 'dont' && { backgroundColor: colors(ctx.rt).noBg }]}
          >
            <Text style={[s.cardBtnText, { color: colors(ctx.rt).no }]}>Не знаю</Text>
          </Pressable>
          <Pressable
            onPress={() => setMark('know')}
            style={[s.cardBtn, { borderColor: colors(ctx.rt).ok }, mark === 'know' && { backgroundColor: colors(ctx.rt).okBg }]}
          >
            <Text style={[s.cardBtnText, { color: colors(ctx.rt).ok }]}>Знаю</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- инлайн-подсветка: ==..== и {{cN::..}} внутри theory/def (тап открывает) ---

/** $$..$$ и \[..\] на верхнем уровне режем отдельно: это блочная формула, её рисуем MathView. */
function splitDisplayMath(body: string): { text?: string; math?: string }[] {
  const out: { text?: string; math?: string }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    out.push({ math: (m[1] ?? m[2] ?? '').trim() });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out.length > 0 ? out : [{ text: body }];
}

function MathBlock({ src, ctx }: { src: string; ctx: Ctx }) {
  return (
    <View style={[s.mathBlock, { borderColor: ctx.rt.text + '1A', backgroundColor: ctx.rt.text + '06' }]}>
      <MathView
        source={src}
        size={ctx.fontSize * 1.08}
        color={ctx.rt.text}
        fonts={{ regular: ctx.fonts.regular, italic: ctx.fonts.italic, bold: ctx.fonts.bold }}
      />
    </View>
  );
}

function RichText({ body, ctx }: { body: string; ctx: Ctx }) {
  const segs = splitDisplayMath(body);
  if (!segs.some((x) => x.math !== undefined)) {
    return <BodySegments body={body} ctx={ctx} />;
  }
  return (
    <View>
      {segs.map((seg, i) => {
        if (seg.math !== undefined) return <MathBlock key={i} src={seg.math} ctx={ctx} />;
        return seg.text && seg.text.trim() ? <BodySegments key={i} body={seg.text} ctx={ctx} /> : null;
      })}
    </View>
  );
}

/** Тело блока → абзацы markdown + собственные таблицы (GFM внутри theory/def). */
function BodySegments({ body, ctx }: { body: string; ctx: Ctx }) {
  const segs = useMemo(() => splitTables(body), [body]);
  if (segs.length === 1 && segs[0].kind === 'text') {
    return <InlineRich text={repairText(prettifySpans(body))} ctx={ctx} />;
  }
  return (
    <View>
      {segs.map((seg, i) =>
        seg.kind === 'table' ? (
          <SmdTable
            key={i}
            table={seg.table}
            rt={ctx.rt}
            fontSize={ctx.fontSize}
            boldFamily={ctx.fonts.bold}
            italicFamily={ctx.fonts.italic}
          />
        ) : (
          <InlineRich key={i} text={repairText(prettifySpans(seg.text))} ctx={ctx} />
        ),
      )}
    </View>
  );
}

const TEXT_LIKE = (c: any) =>
  typeof c === 'string' ||
  typeof c === 'number' ||
  (React.isValidElement(c) && (c.type as any) === Text);

/**
 * Выделение живёт на абзаце/заголовке: тогда жирный и курсив внутри абзаца
 * выделяются вместе с ним. Абзац с картинкой (View внутри) оставляем View —
 * Android не умеет вкладывать View в Text.
 */
export function selectableRules(style: any, extra?: any, media?: { docKey?: string; color: string; muted: string }) {
  const wrap = (key: string) => (node: any, children: any[]) =>
    children.every(TEXT_LIKE) ? (
      <Text key={node.key} selectable style={style?.[key]}>
        {children}
      </Text>
    ) : (
      <View key={node.key} style={style?.[key]}>
        {children}
      </View>
    );
  return {
    paragraph: wrap('paragraph'),
    heading1: wrap('heading1'),
    heading2: wrap('heading2'),
    heading3: wrap('heading3'),
    heading4: wrap('heading4'),
    heading5: wrap('heading5'),
    heading6: wrap('heading6'),
    // ![](img/x.png) в теле — тот же просмотрщик, что у :::figure
    image: (node: any) => (
      <SmdImage
        key={node.key}
        src={node.attributes?.src ?? ''}
        alt={node.attributes?.alt}
        docKey={media?.docKey}
        color={media?.color ?? '#000000'}
        muted={media?.muted ?? '#8E8E93'}
      />
    ),
    ...(extra ?? {}),
  };
}

/** Тот же сегментер таблиц, но для .md/страниц: без .smd-контекста. */
export function SegmentedMarkdown({ text, mdStyle, rules, rt, fontSize, boldFamily, italicFamily }: {
  text: string; mdStyle: any; rules?: any; rt: any; fontSize: number;
  boldFamily?: string; italicFamily?: string;
}) {
  const segs = useMemo(() => splitTables(text), [text]);
  const mdRules = useMemo(() => selectableRules(mdStyle, rules), [mdStyle, rules]);
  return (
    <View>
      {segs.map((seg, i) =>
        seg.kind === 'table' ? (
          <SmdTable key={i} table={seg.table} rt={rt} fontSize={fontSize} boldFamily={boldFamily} italicFamily={italicFamily} />
        ) : (
          <Markdown key={i} style={mdStyle} rules={mdRules}>
            {repairText(prettifySpans(seg.text))}
          </Markdown>
        ),
      )}
    </View>
  );
}

function InlineRich({ text, ctx }: { text: string; ctx: Ctx }) {
  const parts = splitCloze(text);
  const rules = useMemo(
    () => selectableRules(ctx.mdStyle, ctx.rules, { docKey: ctx.docKey, color: ctx.rt.text, muted: ctx.rt.muted ?? ctx.rt.text + '80' }),
    [ctx.mdStyle, ctx.rules, ctx.docKey, ctx.rt],
  );
  if (!parts.some((p) => p.hidden)) {
    return (
      <Markdown style={ctx.mdStyle} rules={rules}>
        {text}
      </Markdown>
    );
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
              ? { color: colors(ctx.rt).ok, fontWeight: '700' }
              : { backgroundColor: colors(ctx.rt).muteBg, color: ctx.rt.text }}
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
    <View style={[s.callout, { borderColor: colors(ctx.rt).mute, backgroundColor: colors(ctx.rt).muteBg }]}>
      <View style={s.cardHead}>
        <Ionicons name="eye-off-outline" size={16} color={colors(ctx.rt).mute} />
        <Text style={[s.calloutLabel, { color: colors(ctx.rt).mute }]}>Пропуск · тап — открыть</Text>
      </View>
      <Text style={[s.clozeText, { color: ctx.rt.text, fontSize: ctx.fontSize }]}>
        {parts.map((p, i) => p.hidden ? (
          <Text
            key={i}
            onPress={() => setOpen((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
            style={open.includes(i)
              ? { color: colors(ctx.rt).ok, fontWeight: '700' }
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
              sel.includes(i) && { borderColor: colors(ctx.rt).blue, backgroundColor: colors(ctx.rt).blueBg },
              r === true && { borderColor: colors(ctx.rt).ok, backgroundColor: colors(ctx.rt).okBg },
              r === false && { borderColor: colors(ctx.rt).no, backgroundColor: colors(ctx.rt).noBg },
            ]}
          >
            <Ionicons
              name={block.quizType === 'single'
                ? (sel.includes(i) ? 'radio-button-on' : 'radio-button-off')
                : (sel.includes(i) ? 'checkbox' : 'square-outline')}
              size={18}
              color={r === true ? colors(ctx.rt).ok : r === false ? colors(ctx.rt).no : ctx.rt.text + '80'}
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
                    selL === li && { borderColor: colors(ctx.rt).blue, backgroundColor: colors(ctx.rt).blueBg },
                    linkPos !== undefined && selL !== li && { borderColor: ctx.rt.text + '60' },
                    leftVerdict === true && { borderColor: colors(ctx.rt).ok, backgroundColor: colors(ctx.rt).okBg },
                    leftVerdict === false && { borderColor: colors(ctx.rt).no, backgroundColor: colors(ctx.rt).noBg },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {badge !== null ? (
                      <View style={[s.linkBadge, leftVerdict === true
                        ? { backgroundColor: colors(ctx.rt).ok }
                        : leftVerdict === false ? { backgroundColor: colors(ctx.rt).no } : { backgroundColor: colors(ctx.rt).blue }]}>
                        <Text style={[s.linkBadgeText, { color: ctx.rt.bg }]}>{badge}</Text>
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
                    rightVerdict === true && { borderColor: colors(ctx.rt).ok, backgroundColor: colors(ctx.rt).okBg },
                    rightVerdict === false && { borderColor: colors(ctx.rt).no, backgroundColor: colors(ctx.rt).noBg },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {linkPos === pos ? (
                      <View style={[s.linkBadge, rightVerdict === true
                        ? { backgroundColor: colors(ctx.rt).ok }
                        : rightVerdict === false ? { backgroundColor: colors(ctx.rt).no } : { backgroundColor: colors(ctx.rt).blue }]}>
                        <Text style={[s.linkBadgeText, { color: ctx.rt.bg }]}>{badge}</Text>
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
                orderSel === pos && { borderColor: colors(ctx.rt).blue, backgroundColor: colors(ctx.rt).blueBg, borderWidth: 1, borderRadius: 10, padding: 4 },
                checked && orderOk && { borderColor: colors(ctx.rt).ok, borderWidth: 1, borderRadius: 10, padding: 4 },
                checked && !orderOk && { borderColor: colors(ctx.rt).no, borderWidth: 1, borderRadius: 10, padding: 4 },
              ]}
            >
              <View style={s.orderPos}>
                <Text style={[s.orderPosText, { color: orderSel === pos ? ctx.rt.bg : ctx.rt.text + '80', backgroundColor: orderSel === pos ? colors(ctx.rt).blue : 'transparent' }]}>
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
            <View style={[s.callout, { borderColor: colors(ctx.rt).ok, backgroundColor: colors(ctx.rt).okBg }]}>
              <Text style={[s.calloutLabel, { color: colors(ctx.rt).ok }]}>Правильный порядок</Text>
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
        <Pressable onPress={() => setChecked(true)} style={[s.checkBtn, { borderColor: ctx.rt.rule }]}>
          <Text style={[s.checkBtnText, { color: ctx.rt.text }]}>Проверить</Text>
        </Pressable>
      )}
      {block.quizType === 'single' && sel.length > 0 && !checked && (
        <Pressable onPress={() => setChecked(true)} style={[s.checkBtn, { borderColor: ctx.rt.rule }]}>
          <Text style={[s.checkBtnText, { color: ctx.rt.text }]}>Проверить</Text>
        </Pressable>
      )}

      {checked && (
        <View style={s.verdict}>
          {block.quizType === 'free' ? (
            <Text style={[s.verdictText, { color: freeOk ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
              {freeOk ? '✓ Верно' : `✗ Правильно: ${block.answer ?? '—'}`}
            </Text>
          ) : block.quizType === 'numeric' ? (
            <Text style={[s.verdictText, { color: numOk ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
              {numOk ? '✓ Верно' : `✗ Правильно: ${block.answer ?? '—'}${block.unit ? ` ${block.unit}` : ''}`}
            </Text>
          ) : block.quizType === 'match' ? (
            <Text style={[s.verdictText, { color: matchOk ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
              {matchOk ? '✓ Все пары верны' : '✗ Есть неверные пары'}
            </Text>
          ) : block.quizType === 'order' ? (
            <Text style={[s.verdictText, { color: orderOk ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
              {orderOk ? '✓ Порядок верный' : '✗ Порядок неверный'}
            </Text>
          ) : block.quizType === 'single' ? (
            <Text style={[s.verdictText, { color: opts[sel[0]]?.correct ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
              {opts[sel[0]]?.correct ? '✓ Верно' : '✗ Неверно'}
            </Text>
          ) : (
            <Text style={[s.verdictText, { color: multiOk ? colors(ctx.rt).ok : colors(ctx.rt).no }]}>
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

const calloutStyle = (rt: any): Record<string, { color: string; icon: any; label: string }> => ({
  'mistake': { color: colors(rt).no, icon: 'alert-circle-outline', label: 'Ошибка' },
  'exam-tip': { color: colors(rt).gold, icon: 'star-outline', label: 'К экзамену' },
  'intuition': { color: colors(rt).blue, icon: 'bulb-outline', label: 'Интуиция' },
});

function CalloutBlock({ kind, body, ctx }: { kind: string; body: string; ctx: Ctx }) {
  const st = calloutStyle(ctx.rt)[kind] ?? { color: colors(ctx.rt).mute, icon: 'information-circle-outline', label: kind };
  return (
    <View style={[s.callout, { borderLeftColor: st.color }]}>
      <View style={s.cardHead}>
        <Ionicons name={st.icon} size={16} color={st.color} />
        <Text style={[s.calloutLabel, { color: st.color }]}>{st.label}</Text>
      </View>
      <RichText body={body} ctx={ctx} />
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
              color={on ? colors(ctx.rt).ok : ctx.rt.text + '60'}
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

// --- compare-table / :::table: та же нативная таблица, что и GFM в теле ---

function CompareTable({ head, rows, ctx }: { head: string[]; rows: string[][]; ctx: Ctx }) {
  const table = { head, rows, align: head.map(() => 'left' as const) };
  return (
    <SmdTable
      table={table}
      rt={ctx.rt}
      fontSize={ctx.fontSize}
      boldFamily={ctx.fonts.bold}
      italicFamily={ctx.fonts.italic}
    />
  );
}

const s = StyleSheet.create({
  meta: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 16, marginBottom: 20 },
  metaTitle: { fontWeight: '700', marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },

  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, marginVertical: 12 },
  def: { borderLeftWidth: 2, paddingLeft: 16, paddingVertical: 4, marginVertical: 12 },
  defTerm: { fontWeight: '700', marginBottom: 6 },
  formula: { paddingVertical: 12, marginVertical: 8, alignItems: 'center' },
  mathBlock: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12, marginVertical: 8,
  },

  reveal: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, marginVertical: 12, overflow: 'hidden' },
  revealHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 },
  revealTitle: { flex: 1, fontWeight: '600' },
  revealHint: { fontSize: 12 },
  revealBody: { paddingHorizontal: 16, paddingBottom: 16 },

  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, marginVertical: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, flex: 1 },
  cardMeta: { fontSize: 12, fontWeight: '600' },
  cardMark: { fontSize: 12, fontWeight: '700' },
  cardText: { lineHeight: 24, marginBottom: 4 },
  cardBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cardBtn: { flex: 1, borderWidth: 1, borderRadius: 10, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  cardBtnText: { fontSize: 14, fontWeight: '700' },

  solutionBody: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 4 },
  actionText: { fontSize: 14, fontWeight: '600' },

  quiz: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, marginVertical: 12 },
  quizQ: { fontWeight: '600', marginBottom: 12, lineHeight: 24 },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, marginBottom: 8,
  },
  optText: { flex: 1, lineHeight: 21 },
  freeInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, marginBottom: 12 },
  checkBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderBottomWidth: 1 },
  checkBtnText: { fontSize: 15, fontWeight: '600' },
  verdict: { marginTop: 12 },
  verdictText: { fontSize: 15, fontWeight: '700' },
  explain: { marginTop: 6, lineHeight: 19 },

  callout: { borderLeftWidth: 2, paddingLeft: 16, paddingVertical: 4, marginVertical: 12 },
  calloutLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 },

  checklist: { paddingVertical: 4, marginVertical: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 4 },
  checkText: { flex: 1, lineHeight: 21 },

  clozeText: { lineHeight: 24 },
  matchWrap: { gap: 8, marginTop: 4 },
  matchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  matchCell: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, justifyContent: 'center', minHeight: 48 },
  linkBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  linkBadgeText: { fontSize: 13, fontWeight: '700' },
  orderNum: { fontSize: 14, fontWeight: '700', minWidth: 24 },
  orderPos: { minWidth: 28, alignItems: 'center', justifyContent: 'center' },
  orderPosText: { fontSize: 14, fontWeight: '700', minWidth: 26, height: 26, lineHeight: 26, textAlign: 'center', borderRadius: 13, overflow: 'hidden' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 44 },
  orderBtn: { padding: 6 },
});

// Текст ответа помощника в чате — тем же движком, что и тело .smd:
// дроби/корни/степени нативные, markdown, списки. Без облачка и границ.
export function RichAnswer({
  body,
  mdStyle,
  rt,
  fontSize,
  fonts,
}: {
  body: string;
  mdStyle: any;
  rt: any;
  fontSize: number;
  fonts: MathFontsLike;
}) {
  const ctx: Ctx = { mdStyle, rt, fontSize, fonts };
  return <RichText body={body} ctx={ctx} />;
}
