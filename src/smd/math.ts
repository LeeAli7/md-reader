// Мини-набор LaTeX для .smd: парсер в дерево раскладки.
// Задача — не покрыть весь TeX, а честно рисовать школьную математику
// (дроби, корни, степени, суммы) без WebView и без сети.
//
// Поддержано: \frac \dfrac \tfrac, \sqrt[n]{}, ^ _, \text{} \mathrm{},
// \left( \right), матрицы НЕ поддержаны, греческие буквы, операторы,
// \\ — перенос строки внутри блочной формулы.

export type MathNode =
  | { k: 'row'; items: MathNode[] }
  | { k: 'text'; v: string; it?: boolean; up?: boolean }
  | { k: 'frac'; a: MathNode; b: MathNode }
  | { k: 'sqrt'; i?: MathNode; b: MathNode }
  | { k: 'script'; base: MathNode; sup?: MathNode; sub?: MathNode }
  | { k: 'big'; v: string };

const SYMBOLS: Record<string, string> = {
  // стрелки
  to: '→', rightarrow: '→', longrightarrow: '⟶', leftarrow: '←', gets: '←',
  leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  mapsto: '↦', uparrow: '↑', downarrow: '↓',
  // арифметика
  times: '×', cdot: '·', pm: '±', mp: '∓', div: '÷', ast: '∗', star: '⋆',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', propto: '∝', ll: '≪', gg: '≫',
  // прочее
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', angle: '∠', perp: '⊥',
  parallel: '∥', triangle: '△', circ: '∘', degree: '°', prime: '′',
  ldots: '…', dots: '…', cdots: '⋯', therefore: '∴', because: '∵',
  emptyset: '∅', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩',
  sum: '∑', prod: '∏', int: '∫', oint: '∮', lim: 'lim',
  // греческие
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

// Имена функций: рисуем прямым текстом, пробел после.
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'log', 'ln', 'lg', 'exp', 'max', 'min', 'lim', 'mod', 'gcd']);

const BIG = new Set(['sum', 'prod', 'int', 'oint']);

// Тонкие пробелы и разделители.
const SPACES: Record<string, string> = {
  ',': '\u2009', ';': '\u2005', ':': '\u2005', '!': '', quad: '\u2003', qquad: '\u2003\u2003',
};

class P {
  s: string;
  i = 0;
  constructor(s: string) {
    this.s = s;
    this.i = 0;
  }
  eof() {
    return this.i >= this.s.length;
  }
  peek() {
    return this.s[this.i];
  }
  // Пропускает пробелы исходника (в TeX они не значимы).
  skipWs() {
    while (!this.eof() && /\s/.test(this.peek())) this.i++;
  }
  readCommand(): string {
    // this.s[this.i] === '\\'
    this.i++;
    if (this.eof()) return '';
    if (/[a-zA-Z]/.test(this.peek())) {
      let name = '';
      while (!this.eof() && /[a-zA-Z]/.test(this.peek())) name += this.s[this.i++];
      return name;
    }
    // \{ \} \, \; и т.п.
    return this.s[this.i++];
  }
  readBalanced(): string {
    // Читает {...} или одиночный символ/команду после \frac и подобных.
    this.skipWs();
    if (this.peek() === '{') {
      let depth = 0;
      const start = this.i;
      while (!this.eof()) {
        const c = this.s[this.i];
        if (c === '\\') {
          this.i += 2;
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            this.i++;
            return this.s.slice(start + 1, this.i - 1);
          }
        }
        this.i++;
      }
      return this.s.slice(start + 1);
    }
    if (this.peek() === '\\') {
      const start = this.i;
      this.readCommand();
      return this.s.slice(start, this.i);
    }
    const c = this.s[this.i];
    this.i++;
    return c ?? '';
  }
}

