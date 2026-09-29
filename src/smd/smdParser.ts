// Supreader engine — парсер .smd v1 → SmdDoc.
// Строго под интерфейс src/smd/smdTypes.ts (контракт с лицом keyz-smd-ui).
// Чистый TS, без RN-зависимостей — гоняется и под node (тесты), и в Hermes.
//
// Покрытие SPEC.md: frontmatter, :::блоки всех типов, Q::A, ==cloze== (инлайн,
// остаётся в теле theory/unknown — отдельного слота в SmdBlock нет), [!SPOILER]
// (блочный `> [!SPOILER]` и инлайн `[!SPOILER ..]` — инлайн остаётся в теле),
// заголовки/списки/код/$math$ (сохраняются как markdown внутри theory).
//
// Типы SPEC маппятся: theorem/proof/summary/meta-links — свои типы SmdBlock
// (proof.for и ссылки meta-links сохраняются для навигации), example/
// figure/occlude → theory (fail-open: лицо рисует markdown/картинку),
// card-bi → две card, numeric/match/order → quiz с quizType,
// task → theory + solution. Неизвестный type → unknown + warning.

import type { SmdBlock, SmdDoc, SmdMeta } from './smdTypes';

export interface SmdParseWarning {
  line?: number;
  col?: number;
  message: string;
}

export interface SmdParseResult {
  doc: SmdDoc;
  warnings: SmdParseWarning[];
}

type Attrs = Record<string, string | boolean>;

// --- frontmatter ---

const FM_RE = /^\uFEFF?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitListValue(v: string): string[] {
  // "[a, b]" или "a, b" с уважением к кавычкам.
  let t = v.trim();
  if (t.startsWith('[') && t.endsWith(']')) t = t.slice(1, -1);
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
    } else if (c === ',') {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
    } else {
      cur += c;
    }
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

function stripInlineComment(v: string): string {
  // Обрезать ' # комментарий' вне кавычек (YAML-комментарий после значения).
  let q: string | null = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
    } else if (c === '#' && i > 0 && /\s/.test(v[i - 1])) {
      return v.slice(0, i).trimEnd();
    }
  }
  return v;
}

function parseFrontmatter(raw: string): Record<string, string | string[]> {
  const fm: Record<string, string | string[]> = {};
  let lastKey: string | null = null;
  for (const line of raw.split('\n')) {
    const mList = /^\s*-\s+(.+)$/.exec(line);
    if (mList && lastKey) {
      const prev = fm[lastKey];
      const arr = Array.isArray(prev) ? prev : [];
      arr.push(stripQuotes(stripInlineComment(mList[1])));
      fm[lastKey] = arr;
      continue;
    }
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const key = line.slice(0, ci).trim();
    if (!key || /^\s/.test(line) && lastKey && !/^[\w-]+$/.test(key)) continue;
    const val = stripInlineComment(line.slice(ci + 1).trim());
    lastKey = key;
    if (val === '' || val === 'null' || val === '~') {
      fm[key] = '';
    } else {
      fm[key] = val;
    }
  }
  return fm;
}

function strVal(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(', ');
  return (v ?? '').trim();
}

function listVal(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim() !== '') return splitListValue(v);
  return [];
}

function titleFromUri(uri?: string): string {
  if (!uri) return 'Конспект';
  const base = (uri.split('/').pop() ?? '').replace(/\.smd$/i, '');
  try {
    return decodeURIComponent(base) || 'Конспект';
  } catch {
    return base || 'Конспект';
  }
}

function buildMeta(fm: Record<string, string | string[]>, uri?: string): SmdMeta {
  const examRaw = stripQuotes(strVal(fm['exam-date'] ?? fm['exam_date'] ?? fm['examDate']));
  return {
    title: stripQuotes(strVal(fm['title'])) || titleFromUri(uri),
    subject: stripQuotes(strVal(fm['subject'])) || undefined,
    tags: listVal(fm['tags']),
    level: stripQuotes(strVal(fm['level'])) || 'baza',
    examDate: examRaw || null,
  };
}

// --- атрибуты :::type{#id .cls key="v" flag} ---

