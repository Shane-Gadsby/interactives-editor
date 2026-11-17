import { describe, expect, it } from 'vitest';
import { createProject } from 'interactives-player';
import { insertAt, insertChoices } from '../src/lib/insert-value';
import type { SuggestEnv } from '../src/lib/suggest';

function env(extra: Partial<SuggestEnv> = {}, scope: Record<string, unknown> = {}): SuggestEnv {
  const project = createProject('T');
  project.variables.push(
    { id: 'v1', name: 'score', type: 'number', initial: 7 },
    { id: 'v2', name: 'cards', type: 'list', initial: '[1,2,3]' },
    { id: 'v3', name: 'user name', type: 'string', initial: 'x' },
  );
  project.dataSources.push({ id: 'd1', name: 'people', kind: 'json', source: 'inline' } as never, { id: 'd2', name: 'settings', kind: 'json', source: 'inline' } as never);
  const full = {
    score: 7,
    cards: [1, 2, 3],
    people: [{ name: 'Ann', age: 31 }, { name: 'Bo', age: 4 }],
    settings: { title: 'Hello', big: true },
    context: { firstName: 'Alex', courseName: 'Intro', courseLabel: 'MAT1000_26S1' },
    pageNumber: 2,
    pageCount: 5,
    ...scope,
  };
  return { project, scope: () => full, layers: () => [], ...extra };
}

const by = (list: ReturnType<typeof insertChoices>, group: string) => list.filter((c) => c.group === group);

describe('Insert value choices', () => {
  it('lists variables with what they are now, and how many a list has; a name that is not a plain word is left out', () => {
    const v = by(insertChoices(env()), 'Your variables');
    expect(v.map((c) => c.expr)).toEqual(['score', 'cards.length']);
    expect(v[0].hint).toBe('number · 7');
    expect(v[1]).toMatchObject({ label: 'How many in cards', hint: 'number · 3' });
  });

  it('data: how many rows, the first row\'s fields, or an object\'s own fields', () => {
    const d = by(insertChoices(env()), 'Data');
    expect(d.map((c) => c.expr)).toEqual(['people.length', 'people[0].name', 'people[0].age', 'settings.title', 'settings.big']);
    expect(d.find((c) => c.expr === 'people[0].name')!.hint).toBe('text · “Ann”');
  });

  it('the learner and course come first-name first, with the sample value', () => {
    const c = by(insertChoices(env()), 'The learner and course');
    expect(c[0]).toMatchObject({ expr: 'context.firstName', hint: 'text · “Alex”' });
    expect(c.map((x) => x.expr)).toContain('context.courseName');
    expect(c.map((x) => x.expr)).not.toContain('context.signedIn');
  });

  it('the page, and the quiz only when there are questions', () => {
    const all = insertChoices(env());
    expect(by(all, 'The page').map((c) => [c.expr, c.hint])).toEqual([['pageNumber', 'number · 2'], ['pageCount', 'number · 5']]);
    expect(by(all, 'Questions')).toEqual([]);
    const q = insertChoices(env({}, { quiz: { count: 2, score: 1, max: 4, percent: 25 } }));
    expect(by(q, 'Questions').map((c) => c.expr)).toEqual(['quiz.score', 'quiz.max', 'quiz.percent']);
  });

  it('in a repeater: the first item\'s fields and its number come first', () => {
    const inRepeat = insertChoices(env({ locals: ['item', 'index'], localValues: { item: { name: 'Ann', age: 31 }, index: 0 } }));
    expect(inRepeat[0].group).toBe('This item of the repeat');
    expect(by(inRepeat, 'This item of the repeat').map((c) => c.expr)).toEqual(['item.name', 'item.age', 'index + 1']);
    const plain = insertChoices(env({ locals: ['item', 'index'], localValues: { item: 'apple', index: 0 } }));
    expect(by(plain, 'This item of the repeat').map((c) => c.expr)).toEqual(['item', 'index + 1']);
    expect(by(plain, 'This item of the repeat')[0].hint).toBe('text · “apple”');
    expect(by(insertChoices(env()), 'This item of the repeat')).toEqual([]);
  });

  it('a field\'s own names (a spoken value\'s value, max and percent) are offered, not event or self', () => {
    const c = by(insertChoices(env({ locals: ['value', 'max', 'percent', 'event', 'self'] })), 'Here');
    expect(c.map((x) => x.expr)).toEqual(['value', 'max', 'percent']);
  });
});

describe('insertAt', () => {
  it('puts {expr} at the caret, over a selection', () => {
    expect(insertAt('Score: ', 7, 7, 'score')).toEqual({ text: 'Score: {score}', caret: 14 });
    expect(insertAt('Hello NAME!', 6, 10, 'context.firstName')).toEqual({ text: 'Hello {context.firstName}!', caret: 25 });
    expect(insertAt('', 0, 0, 'score')).toEqual({ text: '{score}', caret: 7 });
  });
  it('inside braces it goes in bare and closes the brace when nothing does', () => {
    expect(insertAt('Score: {1 + }', 12, 12, 'score')).toEqual({ text: 'Score: {1 + score}', caret: 17 });
    expect(insertAt('Score: { }', 8, 9, 'score').text).toBe('Score: {score}');
    expect(insertAt('Score: {', 8, 8, 'score')).toEqual({ text: 'Score: {score}', caret: 14 });
    expect(insertAt('Score: {  and {b}', 8, 8, 'score').text).toBe('Score: {score}  and {b}');
  });
  it('a caret past the end or backwards is held to the text', () => {
    expect(insertAt('ab', 9, 1, 'x').text).toBe('ab{x}');
  });
});
