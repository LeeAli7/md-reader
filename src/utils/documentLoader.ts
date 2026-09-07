// MD Vault Pro — engine: load any supported file into a renderable form.
// text  → plain string (md/txt/code/csv…)
// sheet → per-sheet string tables (xlsx/xls)
// binary → polite stub, never raw bytes as text (that used to render garbage)

import * as FileSystem from 'expo-file-system';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { isTextReadable } from './fileTypes';

export type LoadedKind = 'text' | 'sheet' | 'binary';

export interface DocSheet {
  name: string;
  rows: string[][];
}

export interface LoadedDoc {
  kind: LoadedKind;
  text?: string;
  sheets?: DocSheet[];
  note?: string;
}

const MAX_TEXT_BYTES = 1024 * 1024; // same guard as contentSearch
const MAX_OFFICE_BYTES = 5 * 1024 * 1024;
const MAX_SHEET_ROWS = 200;
const MAX_SHEET_COLS = 20;

export async function loadReadable(uri: string, ext: string): Promise<LoadedDoc> {
  const e = ext.replace(/^\./, '').toLowerCase();
  const name = uri.split('/').pop() ?? uri;
  if (e === 'docx') return loadDocx(uri);
  if (e === 'xlsx' || e === 'xls') return loadSheet(uri);
  if (isTextReadable(name)) return loadText(uri, e);
  return { kind: 'binary', note: binaryNote(e) };
}

async function loadText(uri: string, e: string): Promise<LoadedDoc> {
  try {
    const info: any = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number' && info.size > MAX_TEXT_BYTES) {
      return { kind: 'binary', note: `Файл .${e} слишком большой для просмотра (>1 МБ).` };
    }
    const text = await FileSystem.readAsStringAsync(uri);
    return { kind: 'text', text };
  } catch {
    return { kind: 'binary', note: `Не удалось прочитать файл .${e}.` };
  }
}

async function loadDocx(uri: string): Promise<LoadedDoc> {
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(uri, MAX_OFFICE_BYTES);
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать .docx (нет файла или больше 5 МБ).' };
  }
  try {
    const copy = Uint8Array.from(bytes);
    const out = await mammoth.convertToHtml({ arrayBuffer: copy.buffer as ArrayBuffer });
    const text = stripHtml(out.value ?? '');
    return { kind: 'text', text: text || '(пустой документ)' };
  } catch {
    return { kind: 'binary', note: 'Не удалось разобрать .docx — возможно, файл повреждён.' };
  }
}

async function loadSheet(uri: string): Promise<LoadedDoc> {
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(uri, MAX_OFFICE_BYTES);
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать таблицу (нет файла или больше 5 МБ).' };
  }
  try {
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheets: DocSheet[] = (wb.SheetNames ?? []).map((sname: string) => {
      const ws = wb.Sheets[sname];
      const raw = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false,
      }) as unknown[][];
      const rows = raw.slice(0, MAX_SHEET_ROWS).map((row: unknown[]) =>
        (Array.isArray(row) ? row : [row]).slice(0, MAX_SHEET_COLS).map(cellToString),
      );
      return { name: sname || 'Лист', rows };
    }).filter((s: DocSheet) => s.rows.length > 0);
    if (sheets.length === 0) return { kind: 'binary', note: 'В таблице нет данных для показа.' };
    return { kind: 'sheet', sheets };
  } catch {
    return { kind: 'binary', note: 'Не удалось разобрать таблицу — возможно, файл повреждён.' };
  }
}

async function readBytes(uri: string, cap: number): Promise<Uint8Array> {
  const info: any = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error('missing');
  if (typeof info.size === 'number' && info.size > cap) throw new Error('too-big');
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(b64);
}

function binaryNote(e: string): string {
  const label = e ? `Файл .${e}` : 'Файл такого типа';
  return `${label} нельзя показать как текст. Откройте его через «Поделиться» / «Открыть через…».`;
}

/** Base64 → bytes without Node Buffer (absent in Hermes). */
function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const c0 = chars.indexOf(clean[i++]);
    const c1 = chars.indexOf(clean[i++]);
    const c2 = chars.indexOf(clean[i++]);
    const c3 = chars.indexOf(clean[i++]);
    const triple = (c0 << 18) | (c1 << 12) | ((c2 & 63) << 6) | (c3 & 63);
    out.push((triple >> 16) & 255);
    if (c2 !== 64) out.push((triple >> 8) & 255);
    if (c3 !== 64) out.push(triple & 255);
  }
  return Uint8Array.from(out);
}

function stripHtml(html: string): string {
  return html
    .replace(/<(br|p|h[1-6]|li|tr|div|section|article)[^>]*>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|tr|div|section|article|table|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v * 100) / 100);
  return String(v);
}
