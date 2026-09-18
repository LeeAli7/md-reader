// Supreader — engine: load any supported file into a renderable form.
// text  → plain string (md/smd/txt/code/csv/rtf…)
// sheet → per-sheet string tables (xlsx/xls)
// rich  → finished html, images already inline (base64 data-uri) — WebView
//         renders it offline. Shape matches RichDoc { html } (src/smd/smdTypes).
// pages → page-per-entry string array (pptx/odt/epub). Shape matches
//         PagedDoc { pages, note } (src/smd/smdTypes).
// binary → polite stub, never raw bytes as text (that used to render garbage)

import * as FileSystem from 'expo-file-system';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { isTextReadable } from './fileTypes';

export type LoadedKind = 'text' | 'sheet' | 'rich' | 'pages' | 'binary';

export interface DocSheet {
  name: string;
  rows: string[][];
}

export interface LoadedDoc {
  kind: LoadedKind;
  text?: string;
  sheets?: DocSheet[];
  html?: string;
  pages?: string[];
  note?: string;
}

const MAX_TEXT_BYTES = 1024 * 1024; // same guard as contentSearch
const MAX_OFFICE_BYTES = 8 * 1024 * 1024;
const MAX_SHEET_ROWS = 200;
const MAX_SHEET_COLS = 20;
const PAGE_CHARS = 3000;

export async function loadReadable(uri: string, ext: string): Promise<LoadedDoc> {
  const e = ext.replace(/^\./, '').toLowerCase();
  const name = uri.split('/').pop() ?? uri;
  if (e === 'docx') return loadDocx(uri);
  if (e === 'doc') return { kind: 'binary', note: docNote() };
  if (e === 'pptx') return loadPptx(uri);
  if (e === 'odt') return loadOdt(uri);
  if (e === 'rtf') return loadRtf(uri);
  if (e === 'epub') return loadEpub(uri);
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

// --- docx → rich html с инлайн-картинками ---

async function loadDocx(uri: string): Promise<LoadedDoc> {
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(uri, MAX_OFFICE_BYTES);
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать .docx (нет файла или больше 8 МБ).' };
  }
  try {
    const copy = Uint8Array.from(bytes);
    const out = await mammoth.convertToHtml(
      { arrayBuffer: copy.buffer as ArrayBuffer },
      {
        convertImage: (mammoth as any).images.imgElement((image: any) =>
          image.read('base64').then((data: string) => ({ src: `data:${image.contentType};base64,${data}` })),
        ),
      },
    );
    const inner = (out.value ?? '').trim();
    if (!inner || stripHtml(inner) === '') return { kind: 'text', text: '(пустой документ)' };
    return { kind: 'rich', html: wrapHtml(inner, 'Документ') };
  } catch {
    return { kind: 'binary', note: 'Не удалось разобрать .docx — возможно, файл повреждён.' };
  }
}

function wrapHtml(inner: string, title: string): string {
  const esc = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{font-family:sans-serif;padding:16px 20px;line-height:1.65;color:#111827;max-width:800px;margin:0 auto}'
    + 'img{max-width:100%;height:auto;border-radius:6px}table{border-collapse:collapse;width:100%}'
    + 'td,th{border:1px solid #D1D5DB;padding:6px 8px;font-size:14px}h1{font-size:22px}h2{font-size:19px}</style>'
    + `</head><body><!-- ${esc} -->${inner}</body></html>`;
}

// --- pptx → pages (по слайдам) ---

async function loadPptx(uri: string): Promise<LoadedDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readBytes(uri, MAX_OFFICE_BYTES));
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать .pptx (нет файла или больше 8 МБ).' };
  }
  try {
    const slideNames = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => slideNum(a) - slideNum(b));
    if (slideNames.length === 0) return { kind: 'binary', note: 'В презентации нет слайдов с текстом.' };
    const pages: string[] = [];
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.file(slideNames[i])!.async('string');
      const paras = extractAText(xml);
      pages.push(paras.length > 0 ? `## Слайд ${i + 1}\n\n${paras.join('\n\n')}` : `## Слайд ${i + 1}\n\n_(без текста)_`);
    }
    return { kind: 'pages', pages, note: `Презентация · слайдов: ${pages.length}` };
  } catch {
    return { kind: 'binary', note: 'Не удалось разобрать .pptx — возможно, файл повреждён.' };
  }
}

