import AsyncStorage from '@react-native-async-storage/async-storage';

// Локальный фолбэк позиций чтения — тот же ключ и форма, что у движка
// (metaStore.md2_positions, ветка ares-r3). На склейке этот файл выкинуть,
// вызовы getPosition/setPosition уже идут через одноимённые функции ниже.
const KEY = 'md2_positions';

interface PosEntry {
  offset: number;
  ts: number;
}

async function readAll(): Promise<Record<string, PosEntry>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Доля прокрутки 0..1, 0 если не было. */
export async function getPosition(uri: string): Promise<number> {
  const all = await readAll();
  const v = all[uri]?.offset;
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : 0;
}

/** Писать на скролле (throttle на стороне UI) — перезаписывает одну запись. */
export async function setPosition(uri: string, offset: number): Promise<void> {
  try {
    const all = await readAll();
    all[uri] = { offset: Math.max(0, Math.min(1, offset)), ts: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export async function clearPosition(uri: string): Promise<void> {
  try {
    const all = await readAll();
    delete all[uri];
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
