// Помощник под задачами .smd.
//
// Провайдер может быть двумя разными: классический OpenAI-совместимый
// (/chat/completions, ответ {choices:[{message:{content}}]}) и Responses
// (/responses, ответ SSE или {output:[{content:[{text}]}]}). Раньше клиент
// умел только второй — с платным ключом от OpenAI/DeepSeek/OpenRouter это
// давало пустой ответ. Теперь пробуем оба и разбираем любой из форматов.
//
// Запрос живёт в модуле, а не в экране: выход из чата его не рвёт.

import AsyncStorage from '@react-native-async-storage/async-storage';

const K_BASE = 'smd_ai_base';
const K_KEY = 'smd_ai_key';
const K_MODEL = 'smd_ai_model';

export const AI_DEFAULTS = {
  base: 'https://crest-learn-test-pirates.trycloudflare.com/zen/v1',
  model: 'muse-spark-1.3-contributor-free',
};

export interface AiConfig {
  base: string;
  key: string;
  model: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  try {
    const [b, k, m] = await Promise.all([
      AsyncStorage.getItem(K_BASE),
      AsyncStorage.getItem(K_KEY),
      AsyncStorage.getItem(K_MODEL),
    ]);
    return {
      base: (b ?? '').trim().replace(/\/+$/, '') || AI_DEFAULTS.base,
      key: (k ?? '').trim(),
      model: (m ?? '').trim() || AI_DEFAULTS.model,
    };
  } catch {
    return { ...AI_DEFAULTS, key: '' };
  }
}

export async function saveAiConfig(c: AiConfig): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(K_BASE, c.base.trim().replace(/\/+$/, '')),
    AsyncStorage.setItem(K_KEY, c.key.trim()),
    AsyncStorage.setItem(K_MODEL, c.model.trim() || AI_DEFAULTS.model),
  ]);
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  /** Локальные uri картинок, чтобы они оставались видны в истории */
  images?: string[];
}

export interface AttachedImage {
  mime: string;
  base64: string;
}

export interface AskOpts {
  signal?: AbortSignal;
  images?: AttachedImage[];
}

export interface AskResult {
  text: string;
  /** Какой адрес реально ответил — показываем в настройках */
  endpoint?: string;
}

// ─────────────────────────── адреса провайдера ───────────────────────────

type Mode = 'chat' | 'responses';

function candidates(base: string): { url: string; mode: Mode }[] {
  const b = base.trim().replace(/\/+$/, '');
  const out: { url: string; mode: Mode }[] = [];
  const push = (url: string, mode: Mode) => {
    if (!out.some((x) => x.url === url)) out.push({ url, mode });
  };
  if (/\/responses$/i.test(b)) push(b, 'responses');
  else if (/\/chat\/completions$/i.test(b)) push(b, 'chat');
  else {
    const hasV1 = /\/v\d+([/]|$)/i.test(b);
    // Сначала то, что понимает почти любой платный ключ.
    push(`${b}/chat/completions`, 'chat');
    if (!hasV1) push(`${b}/v1/chat/completions`, 'chat');
    push(`${b}/responses`, 'responses');
    if (!hasV1) push(`${b}/v1/responses`, 'responses');
  }
  return out;
}

// ─────────────────────────── тело запроса ───────────────────────────

function systemPrompt(task: string, solution: string): string {
  const parts = [
    'Ты — репетитор. Ученик разбирает задачу из конспекта. Объясняй по-русски, коротко и по делу, с опорой на текст задачи.',
    'ОФОРМЛЕНИЕ (строго): $...$ только для коротких формул в одну строку, индексы через _ (C_2H_4), дроби — (a)/(b), без \\frac, \\dfrac, $$, \\begin, \\end. Жирный — только для ключевых слов и итога.',
    `ЗАДАЧА:\n${task}`,
  ];
  if (solution.trim()) parts.push(`РАЗБОР (опирайся на него, но не пересказывай целиком):\n${solution}`);
  return parts.join('\n\n');
}

