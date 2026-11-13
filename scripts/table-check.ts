// Проверка сегментера таблиц без RN и телефона:
//   node node_modules/typescript/bin/tsc scripts/table-check.ts src/smd/table.ts \
//     --outDir /tmp/tbl --module commonjs --target es2019 --skipLibCheck
//   node /tmp/tbl/table-check.js
import { columnWidths, parseTableLines, splitTables, splitCells } from '../src/smd/table';

let fails = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (!cond) {
    fails++;
    console.log('FAIL', name, extra ?? '');
  } else {
    console.log('ok  ', name);
  }
}

// 1. Базовая таблица + выравнивание
const t1 = splitTables('До\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n\nПосле');
ok('два текстовых сегмента + таблица', t1.length === 3, t1.map((s) => s.kind));
const tb1 = t1[1].kind === 'table' ? t1[1].table : null;
ok('шапка', !!tb1 && tb1.head.join('|') === 'a|b');
ok('строки', !!tb1 && tb1.rows[0].join('|') === '1|2');
ok('выравнивание', !!tb1 && tb1.align[0] === 'left' && tb1.align[1] === 'right');

// 2. Без разделителя — обычный текст
const t2 = splitTables('a | b\n1 | 2');
ok('без разделителя не таблица', t2.length === 1 && t2[0].kind === 'text');

// 3. Экранированная палка
ok('\\| не режет', splitCells('a \\| b | c').join('~') === 'a | b~c');

// 4. Внутри fence — не трогаем
const fenced = '```\n| a | b |\n|---|---|\n| 1 | 2 |\n```';
const t4 = splitTables(fenced);
ok('fence не таблица', t4.length === 1 && t4[0].kind === 'text');

// 5. Внутри $$ — не трогаем
const inMath = '$$\n| a | b |\n|---|---|\n| 1 | 2 |\n$$';
const t5 = splitTables(inMath);
ok('$$ не таблица', t5.length === 1 && t5[0].kind === 'text');

// 6. Битая таблица: шапка 3, разделитель 2 — весь текст на месте
const broken = '| a | b | c |\n|---|---|\n| 1 | 2 | 3 |';
const t6 = splitTables(broken);
const chars6 = t6.map((s) => (s.kind === 'text' ? s.text : JSON.stringify(s.table))).join('');
ok('битая не съедена', t6.length === 1 && chars6.split('|').length - 1 === broken.split('|').length - 1);

// 7. Ширина: 2 колонки влезают, 8 — скролл
const two = parseTableLines(['| Понятие | Значение |', '|---|---|', '| Моль | 6·10²³ частиц |']);
const eight = parseTableLines([
  '| a | b | c | d | e | f | g | h |',
  '|---|---|---|---|---|---|---|---|',
  '| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |',
]);
ok('2 колонки без скролла', !!two && !columnWidths(two, 340, 15).scroll);
ok('8 колонок со скроллом', !!eight && columnWidths(eight, 340, 15).scroll);
ok('ширины заполняют экран', !!two && columnWidths(two, 340, 15).widths.reduce((a, b) => a + b, 0) === 340);

// 8. Пустые ячейки и короткая строка
const short = parseTableLines(['| a | b | c |', '|---|---|---|', '| 1 |']);
ok('короткая строка добита', !!short && short.rows[0].length === 3 && short.rows[0][2] === '');

// 9. 1×1
const one = parseTableLines(['| x |', '|---|']);
ok('1×1', !!one && one.head.length === 1 && one.rows.length === 0);

console.log(fails === 0 ? '\nВСЕ ПРОВЕРКИ ПРОШЛИ' : `\nПРОВАЛОВ: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