function parseRow(p: P, stop?: (c: string) => boolean): MathNode[] {
  const items: MathNode[] = [];
  let buf = '';
  let bufIt = false;
  const flush = () => {
    if (buf) {
      items.push({ k: 'text', v: buf, it: bufIt });
      buf = '';
      bufIt = false;
    }
  };
  const pushText = (v: string, it = false) => {
    if (!v) return;
    if (it !== bufIt) flush();
    bufIt = it;
    buf += v;
  };

  while (!p.eof()) {
    const c = p.peek();
    if (stop && stop(c)) break;

    if (c === '\\') {
      const cmd = p.readCommand();
      if (cmd === '\\') {
        flush();
        items.push({ k: 'text', v: '\n' });
        continue;
      }
      if (cmd in SPACES) {
        pushText(SPACES[cmd]);
        continue;
      }
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        flush();
        const a = parseSrc(p.readBalanced());
        const b = parseSrc(p.readBalanced());
        items.push({ k: 'frac', a, b });
        continue;
      }
      if (cmd === 'sqrt') {
        flush();
        let idx: MathNode | undefined;
        p.skipWs();
        if (p.peek() === '[') {
          let j = p.i + 1;
          let depth = 0;
          let end = -1;
          for (; j < p.s.length; j++) {
            if (p.s[j] === '{') depth++;
            else if (p.s[j] === '}') depth--;
            else if (p.s[j] === ']' && depth === 0) {
              end = j;
              break;
            }
          }
          if (end > 0) {
            idx = parseSrc(p.s.slice(p.i + 1, end));
            p.i = end + 1;
          }
        }
        const body = parseSrc(p.readBalanced());
        items.push({ k: 'sqrt', ...(idx ? { i: idx } : {}), b: body });
        continue;
      }
      if (cmd === 'text' || cmd === 'mathrm' || cmd === 'textrm' || cmd === 'operatorname' || cmd === 'mathbf') {
        flush();
        const raw = p.readBalanced();
        items.push({ k: 'text', v: raw, it: false, up: true });
        continue;
      }
      if (cmd === 'left' || cmd === 'right') {
        p.skipWs();
        const d = p.peek();
        if (d === '.') {
          p.i++;
          continue;
        }
        if (d === '\\') {
          const dc = p.readCommand();
          pushText(SYMBOLS[dc] ?? dc);
          continue;
        }
        pushText(d ?? '');
        p.i++;
        continue;
      }
      if (cmd === '{' || cmd === '}' || cmd === '%' || cmd === '&' || cmd === '#' || cmd === '_') {
        pushText(cmd);
        continue;
      }
      if (FUNCS.has(cmd)) {
        flush();
        items.push({ k: 'text', v: cmd, up: true });
        pushText('\u2009');
        continue;
      }
      if (BIG.has(cmd)) {
        flush();
        const v = SYMBOLS[cmd];
        items.push({ k: 'big', v: v === 'lim' ? 'lim' : v });
        continue;
      }
      if (cmd in SYMBOLS) {
        pushText(SYMBOLS[cmd]);
        continue;
      }
      // Неизвестная команда — показываем имя, а не мусор.
      pushText(cmd);
      continue;
    }

    if (c === '^' || c === '_') {
      flush();
      p.i++;
      const arg = parseSrc(p.readBalanced());
      // Степень и индекс липнут к предыдущему атому; x_2^3 даёт один узел.
      const prev = items.pop();
      const base: MathNode = prev ?? { k: 'text', v: '' };
      if (prev && prev.k === 'script' && ((c === '^' && !prev.sup) || (c === '_' && !prev.sub))) {
        items.push(c === '^' ? { ...prev, sup: arg } : { ...prev, sub: arg });
        continue;
      }
      items.push(c === '^' ? { k: 'script', base, sup: arg } : { k: 'script', base, sub: arg });
      continue;
    }

    if (c === '{') {
      p.i++;
      const inner = parseRow(p, (ch) => ch === '}');
      if (p.peek() === '}') p.i++;
      flush();
      items.push({ k: 'row', items: inner });
      continue;
    }
    if (c === '}') break;

    if (c === '&') {
      p.i++;
      pushText('\u2003');
      continue;
    }

    // Обычные символы. Одиночная латинская буква — курсивом (как переменная).
    if (/[a-zA-Z]/.test(c)) {
      pushText(c, true);
      p.i++;
      continue;
    }
    pushText(c);
    p.i++;
  }
  flush();
  return items;
}

function parseSrc(src: string): MathNode {
  const p = new P(src);
  const items = parseRow(p);
  return { k: 'row', items };
}

/** Разбирает формулу в список строк (по \\ внутри). */
export function parseMath(src: string): MathNode[][] {
  const rows: MathNode[][] = [];
  for (const line of splitRows(src)) rows.push(parseRow(new P(line)));
  return rows;
}

function splitRows(src: string): string[] {
  // Только на верхнем уровне: \\ внутри {} не должен рвать.
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === '\\' && src[i + 1] === '\\' && depth <= 0) {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.filter((r) => r.trim() !== '');
}

/** Убирает $$..$$ / $..$ обёртки. */
export function stripDelims(src: string): string {
  const s = src.trim();
  if (s.startsWith('$$') && s.endsWith('$$')) return s.slice(2, -2).trim();
  if (s.startsWith('$') && s.endsWith('$')) return s.slice(1, -1).trim();
  if (s.startsWith('\\[') && s.endsWith('\\]')) return s.slice(2, -2).trim();
  return s;
}