function chatMessages(task: string, solution: string, history: ChatMsg[], question: string) {
  const msgs: any[] = [{ role: 'system', content: systemPrompt(task, solution) }];
  for (const m of history.slice(-8)) {
    msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  }
  msgs.push({ role: 'user', content: question });
  return msgs;
}

function chatInput(task: string, solution: string, history: ChatMsg[], question: string) {
  const parts: any[] = [
    { role: 'system', content: [{ type: 'input_text', text: systemPrompt(task, solution) }] },
  ];
  for (const m of history.slice(-8)) {
    parts.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: [{ type: 'input_text', text: m.text }],
    });
  }
  const content: any[] = [{ type: 'input_text', text: question }];
  return { parts, content };
}

// ─────────────────────────── разбор ответа ───────────────────────────

function partsToText(v: any): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(partsToText).join('');
  if (v && typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (typeof v.content === 'string') return v.content;
    if (Array.isArray(v.content)) return partsToText(v.content);
    if (Array.isArray(v.parts)) return partsToText(v.parts);
  }
  return '';
}

function fromResponses(j: any): string {
  const chunks: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === 'object') {
      if (n.type === 'output_text' && typeof n.text === 'string') chunks.push(n.text);
      Object.values(n).forEach(walk);
    }
  };
  walk(j?.output ?? j?.response?.output);
  return chunks.join('');
}