function parseAttrs(s: string): Attrs {
  const attrs: Attrs = {};
  let t = s.trim();
  if (t.startsWith('{') && t.endsWith('}')) t = t.slice(1, -1);
  // Терпимость к нестандарту (demo.smd): title=Два слова без кавычек —
  // жадно забирает следующие слова без «=» (ключевые attrs идут как key=...).
  for (const key of ['title', 'caption', 'alt', 'name', 'term', 'explain']) {
    const g = new RegExp(`\\b${key}=("[^"]*"|'[^']*'|[^\\s"'}]+(?:\\s+[^\\s=}"']+)*)`);
    const gm = g.exec(t);
    if (gm) {
      let v = gm[1].trim();
      const q = stripQuotes(v);
      attrs[key] = q !== v || !/ /.test(v) ? q : v;
      t = t.replace(gm[0], ' ');
    }
  }
  const re = /#([\w-]+)|\.([\w-]+)|([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    if (m[1]) attrs.id = m[1];
    else if (m[2]) continue; // .class — игнорируем
    else if (m[3]) {
      const v = m[4] ?? m[5] ?? m[6];
      attrs[m[3]] = v ?? true;
    }
  }
  return attrs;
}

function stripMathWrap(s: string): string {
  let t = s.trim();
  // $$...$$, \[...\], \(...\), $...$ — срезаем внешние обёртки (KaTeX не тащим).
  const pairs: [string, string][] = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)']];
  for (const [a, b] of pairs) {
    if (t.startsWith(a) && t.endsWith(b) && t.length > a.length + b.length) {
      t = t.slice(a.length, t.length - b.length).trim();
    }
  }
  if (t.startsWith('$') && t.endsWith('$') && t.length > 2 && !t.startsWith('$$')) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function attrStr(a: Attrs, key: string): string | undefined {
  const v = a[key];
  return typeof v === 'string' ? v : undefined;
}

// --- fences ---

const OPEN_RE = /^:::(\w[\w-]*)\s*(.*)$/;
const CLOSE_RE = /^:::\s*$/;
const CODE_FENCE_RE = /^```/;

interface Fence {
  type: string;
  attrs: Attrs;
  body: string;
  line: number;
  col: number;
}

interface ProofRef {
  ref: string;
  line: number;
  col: number;
}

// --- Q::A ---

const QA_LINE_RE = /^(.+?)::(.+)$/;
const QA_ESC = '\u0000';
const QA_LIST_RE = /^(\s*[-*+]\s+|\s*\d+[.)]\s+)(.*)$/;
const QA_SKIP_PREFIX_RE = /^\s*(#{1,6}\s+|>\s*|```|\||\s*\d+[.)]\s+)/;
const QA_CODE_SCOPE_RE = /^\w+::\w/;
const QA_CODE_CHARS_RE = /[<>(){};\[\]#]/;

function tryQA(line: string): { q: string; a: string } | null {
  const s = line.trim();
  if (!s || !s.includes('::')) return null;
  if (s.includes('://')) return null; // ссылки не трогаем
  if (s.includes('{{') || s.includes('}}')) return null;
  if (s.includes('`')) return null; // инлайн-код (`a == b`) — не Q::A/cloze
  if (QA_SKIP_PREFIX_RE.test(line)) return null;
  if (/^\s*[-*]\s*\[[ xX]\]\s*/.test(line)) return null; // чекбоксы quiz
  // C++-скоупы: std::vector<int>, std::vector (слово::слово + кодовые символы
  // либо повторный :: без пробелов — не пара Вопрос::Ответ).
  if (QA_CODE_SCOPE_RE.test(s) && QA_CODE_CHARS_RE.test(s)) return null;
  if (/^\w+::\w+$/.test(s)) return null; // голый std::vector
  // '- Термин::Опр' — маркер списка срезается, front без дефиса.
  let work = s;
  const lm = QA_LIST_RE.exec(s);
  if (lm) {
    work = (lm[2] ?? '').trim();
    if (!work || !work.includes('::')) return null;
    if (/^\s*[-*]\s*\[[ xX]\]\s*/.test(work)) return null;
  }
  // Экранирование \:: — не разделитель.
  work = work.replace(/\\::/g, QA_ESC);
  if (work.includes('://')) return null;
  const m = QA_LINE_RE.exec(work);
  if (!m) return null;
  const rawQ = m[1].trim();
  let q = rawQ.replace(new RegExp(QA_ESC, 'g'), '::');
  const a = m[2].trim().replace(new RegExp(QA_ESC, 'g'), '::');
  if (!q || !a) return null;
  if (rawQ.replace(new RegExp(QA_ESC, 'g'), '').includes('::')) return null; // второй :: в вопросе
  if (q.includes('://') || a.includes('://')) return null;
  // '$5 и $10' — цены, не повод; '$' в вопросе блокирует (формула),
  // '$' в ответе разрешён: 'Формула::$E=mc^2$' — валидная Q::A.
  if (q.includes('$') || q.includes('{{') || q.includes('}}') || q.includes('`')) return null;
  return { q, a };
}

function splitCard(text: string): { front: string; back: string } | null {
  // "Вопрос | Ответ" (пробелы вокруг | обязательны) либо Q::A.
  const bar = text.search(/\s\|\s/);
  if (bar >= 0) {
    const front = text.slice(0, bar).trim().replace(/\\::/g, '::');
    const back = text.slice(bar).replace(/^\s*\|\s*/, '').trim().replace(/\\::/g, '::');
    if (front && back) return { front, back };
  }
  const qa = tryQA(text);
  if (qa) return { front: qa.q, back: qa.a };
  return null;
}

// --- таблицы / списки ---

function parseMdTable(body: string): { head: string[]; rows: string[][] } | null {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.includes('|'));
  const data = lines.filter((l) => !/^[\s|:~-]+$/.test(l));
  if (data.length === 0) return null;
  const cells = (l: string): string[] => {
    let t = l.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    return t.split('|').map((c) => c.trim());
  };
  const head = cells(data[0]);
  const cols = head.length;
  const rows = data.slice(1).map((l) => {
    const r = cells(l);
    while (r.length < cols) r.push('');
    return r.slice(0, cols);
  });
  return { head, rows };
}