function slideNum(name: string): number {
  const m = /slide(\d+)\.xml$/.exec(name);
  return m ? parseInt(m[1], 10) : 0;
}

/** Текст слайда: <a:p> — абзац, <a:t> — кусок текста. */
function extractAText(xml: string): string[] {
  const paras: string[] = [];
  const pRe = /<a:p[\s>]([\s\S]*?)<\/a:p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(xml)) !== null) {
    const runs: string[] = [];
    const tRe = /<a:t>([^<]*)<\/a:t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(pm[1])) !== null) runs.push(xmlUnescape(tm[1]));
    const para = runs.join('').trim();
    if (para) paras.push(para);
  }
  return paras;
}

// --- odt → pages (content.xml) ---

async function loadOdt(uri: string): Promise<LoadedDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readBytes(uri, MAX_OFFICE_BYTES));
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать .odt (нет файла или больше 8 МБ).' };
  }
  try {
    const entry = zip.file('content.xml');
    if (!entry) return { kind: 'binary', note: 'В .odt нет content.xml — возможно, файл повреждён.' };
    const xml = await entry.async('string');
    const paras = extractOdtParas(xml);
    if (paras.length === 0) return { kind: 'text', text: '(пустой документ)' };
    return { kind: 'pages', pages: paginate(paras), note: `Документ · абзацев: ${paras.length}` };
  } catch {
    return { kind: 'binary', note: 'Не удалось разобрать .odt — возможно, файл повреждён.' };
  }
}

function extractOdtParas(xml: string): string[] {
  const out: string[] = [];
  const re = /<(text:[ph])[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    let t = m[2]
      .replace(/<text:line-break\s*\/>/g, '\n')
      .replace(/<text:s[^>]*\/>/g, ' ')
      .replace(/<[^>]+>/g, '');
    t = xmlUnescape(t).replace(/[ \t]+\n/g, '\n').trim();
    if (t) out.push(m[1] === 'text:h' ? `## ${t}` : t);
  }
  return out;
}

// --- rtf → text ---

async function loadRtf(uri: string): Promise<LoadedDoc> {
  let text: string;
  try {
    const info: any = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number' && info.size > MAX_TEXT_BYTES) {
      return { kind: 'binary', note: 'Файл .rtf слишком большой для просмотра (>1 МБ).' };
    }
    text = await FileSystem.readAsStringAsync(uri);
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать .rtf.' };
  }
  const plain = rtfToText(text).trim();
  return { kind: 'text', text: plain || '(пустой документ)' };
}

