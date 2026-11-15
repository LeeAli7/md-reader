// Контекст для помощника: куски документа как отдельные элементы.
// Текст — снимок на момент выбора: документ может измениться, а вопрос
// должен остаться про то, что человек реально видел.

import type { SmdBlock, SmdDoc } from './smdTypes';

export type ContextItem = {
  id: string;
  label: string;
  hint?: string;
  text: string;
};

const LIMIT = 4000;

function clip(s: string): string {
  const t = s.replace(/:::.*$/gm, '').trim();
  return t.length > LIMIT ? `${t.slice(0, LIMIT)}\n…обрезано` : t;
}

function firstLine(s: string): string {
  const line = s
    .split('\n')
    .map((x) => x.trim())
    .find((x) => x && !x.startsWith(':::')) ?? '';
  return line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').slice(0, 80);
}

export function contextItemsFromDoc(doc: SmdDoc): ContextItem[] {
  const out: ContextItem[] = [];
  let taskNo = 0;
  let theoryNo = 0;

  const push = (block: SmdBlock, i: number, kind: string, body: string, title?: string) => {
    const text = clip(body);
    if (!text) return;
    out.push({
      id: `${kind}-${i}`,
      label: title || `${kind} ${out.length + 1}`,
      hint: block.type,
      text,
    });
  };

  doc.blocks.forEach((b, i) => {
    switch (b.type) {
      case 'theory': {
        const head = firstLine(b.body);
        if (head.length > 3) push(b, i, 'Теория', b.body, head);
        else if (b.body.trim().length > 80) push(b, i, 'Текст', b.body, `Фрагмент ${++theoryNo}`);
        break;
      }
      case 'def':
        push(b, i, 'Определение', b.body, b.term ? `Определение: ${b.term}` : undefined);
        break;
      case 'theorem':
        push(b, i, 'Теорема', b.body, b.name ? `Теорема: ${b.name}` : undefined);
        break;
      case 'proof':
        push(b, i, 'Доказательство', b.body);
        break;
      case 'formula':
        push(b, i, 'Формула', b.body);
        break;
      case 'task': {
        const n = ++taskNo;
        push(b, i, 'Задача', b.body, `Задача ${n}`);
        (b.solutions ?? []).forEach((s, k) => {
          const text = clip(s);
          if (text) out.push({ id: `solution-${i}-${k}`, label: `Решение ${n}`, hint: 'solution', text });
        });
        break;
      }
      case 'summary':
        push(b, i, 'Итог', b.body, 'Итог');
        break;
      case 'spoiler':
        push(b, i, 'Спойлер', b.body, b.title || 'Спойлер');
        break;
      default:
        break;
    }
  });

  return out;
}

/** Текст контекста для промпта: блоки подписаны, чтобы модель их разделяла. */
export function contextPrompt(items: ContextItem[]): string {
  if (!items.length) return '';
  return items
    .map((it, i) => `<блок ${i + 1} — ${it.label}>\n${it.text}\n</блок>`)
    .join('\n\n');
}
