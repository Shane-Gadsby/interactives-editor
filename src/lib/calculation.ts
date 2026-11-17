import { operandToExpr, type Operand } from './condition';

/**
 * The "Pick a calculation" model: a plain template for a value formula (add, a percentage, how many items match, a total, round,
 * this if that otherwise the other, join text), each filled in with values and writing ordinary formula text. The same rule as the
 * condition pickers: `parseCalc` only reads back what `calcToExpr` writes, so a formula it does not recognise is never touched, and
 * the component writes only when somebody presses the button.
 */

export type Arith = '+' | '-' | '*' | '/';
export type Cmp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains';

export const CMP_LABELS: Record<Cmp, string> = {
  '==': 'is',
  '!=': 'is not',
  '>': 'is more than',
  '>=': 'is at least',
  '<': 'is less than',
  '<=': 'is at most',
  contains: 'contains',
};
export const CMP_ORDER: Cmp[] = ['==', '!=', '>', '>=', '<', '<=', 'contains'];

export type JoinPart = { t: 'text'; value: string } | { t: 'value'; value: Operand };

export type Calc =
  | { t: 'arith'; op: Arith; a: Operand; b: Operand }
  | { t: 'percent'; part: Operand; whole: Operand }
  | { t: 'count'; list: string; test: { field: string; op: Cmp; value: Operand } | null }
  | { t: 'sum'; list: string; field: string }
  | { t: 'extreme'; which: 'max' | 'min'; a: Operand; b: Operand }
  | { t: 'round'; value: Operand; places: number }
  | { t: 'ifelse'; cond: string; then: Operand; otherwise: Operand }
  | { t: 'join'; parts: JoinPart[] };

/** What the template menu offers, in order. `key` is what the component keeps in its menu. */
export interface CalcKind {
  key: string;
  label: string;
  /** A fresh calculation of this kind. `first` is the name of the first number, `list` the first list, to start from something real. */
  start: (first: string, list: string) => Calc;
}

const name = (n: string): Operand => ({ t: 'name', name: n });
const num = (v: number): Operand => ({ t: 'num', value: v });
const str = (v: string): Operand => ({ t: 'str', value: v });
const start = (n: string): Operand => (n ? name(n) : num(0));

export const CALC_KINDS: CalcKind[] = [
  { key: 'add', label: 'Add two values', start: (f) => ({ t: 'arith', op: '+', a: start(f), b: num(1) }) },
  { key: 'subtract', label: 'Take one value from another', start: (f) => ({ t: 'arith', op: '-', a: start(f), b: num(1) }) },
  { key: 'multiply', label: 'Multiply two values', start: (f) => ({ t: 'arith', op: '*', a: start(f), b: num(2) }) },
  { key: 'divide', label: 'Divide one value by another', start: (f) => ({ t: 'arith', op: '/', a: start(f), b: num(2) }) },
  { key: 'percent', label: 'What percentage one value is of another', start: (f) => ({ t: 'percent', part: start(f), whole: num(10) }) },
  { key: 'count', label: 'How many items in a list match', start: (_f, l) => ({ t: 'count', list: l, test: null }) },
  { key: 'sum', label: 'The total of a number in each list item', start: (_f, l) => ({ t: 'sum', list: l, field: '' }) },
  { key: 'max', label: 'The larger of two values', start: (f) => ({ t: 'extreme', which: 'max', a: start(f), b: num(0) }) },
  { key: 'min', label: 'The smaller of two values', start: (f) => ({ t: 'extreme', which: 'min', a: start(f), b: num(10) }) },
  { key: 'round', label: 'Round a number', start: (f) => ({ t: 'round', value: start(f), places: 0 }) },
  { key: 'ifelse', label: 'One thing if a condition holds, otherwise another', start: () => ({ t: 'ifelse', cond: '', then: str(''), otherwise: str('') }) },
  { key: 'join', label: 'Join text and values together', start: (f) => ({ t: 'join', parts: [{ t: 'text', value: 'Score: ' }, { t: 'value', value: start(f) }] }) },
];

/** The menu entry a calculation belongs to. */
export function kindOf(c: Calc): string {
  switch (c.t) {
    case 'arith':
      return c.op === '+' ? 'add' : c.op === '-' ? 'subtract' : c.op === '*' ? 'multiply' : 'divide';
    case 'extreme':
      return c.which;
    default:
      return c.t;
  }
}

export const MAX_PLACES = 6;
export const MAX_PARTS = 8;

// ---------------------------------------------------------------- model to text

const NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

const lit = (s: string): string => JSON.stringify(s);

