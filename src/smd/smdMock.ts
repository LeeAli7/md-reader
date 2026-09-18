// Лицо .smd — мок данных под интерфейс Ares.
// TODO(ares): заменить mockSmdDoc() на parseSmd(raw) из src/smd/smdParser.ts,
// mockRichDoc()/mockPages() — на documentLoader rich (html+images) / pages.

import type { SmdDoc, RichDoc, PagedDoc } from './smdTypes';

function titleFromUri(uri: string): string {
  const base = (uri.split('/').pop() ?? '').replace(/\.smd$/i, '');
  return base || 'Конспект';
}

export function mockSmdDoc(uri: string, _raw: string): SmdDoc {
  return {
    meta: {
      title: titleFromUri(uri),
      subject: 'biologiya',
      tags: ['botanika', 'ege'],
      level: 'baza',
      examDate: null,
    },
    blocks: [
      { type: 'theory', id: 'fotosintez', body: 'Фотосинтез — синтез органики из CO2 и воды на свету. Идёт в хлоропластах.' },
      { type: 'def', term: 'Хлоропласт', body: '**Хлоропласт** — органоид, где идёт фотосинтез.' },
      { type: 'formula', body: '6CO_2 + 6H_2O → C_6H_{12}O_6 + 6O_2' },
      { type: 'spoiler', title: 'Напомни уравнение', body: '6CO2 + 6H2O → C6H12O6 + 6O2' },
      { type: 'card', front: 'Где идёт световая фаза?', back: 'В тилакоидах (даёт АТФ и НАДФН)' },
      {
        type: 'quiz', quizType: 'single', question: 'Где идёт световая фаза?', points: 1,
        options: [{ text: 'Строма', correct: false }, { text: 'Тилакоиды', correct: true }],
        explain: 'Световая фаза — в тилакоидах, темновая — в строме.',
      },
      {
        type: 'quiz', quizType: 'multi', question: 'Что нужно для фотосинтеза?', points: 2,
        options: [
          { text: 'CO2', correct: true },
          { text: 'H2O', correct: true },
          { text: 'O2', correct: false },
        ],
      },
      {
        type: 'quiz', quizType: 'free', question: 'Органоид фотосинтеза?',
        answer: 'хлоропласт', explain: 'Принимаются синонимы из accept (движок).',
      },
      { type: 'callout', kind: 'mistake', body: 'Частая ошибка: путают световую и темновую фазы.' },
      { type: 'callout', kind: 'exam-tip', body: 'На ЕГЭ уравнение спрашивают каждый год — выучи наизусть.' },
      { type: 'callout', kind: 'intuition', body: 'Хлоропласт — как солнечная батарея с кухней внутри.' },
      { type: 'checklist', items: ['Могу записать уравнение фотосинтеза', 'Объясняю разницу фаз'] },
      {
        type: 'compare-table',
        head: ['Признак', 'Световая', 'Темновая'],
        rows: [
          ['Где', 'Тилакоиды', 'Строма'],
          ['Даёт', 'АТФ и НАДФН', 'Глюкозу'],
        ],
      },
      { type: 'solution', body: 'Решение: 12 H2O дают 6 O2 (по 2 H2O на O2).' },
    ],
  };
}

// Заглушка rich html: показывает движковую вёрстку до приезда Ares rich.
export function mockRichDoc(title: string): RichDoc {
  const esc = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return {
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<style>body{font-family:sans-serif;padding:20px;line-height:1.6;color:#111}`
      + `.stub{background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px}</style></head>`
      + `<body><h1>${esc}</h1>`
      + `<div class="stub">Rich-предпросмотр (html+картинки) приедет с движком Ares. Сейчас показан текст через текстовый фолбэк.</div>`
      + `</body></html>`,
  };
}

// Заглушка постраничного текста (pptx/odt/epub) до приезда Ares pages.
export function mockPages(text: string): PagedDoc {
  const paras = text.split(/\n{2,}/).filter(Boolean);
  const per = 3;
  const pages: string[] = [];
  for (let i = 0; i < paras.length; i += per) pages.push(paras.slice(i, i + per).join('\n\n'));
  return { pages: pages.length > 0 ? pages : [text || '(пусто)'] };
}
