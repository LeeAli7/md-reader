import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSmdFull } from '../src/smd/smdParser';

const p = path.join(os.homedir(), 'study', 'obzor-supreader.smd');
const src = fs.readFileSync(p, 'utf8');
const { doc, warnings } = parseSmdFull(src);
const counts: Record<string, number> = {};
for (const b of doc.blocks) counts[b.type] = (counts[b.type] ?? 0) + 1;
console.log('bytes', src.length, 'blocks', doc.blocks.length);
console.log(counts);
const figs = doc.blocks.filter((b: any) => b.type === 'figure');
console.log('figures', figs.map((f: any) => ({ svg: !!f.svg, src: (f.src ?? '').slice(0, 22) })));
const vids = doc.blocks.filter((b: any) => b.type === 'video');
console.log('videos', vids.map((v: any) => (v.src ?? '').slice(0, 22)));
const tasks = doc.blocks.filter((b: any) => b.type === 'task');
console.log('tasks', tasks.length, 'solutions', tasks.map((t: any) => (t.solutions ?? []).length));
console.log('warnings', warnings.length, warnings.slice(0, 3));
