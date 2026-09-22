// apo/explain — explainText with persistent cache (apo_explain_cache_v1).
// MVP text is a local template; buildExplainPrompt shapes the same request
// for the remote explanation model without any network in MVP.

import { cacheKey } from './hash';
import { APO_KEYS, loadJson, saveJson } from './store';

export interface ExplainResult {
  text: string;
  cached: boolean;
  provider: string;
}

/** Prompt shape for the remote explanation model (DeepSeek-class, RU). */
export function buildExplainPrompt(stem: string, answer: string): string {
  return (
    `Объясни коротко и по шагам, почему правильный ответ — «${answer}», ` +
    `на вопрос: ${stem}. Ответ на русском, 3–6 шагов, без воды.`
  );
}

export async function explainText(stem: string, answer: string): Promise<ExplainResult> {
  const key = cacheKey(['explain-v1', stem, answer]);
  const cache = await loadJson<Record<string, string>>(APO_KEYS.explainCache, {});
  const hit = cache[key];
  if (typeof hit === 'string') return { text: hit, cached: true, provider: 'local-baseline' };
  const text =
    `Ответ: ${answer}.\n` +
    'Почему: ключевые слова вопроса пересекаются именно с этим вариантом сильнее, чем с остальными. ' +
    'Проверь: перечитай вопрос, отбрось варианты с лишними условиями, сверь оставшийся с вопросом дословно. ' +
    'Если точность ниже 75% — перепроверь по учебнику.';
  cache[key] = text;
  await saveJson(APO_KEYS.explainCache, cache);
  return { text, cached: false, provider: 'local-baseline' };
}
