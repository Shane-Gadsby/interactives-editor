/**
 * The condition picker's model: a yes/no formula as rows of [value] [is / is at least / ...] [value], joined by "and" or "or".
 * Only the plain subset fits (comparisons, &&, ||, !, .includes, .length against 0). parseCondition says null for anything else, so a
 * formula the pickers can't show is left exactly as typed and opens as text. Nothing here ever rewrites a formula it can't parse
 * back: the component only writes after somebody changes a row.
 */

export type Operand = { t: 'name'; name: string } | { t: 'num'; value: number } | { t: 'str'; value: string } | { t: 'bool'; value: boolean };

export type CondOp = 'is' | 'isnot' | 'atleast' | 'atmost' | 'more' | 'less' | 'contains' | 'empty' | 'notempty' | 'true' | 'false';

export interface CondRow {
  /** A name or a dotted path: score, quiz.score, event.index. */
  left: string;
  op: CondOp;
  /** Missing for the ones that ask nothing more (is empty, is true...). */
  right?: Operand;
}

export interface Condition {
  join: 'and' | 'or';
  rows: CondRow[];
}

export const OP_LABELS: Record<CondOp, string> = {
  is: 'is',
  isnot: 'is not',
  atleast: 'is at least',
  atmost: 'is at most',
  more: 'is more than',
  less: 'is less than',
  contains: 'contains',
  empty: 'is empty',
  notempty: 'is not empty',
  true: 'is on (true)',
  false: 'is off (false)',
};

export const OP_ORDER: CondOp[] = ['is', 'isnot', 'atleast', 'atmost', 'more', 'less', 'contains', 'empty', 'notempty', 'true', 'false'];

/** Whether a row of this kind has a value to its right. */
export const opTakesValue = (op: CondOp): boolean => !(op === 'empty' || op === 'notempty' || op === 'true' || op === 'false');

const MAX_ROWS = 8;
const SYMBOL: Partial<Record<CondOp, string>> = { is: '==', isnot: '!=', atleast: '>=', atmost: '<=', more: '>', less: '<' };
const FROM_SYMBOL: Record<string, CondOp> = { '==': 'is', '===': 'is', '!=': 'isnot', '!==': 'isnot', '>=': 'atleast', '<=': 'atmost', '>': 'more', '<': 'less' };

// ---------------------------------------------------------------- text from a model

export function operandToExpr(o: Operand): string {
  if (o.t === 'name') return o.name;
  if (o.t === 'num') return String(o.value);
  if (o.t === 'bool') return o.value ? 'true' : 'false';
  return JSON.stringify(o.value);
}

export function rowToExpr(r: CondRow): string {
  switch (r.op) {
    case 'true':
      return r.left;
    case 'false':
      return `!${r.left}`;
    case 'empty':
      return `${r.left}.length == 0`;
    case 'notempty':
      return `${r.left}.length > 0`;
    case 'contains':
      return `${r.left}.includes(${operandToExpr(r.right ?? { t: 'str', value: '' })})`;
    default:
      return `${r.left} ${SYMBOL[r.op]} ${operandToExpr(r.right ?? { t: 'num', value: 0 })}`;
  }
}

/** The formula for a condition: rows joined with && or ||. No rows is no condition (an empty string). */
export function conditionToExpr(c: Condition): string {
  return c.rows.map(rowToExpr).join(c.join === 'or' ? ' || ' : ' && ');
}

/** A row that can be written: it names a value, and has the value it needs. */
export const rowComplete = (r: CondRow): boolean => !!r.left && (!opTakesValue(r.op) || (!!r.right && (r.right.t !== 'name' || !!r.right.name) && (r.right.t !== 'num' || Number.isFinite(r.right.value))));

// ---------------------------------------------------------------- text to a model

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'p'; v: string };

const PUNCT = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '!', '(', ')', '.'];

function lex(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let raw = '';
      let escaped = false;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') {
          escaped = true;
          raw += src[j] + (src[j + 1] ?? '');
          j += 2;
        } else raw += src[j++];
      }
      if (j >= src.length) return null;
      let value = raw;
      if (escaped) {
        // only a double-quoted string with JSON's escapes is read; anything stranger stays a formula
        if (c !== '"') return null;
        try {
          value = JSON.parse(`"${raw}"`);
        } catch {
          return null;
        }
      }
      out.push({ t: 'str', v: value });
      i = j + 1;
      continue;
    }
    const num = /^-?(?:\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (num && (c !== '-' || !out.length || out[out.length - 1].t === 'p') && !/^[A-Za-z_$]/.test(src.slice(i + num[0].length, i + num[0].length + 1))) {
      // a minus sign belongs to a number only where an operand starts
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) return null;
    out.push({ t: 'p', v: p });
    i += p.length;
  }
  return out;
}

const RESERVED = new Set(['null', 'undefined', 'this', 'typeof', 'new', 'void', 'in', 'function']);

