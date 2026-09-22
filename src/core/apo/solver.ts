// apo/solver — solveTest with confidence + lowAccuracy gate (0.75).
// MVP provider is a local token-overlap baseline (offline, honest, fast).
// buildChoicePayload shapes the same question for the remote decision
// engine (state + Choice) without any network in MVP.

import { cacheKey } from './hash';

export const APO_ACCURACY_THRESHOLD = 0.75;

export interface SolveInput {
  stem: string;
  options: string[];
}

export interface SolveResult {
  choice: string;
  choiceIndex: number;
  probabilities: number[];
  confidence: number;
  lowAccuracy: boolean;
  provider: string;
  cacheHit: boolean;
}

const solveMem = new Map<string, SolveResult>();

function tokens(s: string): string[] {
  const m = s.toLowerCase().match(/[a-zа-яё0-9]+/gi);
  return m ? m.filter((t) => t.length > 2) : [];
}

export function solveTestLocal(input: SolveInput): SolveResult {
  const { stem, options } = input;
  if (options.length === 0) {
    return {
      choice: '',
      choiceIndex: -1,
      probabilities: [],
      confidence: 0,
      lowAccuracy: true,
      provider: 'local-baseline',
      cacheHit: false,
    };
  }
  const key = cacheKey(['solve-v1', stem, ...options]);
  const hit = solveMem.get(key);
  if (hit) return { ...hit, cacheHit: true };

  const stemSet = new Set(tokens(stem));
  const scores = options.map((o) => {
    let s = 0;
    for (const t of tokens(o)) if (stemSet.has(t)) s += 1;
    return s;
  });
  const exps = scores.map((s) => Math.exp(s));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  const res: SolveResult = {
    choice: options[best],
    choiceIndex: best,
    probabilities: probs.map(round3),
    confidence: round3(probs[best]),
    lowAccuracy: probs[best] < APO_ACCURACY_THRESHOLD,
    provider: 'local-baseline',
    cacheHit: false,
  };
  solveMem.set(key, res);
  return res;
}

export async function solveTest(input: SolveInput): Promise<SolveResult> {
  return solveTestLocal(input);
}

export interface ChoicePayload {
  state: { question: string };
  questions: {
    answer: { type: 'choice'; instructions: string; criteria: Record<string, string> };
  };
}

/** Shape for the remote decision engine: question -> state, options -> Choice criteria. */
export function buildChoicePayload(input: SolveInput): ChoicePayload {
  const criteria: Record<string, string> = {};
  input.options.forEach((o, i) => {
    criteria[`opt_${i}`] = o;
  });
  return {
    state: { question: input.stem },
    questions: {
      answer: {
        type: 'choice',
        instructions: 'Выбери вариант, который правильно отвечает на `question`.',
        criteria,
      },
    },
  };
}
