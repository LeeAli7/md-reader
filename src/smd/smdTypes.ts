// Лицо .smd — типы под интерфейс Ares (ветка ares-smd-engine).
// Когда движок приедет (src/smd/smdParser.ts → { meta, blocks }),
// SmdDoc ниже должен совпасть 1:1 — моки в smdMock.ts заменить на вызов парсера.

export interface SmdMeta {
  title: string;
  subject?: string;
  tags: string[];
  level: 'baza' | 'prodvinutiy' | 'olimpiada' | string;
  examDate?: string | null;
}

export interface QuizOption {
  text: string;
  correct: boolean;
}

export type SmdBlock =
  | { type: 'theory'; id?: string; body: string }
  | { type: 'def'; term?: string; body: string }
  | { type: 'formula'; body: string }
  | { type: 'spoiler'; title?: string; body: string }
  | { type: 'solution'; body: string }
  | { type: 'card'; front: string; back: string }
  | { type: 'quiz'; quizType: 'single' | 'multi' | 'free'; question: string; options?: QuizOption[]; answer?: string; explain?: string; points?: number }
  | { type: 'callout'; kind: 'mistake' | 'exam-tip' | 'intuition'; body: string }
  | { type: 'checklist'; items: string[] }
  | { type: 'compare-table'; head: string[]; rows: string[][] }
  | { type: 'unknown'; rawType: string; body: string };

export interface SmdDoc {
  meta: SmdMeta;
  blocks: SmdBlock[];
}

// Rich-документ от Ares (docx с картинками): готовый html, картинки уже
// инлайн (base64/data-uri) — WebView рендерит без сети.
export interface RichDoc {
  html: string;
  baseUrl?: string;
}

// Постраничный текст от Ares (pptx/odt/epub): массив страниц.
export interface PagedDoc {
  pages: string[];
  note?: string;
}

// Лист xlsx (формат documentLoader sheet — переиспользуем).
export interface SheetDoc {
  name: string;
  rows: string[][];
}