const OPT_RE = /^\s*[-*]\s*\[([ xX])\]\s*(.+)$/;
const CHECK_RE = /^\s*(?:[-*]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s+)(.+)$/;
const ANSWER_RE = /^>\s*answer:\s*(.+)$/;

function stripListMarker(line: string): string {
  const m = CHECK_RE.exec(line);
  return (m ? m[1] : line).trim();
}

// --- fence → SmdBlock[] ---

function fenceToBlocks(f: Fence, warn: (msg: string, col?: number) => void): SmdBlock[] {
  const type = f.type.toLowerCase();
  const a = f.attrs;
  const body = f.body.trim();
  const id = attrStr(a, 'id');

  switch (type) {
    case 'theory':
      return [{ type: 'theory', ...(id ? { id } : {}), body }];
    case 'def': {
      let term = attrStr(a, 'term');
      if (!term) {
        const m = /\*\*(.+?)\*\*/.exec(body);
        if (m) term = m[1].trim();
      }
      return [{ type: 'def', ...(term ? { term } : {}), body }];
    }
    case 'theorem': {
      const name = attrStr(a, 'name');
      return [{ type: 'theorem', ...(id ? { id } : {}), ...(name ? { name } : {}), body }];
    }
    case 'proof': {
      const forId = attrStr(a, 'for');
      return [{ type: 'proof', ...(forId ? { for: forId } : {}), body }];
    }
    case 'example':
      return [{ type: 'theory', ...(id ? { id } : {}), body: `**Пример**\n\n${body}` }];
    case 'formula':
      return [{ type: 'formula', body: stripMathWrap(body) }];
    case 'compare-table': {
      const t = parseMdTable(body);
      if (!t) {
        warn(`:::compare-table без markdown-таблицы в теле (строка ${f.line})`);
        return [{ type: 'theory', body }];
      }
      return [{ type: 'compare-table', head: t.head, rows: t.rows }];
    }
    case 'figure': {
      const src = attrStr(a, 'src') ?? '';
      const alt = attrStr(a, 'alt') ?? 'рисунок';
      const caption = attrStr(a, 'caption') ?? '';
      if (!src) {
        warn(`:::figure без src (строка ${f.line})`);
        return [{ type: 'theory', body }];
      }
      return [{ type: 'theory', body: `![${alt}](${src})${caption ? `\n*${caption}*` : ''}` }];
    }
    case 'spoiler':
      return [{ type: 'spoiler', ...(attrStr(a, 'title') ? { title: attrStr(a, 'title')! } : {}), body }];
    case 'solution':
      return [{ type: 'solution', body }];
    case 'card': {
      const out: SmdBlock[] = [];
      for (const line of body.split('\n')) {
        const t = line.replace(/^\s*[-*+]\s+/, '').trim();
        if (!t) continue;
        const c = splitCard(t);
        if (c) out.push({ type: 'card', front: c.front, back: c.back });
      }
      if (out.length === 0) {
        warn(`:::card без разделителя « | » или «::» (строка ${f.line})`);
        return [{ type: 'unknown', rawType: 'card', body }];
      }
      return out;
    }
    case 'cloze':
      return [{ type: 'cloze', body }];
    case 'card-bi': {
      const pair = splitCard(body.replace(/\s*\n\s*/g, ' '));
      if (!pair) {
        warn(`:::card-bi без разделителя « | » (строка ${f.line})`);
        return [{ type: 'unknown', rawType: 'card-bi', body }];
      }
      const fwd = pair.front.replace(/^(прямо|front)\s*:\s*/i, '').trim();
      const bwd = pair.back.replace(/^(обратно|back)\s*:\s*/i, '').trim();
      // Одна двусторонняя карточка (переворот даёт оба направления).
      return [{ type: 'card', front: fwd || pair.front, back: bwd || pair.back }];
    }
    case 'occlude': {
      const src = attrStr(a, 'src') ?? '';
      const boxes = attrStr(a, 'boxes') ?? '';
      // fail-open в theory (не unknown): лицо рисует картинку+подпись.
      return [{
        type: 'theory',
        body: src ? `![перекрытая схема](${src})${boxes ? `\nЗакрытые области: ${boxes}` : ''}${body && body !== '' ? `\n\n${body}` : ''}` : (body || '*Перекрытая схема*'),
      }];
    }
    case 'quiz':
      return parseQuiz(a, body, f.line, f.col, warn);
    case 'task': {
      // solution только внутри task — вынимаем вложенный :::solution.
      const { text, solutions } = extractSolutions(body, warn);
      const diff = attrStr(a, 'difficulty');
      const pts = attrStr(a, 'points');
      const out: SmdBlock[] = [];
      if (text.trim()) out.push({
        type: 'task',
        ...(diff ? { difficulty: diff } : {}),
        ...(pts ? { points: pts } : {}),
        body: text.trim(),
      });
      for (const s of solutions) out.push({ type: 'solution', body: s });
      if (out.length === 0) return [{ type: 'task', body }];
      return out;
    }
    case 'callout': {
      const rawKind = attrStr(a, 'kind') ?? 'mistake';
      if (rawKind !== 'mistake' && rawKind !== 'exam-tip' && rawKind !== 'intuition') {
        warn(`:::callout: неизвестный kind "${rawKind}" — взят "mistake"`, f.col);
        return [{ type: 'callout', kind: 'mistake', body }];
      }
      return [{ type: 'callout', kind: rawKind as 'mistake' | 'exam-tip' | 'intuition', body }];
    }
    case 'summary':
      return [{ type: 'summary', body }];
    case 'checklist': {
      const items = body.split('\n').map((l) => stripListMarker(l)).map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return [{ type: 'theory', body }];
      return [{ type: 'checklist', items }];
    }
    case 'meta-links': {
      const links: { text: string; href: string }[] = [];
      for (const ln of body.split('\n')) {
        const t = ln.trim().replace(/^(\s*[-*+]\s+|\s*\d+[.)]\s+)/, '').trim();
        const m = /^\[(.+?)\]\((.+?)\)/.exec(t);
        if (m) links.push({ text: m[1].trim(), href: m[2].trim() });
      }
      return [{ type: 'meta-links', links, body }];
    }
    default:
      // Неизвестный type → fail-open: показываем тело, лицо помечает тип.
      warn(`неизвестный тип блока :::${f.type} (строка ${f.line}) — показан как есть`);
      return [{ type: 'unknown', rawType: f.type, body }];
  }
}

