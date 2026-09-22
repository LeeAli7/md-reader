// apo/providers — price/limit constants (measured 2026-09, docs-quoted).
// No network here; numbers guide quota math and the paywall copy.

export const DECISION_ENGINE = {
  /** Pinned model id (never the moving alias — confidence gates depend on it). */
  model: 'jev-1.13.0',
  endpoint: 'https://api.typesafe.ai/v1/systemone',
  inputPerMtokUsd: 0.042,
  outputPerMtokUsd: 0,
  contextTotal: 65536,
  contextStatePlusLongest: 32768,
  textOnly: true,
  /** Sustained medians from the independent 791-decision bench (2026-09-19). */
  latencyMedianMs: 330,
  latencyP95Ms: 440,
} as const;

export const EXPLAIN_MODEL = {
  model: 'deepseek-flash',
  baseUrl: 'https://api.deepseek.com',
  /** Cache-miss input $/Mtok: off-peak 0.15, peak 0.30 (peak = weekday 01–04, 06–10 UTC). */
  inputPerMtokOffPeakUsd: 0.15,
  inputPerMtokPeakUsd: 0.3,
  outputPerMtokOffPeakUsd: 0.6,
  outputPerMtokPeakUsd: 1.2,
  context: 1048576,
  concurrency: 2500,
} as const;

/** Blended estimate: ~$0.02 decision + ~$0.20 structuring + ~$0.15 explanations. */
export const APO_COST_PER_1000_SOLVES_USD = 0.4;
