import { describe, expect, it } from 'vitest';
import type { Variable } from 'interactives-player';
import { addRow, defaultResult, freeKey, isByValue, isPlainWhen, nextOption, removeRow, renameRow, rowsOf, setOtherwise, startMap, whenChoices, whenKind, type MapConverter } from '../src/lib/by-value';

const vars: Variable[] = [
  { id: 'a', name: 'mood', type: 'enum', initial: 'happy', options: ['happy', 'sad', 'cross'] },
  { id: 'b', name: 'open', type: 'boolean', initial: false },
  { id: 'c', name: 'score', type: 'number', initial: 2 },
  { id: 'd', name: 'bad name', type: 'number', initial: 0 },
];

describe('By value table helpers', () => {
  it('offers variables, and inside a repeater the item fields and the index', () => {
    expect(whenChoices(vars).map((c) => c.value)).toEqual(['mood', 'open', 'score']);
    const inRepeater = whenChoices(vars, { locals: ['item', 'index'], values: { item: { text: 'a', state: 'wrong', 'odd key': 1 }, index: 0 } });
    expect(inRepeater.map((c) => c.value)).toEqual(['mood', 'open', 'score', 'item.text', 'item.state', 'index']);
    expect(whenChoices([], { locals: ['item', 'index'], values: { item: 'plain', index: 0 } }).map((c) => c.value)).toEqual(['item', 'index']);
  });

  it('tells a plain choice from a formula', () => {
    const c = whenChoices(vars, { locals: ['item'], values: { item: { state: '' } } });
    expect(isPlainWhen('', c)).toBe(true);
    expect(isPlainWhen('item.state', c)).toBe(true);
    expect(isPlainWhen('score > 5', c)).toBe(false);
  });

  it('knows what the when side can hold', () => {
    expect(whenKind('mood', vars, {})).toEqual({ kind: 'options', options: ['happy', 'sad', 'cross'] });
    expect(whenKind('open', vars, {})).toEqual({ kind: 'boolean' });
    expect(whenKind('score > 5', vars, { score: 2 })).toEqual({ kind: 'boolean' });
    expect(whenKind('item.selected', vars, { item: { selected: true } })).toEqual({ kind: 'boolean' });
    expect(whenKind('item.state', vars, { item: { state: 'wrong' } })).toEqual({ kind: 'text' });
  });

  it('starts a table with a row per option or per true and false, in the layer\'s own value', () => {
    expect(startMap({ kind: 'options', options: ['a', 'b'] }, 'color', '#ff0000').map).toEqual({ a: '#ff0000', b: '#ff0000' });
    expect(startMap({ kind: 'boolean' }, 'number', 3).map).toEqual({ true: 3, false: 3 });
    expect(startMap({ kind: 'text' }, 'string', 'x').map).toEqual({});
    expect(defaultResult('color', undefined)).toBe('#888888');
    expect(defaultResult('boolean', undefined)).toBe(false);
  });

  it('adds, renames in place, refuses a clash and removes', () => {
    let c: MapConverter = { type: 'map', map: { correct: '#0f0', wrong: '#f00' } };
    expect(isByValue([c])).toBe(true);
    expect(isByValue([c, { type: 'toText' }])).toBe(false);
    expect(freeKey(c, 'wrong')).toBe('wrong 2');
    expect(freeKey(c, 'new value')).toBe('new value');
    c = addRow(c, 'missed', '#ff0');
    expect(rowsOf(renameRow(c, 'wrong', 'incorrect')).map(([k]) => k)).toEqual(['correct', 'incorrect', 'missed']);
    expect(renameRow(c, 'wrong', 'correct')).toBe(c);
    expect(Object.keys(removeRow(c, 'correct').map)).toEqual(['wrong', 'missed']);
    expect(nextOption(c, ['correct', 'wrong', 'missed', 'later'])).toBe('later');
    expect(setOtherwise(c, '#ccc').fallback).toBe('#ccc');
    expect(setOtherwise(setOtherwise(c, '#ccc'), undefined).fallback).toBeUndefined();
  });
});