/** Минимальный RTF-декодер: \par/\line/\tab, \uN, \'xx, пропуск fonttbl-style групп. */
export function rtfToText(rtf: string): string {
  let out = '';
  let i = 0;
  const skipStack: boolean[] = [false];
  const skipped = () => skipStack.some(Boolean);
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') {
      // {\*\fonttbl...} и {\fonttbl...} — служебные группы, пропускаем целиком.
      const head = rtf.slice(i, i + 12);
      const skip = /^\{\\?(\*|fonttbl|colortbl|stylesheet|info|pict)/.test(head);
      skipStack.push(skip);
      i++;
      continue;
    }
    if (c === '}') {
      skipStack.pop();
      if (skipStack.length === 0) skipStack.push(false);
      i++;
      continue;
    }
    if (c === '\\') {
      const m = /^\\([a-z]+)(-?\d+)?[ ]?|^\\'([0-9a-fA-F]{2})|^\\(.)/.exec(rtf.slice(i));
      if (!m) { if (!skipped()) out += c; i++; continue; }
      const tok = m[0];
      if (m[1]) {
        const word = m[1];
        const arg = m[2] !== undefined ? parseInt(m[2], 10) : null;
        if (!skipped()) {
          if (word === 'par' || word === 'line') out += '\n';
          else if (word === 'tab') out += '\t';
          else if (word === 'emdash') out += '—';
          else if (word === 'endash') out += '–';
          else if (word === 'lquote' || word === 'rquote') out += "'";
          else if (word === 'ldblquote' || word === 'rdblquote') out += '"';
          else if (word === 'u' && arg !== null) out += String.fromCharCode(arg < 0 ? arg + 65536 : arg);
        }
        i += tok.length;
        // \uN съедает один запасной символ следом.
        if (m[1] === 'u' && rtf[i] === ' ') i++;
        else if (m[1] === 'u' && rtf[i] === '\\' && rtf[i + 1] === "'") i += 4;
        continue;
      }
      if (m[3]) {
        if (!skipped()) out += String.fromCharCode(parseInt(m[3], 16));
        i += tok.length;
        continue;
      }
      if (m[4] && !skipped() && m[4] !== '\n' && m[4] !== '\r') {
        if (m[4] !== '{' && m[4] !== '}' && m[4] !== '\\') out += m[4];
      }
      i += tok.length;
      continue;
    }
    if (!skipped() && c !== '\n' && c !== '\r') out += c;
    i++;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

// --- epub → pages (по главам spine) ---

async function loadEpub(uri: string): Promise<LoadedDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readBytes(uri, MAX_OFFICE_BYTES));
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать .epub (нет файла или больше 8 МБ).' };
  }
  try {
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) return { kind: 'binary', note: 'В .epub нет container.xml — возможно, файл повреждён.' };
    const opfPath = /full-path="([^"]+)"/.exec(containerXml)?.[1];
    if (!opfPath) return { kind: 'binary', note: 'Не найден OPF-манифест .epub.' };
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opf = await zip.file(opfPath)?.async('string');
    if (!opf) return { kind: 'binary', note: 'Не читается OPF-манифест .epub.' };
    const title = /<dc:title[^>]*>([^<]*)<\/dc:title>/.exec(opf)?.[1]?.trim();

    const manifest: Record<string, string> = {};
    const itemRe = /<item[^>]*>/g;
    let im: RegExpExecArray | null;
    while ((im = itemRe.exec(opf)) !== null) {
      const id = /id="([^"]+)"/.exec(im[0])?.[1];
      const href = /href="([^"]+)"/.exec(im[0])?.[1];
      if (id && href) manifest[id] = base + decodeURIComponent(href);
    }
    const spine: string[] = [];
    const refRe = /<itemref[^>]*>/g;
    let rm: RegExpExecArray | null;
    while ((rm = refRe.exec(opf)) !== null) {
      const idref = /idref="([^"]+)"/.exec(rm[0])?.[1];
      if (idref && manifest[idref]) spine.push(manifest[idref]);
    }
    if (spine.length === 0) return { kind: 'binary', note: 'В .epub нет глав для показа.' };

    const pages: string[] = [];
    for (const path of spine) {
      const entry = zip.file(path);
      if (!entry) continue;
      const html = await entry.async('string');
      const paras = epubParas(html);
      if (paras.length === 0) continue;
      const chunks = paginate(paras);
      if (chunks.length === 1) pages.push(chunks[0]);
      else chunks.forEach((c, k) => pages.push(`${c}\n\n_(${k + 1}/${chunks.length})_`));
      if (pages.length > 200) break;
    }
    if (pages.length === 0) return { kind: 'binary', note: 'В главах .epub нет текста.' };
    return { kind: 'pages', pages, note: `${title ? `«${xmlUnescape(title)}» · ` : ''}глав: ${pages.length}` };
  } catch {
    return { kind: 'binary', note: 'Не удалось разобрать .epub — возможно, файл повреждён.' };
  }
}

function epubParas(html: string): string[] {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  const out: string[] = [];
  const re = /<(h[1-4]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    let t = m[2].replace(/<br[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
    t = xmlUnescape(t).replace(/\s*\n\s*/g, '\n').trim();
    if (!t) continue;
    out.push(/^h\d$/.test(tag) ? `## ${t}` : t);
  }
  return out;
}

// --- helpers ---

function paginate(paras: string[]): string[] {
  const pages: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of paras) {
    if (len + p.length > PAGE_CHARS && cur.length > 0) {
      pages.push(cur.join('\n\n'));
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.length;
  }
  if (cur.length > 0) pages.push(cur.join('\n\n'));
  return pages;
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function docNote(): string {
  return 'Формат .doc (Word 97–2003) не поддерживается для предпросмотра. '
    + 'Пересохраните файл как .docx или откройте через «Поделиться».';
}

async function loadSheet(uri: string): Promise<LoadedDoc> {
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(uri, MAX_OFFICE_BYTES);
  } catch {
    return { kind: 'binary', note: 'Не удалось прочитать таблицу (нет файла или больше 8 МБ).' };
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
