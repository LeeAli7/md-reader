// Supreader engine — приём входящих файлов (Android intent VIEW / «Открыть через…»).
// Linking отдаёт content:// или file:// URI временного файла: копируем его в
// хранилище (Inbox) и возвращаем постоянный uri, который понимает ReaderScreen.
// Чистый engine-модуль: никакого navigation внутри — колбэк решает UI.

import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ensureInbox } from './importExport';

export interface IncomingCopy {
  /** Постоянный uri копии в хранилище. */
  uri: string;
  /** Имя файла. */
  name: string;
}

/** content://file.jpg или file:///… → имя файла, без query-параметров. */
export function nameFromIncomingUrl(url: string): string {
  const noQuery = url.split('?')[0].split('#')[0];
  const last = noQuery.split('/').pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // оставляем как есть
  }
  name = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  if (!name || name === '.' || name === '..') return `shared-${Date.now()}`;
  // content-провайдеры иногда отдают голый id без расширения — не чиним, берём как есть.
  return name;
}

async function uniqueDest(dir: string, name: string): Promise<string> {
  const base = dir.endsWith('/') ? dir : dir + '/';
  let dest = base + name;
  let n = 2;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  while ((await FileSystem.getInfoAsync(dest)).exists) {
    dest = `${base}${stem} (${n})${ext}`;
    n++;
    if (n > 100) break;
  }
  return dest;
}

/**
 * Скопировать входящий файл в Inbox. Возвращает null, если скопировать
 * не удалось (чужой content-провайдер, нет прав) — UI показывает тост/алёрт.
 */
export async function copyIncomingToVault(url: string): Promise<IncomingCopy | null> {
  if (!url) return null;
  try {
    const inbox = await ensureInbox();
    const dest = await uniqueDest(inbox, nameFromIncomingUrl(url));
    await FileSystem.copyAsync({ from: url, to: dest });
    return { uri: dest, name: dest.split('/').pop() ?? nameFromIncomingUrl(url) };
  } catch {
    return null;
  }
}

function extractUrl(e: unknown): string | null {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'url' in (e as Record<string, unknown>)) {
    const u = (e as Record<string, unknown>).url;
    return typeof u === 'string' ? u : null;
  }
  return null;
}

/**
 * Подписка на входящие файлы: холодный старт (getInitialURL) + горячие
 * intent'ы (событие 'url'). Возвращает отписку для useEffect.
 */
export function initIncomingFileListener(onFile: (uri: string) => void): () => void {
  let alive = true;
  const handle = (raw: unknown) => {
    const url = extractUrl(raw);
    if (!url || !alive) return;
    copyIncomingToVault(url).then((copied) => {
      if (copied && alive) onFile(copied.uri);
    });
  };
  Linking.getInitialURL().then((url) => {
    if (url) handle(url);
  }).catch(() => {});
  const sub = Linking.addEventListener('url', handle);
  return () => {
    alive = false;
    sub.remove();
  };
}
