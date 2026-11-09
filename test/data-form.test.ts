//The pure side of the Form view: labels from key names, card titles, what Add another starts as, the outline
import { describe, expect, it } from 'vitest';
import type { Json } from '../src/lib/data-edit';
import { cardTitle, fillFor, idOf, labelOf, nameOf, newItemFor, nounOf, outlineOf, siblingKind, singularOf } from '../src/lib/data-form';

describe('labels from key names', () => {
  it.each([
    ['startLabel', 'Start label'],
    ['start_label', 'Start label'],
    ['start-label', 'Start label'],
    ['START_LABEL', 'Start label'],
    ['ID', 'ID'],
    ['MAX_ATTEMPTS', 'Max attempts'],
    ['title', 'Title'],
    ['passMark', 'Pass mark'],
    ['userID', 'User ID'],
    ['HTMLFile', 'HTML file'],
    ['item2', 'Item 2'],
    ['feedback style', 'Feedback style'],
    ['allow_retry', 'Allow retry'],
    ['ai', 'AI'],
    ['id', 'ID'],
    ['image_url', 'Image URL'],
    ['aid', 'Aid'],
    ['7', '7'],
    ['', '(no name)'],
  ])('%s is %s', (key, label) => expect(labelOf(key)).toBe(label));

  it('singular nouns for the items of a list', () => {
    expect(singularOf('Dilemmas')).toBe('Dilemma');
    expect(singularOf('Choices')).toBe('Choice');
    expect(singularOf('Categories')).toBe('Category');
    expect(singularOf('Boxes')).toBe('Box');
    expect(singularOf('Opening')).toBe('Opening');
    expect(singularOf('Status')).toBe('Status');
    expect(singularOf('People')).toBe('Person');
    expect(singularOf('Feedback lines')).toBe('Feedback line');
    expect(nounOf('dilemmas')).toBe('Dilemma');
    expect(nounOf('answer_options')).toBe('Answer option');
    expect(nounOf(undefined)).toBe('Item');
    expect(nounOf(3)).toBe('Item');
  });
});

describe('card titles', () => {
  it('uses the title, name, label, question or id, in that order, with the number from 1', () => {
    expect(cardTitle({ id: 'd1', title: 'The old assignment' }, 'Dilemma', 0)).toBe('Dilemma 1: The old assignment');
    expect(cardTitle({ label: 'Yes', name: 'Named' }, 'Choice', 1)).toBe('Choice 2: Named');
    expect(cardTitle({ id: 'd1', question: 'Share your answers?' }, 'Dilemma', 2)).toBe('Dilemma 3: Share your answers?');
    expect(cardTitle({ id: 'd1', scene: 'library' }, 'Dilemma', 0)).toBe('Dilemma 1: d1');
  });
  it('falls back to the first short text, and to just the number', () => {
    expect(cardTitle({ speaker: 'Priya', line: 'Hi' }, 'Opening', 0)).toBe('Opening 1: Priya');
    expect(cardTitle({ score: 2, ai: true }, 'Choice', 0)).toBe('Choice 1');
    expect(cardTitle({ blank: '', long: 'x'.repeat(100) }, 'Item', 4)).toBe('Item 5');
  });
  it('shortens a long title and keeps only its first line', () => {
    const t = cardTitle({ title: `${'word '.repeat(30)}` }, 'Item', 0);
    expect(t.endsWith('…')).toBe(true);
    expect(t.length).toBeLessThan(60);
    expect(nameOf({ question: 'First line\nsecond line' })).toBe('First line…');
  });
  it('a list in a list, or a plain value, is just its number', () => {
    expect(cardTitle([1, 2], 'Item', 0)).toBe('Item 1');
    expect(cardTitle('x', 'Tag', 1)).toBe('Tag 2');
  });
});

