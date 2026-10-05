// Помощник под задачами .smd: вопросы с контекстом задачи через zen-прокси.
// Контракт проверен живьём: POST {base}/responses {model, input, stream:false},
// ответ — SSE (response.output_text.delta/done). Модель по умолчанию — muse 1.3.

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
}

function buildInput(task: string, solution: string, history: ChatMsg[], question: string): string {
  const parts = [
    'Ты — репетитор. Ученик разбирает задачу из конспекта. Объясняй по-русски, коротко и по делу, с опорой на текст задачи.',
    `ЗАДАЧА:\n${task}`,
  ];
  if (solution.trim()) parts.push(`РАЗБОР (скрыт от ученика, опирайся на него):\n${solution}`);
  const tail = history.slice(-6);
  for (const m of tail) parts.push(`${m.role === 'user' ? 'УЧЕНИК' : 'ТЫ РАНЕЕ'}: ${m.text}`);
  parts.push(`ВОПРОС УЧЕНИКА: ${question}`);
  return parts.join('\n\n');
}

function extractText(sse: string): string {
  let out = '';
  let done: string | null = null;
  for (const line of sse.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const ev = JSON.parse(payload);
      if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
        out += ev.delta;
      } else if (ev.type === 'response.output_text.done' && typeof ev.text === 'string') {
        done = ev.text;
      } else if (ev.type === 'response.completed') {
        const chunks: string[] = [];
        const walk = (n: any) => {
          if (!n) return;
          if (Array.isArray(n)) { n.forEach(walk); return; }
          if (typeof n === 'object') {
            if (n.type === 'output_text' && typeof n.text === 'string') chunks.push(n.text);
            Object.values(n).forEach(walk);
          }
        };
        walk(ev.response?.output);
        if (chunks.length > 0) done = chunks.join('');
      } else if (typeof ev.output_text === 'string') {
        done = ev.output_text;
      }
    } catch {
      // мусорная строка — пропускаем
    }
  }
  const text = (done ?? out).trim();
  if (!text) throw new Error('Пустой ответ модели');
  return text;
}

export async function askTask(
  task: string,
  solution: string,
  history: ChatMsg[],
  question: string,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = await getAiConfig();
  if (!cfg.key) throw new Error('Нет API-ключа. Введи его в Настройки → Помощник (ИИ).');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${cfg.base}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        input: buildInput(task, solution, history, question),
        stream: false,
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(raw);
        msg = j?.error?.message ?? j?.message ?? msg;
      } catch {}
      throw new Error(msg);
    }
    return extractText(raw);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Превышено время ожидания (2 мин). Попробуй короче вопрос.');
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function checkConnection(): Promise<string> {
  const cfg = await getAiConfig();
  if (!cfg.key) throw new Error('Нет API-ключа.');
  const res = await fetch(`${cfg.base}/models`, {
    headers: { Authorization: `Bearer ${cfg.key}` },
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 120)}`);
  try {
    const j = JSON.parse(raw);
    const n = Array.isArray(j?.data) ? j.data.length : 0;
    return `Связь есть, моделей: ${n}. Рабочая: ${cfg.model}`;
  } catch {
    return 'Связь есть, но ответ не распознан.';
  }
}
