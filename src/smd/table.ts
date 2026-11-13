// GFM-таблицы внутри тела блока .smd.
// react-native-markdown-display 7 таблицы не умеет, поэтому тело блока режем на
// сегменты «текст / таблица» ДО markdown-рендера. Модуль чистый (без React и RN),
// чтобы гоняться юнит-тестами в node.

export type TableAlign = 'left' | 'center' | 'right';

export interface TableSpec {
  head: string[];
  rows: string[][];
  align: TableAlign[];
}

export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'table'; table: TableSpec };

const SEP_CELL = /^\s*:?-+:?\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Разбить строку таблицы на ячейки: `\|` — литерал, палки внутри `code` не режут. */
export function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

  const out: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inCode) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function alignOf(cell: string): TableAlign {
  const t = cell.trim();
  if (t.startsWith(':') && t.endsWith(':')) return 'center';
  if (t.endsWith(':')) return 'right';
  return 'left';
}

/** Таблица = шапка с `|` + строка-разделитель с тем же числом колонок. */
export function parseTableLines(lines: string[]): TableSpec | null {
  if (lines.length < 2) return null;
  if (!lines[0].includes('|')) return null;

  const head = splitCells(lines[0]);
  const sep = splitCells(lines[1]);
  if (head.length === 0 || sep.length !== head.length) return null;
  if (!sep.every((c) => SEP_CELL.test(c))) return null;

  const width = head.length;
  const rows = lines.slice(2).map((l) => {
    const cells = splitCells(l).slice(0, width);
    while (cells.length < width) cells.push('');
    return cells;
  });

  return { head, rows, align: sep.map(alignOf) };
}

/**
 * Разрезать тело блока на текст и таблицы. Внутри ```-фенсов и `$$…$$`
 * таблиц нет — эти участки переносим как есть.
 */
export function splitTables(body: string): BodySegment[] {
  const lines = body.split('\n');
  const segs: BodySegment[] = [];
  let buf: string[] = [];
  let fence = false;
  let math = false;

  const flush = () => {
    if (!buf.length) return;
    const text = buf.join('\n');
    if (text.trim() !== '') segs.push({ kind: 'text', text });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      fence = !fence;
      buf.push(line);
      continue;
    }

    if (!fence) {
      const marks = (line.match(/\$\$/g) ?? []).length;
      if (marks % 2 === 1) math = !math;
      if (math || marks > 0) {
        buf.push(line);
        continue;
      }
    }

    if (!fence && line.includes('|')) {
      const cand: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
        cand.push(lines[j]);
        j++;
      }
      const table = cand.length >= 2 ? parseTableLines(cand) : null;
      if (table) {
        flush();
        segs.push({ kind: 'table', table });
        i = j - 1;
        continue;
      }
    }

    buf.push(line);
  }

  flush();
  return segs.length ? segs : [{ kind: 'text', text: body }];
}

/** Самое длинное слово колонки — по нему считаем ширину, фразы переносятся. */
function longestWordLen(cells: string[]): number {
  let n = 1;
  for (const c of cells) {
    for (const w of c.split(/\s+/)) {
      const clean = w.replace(/[*_`$#>]/g, '');
      if (clean.length > n) n = clean.length;
    }
  }
  return n;
}

/**
 * Ширины колонок. Если суммарно влезает — растягиваем пропорционально
 * (скролла нет). Если нет — минимальная ширина каждой колонки и горизонтальный
 * скролл, как таблица в Телеграме.
 */
export function columnWidths(
  table: TableSpec,
  available: number,
  cellFont: number,
): { widths: number[]; scroll: boolean } {
  const MIN = 96;
  const MAX = 240;
  const PAD = 16;

  const raw = table.head.map((h, j) => {
    const cells = [h, ...table.rows.map((r) => r[j] ?? '')];
    const len = longestWordLen(cells);
    return Math.min(MAX, Math.max(MIN, Math.round(len * cellFont * 0.55 + PAD)));
  });

  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= available) {
    const k = available / total;
    return { widths: raw.map((w) => Math.floor(w * k)), scroll: false };
  }
  return { widths: raw, scroll: true };
}
