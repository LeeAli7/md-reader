// MD Vault Pro — engine: favorites / recent / tags on AsyncStorage
// Keys are namespaced (md2_) so v1 reading-settings keys stay untouched.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  favorites: 'md2_favorites', // string[] of file uris
  recent: 'md2_recent', // {uri,title,ts}[] capped
  tags: 'md2_tags', // Record<uri, string[]>
};

const MAX_RECENT = 50;
const MAX_TAGS_PER_FILE = 20;

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable — UI stays working, meta just doesn't persist
  }
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
}

// ---- Favorites ----

export async function getFavorites(): Promise<string[]> {
  const list = await readJSON<string[]>(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

export async function isFavorite(uri: string): Promise<boolean> {
  return (await getFavorites()).includes(uri);
}

/** Toggle; returns the new list so UI can setState directly. */
export async function toggleFavorite(uri: string): Promise<string[]> {
  const list = await getFavorites();
  const next = list.includes(uri) ? list.filter(u => u !== uri) : [...list, uri];
  await writeJSON(KEYS.favorites, next);
  return next;
}

// ---- Recent ----

export interface RecentEntry {
  uri: string;
  title: string;
  ts: number;
}

export async function getRecent(): Promise<RecentEntry[]> {
  const list = await readJSON<RecentEntry[]>(KEYS.recent, []);
  return Array.isArray(list) ? list : [];
}

export async function pushRecent(uri: string, title: string): Promise<RecentEntry[]> {
  const list = await getRecent();
  const next = [{ uri, title, ts: Date.now() }, ...list.filter(e => e.uri !== uri)].slice(0, MAX_RECENT);
  await writeJSON(KEYS.recent, next);
  return next;
}

export async function clearRecent(): Promise<void> {
  await writeJSON(KEYS.recent, []);
}

// ---- Tags ----

export type TagMap = Record<string, string[]>;

export async function getTagMap(): Promise<TagMap> {
  const map = await readJSON<TagMap>(KEYS.tags, {});
  return map && typeof map === 'object' ? map : {};
}

export async function getTags(uri: string): Promise<string[]> {
  return (await getTagMap())[uri] ?? [];
}

export async function setTags(uri: string, tags: string[]): Promise<string[]> {
  const clean = [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, MAX_TAGS_PER_FILE);
  const map = await getTagMap();
  if (clean.length === 0) delete map[uri];
  else map[uri] = clean;
  await writeJSON(KEYS.tags, map);
  return clean;
}

/** All known tags with usage counts, for the Tags tab. */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const map = await getTagMap();
  const counts = new Map<string, number>();
  for (const tags of Object.values(map)) {
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** All file uris carrying a tag. */
export async function searchByTag(tag: string): Promise<string[]> {
  const t = normalizeTag(tag);
  if (!t) return [];
  const map = await getTagMap();
  return Object.entries(map)
    .filter(([, tags]) => tags.includes(t))
    .map(([uri]) => uri);
}
