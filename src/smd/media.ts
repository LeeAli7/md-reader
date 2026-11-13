// Пути к картинкам/видео внутри .smd.
// В документе пишем коротко: src="img/grafik.png".
// В приложении файл лежит рядом с .smd, поэтому относительный путь
// разворачиваем от каталога документа. content:// (SAF) папок не знает —
// там путь оставляем как есть: так работают вставленные ссылки и data:.

export function resolveAsset(src: string, docKey?: string): string {
  const raw = (src || '').trim();
  if (!raw) return raw;
  if (/^(https?|data|file|content|asset|blob|ph):/i.test(raw)) return raw;
  const base = (docKey || '').replace(/[?#].*$/, '');
  if (!base.startsWith('file://')) return raw;
  const dir = base.slice(0, base.lastIndexOf('/') + 1);
  const clean = raw.replace(/^\.\//, '');
  return dir + clean.split('/').map((p) => (p === '..' || p === '.' ? p : encodeURIComponent(p))).join('/');
}