function parseQuiz(a: Attrs, body: string, line: number, col: number, warn: (msg: string, col?: number) => void): SmdBlock[] {
  const attrType = (attrStr(a, 'type') ?? '').toLowerCase();
  const lines = body.split('\n');
  const options: { text: string; correct: boolean }[] = [];
  const qLines: string[] = [];
  let answer: string | undefined;
  let tol: number | undefined;
  let unit: string | undefined;
  let accept: string[] | undefined;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const om = OPT_RE.exec(line);
    if (om) {
      options.push({ text: om[2].trim(), correct: om[1].toLowerCase() === 'x' });
      continue;
    }
    const am = ANSWER_RE.exec(t);
    if (am) {
      const parts = am[1].split('|').map((s) => s.trim()).filter(Boolean);
      answer = stripQuotes(parts[0] ?? '');
      for (const p of parts.slice(1)) {
        const um = /^unit\s*:\s*(.+)$/i.exec(p);
        if (um) { unit = stripQuotes(um[1]); continue; }
        const tm = /^tol(?:erance)?\s*:\s*(.+)$/i.exec(p);
        if (tm) { const n = parseFloat(stripQuotes(tm[1]).replace(',', '.')); if (!Number.isNaN(n)) tol = n; continue; }
        const acm = /^accept\s*:\s*(.+)$/i.exec(p);
        if (acm) {
          accept = splitListValue(stripQuotes(acm[1])).map((s) => stripQuotes(s).trim()).filter(Boolean);
          // accept в кавычках через «;» — тоже делим.
          if (accept.length === 1 && accept[0].includes(';')) {
            accept = accept[0].split(';').map((s) => stripQuotes(s.trim())).filter(Boolean);
          }
          continue;
        }
      }
      continue;
    }
    qLines.push(t);
  }
  const pointsRaw = attrStr(a, 'points');
  const points = pointsRaw !== undefined ? Math.max(1, parseInt(pointsRaw, 10) || 1) : 1;
  const explain = attrStr(a, 'explain');
  const qText = qLines.join('\n').trim();
  const ex = explain ? { explain } : {};

  // --- numeric: :::quiz{type="numeric"} + "> answer: 6 | tol: 0 | unit: ..." ---
  if (attrType === 'numeric') {
    if (answer === undefined) {
      warn(`:::quiz numeric без answer (строка ${line}) — показан как есть`, col);
      return [{ type: 'unknown', rawType: 'quiz', body }];
    }
    return [{
      type: 'quiz', quizType: 'numeric',
      question: qText || 'Вопрос',
      answer, ...(tol !== undefined ? { tolerance: tol } : {}),
      ...(unit ? { unit } : {}), ...ex, points,
    }];
  }

  // Пара match: приоритет '=>/<=/<->'; fallback — ровно одна '→'/'—'.
  // '|' и '::' разделителями НЕ являются (конфликт с card и Q::A).
  function splitPair(t: string): { left: string; right: string } | null {
    const strong = /^(.+?)\s*(=>|<=|<->|->)\s*(.+)$/.exec(t);
    if (strong) return { left: strong[1].trim(), right: strong[3].trim() };
    const arrows = [...t.matchAll(/[→—]/g)];
    if (arrows.length === 1) {
      const i = arrows[0].index ?? -1;
      if (i >= 0) return { left: t.slice(0, i).trim(), right: t.slice(i + 1).trim() };
    }
    return null;
  }
  if (attrType === 'match') {
    const pairs: { left: string; right: string }[] = [];
    for (const t of qLines) {
      const s = t.replace(/^\s*[-*+]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim();
      const pr = splitPair(s);
      if (pr) pairs.push(pr);
    }
    if (pairs.length >= 2) {
      // вопрос — первая строка без разделителя (если есть), иначе дефолт.
      let question = 'Сопоставь пары';
      if (qLines.length > pairs.length) question = qLines.slice(0, qLines.length - pairs.length).join('\n').trim() || question;
      return [{ type: 'quiz', quizType: 'match', question, pairs, ...ex, points }];
    }
    // одиночная match-строка без пар — фолбэк ниже.
  }

  // --- order: первая НЕ-списочная строка — вопрос (в шаги не входит),
  // иначе все строки — шаги, вопрос по умолчанию (как Python-эталон) ---
  if (attrType === 'order') {
    const isList = (s: string) => /^\s*([-*+]\s+|\d+[.)]\s+)/.test(s);
    let question = 'Восстанови порядок';
    let rest = qLines;
    if (qLines.length > 0 && !isList(qLines[0])) {
      question = qLines[0].trim() || question;
      rest = qLines.slice(1);
    }
    const items = rest
      .map((t) => t.replace(/^\s*[-*+]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
      .filter(Boolean);
    if (items.length >= 2) {
      return [{ type: 'quiz', quizType: 'order', question, items, ...ex, points }];
    }
    warn(`:::quiz order без списка шагов (строка ${line}) — показан как есть`, col);
    return [{ type: 'unknown', rawType: 'quiz', body }];
  }

  if (options.length > 0) {
    const marked = options.filter((o) => o.correct).length;
    const quizType: 'single' | 'multi' =
      attrType === 'multi' || marked > 1 ? 'multi' : 'single';
    if (quizType === 'single' && marked !== 1) {
      warn(`:::quiz single без ровно одного [x] (строка ${line})`, col);
    }
    return [{
      type: 'quiz', quizType, question: qText || 'Вопрос',
      options, ...(explain ? { explain } : {}), points,
    }];
  }
  if (answer !== undefined) {
    return [{
      type: 'quiz', quizType: 'free',
      question: (qText || 'Вопрос') + (unit ? ` (ответ в ${unit})` : ''),
      answer, ...(accept && accept.length > 0 ? { accept } : {}),
      ...(explain ? { explain } : {}), points,
    }];
  }
  // Q::A-тренажёр без опций (demo.smd: :::quiz title=... с «Вопрос::Ответ»).
  const cards: SmdBlock[] = [];
  for (const t of qLines) {
    const c = splitCard(t.replace(/^\s*[-*+]\s+/, ''));
    if (c) cards.push({ type: 'card', front: c.front, back: c.back });
  }
  if (cards.length > 0) return cards;
  warn(`:::quiz без опций и без answer (строка ${line}) — показан как есть`, col);
  return [{ type: 'unknown', rawType: 'quiz', body }];
}

function extractSolutions(body: string, warn: (msg: string, col?: number) => void): { text: string; solutions: string[] } {
  const lines = body.split('\n');
  const text: string[] = [];
  const solutions: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = OPEN_RE.exec(lines[i].trim());
    if (m && m[1].toLowerCase() === 'solution' && !CODE_FENCE_RE.test(lines[i].trim())) {
      const inner: string[] = [];
      i++;
      let depth = 1;
      let inFcode = false;
      while (i < lines.length && depth > 0) {
        const t = lines[i].trim();
        if (CODE_FENCE_RE.test(t)) {
          inFcode = !inFcode;
          inner.push(lines[i]);
        } else {
          if (!inFcode && CLOSE_RE.test(t)) depth--;
          else if (!inFcode && OPEN_RE.test(t)) depth++;
          if (depth > 0) inner.push(lines[i]);
        }
        i++;
      }
      solutions.push(inner.join('\n').trim());
    } else {
      text.push(lines[i]);
      i++;
    }
  }
  if (solutions.length === 0) warn(':::task без вложенного :::solution', 1);
  return { text: text.join('\n'), solutions };
}

