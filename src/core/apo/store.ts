// apo/store — AsyncStorage keys + JSON helpers (memory fallback).

import AsyncStorage from '@react-native-async-storage/async-storage';

export const APO_KEYS = {
  history: 'apo_history_v1',
  quota: 'apo_quota_v1',
  sub: 'apo_sub_v1',
  explainCache: 'apo_explain_cache_v1',
} as const;

const mem = new Map<string, string>();

export async function storeGet(key: string): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // offline / headless test env — fall through to memory
  }
  return mem.get(key) ?? null;
}

export async function storeSet(key: string, value: string): Promise<void> {
  mem.set(key, value);
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // memory copy already kept
  }
}

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await storeGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  await storeSet(key, JSON.stringify(value));
}
