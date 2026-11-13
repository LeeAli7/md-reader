// Проверка медиа-блоков .smd: figure со src, video, plot.
import { parseSmdFull } from '../src/smd/smdParser';

const doc = `---
smd: 1
title: media
---

:::figure{src="img/a.png" alt="A" caption="Подпись"}
:::

:::video{src="video/v.mp4" poster="img/p.jpg" caption="Опыт"}
:::

:::plot{x="-4..4" y="-2..8" title="Кривые"}
y = x^2 - 4
f(x) = 2x + 1
:::
`;

const { doc: parsed } = parseSmdFull(doc);
const blocks = parsed.blocks as any[];
const by = (t: string) => blocks.filter((b: any) => b.type === t);

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fails++;
};

const fig: any = by('figure')[0];
check(!!fig && fig.src === 'img/a.png' && fig.caption === 'Подпись' && !fig.svg, 'figure: src + caption');

const vid: any = by('video')[0];
check(!!vid && vid.src === 'video/v.mp4' && vid.poster === 'img/p.jpg', 'video: src + poster');

const plot: any = by('plot')[0];
check(!!plot, 'plot: блок разобран');
check(!!plot && plot.exprs.length === 2, 'plot: две формулы');
check(!!plot && plot.exprs[0] === 'x^2 - 4', 'plot: y = срезан');
check(!!plot && plot.exprs[1] === '2x + 1', 'plot: f(x) = срезан');
check(!!plot && plot.xmin === -4 && plot.xmax === 4, 'plot: диапазон x');
check(!!plot && plot.ymin === -2 && plot.ymax === 8, 'plot: диапазон y');
check(!!plot && plot.title === 'Кривые', 'plot: заголовок');

console.log(fails ? `\nПРОВАЛОВ: ${fails}` : '\nМЕДИА ОК');
process.exit(fails ? 1 : 0);
