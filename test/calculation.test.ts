import { describe, expect, it } from 'vitest';
import { checkExpression, evaluate } from 'interactives-player';
import { CALC_KINDS, calcComplete, calcToExpr, kindOf, parseCalc, parseOperand, type Calc } from '../src/lib/calculation';

const scope = {
  vars: {
    score: 7,
    total: 20,
    zero: 0,
    name: 'Ann',
    cards: [{ s: 'up', n: 1 }, { s: 'down', n: 2 }, { s: 'up', n: 3 }],
    words: ['a', 'b', 'a'],
    quiz: { score: 3 },
    price: 3.14159,
    flag: true,
  },
};
const run = (c: Calc) => {
  const text = calcToExpr(c);
  checkExpression(text);
  return evaluate(text, scope);
};
const n = (v: number) => ({ t: 'num' as const, value: v });
const nm = (v: string) => ({ t: 'name' as const, name: v });
const s = (v: string) => ({ t: 'str' as const, value: v });

describe('calculation templates write ordinary formulas', () => {
  it('arithmetic', () => {
    expect(calcToExpr({ t: 'arith', op: '+', a: nm('score'), b: n(1) })).toBe('score + 1');
    expect(run({ t: 'arith', op: '+', a: nm('score'), b: nm('total') })).toBe(27);
    expect(run({ t: 'arith', op: '-', a: nm('total'), b: nm('score') })).toBe(13);
    expect(run({ t: 'arith', op: '*', a: nm('quiz.score'), b: n(2) })).toBe(6);
    expect(run({ t: 'arith', op: '/', a: nm('total'), b: n(4) })).toBe(5);
    expect(calcToExpr({ t: 'arith', op: '-', a: n(5), b: n(-3) })).toBe('5 - -3');
  });
  it('percentage, with a whole of 0 giving 0 not a broken number', () => {
    expect(calcToExpr({ t: 'percent', part: nm('score'), whole: nm('total') })).toBe('total > 0 ? Math.round(score / total * 100) : 0');
    expect(run({ t: 'percent', part: nm('score'), whole: nm('total') })).toBe(35);
    expect(run({ t: 'percent', part: nm('score'), whole: nm('zero') })).toBe(0);
  });
  it('how many match, in each of its forms', () => {
    expect(calcToExpr({ t: 'count', list: 'cards', test: null })).toBe('count(cards)');
    expect(run({ t: 'count', list: 'cards', test: null })).toBe(3);
    expect(calcToExpr({ t: 'count', list: 'cards', test: { field: 's', op: '==', value: s('up') } })).toBe('count(cards, "s", "up")');
    expect(run({ t: 'count', list: 'cards', test: { field: 's', op: '==', value: s('up') } })).toBe(2);
    expect(run({ t: 'count', list: 'words', test: { field: '', op: '==', value: s('a') } })).toBe(2);
    expect(calcToExpr({ t: 'count', list: 'words', test: { field: '', op: '==', value: s('a') } })).toBe('count(words, "a")');
    expect(run({ t: 'count', list: 'cards', test: { field: 'n', op: '>=', value: n(2) } })).toBe(2);
    expect(calcToExpr({ t: 'count', list: 'cards', test: { field: 'n', op: '>', value: nm('score') } })).toBe('count(cards, "n", ">", score)');
  });
  it('total, largest and smallest, round', () => {
    expect(run({ t: 'sum', list: 'cards', field: 'n' })).toBe(6);
    expect(calcToExpr({ t: 'sum', list: 'cards', field: '' })).toBe('sum(cards)');
    expect(run({ t: 'extreme', which: 'max', a: nm('score'), b: nm('total') })).toBe(20);
    expect(run({ t: 'extreme', which: 'min', a: nm('score'), b: nm('total') })).toBe(7);
    expect(run({ t: 'round', value: nm('price'), places: 0 })).toBe(3);
    expect(calcToExpr({ t: 'round', value: nm('price'), places: 2 })).toBe('Math.round(price * 100) / 100');
    expect(run({ t: 'round', value: nm('price'), places: 2 })).toBe(3.14);
    expect(run({ t: 'round', value: nm('price'), places: 3 })).toBe(3.142);
  });
  it('this if that otherwise the other, and joining text', () => {
    const c: Calc = { t: 'ifelse', cond: 'score >= 5', then: s('Pass'), otherwise: s('Try again') };
    expect(calcToExpr(c)).toBe('score >= 5 ? "Pass" : "Try again"');
    expect(run(c)).toBe('Pass');
    expect(run({ t: 'join', parts: [{ t: 'text', value: 'Hello ' }, { t: 'value', value: nm('name') }, { t: 'text', value: '! Score ' }, { t: 'value', value: nm('score') }] })).toBe('Hello Ann! Score 7');
    //two numbers joined are text, not added
    expect(run({ t: 'join', parts: [{ t: 'value', value: nm('score') }, { t: 'value', value: nm('total') }] })).toBe('720');
    expect(run({ t: 'join', parts: [{ t: 'text', value: 'a `tick` ${x} \\ b' }] })).toBe('a `tick` ${x} \\ b');
  });
});

