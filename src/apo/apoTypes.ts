// Apo — типы и контракт с движком.
// NATIVE OWNER (Ares): заменить мок-реализации в apoEngine.ts на реальные
// вызовы движка — сигнатуры и ключи ниже НЕ менять, UI уже закодирован под них.
export const APO_CONFIDENCE_THRESHOLD = 0.75;

export const APO_KEYS = {
  history: 'apo_history_v1',
  quota: 'apo_quota_v1',
  sub: 'apo_sub_v1',
  explainCache: 'apo_explain_cache_v1',
} as const;

export interface ApoOption {
  key: string;
  text: string;
}

export interface ApoQuestion {
  id: string;
  stem: string;
  options: ApoOption[];
}

export interface ApoIngestResult {
  text: string;
  questions: ApoQuestion[];
  warnings: string[];
}

export interface ApoSolveResult {
  answerIndex: number;
  confidence: number[];
  ms: number;
  lowAccuracy: boolean;
}

export type ApoSubPlan = 'free' | 'base' | 'unlimited';

export interface ApoHistoryItem {
  id: string;
  stem: string;
  answer: string;
  confidence: number;
  at: number;
}