/** A text part inside a template literal: the characters that would end it or start a slot are escaped. */
const templateText = (s: string): string => s.replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${');

const operandOk = (o: Operand | undefined): boolean => !!o && (o.t !== 'name' || NAME.test(o.name)) && (o.t !== 'num' || Number.isFinite(o.value));

/** Whether every box the template needs is filled in well enough to write. */
export function calcComplete(c: Calc): boolean {
  switch (c.t) {
    case 'arith':
    case 'extreme':
      return operandOk(c.a) && operandOk(c.b);
    case 'percent':
      return operandOk(c.part) && operandOk(c.whole);
    case 'count':
      return NAME.test(c.list) && (!c.test || operandOk(c.test.value));
    case 'sum':
      return NAME.test(c.list);
    case 'round':
      return operandOk(c.value) && Number.isInteger(c.places) && c.places >= 0 && c.places <= MAX_PLACES;
    case 'ifelse':
      return c.cond.trim() !== '' && operandOk(c.then) && operandOk(c.otherwise);
    case 'join':
      return c.parts.length > 0 && c.parts.every((p) => (p.t === 'text' ? true : operandOk(p.value)));
  }
}

/** The formula text for a calculation. Only call it when `calcComplete`. */
export function calcToExpr(c: Calc): string {
  switch (c.t) {
    case 'arith':
      return `${operandToExpr(c.a)} ${c.op} ${operandToExpr(c.b)}`;
    case 'percent': {
      const whole = operandToExpr(c.whole);
      return `${whole} > 0 ? Math.round(${operandToExpr(c.part)} / ${whole} * 100) : 0`;
    }
    case 'count': {
      if (!c.test) return `count(${c.list})`;
      const v = operandToExpr(c.test.value);
      if (c.test.op === '==') return c.test.field.trim() === '' ? `count(${c.list}, ${v})` : `count(${c.list}, ${lit(c.test.field.trim())}, ${v})`;
      return `count(${c.list}, ${lit(c.test.field.trim())}, ${lit(c.test.op)}, ${v})`;
    }
    case 'sum':
      return c.field.trim() === '' ? `sum(${c.list})` : `sum(${c.list}, ${lit(c.field.trim())})`;
    case 'extreme':
      return `Math.${c.which}(${operandToExpr(c.a)}, ${operandToExpr(c.b)})`;
    case 'round': {
      const v = operandToExpr(c.value);
      return c.places === 0 ? `Math.round(${v})` : `Math.round(${v} * 1${'0'.repeat(c.places)}) / 1${'0'.repeat(c.places)}`;
    }
    case 'ifelse':
      return `${c.cond.trim()} ? ${operandToExpr(c.then)} : ${operandToExpr(c.otherwise)}`;
    case 'join':
      return '`' + c.parts.map((p) => (p.t === 'text' ? templateText(p.value) : '${' + operandToExpr(p.value) + '}')).join('') + '`';
  }
}

// ---------------------------------------------------------------- text to model

const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/;

/** One value as written: a number, a "text", true or false, or a name (dots allowed). Null for anything else. */
export function parseOperand(src: string): Operand | null {
  const s = src.trim();
  if (NUMBER_TEXT.test(s)) return { t: 'num', value: Number(s) };
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const v: unknown = JSON.parse(s);
      return typeof v === 'string' ? { t: 'str', value: v } : null;
    } catch {
      return null;
    }
  }
  if (s === 'true' || s === 'false') return { t: 'bool', value: s === 'true' };
  if (s === 'null' || s === 'undefined') return null;
  return NAME.test(s) ? { t: 'name', name: s } : null;
}

/** The pieces of `s` between top level `sep`s: not inside quotes, brackets or a template literal. */
function splitTop(s: string, sep: string): string[] | null {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
    if (depth < 0) return null;
  }
  if (quote || depth !== 0) return null;
  out.push(s.slice(from));
  return out;
}

/** The arguments of `fn(...)` when the whole text is that one call, else null. */
function callArgs(s: string, fn: string): string[] | null {
  if (!s.startsWith(fn + '(') || !s.endsWith(')')) return null;
  const inner = s.slice(fn.length + 1, -1);
  const args = splitTop(inner, ',');
  return args && args.every((a) => a.trim() !== '') ? args.map((a) => a.trim()) : null;
}

const stringArg = (s: string | undefined): string | null => {
  const o = s === undefined ? null : parseOperand(s);
  return o && o.t === 'str' ? o.value : null;
};
const nameArg = (s: string | undefined): string | null => (s !== undefined && NAME.test(s) && s !== 'true' && s !== 'false' ? s : null);

const ARITH: Arith[] = ['+', '-', '*', '/'];