class Reader {
  pos = 0;
  constructor(private readonly toks: Tok[]) {}
  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  done(): boolean {
    return this.pos >= this.toks.length;
  }
  isP(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'p' && t.v === v;
  }
  eatP(v: string): boolean {
    if (!this.isP(v)) return false;
    this.pos++;
    return true;
  }
  /** a.b.c as one string, stopping before `.includes(`; null when no name starts here */
  path(): string | null {
    const t = this.peek();
    if (!t || t.t !== 'id' || RESERVED.has(t.v) || t.v === 'true' || t.v === 'false') return null;
    this.pos++;
    const parts = [t.v];
    while (this.isP('.')) {
      const n = this.toks[this.pos + 1];
      if (!n || n.t !== 'id' || RESERVED.has(n.v)) return null;
      if (n.v === 'includes' && this.toks[this.pos + 2]?.t === 'p' && (this.toks[this.pos + 2] as { v: string }).v === '(') break;
      this.pos += 2;
      parts.push(n.v);
    }
    return parts.join('.');
  }
  operand(): Operand | null {
    const t = this.peek();
    if (!t) return null;
    if (t.t === 'num') return (this.pos++, { t: 'num', value: t.v });
    if (t.t === 'str') return (this.pos++, { t: 'str', value: t.v });
    if (t.t === 'id' && (t.v === 'true' || t.v === 'false')) return (this.pos++, { t: 'bool', value: t.v === 'true' });
    const p = this.path();
    return p === null ? null : { t: 'name', name: p };
  }
}

function readRow(r: Reader): CondRow | null {
  if (r.eatP('!')) {
    const left = r.path();
    return left === null ? null : { left, op: 'false' };
  }
  const first = r.peek();
  // a value on the left of a comparison has to be a name: 5 < score is left as a formula
  if (!first || first.t !== 'id') return null;
  const left = r.path();
  if (left === null) return null;
  if (r.isP('.')) {
    // path() stopped before .includes(
    r.pos += 2;
    if (!r.eatP('(')) return null;
    const right = r.operand();
    if (!right || !r.eatP(')')) return null;
    return { left, op: 'contains', right };
  }
  const t = r.peek();
  if (!t || (t.t === 'p' && (t.v === '&&' || t.v === '||'))) return { left, op: 'true' };
  if (t.t !== 'p' || !(t.v in FROM_SYMBOL)) return null;
  r.pos++;
  const right = r.operand();
  if (!right) return null;
  const op = FROM_SYMBOL[t.v];
  // x.length == 0 reads as "is empty", x.length > 0 as "is not empty"
  if (left.endsWith('.length') && right.t === 'num' && right.value === 0) {
    const base = left.slice(0, -'.length'.length);
    if (op === 'is') return { left: base, op: 'empty' };
    if (op === 'more') return { left: base, op: 'notempty' };
  }
  return { left, op, right };
}

/**
 * The condition a formula says, or null when it says more than the pickers can (arithmetic, function calls, brackets, a mix of
 * && and || ...). Empty text is a condition with no rows.
 */
export function parseCondition(src: string): Condition | null {
  if (!src.trim()) return { join: 'and', rows: [] };
  const toks = lex(src);
  if (!toks || !toks.length) return null;
  const r = new Reader(toks);
  const rows: CondRow[] = [];
  let join: 'and' | 'or' | null = null;
  for (;;) {
    const row = readRow(r);
    if (!row) return null;
    rows.push(row);
    if (rows.length > MAX_ROWS) return null;
    if (r.done()) break;
    const j = r.eatP('&&') ? 'and' : r.eatP('||') ? 'or' : null;
    if (!j || (join && join !== j)) return null;
    join = j;
  }
  return { join: join ?? 'and', rows };
}

/** Whether the text is exactly what the pickers would write back (so opening and closing the pickers can't change it). */
export function conditionIsExact(src: string): boolean {
  const c = parseCondition(src);
  return !!c && conditionToExpr(c) === src.trim().replace(/\s+/g, ' ');
}

/** A condition in words, for sentences: "score is at least 5 and done is on". A formula the pickers can't read comes back as typed. */
export function conditionWords(src: string): string {
  const c = parseCondition(src);
  const t = src.trim().replace(/\s+/g, ' ');
  if (!c || !c.rows.length) return t;
  const word = (o: Operand) => (o.t === 'str' ? `“${o.value}”` : o.t === 'bool' ? (o.value ? 'on' : 'off') : operandToExpr(o));
  return c.rows
    .map((r) => {
      if (r.op === 'true') return `${r.left} is on`;
      if (r.op === 'false') return `${r.left} is off`;
      return `${r.left} ${OP_LABELS[r.op]}${r.right && opTakesValue(r.op) ? ' ' + word(r.right) : ''}`;
    })
    .join(c.join === 'or' ? ' or ' : ' and ');
}
