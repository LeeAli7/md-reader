// MD Vault Pro — engine: folder tree for the move-modal.
// Returns the whole directory skeleton under the vault root so the UI
// can render a one-shot picker (tree + breadcrumbs) instead of
// step-by-step navigation. Files are excluded — folders only.

import * as FileSystem from 'expo-file-system';
import { VAULT_DIR, ensureDir } from './importExport';

export interface FolderNode {
  name: string;
  /** Directory uri, always with trailing '/' (same convention as FileBrowser). */
  uri: string;
  children: FolderNode[];
}

/** Full folder skeleton from the vault root, sorted by name at every level. */
export async function getFolderTree(): Promise<FolderNode[]> {
  await ensureDir(VAULT_DIR);
  return readLevel(VAULT_DIR);
}

async function readLevel(dir: string): Promise<FolderNode[]> {
  let items: string[];
  try {
    items = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return [];
  }
  const base = dir.endsWith('/') ? dir : dir + '/';
  const out: FolderNode[] = [];
  for (const name of items) {
    const full = base + name;
    let info: any;
    try {
      info = await FileSystem.getInfoAsync(full);
    } catch {
      continue;
    }
    if (!info.exists || !info.isDirectory) continue;
    const uri = full.endsWith('/') ? full : full + '/';
    out.push({ name, uri, children: await readLevel(uri) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