// --- entry ---

const SPOILER_Q_RE = /^>\s*\[!SPOILER\]\s*(.*)$/;

export function parseSmd(raw: string, uri?: string): SmdDoc {
  return parseSmdFull(raw, uri).doc;
}

export function parseSmdFull(raw: string, uri?: string): SmdParseResult {
  const warnings: SmdParseWarning[] = [];
  const warn = (message: string, line?: number, col?: number) =>
    warnings.push({ line: line ?? 0, col: col ?? 1, message });

  const src = raw.replace(/\r\n?/g, '\n');
  let rest = src;
  let fm: Record<string, string | string[]> = {};
  let lineBase = 0; // строк съедено frontmatter — варнинги в координатах файла
  const fmMatch = FM_RE.exec(src);
  if (fmMatch) {
    try {
      fm = parseFrontmatter(fmMatch[1]);
    } catch {
      warn('frontmatter не разобран — взят заголовок из имени файла', 1, 1);
    }
    lineBase = fmMatch[0].split('\n').length - 1;
    rest = src.slice(fmMatch[0].length);
  }
  const meta = buildMeta(fm, uri);

  const blocks: SmdBlock[] = [];
  const lines = rest.split('\n');
  let pending: string[] = [];

  const flushPending = () => {
    const chunk = pending.join('\n').trim();
    pending = [];
    if (chunk) blocks.push({ type: 'theory', body: chunk });
  };

  let i = 0;
  let inCode = false;
  while (i < lines.length) {
    const line = lines[i];
    const s = line.trim();

    if (CODE_FENCE_RE.test(s)) {
      pending.push(line);
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) {
      pending.push(line);
      i++;
      continue;
    }

    const om = OPEN_RE.exec(s);
    if (om && !CLOSE_RE.test(s)) {
      flushPending();
      const ftype = om[1];
      const attrs = parseAttrs(om[2] ?? '');
      const inner: string[] = [];
      const startLine = i + 1 + lineBase;
      const startCol = line.indexOf(':::') + 1;
      i++;
      let depth = 1;
      let closed = false;
      let inFcode = false;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (CODE_FENCE_RE.test(t)) {
          // ::: внутри код-блока — часть кода, не граница блока.
          inFcode = !inFcode;
          inner.push(lines[i]);
        } else if (!inFcode && CLOSE_RE.test(t)) {
          depth--;
          if (depth === 0) { closed = true; i++; break; }
          inner.push(lines[i]);
        } else if (!inFcode && OPEN_RE.test(t)) {
          depth++;
          inner.push(lines[i]);
        } else {
          inner.push(lines[i]);
        }
        i++;
      }
      if (!closed) warn(`:::Незакрытый блок :::${ftype} (строка ${startLine}) — закрыт концом файла`, startLine, startCol);
      const fence: Fence = { type: ftype, attrs, body: inner.join('\n'), line: startLine, col: startCol };
      if (ftype.toLowerCase() === 'solution') {
        warn(`:::solution вне :::task (строка ${startLine}) — показан отдельно`, startLine, startCol);
      }
      blocks.push(...fenceToBlocks(fence, (msg, col) => warn(msg, startLine, col ?? startCol)));
      continue;
    }
    if (CLOSE_RE.test(s)) {
      warn('одиночный ::: без открытия — пропущен', i + 1 + lineBase, line.indexOf(':::') + 1);
      i++; // stray ::: — пропускаем
      continue;
    }
    if (s === '') {
      flushPending();
      i++;
      continue;
    }

    const spm = SPOILER_Q_RE.exec(line);
    if (spm) {
      flushPending();
      const title = spm[1].trim();
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'spoiler',
        ...(title ? { title } : {}),
        body: bodyLines.join('\n').trim(),
      });
      continue;
    }

    const qa = tryQA(line);
    if (qa) {
      flushPending();
      blocks.push({ type: 'card', front: qa.q, back: qa.a });
      i++;
      continue;
    }

    pending.push(line);
    i++;
  }
  flushPending();

  return { doc: { meta, blocks }, warnings };
}

