// apo/quota — free quota (20/day), history (cap 200), subscription flag.

import { APO_KEYS, loadJson, saveJson } from './store';

export const APO_FREE_DAILY = 20;
export const APO_HISTORY_CAP = 200;

export interface QuotaState {
  date: string;
  used: number;
}

export interface HistoryEntry {
  ts: number;
  stem: string;
  choice: string;
  confidence: number;
  lowAccuracy: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function isPro(): Promise<boolean> {
  return (await loadJson<boolean>(APO_KEYS.sub, false)) === true;
}

export async function setPro(v: boolean): Promise<void> {
  await saveJson(APO_KEYS.sub, v);
}

export async function quotaRemaining(): Promise<number> {
  if (await isPro()) return Number.POSITIVE_INFINITY;
  const t = today();
  const q = await loadJson<QuotaState>(APO_KEYS.quota, { date: t, used: 0 });
  if (q.date !== t) return APO_FREE_DAILY;
  return Math.max(0, APO_FREE_DAILY - q.used);
}

export async function consumeQuota(): Promise<boolean> {
  if (await isPro()) return true;
  const t = today();
  const q = await loadJson<QuotaState>(APO_KEYS.quota, { date: t, used: 0 });
  const cur: QuotaState = q.date === t ? q : { date: t, used: 0 };
  if (cur.used >= APO_FREE_DAILY) return false;
  cur.used += 1;
  await saveJson(APO_KEYS.quota, cur);
  return true;
}

export async function pushHistory(e: HistoryEntry): Promise<HistoryEntry[]> {
  const h = await loadJson<HistoryEntry[]>(APO_KEYS.history, []);
  h.unshift(e);
  const cut = h.slice(0, APO_HISTORY_CAP);
  await saveJson(APO_KEYS.history, cut);
  return cut;
}

export async function readHistory(): Promise<HistoryEntry[]> {
  return loadJson<HistoryEntry[]>(APO_KEYS.history, []);
}