/** Любой формат → текст. Пустая строка, если модель ничего не сказала. */
function parseAnswer(raw: string, contentType: string): string {
  const body = raw.trim();
  if (!body) return '';

  const looksSse = /text\/event-stream/i.test(contentType) || /^\s*data:/m.test(body);
  if (looksSse) {
    let acc = '';
    let done = '';
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const ev = JSON.parse(payload);
        const delta =
          ev?.delta?.content ??
          (ev?.type === 'response.output_text.delta' ? ev.delta : undefined) ??
          ev?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') acc += delta;
        const full =
          ev?.choices?.[0]?.message?.content ??
          ev?.choices?.[0]?.text ??
          (ev?.type === 'response.output_text.done' ? ev.text : undefined) ??
          ev?.output_text;
        if (typeof full === 'string' && full.trim()) done = full;
        if (ev?.type === 'response.completed') {
          const t2 = fromResponses(ev?.response);
          if (t2.trim()) done = t2;
        }
      } catch {
        // не-JSON строка SSE — это может быть сырой текст, копим как есть
        if (payload && !payload.startsWith('{')) acc += payload;
      }
    }
    return (done || acc).trim();
  }

  try {
    const j = JSON.parse(body);
    const cands = [
      j?.choices?.[0]?.message?.content,
      j?.choices?.[0]?.text,
      j?.output_text,
      j?.response?.output_text,
      j?.message?.content,
      j?.content,
      fromResponses(j),
    ];
    for (const c of cands) {
      const text = partsToText(c).trim();
      if (text) return text;
    }
    // Модель ответила, но только «размышлениями» — это не пустой ответ.
    const reasoning =
      partsToText(j?.choices?.[0]?.message?.reasoning_content) ||
      partsToText(j?.choices?.[0]?.message?.reasoning);
    if (reasoning.trim()) {
      return reasoning.trim();
    }
    return '';
  } catch {
    // Провайдер вернул не JSON и не SSE — отдаём как есть, если это текст.
    return /^[[{]/.test(body) ? '' : body;
  }
}

function describeHttpError(status: number, raw: string): string {
  let detail = raw.trim().slice(0, 300);
  try {
    const j = JSON.parse(raw);
    detail = j?.error?.message ?? j?.message ?? j?.error ?? detail;
    if (typeof detail !== 'string') detail = JSON.stringify(detail).slice(0, 300);
  } catch {}
  if (status === 401 || status === 403) return `Ключ не принят (${status}). ${detail}`;
  if (status === 404) return `Адрес не найден (404). Проверь base URL. ${detail}`;
  if (status === 429) return `Лимит запросов (429). ${detail}`;
  if (status >= 500) return `Провайдер ответил ${status}. ${detail}`;
  return `${status}: ${detail}`;
}

// ─────────────────────────── сам запрос ───────────────────────────

async function callProvider(
  cfg: AiConfig,
  task: string,
  solution: string,
  history: ChatMsg[],
  question: string,
  images: AttachedImage[],
  signal?: AbortSignal,
): Promise<AskResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240000);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort);
  }
  const errors: string[] = [];
  try {
    for (const ep of candidates(cfg.base)) {
      try {
        let body: any;
        if (ep.mode === 'chat') {
          const msgs = chatMessages(task, solution, history, question);
          if (images.length > 0) {
            msgs[msgs.length - 1] = {
              role: 'user',
              content: [
                { type: 'text', text: question },
                ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
              ],
            };
          }
          body = { model: cfg.model, messages: msgs, stream: false };
        } else {
          const { parts, content } = chatInput(task, solution, history, question);
          const input =
            images.length > 0
              ? [...parts, {
                  role: 'user',
                  content: [
                    ...content,
                    ...images.map((im) => ({ type: 'input_image', image_url: `data:${im.mime};base64,${im.base64}` })),
                  ],
                }]
              : parts;
          body = { model: cfg.model, input, stream: false };
        }

        const res = await fetch(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const raw = await res.text();
        if (!res.ok) {
          const msg = describeHttpError(res.status, raw);
          // 404/405/400 — «такого адреса нет», пробуем следующий вариант.
          if (res.status === 404 || res.status === 405 || res.status === 400) {
            errors.push(`${ep.url}: ${msg}`);
            continue;
          }
          // 401/429/5xx — смысловая ошибка: дальше стучаться бессмысленно.
          const fatal: any = new Error(msg);
          fatal.fatal = true;
          throw fatal;
        }
        const text = parseAnswer(raw, res.headers.get('content-type') ?? '');
        if (!text) {
          errors.push(`${ep.url}: пустой ответ модели`);
          continue;
        }
        return { text, endpoint: ep.url };
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        if (e?.fatal) throw e;
        errors.push(`${ep.url}: ${e?.message ?? e}`);
      }
    }
    const allEmpty = errors.length > 0 && errors.every((x) => x.includes('пустой ответ'));
    throw new Error(
      allEmpty
        ? `Модель ответила пустым текстом. Проверь имя модели (${cfg.model}) и адрес.\n${errors.join('\n')}`
        : errors.length
          ? `Не получилось получить ответ.\n${errors.join('\n')}`
          : 'Не получилось получить ответ.',
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function askTask(
  task: string,
  solution: string,
  history: ChatMsg[],
  question: string,
  opts?: AskOpts | AbortSignal,
): Promise<string> {
  const cfg = await getAiConfig();
  if (!cfg.key) throw new Error('Нет API-ключа. Введи его в Настройки → Помощник (ИИ).');
  // Раньше сюда передавали то AskOpts, то AbortSignal — различаем по форме,
  // а не через instanceof (в Hermes AbortSignal может быть не конструктором).
  const asSignal = opts && typeof (opts as any).aborted === 'boolean' && typeof (opts as any).addEventListener === 'function';
  const signal = asSignal ? (opts as unknown as AbortSignal) : (opts as AskOpts | undefined)?.signal;
  const images = asSignal ? [] : (opts as AskOpts | undefined)?.images ?? [];
  const res = await callProvider(cfg, task, solution, history, question, images, signal);
  return res.text;
}

// ─────────────────────────── проверка связи ───────────────────────────

export async function checkConnection(): Promise<string> {
  const cfg = await getAiConfig();
  if (!cfg.key) throw new Error('Нет API-ключа.');
  const probe = await callProvider(
    cfg,
    'Проверка связи.',
    '',
    [],
    'Ответь одним словом: работает',
    [],
  );
  const host = probe.endpoint?.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  return `Связь есть (${probe.endpoint?.split('/').slice(-2).join('/') ?? 'ok'}, ${host}).\nОтвет модели: «${probe.text.slice(0, 80)}»`;
}

// ─────────────────────────── история ветки ───────────────────────────

// Стабильный id ветки на задачу (история переживает перезаходы).
export function chatIdFor(uri: string, taskBody: string): string {
  let h = 2166136261;
  const s = `${uri}#${taskBody}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `smd_chat_${(h >>> 0).toString(36)}`;
}

export async function loadChat(chatId: string): Promise<ChatMsg[]> {
  try {
    const raw = await AsyncStorage.getItem(chatId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.text === 'string')
      .map((m): ChatMsg => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: m.text.slice(0, 8000) }))
      .slice(-100);
  } catch {
    return [];
  }
}

export async function saveChat(chatId: string, msgs: ChatMsg[]): Promise<void> {
  try {
    await AsyncStorage.setItem(chatId, JSON.stringify(msgs.slice(-100)));
  } catch {}
}

export async function appendChat(chatId: string, msg: ChatMsg): Promise<void> {
  try {
    const cur = await loadChat(chatId);
    await saveChat(chatId, [...cur, msg]);
  } catch {}
}

export interface PendingJob {
  question: string;
  full: string;
  shown: string;
  images: AttachedImage[];
  ts: number;
}

export async function getPending(chatId: string): Promise<PendingJob | null> {
  try {
    const raw = await AsyncStorage.getItem(`${chatId}:pending`);
    return raw ? (JSON.parse(raw) as PendingJob) : null;
  } catch {
    return null;
  }
}

export async function setPending(chatId: string, job: PendingJob | null): Promise<void> {
  try {
    if (job) await AsyncStorage.setItem(`${chatId}:pending`, JSON.stringify(job));
    else await AsyncStorage.removeItem(`${chatId}:pending`);
  } catch {}
}

// ─────────────────────── фоновый прогон запроса ───────────────────────
// Запрос принадлежит модулю: экран может размонтироваться, уйти в фон,
// потерять состояние — ответ всё равно прилетит и допишется в ветку.

export type AiEvent =
  | { chatId: string; kind: 'start' }
  | { chatId: string; kind: 'done'; text: string }
  | { chatId: string; kind: 'error'; error: string };

type Listener = (e: AiEvent) => void;

const listeners = new Set<Listener>();
const running = new Map<string, { startedAt: number; abort: () => void }>();

export function subscribeAi(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(e: AiEvent) {
  listeners.forEach((fn) => { try { fn(e); } catch {} });
}

export function isAiRunning(chatId: string): boolean {
  return running.has(chatId);
}

export function aiStartedAt(chatId: string): number | undefined {
  return running.get(chatId)?.startedAt;
}

export function abortAi(chatId: string) {
  running.get(chatId)?.abort();
}

export async function runAskTask(
  chatId: string,
  task: string,
  solution: string,
  history: ChatMsg[],
  job: PendingJob,
): Promise<void> {
  if (running.has(chatId)) return;
  const ctrl = new AbortController();
  running.set(chatId, { startedAt: Date.now(), abort: () => ctrl.abort() });
  await setPending(chatId, job);
  emit({ chatId, kind: 'start' });
  try {
    const answer = await askTask(task, solution, history, job.full, { images: job.images, signal: ctrl.signal });
    await appendChat(chatId, { role: 'assistant', text: answer });
    await setPending(chatId, null);
    emit({ chatId, kind: 'done', text: answer });
  } catch (e: any) {
    const error = e?.name === 'AbortError' ? 'Остановлено.' : e?.message ?? String(e);
    await setPending(chatId, null);
    emit({ chatId, kind: 'error', error });
  } finally {
    running.delete(chatId);
  }
}
