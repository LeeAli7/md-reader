// MD Vault Pro — engine: import / export / Inbox
// Uses only v1 deps (expo-document-picker, expo-file-system, react-native Share).
// expo-sharing is optional: if Marcel adds it later we prefer it, else fallback.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Share } from 'react-native';

export const VAULT_DIR = FileSystem.documentDirectory + 'md-reader/';
export const INBOX_DIR = VAULT_DIR + 'Inbox/';

export async function ensureDir(path: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // ignore — caller surfaces errors on actual copy/write
  }
}

export async function ensureInbox(): Promise<string> {
  await ensureDir(INBOX_DIR);
  return INBOX_DIR;
}

export interface ImportedFile {
  name: string;
  dest: string;
}

/**
 * Pick any file(s) and copy into destDir (defaults to Inbox).
 * Works with single- and multi-pick DocumentPicker results.
 */
export async function importFiles(destDir?: string): Promise<ImportedFile[]> {
  const target = destDir ?? (await ensureInbox());
  await ensureDir(target);
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: '*/*',
  } as DocumentPicker.DocumentPickerOptions);
  if (res.canceled || !res.assets || res.assets.length === 0) return [];
  const out: ImportedFile[] = [];
  const base = target.endsWith('/') ? target : target + '/';
  for (const asset of res.assets) {
    const name = asset.name ?? ('import-' + Date.now());
    let dest = base + name;
    // de-dup: "name.md", "name (2).md", ...
    let n = 2;
    while ((await FileSystem.getInfoAsync(dest)).exists) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      dest = `${base}${stem} (${n})${ext}`;
      n++;
      if (n > 100) break;
    }
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
    out.push({ name: dest.split('/').pop() ?? name, dest });
  }
  return out;
}

/** Share a file: prefers expo-sharing when installed, else RN Share fallback. */
export async function exportFile(uri: string, title?: string): Promise<'shared' | 'dismissed'> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as {
      isAvailableAsync?: () => Promise<boolean>;
      shareAsync?: (url: string, opts?: { dialogTitle?: string }) => Promise<unknown>;
    };
    if (Sharing?.isAvailableAsync && Sharing?.shareAsync) {
      const ok = await Sharing.isAvailableAsync().catch(() => false);
      if (ok) {
        await Sharing.shareAsync(uri, { dialogTitle: title ?? 'Поделиться файлом' });
        return 'shared';
      }
    }
  } catch {
    // expo-sharing not installed — fall through to RN Share
  }
  const result = await Share.share(
    { message: uri, title: title ?? 'Поделиться файлом', url: uri } as Parameters<typeof Share.share>[0],
  );
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}