describe('Add another', () => {
  it('copies the fields of the items already there, empty, keeping their types', () => {
    const items = [
      { label: 'Yes', score: 2, ai: true, note: null, tags: ['a'], extra: { on: true, text: 'x' } },
      { label: 'No', score: 0, ai: false, note: 'later', tags: [], extra: { on: false, text: '' } },
    ];
    expect(newItemFor(items)).toEqual({ label: '', score: 0, ai: false, note: '', tags: [], extra: { on: false, text: '' } });
  });
  it('gathers a field one item left out, in the order the keys first appear', () => {
    const next = newItemFor([{ a: 1 }, { b: 'x', a: 2 }, { c: false }]) as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(['a', 'b', 'c']);
    expect(next).toEqual({ a: 0, b: '', c: false });
  });
  it('a list of plain values adds a blank of the last one, and an empty list a line of text', () => {
    expect(newItemFor(['a', 'b'])).toBe('');
    expect(newItemFor([1, 2])).toBe(0);
    expect(newItemFor([true])).toBe(false);
    expect(newItemFor([])).toBe('');
    expect(newItemFor([[1], [2]])).toEqual([]);
  });
  it('never shares anything with the items it copied', () => {
    const items = [{ a: { b: [1] } }];
    const made = newItemFor(items) as { a: { b: unknown[] } };
    made.a.b.push(2);
    expect(items[0].a.b).toEqual([1]);
  });
});

describe('filling in an empty value', () => {
  it('takes the kind the same field has in the other items', () => {
    const items = [{ score: null }, { score: 3 }, { score: 1 }];
    expect(siblingKind(items, 'score')).toBe('number');
    expect(siblingKind([{ on: true }], 'on')).toBe('yesno');
    expect(siblingKind([{ a: null }], 'a')).toBe('text');
    expect(siblingKind(undefined, 'a')).toBe('text');
  });
  it('starts as text, a number or a yes/no, never a structure', () => {
    expect(fillFor('number')).toBe(0);
    expect(fillFor('yesno')).toBe(false);
    expect(fillFor('text')).toBe('');
    expect(fillFor('list')).toBe('');
  });
});

describe('the outline', () => {
  const file: Json = {
    title: 'T',
    settings: { retry: true },
    opening: [{ speaker: 'Priya', line: 'Hi' }],
    dilemmas: [
      { title: 'The old assignment', choices: [{ label: 'Yes' }, { label: 'No' }], tags: ['a'] },
      { title: 'The chatbot', choices: [] },
    ],
  };
  it('lists every list and card in the order the form shows them, with where each sits', () => {
    const o = outlineOf(file, 'script');
    expect(o.map((x) => `${x.depth}:${x.title}`)).toEqual([
      '0:Settings',
      '0:Opening (1)',
      '1:Opening 1: Priya',
      '0:Dilemmas (2)',
      '1:Dilemma 1: The old assignment',
      '2:Choices (2)',
      '3:Choice 1: Yes',
      '3:Choice 2: No',
      '2:Tags (1)',
      '1:Dilemma 2: The chatbot',
      '2:Choices (0)',
    ]);
    expect(o.find((x) => x.title === 'Choices (2)')!.trail).toBe('Dilemmas > Dilemma 1: The old assignment > Choices');
    expect(o.find((x) => x.title === 'Choices (2)')!.path).toEqual(['dilemmas', 0, 'choices']);
    expect(o.find((x) => x.title === 'Settings')!.kind).toBe('card');
    expect(o.find((x) => x.title === 'Dilemmas (2)')!.kind).toBe('list');
  });
  it('a file that is a list starts with the list, named for the file', () => {
    const o = outlineOf([{ a: 1 }, { a: 2 }], 'rows');
    expect(o.map((x) => x.title)).toEqual(['rows (2)', 'Item 1', 'Item 2']);
  });
  it('a lone value or an empty file has no outline', () => {
    expect(outlineOf(undefined, 'x')).toEqual([]);
    expect(outlineOf('text', 'x')).toEqual([]);
    expect(outlineOf({ a: 1 }, 'x')).toEqual([]);
  });
  it('ids are safe for the page and tell apart paths that look alike', () => {
    expect(idOf(['a', 0])).toBe('ka_n0');
    expect(idOf([])).toBe('root');
    expect(idOf(['a b'])).not.toBe(idOf(['a-b']));
    expect(/^[A-Za-z0-9_-]+$/.test(idOf(['x"y', 3, 'é']))).toBe(true);
  });
});
