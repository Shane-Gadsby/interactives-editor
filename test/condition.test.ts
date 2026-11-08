//The condition picker's model: formula to rows and back, and never touching a formula it cannot read in full.
import { describe, expect, it } from 'vitest';
import { checkExpression } from 'interactives-player';
import { conditionIsExact, conditionToExpr, conditionWords, OP_ORDER, opTakesValue, parseCondition, rowComplete, type Condition } from '../src/lib/condition';

const CANONICAL = [
  'score >= 5',
  'score > 10',
  'score < 3',
  'score <= 3',
  'score == 7',
  'score != 7',
  'name == "Sam"',
  'name != "Sam"',
  'done',
  '!done',
  'done == true',
  'lives > 0 && !gameOver',
  'a == 1 || b == 2 || c == 3',
  'answer.includes("yes")',
  'answers.includes(event.value)',
  'name.length == 0',
  'list.length > 0',
  'quiz.score >= quiz.passMark',
  'event.index == 2',
  'x > -5',
  'x > 2.5',
];

describe('parseCondition and conditionToExpr', () => {
  it('reads a formula into rows and writes the same formula back, for every plain shape', () => {
    for (const src of CANONICAL) {
      const c = parseCondition(src);
      expect(c, src).not.toBeNull();
      expect(conditionToExpr(c!), src).toBe(src);
      expect(conditionIsExact(src), src).toBe(true);
    }
  });

  it('round trips picker to formula to picker, for every operator', () => {
    for (const op of OP_ORDER) {
      const c: Condition = { join: 'and', rows: [{ left: 'score', op, ...(opTakesValue(op) ? { right: { t: 'num' as const, value: 5 } } : {}) }] };
      const text = conditionToExpr(c);
      expect(() => checkExpression(text), text).not.toThrow();
      expect(parseCondition(text), text).toEqual(c);
    }
  });

  it('round trips every kind of value and both joins', () => {
    const rights = [{ t: 'num', value: 12 }, { t: 'num', value: -1.5 }, { t: 'str', value: 'say "hi"' }, { t: 'bool', value: false }, { t: 'name', name: 'target' }, { t: 'name', name: 'quiz.max' }] as const;
    for (const right of rights) {
      for (const join of ['and', 'or'] as const) {
        const c: Condition = { join, rows: [{ left: 'a', op: 'is', right }, { left: 'b', op: 'atleast', right: { t: 'num', value: 3 } }] };
        const text = conditionToExpr(c);
        expect(() => checkExpression(text), text).not.toThrow();
        expect(parseCondition(text), text).toEqual(c);
      }
    }
  });

  it('reads === and !== and single quotes, but writes the plain forms', () => {
    expect(conditionToExpr(parseCondition("a === 1 && b !== 'x'")!)).toBe('a == 1 && b != "x"');
    expect(conditionIsExact("a === 1")).toBe(false);
  });

  it('is no rows for no text, and one row for a bare name', () => {
    expect(parseCondition('')).toEqual({ join: 'and', rows: [] });
    expect(parseCondition('   ')).toEqual({ join: 'and', rows: [] });
    expect(parseCondition('running')).toEqual({ join: 'and', rows: [{ left: 'running', op: 'true' }] });
  });

  it('leaves everything it cannot read in full alone (null)', () => {
    const notFit = [
      'score + 1 > 5',
      'Math.max(a, b) > 2',
      '(a > 1 || b > 2) && c',
      'a > 1 && b > 2 || c',
      'a ? b : c',
      '5 < score',
      'true',
      'a = 1',
      'a > 1 >',
      'a > ',
      '&& a',
      'a == "unterminated',
      "a == 'it\\'s'",
      'x.items[0] > 1',
      'items.filter(i => i.ok).length > 0',
      'a > 1 ; b',
      'name.startsWith("S")',
      'a == null',
      'a < b < c',
      '`${a}` == "1"',
      'a > 1 &&',
    ];
    for (const src of notFit) expect(parseCondition(src), src).toBeNull();
  });

  it('never writes back something different from a formula that was left alone: rows only come from text it read in full', () => {
    for (const src of [...CANONICAL, 'a === 1', "b == 'x'", ' score   >=  5 ']) {
      const c = parseCondition(src);
      if (!c) continue;
      // whatever it wrote reads back as the very same rows
      expect(parseCondition(conditionToExpr(c))).toEqual(c);
    }
  });

  it('says whether a row is complete enough to write', () => {
    expect(rowComplete({ left: '', op: 'is', right: { t: 'num', value: 1 } })).toBe(false);
    expect(rowComplete({ left: 'a', op: 'is' })).toBe(false);
    expect(rowComplete({ left: 'a', op: 'is', right: { t: 'name', name: '' } })).toBe(false);
    expect(rowComplete({ left: 'a', op: 'empty' })).toBe(true);
    expect(rowComplete({ left: 'a', op: 'more', right: { t: 'num', value: 0 } })).toBe(true);
  });
});

describe('conditionWords', () => {
  it('reads a condition as words', () => {
    expect(conditionWords('score >= 5')).toBe('score is at least 5');
    expect(conditionWords('score >= 5 && !done')).toBe('score is at least 5 and done is off');
    expect(conditionWords('a == "x" || b.includes(3)')).toBe('a is “x” or b contains 3');
    expect(conditionWords('list.length == 0')).toBe('list is empty');
  });
  it('gives a formula it cannot read back as typed', () => {
    expect(conditionWords('score  + 1 > 5')).toBe('score + 1 > 5');
    expect(conditionWords('')).toBe('');
  });
});
