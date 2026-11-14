import { parseSmdFull } from '../src/smd/smdParser';
import * as fs from 'fs';

const src = fs.readFileSync('/tmp/demo/demo.packed.smd', 'utf8');
const t0 = Date.now();
const { doc } = parseSmdFull(src) as any;
console.log('ms', Date.now() - t0, 'blocks', doc.blocks.length);
for (const b of doc.blocks) {
  const s = b.src || b.poster || '';
  console.log(b.type, b.id ?? '', s ? s.slice(0, 24) + '…' + s.length : '');
}
const fig = doc.blocks.find((b: any) => b.type === 'figure');
const vid = doc.blocks.find((b: any) => b.type === 'video');
console.log('figure inline', !!fig?.src?.startsWith('data:image'), 'video inline', !!vid?.poster?.startsWith('data:image'));