/** What `calcToExpr` would have written, read back; null when the text is anything else. */
export function parseCalc(src: string): Calc | null {
  const s = src.trim();
  if (!s) return null;

  //two values and a sign between single spaces: 3 + score. (A negative number reads as itself.)
  for (const op of ARITH) {
    const parts = s.split(` ${op} `);
    if (parts.length === 2) {
      const a = parseOperand(parts[0]);
      const b = parseOperand(parts[1]);
      if (a && b && a.t !== 'bool' && b.t !== 'bool') return { t: 'arith', op, a, b };
    }
  }

  const pct = /^(\S+) > 0 \? Math\.round\((\S+) \/ (\S+) \* 100\) : 0$/.exec(s);
  if (pct && pct[1] === pct[3]) {
    const part = parseOperand(pct[2]);
    const whole = parseOperand(pct[1]);
    if (part && whole) return { t: 'percent', part, whole };
  }

  const count = callArgs(s, 'count');
  if (count) {
    const list = nameArg(count[0]);
    if (!list) return null;
    if (count.length === 1) return { t: 'count', list, test: null };
    if (count.length === 2) {
      const value = parseOperand(count[1]);
      return value ? { t: 'count', list, test: { field: '', op: '==', value } } : null;
    }
    const field = stringArg(count[1]);
    if (field === null) return null;
    if (count.length === 3) {
      const value = parseOperand(count[2]);
      return value ? { t: 'count', list, test: { field, op: '==', value } } : null;
    }
    if (count.length === 4) {
      const op = stringArg(count[2]);
      const value = parseOperand(count[3]);
      return op && (CMP_ORDER as string[]).includes(op) && value ? { t: 'count', list, test: { field, op: op as Cmp, value } } : null;
    }
    return null;
  }

  const sum = callArgs(s, 'sum');
  if (sum) {
    const list = nameArg(sum[0]);
    if (!list || sum.length > 2) return null;
    if (sum.length === 1) return { t: 'sum', list, field: '' };
    const field = stringArg(sum[1]);
    return field === null ? null : { t: 'sum', list, field };
  }

  for (const which of ['max', 'min'] as const) {
    const args = callArgs(s, `Math.${which}`);
    if (args && args.length === 2) {
      const a = parseOperand(args[0]);
      const b = parseOperand(args[1]);
      return a && b && a.t !== 'bool' && b.t !== 'bool' ? { t: 'extreme', which, a, b } : null;
    }
  }

  const rounded = /^Math\.round\((.+) \* 1(0+)\) \/ 1(0+)$/.exec(s);
  if (rounded && rounded[2] === rounded[3] && rounded[2].length <= MAX_PLACES) {
    const value = parseOperand(rounded[1]);
    if (value && value.t !== 'bool') return { t: 'round', value, places: rounded[2].length };
  }
  const whole = callArgs(s, 'Math.round');
  if (whole && whole.length === 1) {
    const value = parseOperand(whole[0]);
    if (value && value.t !== 'bool') return { t: 'round', value, places: 0 };
  }

  if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) return parseJoin(s.slice(1, -1));

  return parseIfElse(s);
}

function parseJoin(inner: string): Calc | null {
  const parts: JoinPart[] = [];
  let text = '';
  let i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if (c === '\\') {
      const next = inner[i + 1];
      if (next === '\\' || next === '`' || next === '$') text += next;
      else return null;
      i += 2;
    } else if (c === '$' && inner[i + 1] === '{') {
      const close = inner.indexOf('}', i);
      if (close < 0) return null;
      const value = parseOperand(inner.slice(i + 2, close));
      if (!value) return null;
      if (text !== '') parts.push({ t: 'text', value: text });
      parts.push({ t: 'value', value });
      text = '';
      i = close + 1;
    } else {
      text += c;
      i++;
    }
  }
  if (text !== '') parts.push({ t: 'text', value: text });
  return parts.length > 0 && parts.length <= MAX_PARTS ? { t: 'join', parts } : null;
}

function parseIfElse(s: string): Calc | null {
  const q = splitTop(s, '?');
  if (!q || q.length !== 2) return null;
  const c = splitTop(q[1], ':');
  if (!c || c.length !== 2) return null;
  const cond = q[0].trim();
  //optional chaining, ?? and the like put a second ? or : in the condition; leave those as they are
  if (!cond || /\?/.test(cond.replace(/"(?:[^"\\]|\\.)*"/g, '')) || /:/.test(cond.replace(/"(?:[^"\\]|\\.)*"/g, ''))) return null;
  const then = parseOperand(c[0]);
  const otherwise = parseOperand(c[1]);
  return then && otherwise ? { t: 'ifelse', cond, then, otherwise } : null;
}
