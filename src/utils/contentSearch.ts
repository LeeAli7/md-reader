// MD Vault Pro — engine: content search (search inside files, not just names)
// Deps: expo-file-system (already in v1) + ./fileTypes for binary skipping.

import * as FileSystem from 'expo-file-system';
import { isTextReadable } from './fileTypes';

export interface ContentMatch {
  line: number; // 1-based
  text: string; // trimmed snippet of the matched line
}

export interface FileSearchResult {
  uri: string;
  name: string;
  matches: ContentMatch[];
  matchCount: number;
}

interface WalkOptions {
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxMatchesPerFile?: number;
}

const DEFAULTS: Required<WalkOptions> = {
  maxFiles: 200,
  maxBytesPerFile: 1024 * 1024, // 1 MB — skip bigger to protect RAM
  maxMatchesPerFile: 20,
};

function snippet(line: string, col: number, radius = 48): string {
  const t = line.trim();
  if (t.length <= 140) return t;
  const start = Math.max(0, col - radius);
  return (start > 0 ? '…' : '') + t.slice(start, start + 140) + '…';
}

/** Search query inside one file uri. Returns [] when unreadable/missing. */
export async function searchInFile(uri: string, query: string, maxMatches = 20): Promise<ContentMatch[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const name = uri.split('/').pop() ?? uri;
  if (!isTextReadable(name)) return [];
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return [];
    if (typeof info.size === 'number' && info.size > DEFAULTS.maxBytesPerFile) return [];
    const text = await FileSystem.readAsStringAsync(uri);
    const out: ContentMatch[] = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].toLowerCase().indexOf(q);
      if (idx >= 0) {
        out.push({ line: i + 1, text: snippet(lines[i], idx) });
        if (out.length >= maxMatches) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function walkTextFiles(dir: string, acc: string[], limit: number): Promise<void> {
  if (acc.length >= limit) return;
  let items: string[];
  try {
    items = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return;
  }
  for (const name of items) {
    if (acc.length >= limit) return;
    const full = dir.endsWith('/') ? dir + name : dir + '/' + name;
    let info: any;
    try {
      info = await FileSystem.getInfoAsync(full);
    } catch {
      continue;
    }
    if (!info.exists) continue;
    if (info.isDirectory) {
      await walkTextFiles(full, acc, limit);
    } else if (isTextReadable(name)) {
      if (typeof info.size === 'number' && info.size > DEFAULTS.maxBytesPerFile) continue;
      acc.push(full);
    }
  }
}

/** Recursive content search under dir. Breadth-safe: caps files + matches. */
export async function searchInDir(
  dir: string,
  query: string,
  opts: WalkOptions = {},
): Promise<FileSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const { maxFiles, maxMatchesPerFile } = { ...DEFAULTS, ...opts };
  const files: string[] = [];
  await walkTextFiles(dir, files, maxFiles);
  const results: FileSearchResult[] = [];
  for (const uri of files) {
    const matches = await searchInFile(uri, q, maxMatchesPerFile);
    if (matches.length > 0) {
      results.push({
        uri,
        name: uri.split('/').pop() ?? uri,
        matches,
        matchCount: matches.length,
      });
    }
  }
  return results;
}
