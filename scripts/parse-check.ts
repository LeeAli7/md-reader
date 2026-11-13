// Паритет парсеров: `:::table` = `:::compare-table` и совпадение head/rows.
import { parseSmdFull } from '../src/smd/smdParser';

const a = `---
title: Т
subject: Химия
---

:::table{#t1 cols="2"}
| Понятие | Значение |
|---|---|
| Моль | 6·10²³ |
| Масса | г/моль |
:::
`;

const b = a.replace(':::table', ':::compare-table');

const ra = parseSmdFull(a);
const rb = parseSmdFull(b);
const ta = ra.doc.blocks.find((x) => x.type === 'compare-table');
const tb = rb.doc.blocks.find((x) => x.type === 'compare-table');

let fails = 0;
const ok = (n: string, c: boolean, extra?: any) => {
  if (!c) { fails++; console.log('FAIL', n, extra ?? ''); } else console.log('ok  ', n);
};

ok(':::table распознан', !!ta, ra.doc.blocks.map((x) => x.type));
ok(':::compare-table распознан', !!tb);
ok('одинаковые блоки', JSON.stringify(ta) === JSON.stringify(tb));
ok('нет warning про cols', !ra.warnings.some((w) => /cols/.test(w.message)), ra.warnings);
ok('warning пусто', ra.warnings.length === 0, ra.warnings);

console.log(fails === 0 ? '\nПАРИТЕТ ОК' : `\nПРОВАЛОВ: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
