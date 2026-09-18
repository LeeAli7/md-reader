// Supreader — engine: резервная копия хранилища.
// Упаковывает всё содержимое VAULT_DIR в zip и отдаёт в диалог «Поделиться»
// (сохранить в файлы / отправить себе). Имя VAULT_DIR не меняется.

import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { VAULT_DIR, ensureDir, exportFile } from './importExport';

async function collectDir(dir: string, prefix: string, zip: JSZip): Promise<void> {
  let items: string[];
  try {
    items = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return;
  }
  const base = dir.endsWith('/') ? dir : dir + '/';
  for (const name of items) {
    const full = base + name;
    let info: { exists: boolean; isDirectory?: boolean };
    try {
      info = (await FileSystem.getInfoAsync(full)) as { exists: boolean; isDirectory?: boolean };
    } catch {
      continue;
    }
    if (!info.exists) continue;
    if (info.isDirectory) {
      await collectDir(full, prefix + name + '/', zip);
    } else {
      try {
        const b64 = await FileSystem.readAsStringAsync(full, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zip.file(prefix + name, b64, { base64: true });
      } catch {
        // битый/занятый файл — пропускаем, бэкап остальных продолжается
      }
    }
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Экспорт всего хранилища в zip через системный диалог «Поделиться».
 * Возвращает число упакованных файлов (для сообщения пользователю).
 */
export async function exportVaultBackup(): Promise<{ status: 'shared' | 'dismissed'; files: number }> {
  await ensureDir(VAULT_DIR);
  const zip = new JSZip();
  await collectDir(VAULT_DIR, '', zip);
  const names = Object.keys(zip.files).filter((k) => !zip.files[k].dir);
  const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const dest = (FileSystem.cacheDirectory ?? VAULT_DIR) + `supreader-backup-${stamp()}.zip`;
  await FileSystem.writeAsStringAsync(dest, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const status = await exportFile(dest, 'Резервная копия Supreader');
  return { status, files: names.length };
}
