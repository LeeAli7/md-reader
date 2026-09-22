// Apo — тонкий слой движка для UI.
// NATIVE OWNER (Ares): заменить тела ingestFile/solveTest/explainText на
// реальные вызовы (OCR/парсеры, решающий движок + DeepSeek-объяснения).
// Сигнатуры, APO_KEYS и порог 0.75 — контракт, UI закодирован под них.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APO_CONFIDENCE_THRESHOLD,
  APO_KEYS,
  ApoIngestResult,
  ApoQuestion,
  ApoSolveResult,
} from './apoTypes';

const FREE_PER_DAY = 20;

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(16);
}

// Разложить вставленный текст на вопрос и варианты A-D построчно.
export function parsePastedTest(raw: string): ApoQuestion {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const opts: { key: string; text: string }[] = [];
  const stemParts: string[] = [];
  const optRe = /^([A-DА-Г]\)?[\).:-]?)\s*(.+)$/i;
  const keys = ['A', 'B', 'C', 'D'];
  let ki = 0;
  for (const line of lines) {
    const m = line.match(optRe);
    if (m && ki < 4) {
      opts.push({ key: keys[ki], text: m[2].trim() });
      ki++;
    } else if (opts.length === 0) {
      stemParts.push(line);
    } else {
      opts[opts.length - 1].text += ' ' + line;
    }
  }
  return {
    id: hashString(raw),
    stem: stemParts.join(' ') || 'Вопрос',
    options: opts,
  };
}

// ingestFile: файл (камера/галерея/PDF/DOCX/текст) -> текст + вопросы + предупреждения.
// Сейчас: локальный разбор текста; Ares подключит OCR и парсеры документов.
export async function ingestFile(name: string, text: string): Promise<ApoIngestResult> {
  const warnings: string[] = [];
  if (!text.trim()) warnings.push('Пустой документ — нечего решать');
  const q = parsePastedTest(text);
  if (q.options.length < 2) warnings.push('Нашли меньше 2 вариантов — проверьте разбор');
  return { text, questions: text.trim() ? [q] : [], warnings };
}

// solveTest: вопрос + варианты -> ответ с confidence.
// Сейчас: детерминированный мок; Ares заменит на решающий движок.
export async function solveTest(question: string, options: string[]): Promise<ApoSolveResult> {
  const t0 = Date.now();
  const seed = hashString(question + '|' + options.join('|'));
  let n = parseInt(seed.slice(1), 16);
  const rnd = () => {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return n / 0x7fffffff;
  };
  const raw = options.map(() => 0.1 + rnd());
  const sum = raw.reduce((a, b) => a + b, 0);
  const confidence = raw.map((v) => Math.round((v / sum) * 100) / 100);
  let answerIndex = 0;
  confidence.forEach((c, i) => {
    if (c > confidence[answerIndex]) answerIndex = i;
  });
  const top = confidence[answerIndex] ?? 0;
  return {
    answerIndex,
    confidence,
    ms: Date.now() - t0,
    lowAccuracy: top < APO_CONFIDENCE_THRESHOLD,
  };
}

// explainText: подробный разбор по кнопке под каждым тестом, кэш по sha256.
export async function explainText(question: string, answer: string): Promise<string> {
  const key = `${APO_KEYS.explainCache}:${hashString(question + '|' + answer)}`;
  const cached = await AsyncStorage.getItem(key);
  if (cached) return cached;
  // NATIVE OWNER (Ares): заменить на вызов LLM-объяснений (DeepSeek).
  const text =
    `Разбор: правильный ответ — ${answer}. ` +
    `Вопрос: ${question} ` +
    `Проверьте ключевые факты по теме и исключите остальные варианты.`;
  await AsyncStorage.setItem(key, text);
  return text;
}

// Квота free: N решений в день.
export async function quotaLeft(): Promise<{ left: number; total: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${APO_KEYS.quota}:${day}`;
  const used = parseInt((await AsyncStorage.getItem(key)) ?? '0', 10);
  return { left: Math.max(0, FREE_PER_DAY - used), total: FREE_PER_DAY };
}

export async function quotaConsume(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${APO_KEYS.quota}:${day}`;
  const used = parseInt((await AsyncStorage.getItem(key)) ?? '0', 10);
  await AsyncStorage.setItem(key, String(used + 1));
}
