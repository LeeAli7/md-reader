// apo — public surface of the apo solver engine (MVP).

export { sha256Hex, cacheKey } from './hash';
export { APO_KEYS, storeGet, storeSet, loadJson, saveJson } from './store';
export {
  ingestFile,
  parseQuestions,
  normalizeText,
  type ApoFileInput,
  type ApoQuestion,
  type IngestResult,
} from './ingest';
export {
  solveTest,
  solveTestLocal,
  buildChoicePayload,
  APO_ACCURACY_THRESHOLD,
  type SolveInput,
  type SolveResult,
  type ChoicePayload,
} from './solver';
export { explainText, buildExplainPrompt, type ExplainResult } from './explain';
export {
  isPro,
  setPro,
  quotaRemaining,
  consumeQuota,
  pushHistory,
  readHistory,
  APO_FREE_DAILY,
  APO_HISTORY_CAP,
  type QuotaState,
  type HistoryEntry,
} from './quota';
export { DECISION_ENGINE, EXPLAIN_MODEL, APO_COST_PER_1000_SOLVES_USD } from './providers';
