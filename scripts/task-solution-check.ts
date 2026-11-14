import { parseSmdFull } from '../src/smd/smdParser';

const src = `---
smd: 1
title: task check
---

:::task{#t1 difficulty="baza" points="2"}
Найди 2+2.

:::solution
4
:::
:::

:::task{#t2}
Без решения.
:::
`;

const { doc } = parseSmdFull(src) as any;
console.log('blocks', doc.blocks.length, doc.blocks.map((b: any) => b.type).join(','));
const t1 = doc.blocks[0];
console.log('t1 solutions', JSON.stringify(t1.solutions), 'body has solution?', /4/.test(t1.body) && t1.body.includes(':::solution'));
const t2 = doc.blocks[1];
console.log('t2 solutions', JSON.stringify(t2.solutions ?? null));
const stray = parseSmdFull(`---\nsmd: 1\ntitle: x\n---\n:::solution\n4\n:::\n`) as any;
console.log('orphan', stray.doc.blocks.map((b: any) => b.type).join(','));
