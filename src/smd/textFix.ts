// Починка текста перед показом.
// В курсах встречается «‘n» / «'n» вместо стрелки: так стрелку когда-то
// получали из PDF и с телефонной клавиатуры. Показываем читателю стрелку,
// а не артефакт. Правило узкое: апостроф+ n, за которым идёт пробел или знак.

const ARROW_ART = /(\S)['\u2018\u2019\u02BC\u2032\u0060][nN](?=[\s),.;:!?\]]|$)/g;

export function repairArrows(s: string): string {
  if (!s) return s;
  return s.replace(ARROW_ART, '$1\u2192');
}

export function repairText(s: string): string {
  if (!s) return s;
  let o = repairArrows(s);
  o = o.replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl');
  o = o.replace(/\u00AD/g, '');
  return o;
}
