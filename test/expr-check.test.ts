//What a formula field says under itself: what it works out to now, or what is wrong in plain words, with a one-click fix.
import { describe, expect, it } from 'vitest';
import { createProject } from 'interactives-player';
import { checkFormula, checkTemplate, didYouMean, isVolatile, plainParseError, replaceName, valueWords, type CheckEnv } from '../src/lib/expr-check';
import { previewScope } from '../src/lib/data';

function env(locals: string[] = [], localValues?: Record<string, unknown>): CheckEnv {
  const p = createProject('T');
  p.variables.push(
    { id: 'v1', name: 'score', type: 'number', initial: 7 },
    { id: 'v2', name: 'playerName', type: 'string', initial: 'Sam' },
    { id: 'v3', name: 'done', type: 'boolean', initial: false },
    { id: 'v4', name: 'answers', type: 'list', initial: '["a","b"]' },
  );
  return { variables: p.variables, dataNames: p.dataSources.map((d) => d.name), locals, localValues, scope: () => previewScope(p) };
}

const msg = (src: string, e = env()) => {
  const r = checkFormula(src, e);
  return r.kind === 'error' ? r.message : `(${r.kind})`;
};

describe('checkFormula', () => {
  it('says nothing for an empty field', () => {
    expect(checkFormula('', env()).kind).toBe('empty');
    expect(checkFormula('   ', env()).kind).toBe('empty');
  });

  it('shows what a good formula works out to now', () => {
    expect(checkFormula('score >= 5', env())).toEqual({ kind: 'ok', text: 'currently true' });
    expect(checkFormula('score + 5', env())).toEqual({ kind: 'ok', text: 'currently 12' });
    expect(checkFormula('"Hello " + playerName', env())).toEqual({ kind: 'ok', text: 'currently “Hello Sam”' });
    expect(checkFormula('answers', env())).toEqual({ kind: 'ok', text: 'currently 2 items' });
    expect(checkFormula('done', env())).toEqual({ kind: 'ok', text: 'currently false' });
  });

  it('names a misspelt value, suggests the near one and offers the fix', () => {
    const r = checkFormula('scoer > 5', env());
    expect(r).toEqual({ kind: 'error', message: 'There is no value called scoer. Did you mean score?', fix: { label: 'Use score', text: 'score > 5' } });
    // capital letters are the commonest slip
    expect(msg('Score > 5')).toBe('There is no value called Score. Did you mean score?');
    expect(msg('plyerName')).toContain('Did you mean playerName?');
  });

  it('fixes every use of the misspelt name, but not text in quotes or a part after a dot', () => {
    const r = checkFormula('scoer + scoer * 2 + answers.length + (event.scoer ? 1 : 0)', env(['event'], { event: { scoer: 1 } }));
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.fix?.text).toBe('score + score * 2 + answers.length + (event.scoer ? 1 : 0)');
    expect(replaceName('scoer == "scoer" + x.scoer', 'scoer', 'score')).toBe('score == "scoer" + x.scoer');
  });

  it('says plainly when nothing is close', () => {
    expect(msg('zzzzzz > 1')).toBe('There is no value called zzzzzz. Check the spelling, or add a variable with that name.');
  });

  it('knows the names the field is given (event, value...) and the helpers and globals', () => {
    expect(msg('event.index == 1', env(['event']))).toBe('(ok)');
    expect(msg('event.index == 1', env())).toContain('There is no value called event');
    expect(msg('Math.max(score, 3)')).toBe('(ok)');
    expect(msg('fmt(score, 2)')).toBe('(ok)');
    expect(msg('answers.filter(a => a != "b").length')).toBe('(ok)');
  });

  it('says what a name only known when it runs depends on, rather than guessing a value', () => {
    expect(checkFormula('event.index == 1', env(['event']))).toEqual({ kind: 'ok', text: 'depends on what happens when it runs' });
    expect(checkFormula('event.index == 1', env(['event'], { event: { index: 1 } }))).toEqual({ kind: 'ok', text: 'currently true' });
  });

  it('shows things that change each time as that, and does not run them', () => {
    expect(checkFormula('Math.random() > 0.5', env())).toEqual({ kind: 'ok', text: 'changes each time it runs' });
    expect(checkFormula('randInt(1, 6)', env())).toEqual({ kind: 'ok', text: 'changes each time it runs' });
    expect(checkFormula('Date.now() > 0', env())).toEqual({ kind: 'ok', text: 'changes each time it runs' });
    expect(isVolatile('shuffle(answers)')).toBe(true);
    expect(isVolatile('shuffle(answers, 4)')).toBe(false);
    expect(isVolatile('score + 1')).toBe(false);
  });

  it('turns the parser\'s complaints into sentences', () => {
    expect(msg('(score + 1')).toBe('A bracket is not closed. Add a ) to match the (.');
    expect(msg('score + 1)')).toBe('There is a ) with no ( before it.');
    expect(msg('"hello')).toBe('A quote is not closed. Put the same kind of quote at the end of the text.');
    expect(msg('score >')).toBe('The formula stops too soon: something is missing after the last symbol.');
    expect(msg('score = 5')).toContain('cannot set a value with a single =');
    expect(msg('score++')).toContain('cannot add one with ++');
    expect(msg('score # 2')).toBe('The formula has a character it does not understand: “#”.');
    expect(msg('score > > 2')).toContain('where the formula does not expect one');
    expect(msg('[1, 2')).toContain('A bracket is not closed. Add a ]');
    expect(msg('function')).toContain('cannot be used in a formula');
  });

  it('says what went wrong when a formula cannot be worked out with today\'s values', () => {
    const r = checkFormula('answers.nothing.deeper > 1', env());
    expect(r.kind).toBe('error');
  });

  it('every message is a sentence: no parser positions, no code words', () => {
    for (const src of ['(1', '"a', 'a b', '1 +', 'x = 1', '1 2', ']', 'score..', 'new']) {
      const m = msg(src);
      expect(m, src).not.toMatch(/\(at \d+\)|Cannot parse|ExprError/);
      expect(m, src).toMatch(/[.?]$/);
    }
  });
});

describe('checkTemplate', () => {
  it('checks each {…} slot of a text and says which one is wrong', () => {
    const r = checkTemplate('Score: {scoer}', env());
    expect(r).toEqual({ kind: 'error', message: 'In {scoer}: There is no value called scoer. Did you mean score?', fix: { label: 'Use score', text: 'Score: {score}' } });
  });
  it('shows the text as it reads now', () => {
    expect(checkTemplate('Score: {score} of 10', env())).toEqual({ kind: 'ok', text: 'reads “Score: 7 of 10”' });
  });
  it('says nothing for plain text, or for escaped braces', () => {
    expect(checkTemplate('Hello', env()).kind).toBe('empty');
    expect(checkTemplate('Use {{braces}}', env()).kind).toBe('empty');
  });
});

describe('the small pieces', () => {
  it('didYouMean picks a near name, a longer name started, or nothing', () => {
    expect(didYouMean('scoer', ['score', 'lives'])).toBe('score');
    expect(didYouMean('sco', ['score', 'lives'])).toBe('score');
    expect(didYouMean('qqqqq', ['score', 'lives'])).toBeNull();
    expect(didYouMean('ab', ['abc'])).toBeNull();
  });
  it('plainParseError leaves an unknown message as a sentence', () => {
    expect(plainParseError('Something odd')).toBe('Something odd.');
  });
  it('valueWords reads values', () => {
    expect(valueWords('')).toBe('empty text');
    expect(valueWords(undefined)).toBe('nothing');
    expect(valueWords([1])).toBe('1 item');
  });
});