// --- Оглавление .smd: записи с индексом блока (точный прыжок по onLayout) ---
export interface SmdTocEntry {
  level: number;
  title: string;
  blockIdx: number;
}
export function smdToc(doc: SmdDoc): SmdTocEntry[] {
  const out: SmdTocEntry[] = [];
  doc.blocks.forEach((b, i) => {
    if (b.type === 'theory') {
      for (const ln of b.body.split('\n')) {
        const m = /^(#{1,3})\s+(.+)$/.exec(ln.trim());
        if (m) out.push({ level: m[1].length, title: m[2].trim().slice(0, 80), blockIdx: i });
      }
    } else if (b.type === 'summary') {
      out.push({ level: 1, title: 'Выжимка', blockIdx: i });
    } else if (b.type === 'def') {
      out.push({ level: 2, title: (b.term ?? 'Определение').slice(0, 80), blockIdx: i });
    } else if (b.type === 'theorem') {
      out.push({ level: 2, title: (b.name ?? 'Теорема').slice(0, 80), blockIdx: i });
    } else if (b.type === 'quiz') {
      out.push({ level: 2, title: (b.question || 'Вопрос').split('\n')[0].slice(0, 80), blockIdx: i });
    } else if (b.type === 'task') {
      const first = (b.body || '').split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? '';
      const m = /^(Задача\s+[0-9а-яА-ЯёЁ.]+|Вопрос\s+\S+)/.exec(first);
      const num = m ? m[0].replace(/[.]+$/, '') : '';
      out.push({ level: 2, title: (num || first).slice(0, 80) || 'Задача', blockIdx: i });
    } else if (b.type === 'spoiler') {
      out.push({ level: 3, title: (b.title ?? 'Спойлер').slice(0, 80), blockIdx: i });
    } else if (b.type === 'checklist') {
      out.push({ level: 2, title: 'Самопроверка', blockIdx: i });
    }
  });
  return out;
}