describe('reading a formula back', () => {
  const kinds = (c: Calc) => parseCalc(calcToExpr(c));
  it('reads back everything it writes', () => {
    const all: Calc[] = [
      { t: 'arith', op: '+', a: nm('score'), b: n(1) },
      { t: 'arith', op: '-', a: n(5), b: n(-3) },
      { t: 'arith', op: '/', a: nm('quiz.score'), b: nm('total') },
      { t: 'arith', op: '+', a: s('a'), b: s('b') },
      { t: 'percent', part: nm('score'), whole: nm('total') },
      { t: 'count', list: 'cards', test: null },
      { t: 'count', list: 'cards', test: { field: 's', op: '==', value: s('up') } },
      { t: 'count', list: 'words', test: { field: '', op: '==', value: s('a') } },
      { t: 'count', list: 'cards', test: { field: 'n', op: '>=', value: n(2.5) } },
      { t: 'count', list: 'cards', test: { field: 'done', op: '==', value: { t: 'bool', value: true } } },
      { t: 'count', list: 'cards', test: { field: 'name', op: 'contains', value: s('x, y') } },
      { t: 'sum', list: 'cards', field: 'n' },
      { t: 'sum', list: 'cards', field: '' },
      { t: 'extreme', which: 'max', a: nm('score'), b: n(0) },
      { t: 'extreme', which: 'min', a: nm('score'), b: nm('total') },
      { t: 'round', value: nm('price'), places: 0 },
      { t: 'round', value: nm('price'), places: 2 },
      { t: 'ifelse', cond: 'score >= 5 && name == "A?B"', then: s('Pass: yes'), otherwise: n(0) },
      { t: 'join', parts: [{ t: 'text', value: 'Hello ' }, { t: 'value', value: nm('name') }, { t: 'text', value: '! `x` ${y}' }] },
      { t: 'join', parts: [{ t: 'value', value: nm('a') }, { t: 'value', value: nm('b') }] },
    ];
    for (const c of all) expect(kinds(c), calcToExpr(c)).toEqual(c);
  });
  it('leaves anything else alone: null, so the text stays as it is', () => {
    for (const text of [
      '',
      'score',
      'score + 1 + 2',
      'score + b * c',
      'cards.filter(c => c.s == "up").length',
      'count(cards, "s") + 1',
      'count(cards, s, "up")',
      'count(cards, "s", "bigger", 3)',
      'count(cards, "s", "==", 1, 2)',
      'sum(cards, n)',
      'sum(cards, "n", 1)',
      'Math.max(score, 1, 2)',
      'Math.max(...scores)',
      'Math.round(score * 7) / 7',
      'Math.round(score * 100) / 1000',
      'total > 0 ? Math.round(score / other * 100) : 0',
      'a ? b : c ? d : e',
      'a?.b ? 1 : 2',
      'a ?? b ? 1 : 2',
      'score > 1 ? x + 1 : 2',
      '`Hello ${name.toUpperCase()}`',
      '`Hello ${name`',
      '`bad \\n escape`',
      'score + undefined',
      'score + null',
      'fmt(score, 2)',
    ])
      expect(parseCalc(text), text).toBeNull();
  });
  it('reads operands as a number, text, on/off or a name with dots', () => {
    expect(parseOperand('-2.5')).toEqual(n(-2.5));
    expect(parseOperand('"a b"')).toEqual(s('a b'));
    expect(parseOperand('true')).toEqual({ t: 'bool', value: true });
    expect(parseOperand('quiz.score')).toEqual(nm('quiz.score'));
    expect(parseOperand('a.')).toBeNull();
    expect(parseOperand('1a')).toBeNull();
    expect(parseOperand('"unterminated')).toBeNull();
  });
});

describe('the menu and what is ready to write', () => {
  it('every menu entry starts as a calculation of its own kind, and the starts that need nothing more are complete', () => {
    expect(CALC_KINDS.map((k) => k.key)).toEqual(['add', 'subtract', 'multiply', 'divide', 'percent', 'count', 'sum', 'max', 'min', 'round', 'ifelse', 'join']);
    for (const k of CALC_KINDS) {
      const c = k.start('score', 'cards');
      expect(kindOf(c), k.key).toBe(k.key);
      //a condition for this-if-that is still to be chosen
      expect(calcComplete(c), k.key).toBe(k.key !== 'ifelse');
      if (calcComplete(c)) expect(parseCalc(calcToExpr(c)), k.key).toEqual(c);
    }
    expect(calcComplete({ t: 'count', list: '', test: null })).toBe(false);
    expect(calcComplete({ t: 'arith', op: '+', a: nm(''), b: n(1) })).toBe(false);
    expect(calcComplete({ t: 'arith', op: '+', a: n(NaN), b: n(1) })).toBe(false);
    expect(calcComplete({ t: 'round', value: n(1), places: 9 })).toBe(false);
    expect(calcComplete({ t: 'ifelse', cond: 'score > 1', then: s(''), otherwise: s('') })).toBe(true);
  });
});
