// apo/ingest — camera/gallery/PDF/DOCX/text into { text, questions[], warnings[] }.
// Text-capable inputs reuse the reader engine (loadReadable). Photo/PDF-scan
// OCR is out of MVP scope: those return honest warnings, never fake text.

import { loadReadable } from '../../utils/documentLoader';
import { getExtension } from '../../utils/fileTypes';

export interface ApoFileInput {
  name: string;
  uri?: string;
  text?: string;
  mime?: string;
}

export interface ApoQuestion {
  stem: string;
  options: string[];
  open: boolean;
}

export interface IngestResult {
  text: string;
  questions: ApoQuestion[];
  warnings: string[];
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif']);

const Q_START =
  /^(?:#{1,3}\s+|\d{1,3}[.)]\s*\S|вопрос\s*\d*\s*[:.)]?\s*\S)/i;
const OPT_LINE =
  /^\s*([A-EA-Яa-ea-я]|[1-5])[.)\]\-:]\s+(.+?)\s*$/;
const BULLET_LINE = /^\s*[-•*]\s+(.+?)\s*$/;

const MAX_QUESTIONS = 50;
const MAX_STEM = 2000;
const MAX_OPTIONS = 8;

export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(html: string): string {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function sheetsToText(sheets: { name: string; rows: string[][] }[]): string {
  return sheets
    .map((s) => `## ${s.name}\n` + s.rows.map((r) => r.join(' | ')).join('\n'))
    .join('\n\n');
}

function pushCurrent(list: ApoQuestion[], cur: { stem: string; options: string[] } | null): void {
  if (!cur) return;
  const stem = cur.stem.trim().slice(0, MAX_STEM);
  if (!stem && cur.options.length === 0) return;
  list.push({ stem, options: cur.options.slice(0, MAX_OPTIONS), open: cur.options.length === 0 });
}

/** Split plain text into questions by numbering + option markers. */
export function parseQuestions(text: string): ApoQuestion[] {
  const out: ApoQuestion[] = [];
  let cur: { stem: string; options: string[]; numbered: boolean } | null = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const opt = OPT_LINE.exec(line);
    if (opt !== null) {
      const optText = opt[2].trim();
      const isDigit = /^\d/.test(opt[1]);
      if (isDigit && (cur === null || cur.options.length > 0 || cur.numbered)) {
        // numbered question ("2. ..."), not a numeric option
        if (out.length + (cur ? 1 : 0) >= MAX_QUESTIONS) break;
        pushCurrent(out, cur);
        cur = { stem: line, options: [], numbered: true };
        continue;
      }
      if (cur === null) cur = { stem: '', options: [], numbered: false };
      if (cur.options.length < MAX_OPTIONS && optText) cur.options.push(optText);
      else if (optText) cur.stem += (cur.stem ? ' ' : '') + optText;
      continue;
    }
    const bullet = BULLET_LINE.exec(line);
    if (bullet !== null) {
      const optText = (bullet[1] ?? '').trim();
      if (cur === null) cur = { stem: '', options: [], numbered: false };
      if (cur.options.length < MAX_OPTIONS && optText) cur.options.push(optText);
      else if (optText) cur.stem += (cur.stem ? ' ' : '') + optText;
      continue;
    }
    if (Q_START.test(line)) {
      if (out.length + (cur ? 1 : 0) >= MAX_QUESTIONS) break;
      pushCurrent(out, cur);
      cur = { stem: line.replace(/^#{1,3}\s+/, ''), options: [], numbered: false };
      continue;
    }
    if (cur === null) cur = { stem: line, options: [], numbered: false };
    else if (cur.options.length > 0) {
      cur.options[cur.options.length - 1] += ' ' + line;
    } else {
      cur.stem += (cur.stem ? '\n' : '') + line;
    }
  }
  pushCurrent(out, cur);
  return out;
}

export async function ingestFile(file: ApoFileInput): Promise<IngestResult> {
  const warnings: string[] = [];
  let text = '';

  if (typeof file.text === 'string' && file.text.trim() !== '') {
    text = normalizeText(file.text);
  } else if (file.uri) {
    const ext = getExtension(file.name);
    if (IMAGE_EXTS.has(ext)) {
      warnings.push(
        'ocr-needed: фото без копируемого текста — в MVP распознавание камеры вне скоупа, вставь текст вручную',
      );
      return { text: '', questions: [], warnings };
    }
    if (ext === 'pdf') {
      warnings.push(
        'pdf-text-pending: извлечение текстового слоя PDF в MVP читает движок Reader — сюда передай текст напрямую',
      );
      return { text: '', questions: [], warnings };
    }
    const doc = await loadReadable(file.uri, ext);
    if (doc.kind === 'text' && doc.text) text = normalizeText(doc.text);
    else if (doc.kind === 'sheet' && doc.sheets) text = normalizeText(sheetsToText(doc.sheets));
    else if (doc.kind === 'rich' && doc.html) text = stripHtml(doc.html);
    else if (doc.kind === 'pages' && doc.pages) text = normalizeText(doc.pages.join('\n\n'));
    else {
      warnings.push(doc.note ?? 'binary-unsupported: формат без извлекаемого текста');
      return { text: '', questions: [], warnings };
    }
  } else {
    warnings.push('empty-input: нет ни text, ни uri');
    return { text: '', questions: [], warnings };
  }

  if (!text) {
    warnings.push('empty-text: из входа не извлеклось текста');
    return { text: '', questions: [], warnings };
  }
  const questions = parseQuestions(text);
  if (questions.length === 0) {
    warnings.push('no-questions: разбивка не нашла вопросов — один открытый вопрос');
    return { text, questions: [{ stem: text.slice(0, MAX_STEM), options: [], open: true }], warnings };
  }
  return { text, questions, warnings };
}
