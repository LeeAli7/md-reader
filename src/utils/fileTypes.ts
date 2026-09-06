// MD Vault Pro — engine: file type registry
// Pure TS, no native deps. Single source of truth for "what can we open/edit".

export type FileKind =
  | 'folder'
  | 'markdown'
  | 'text'
  | 'code'
  | 'data'
  | 'doc'
  | 'pdf'
  | 'image'
  | 'other';

export const MARKDOWN_EXTS = ['md', 'markdown', 'mdown', 'mkd'] as const;
export const TEXT_EXTS = ['txt', 'text', 'log', 'caption', 'srt', 'tex'] as const;
export const CODE_EXTS = [
  'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
  'cs', 'go', 'rs', 'rb', 'php', 'swift', 'sh', 'json', 'yaml', 'yml',
  'toml', 'xml', 'html', 'css', 'scss', 'sql', 'r', 'lua', 'pl', 'vue', 'svelte',
] as const;
export const DATA_EXTS = ['csv', 'tsv'] as const;
export const DOC_EXTS = ['doc', 'docx', 'odt', 'rtf', 'epub'] as const;

const CODE_SET = new Set<string>(CODE_EXTS as unknown as string[]);
const TEXT_SET = new Set<string>(TEXT_EXTS as unknown as string[]);
const MD_SET = new Set<string>(MARKDOWN_EXTS as unknown as string[]);

/** Lowercase extension without dot. '' when none. */
export function getExtension(name: string): string {
  const base = name.split('/').pop() ?? name;
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

export function getFileKind(name: string, isDir = false): FileKind {
  if (isDir) return 'folder';
  const ext = getExtension(name);
  if (!ext) return 'other';
  if (MD_SET.has(ext)) return 'markdown';
  if (TEXT_SET.has(ext)) return 'text';
  if (CODE_SET.has(ext)) return 'code';
  if ((DATA_EXTS as readonly string[]).includes(ext)) return 'data';
  if ((DOC_EXTS as readonly string[]).includes(ext)) return 'doc';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  return 'other';
}

/** Can we render the content as plain text in Reader/Editor v2? */
export function isTextReadable(name: string, isDir = false): boolean {
  if (isDir) return false;
  const kind = getFileKind(name);
  return kind === 'markdown' || kind === 'text' || kind === 'code' || kind === 'data';
}

/** Can the user edit and save it in EditorScreen v2? Same set as readable for now. */
export function isEditable(name: string, isDir = false): boolean {
  return isTextReadable(name, isDir);
}

export function isMarkdown(name: string): boolean {
  return MD_SET.has(getExtension(name));
}

/** Ionicons name for FileBrowser rows. Keeps UI mapping in one place. */
export function getIconName(name: string, isDir = false): string {
  if (isDir) return 'folder';
  switch (getFileKind(name)) {
    case 'markdown': return 'document-text';
    case 'text': return 'document';
    case 'code': return 'code-slash';
    case 'data': return 'grid';
    case 'doc': return 'book';
    case 'pdf': return 'document-attach';
    case 'image': return 'image';
    default: return 'document-outline';
  }
}

/** Human label for filter chips / details. */
export function getKindLabel(kind: FileKind): string {
  switch (kind) {
    case 'folder': return 'Папка';
    case 'markdown': return 'Markdown';
    case 'text': return 'Текст';
    case 'code': return 'Код';
    case 'data': return 'Данные';
    case 'doc': return 'Документ';
    case 'pdf': return 'PDF';
    case 'image': return 'Картинка';
    default: return 'Файл';
  }
}
