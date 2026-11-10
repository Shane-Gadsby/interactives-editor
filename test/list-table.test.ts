//A list variable (or a repeater's typed items) as a table: records give columns, plain lists one column, and the text round-trips.
import { describe, expect, it } from 'vitest';
import type { Project } from 'interactives-player';
import { PLAIN_COLUMN, STARTER_ITEMS, gridToListText, listToGrid, tableable } from '../src/lib/list-table';
import { defaultItems, itemExample, itemsChoiceOf, itemsChoices, itemsFor, OWN_ITEMS } from '../src/lib/repeat-items';
import { gridOps } from '../src/lib/data-edit';

const project = (): Pick<Project, 'variables' | 'dataSources'> => ({
  variables: [
    { id: 'a', name: 'people', type: 'list', initial: '[]' },
    { id: 'b', name: 'score', type: 'number', initial: 0 },
  ],
  dataSources: [{ id: 'd', name: 'products' } as never],
});

describe('list text as a table', () => {
  it('records become a column per field, and write back as records', () => {
    const lg = listToGrid('[{"name": "Ann", "age": 30}, {"name": "Bo", "ok": true}]')!;
    expect(lg.plain).toBe(false);
    expect(lg.grid.columns).toEqual(['name', 'age', 'ok']);
    expect(lg.grid.rows).toEqual([['Ann', 30, undefined], ['Bo', undefined, true]]);
    expect(JSON.parse(gridToListText(lg.grid, lg.plain))).toEqual([{ name: 'Ann', age: 30 }, { name: 'Bo', ok: true }]);
  });

  it('a plain list is one column and stays plain', () => {
    const lg = listToGrid('[1, "two", 3]')!;
    expect(lg.plain).toBe(true);
    expect(lg.grid.columns).toEqual([PLAIN_COLUMN]);
    const more = gridOps.addRow(lg.grid, 2);
    expect(JSON.parse(gridToListText(more, true)).slice(0, 3)).toEqual([1, 'two', 3]);
    expect(JSON.parse(gridToListText(more, true))).toHaveLength(4);
  });

  it('adding a column to a plain list turns it into records', () => {
    const lg = listToGrid('["a", "b"]')!;
    const wide = gridOps.addColumn(lg.grid, 0);
    expect(JSON.parse(gridToListText(wide, lg.plain))).toEqual([{ value: 'a', column2: '' }, { value: 'b', column2: '' }]);
  });

  it('renaming the one column of a plain list makes records', () => {
    const lg = listToGrid('["a", "b"]')!;
    expect(JSON.parse(gridToListText(gridOps.renameColumn(lg.grid, 0, 'name'), lg.plain))).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('a record list with one field called value stays records', () => {
    const lg = listToGrid('[{"value": 1}]')!;
    expect(lg.plain).toBe(false);
    expect(JSON.parse(gridToListText(lg.grid, lg.plain))).toEqual([{ value: 1 }]);
  });

  it('an empty list has one column to start, or the columns it had', () => {
    expect(listToGrid('[]')!.grid.columns).toEqual([PLAIN_COLUMN]);
    const had = listToGrid('[]', ['name', 'age'])!;
    expect(had.grid.columns).toEqual(['name', 'age']);
    expect(had.plain).toBe(false);
    expect(gridToListText(had.grid, had.plain)).toBe('[]');
  });

  it('cells keep their type: text, numbers and yes/no', () => {
    const lg = listToGrid('[{"a": "1", "b": 1, "c": false, "d": null}]')!;
    const back = JSON.parse(gridToListText(lg.grid, false));
    expect(back).toEqual([{ a: '1', b: 1, c: false, d: null }]);
  });

  it('has no table for items inside items, or for text that is not a list', () => {
    expect(listToGrid('[{"pets": ["cat"]}]')).toBeNull();
    expect(listToGrid('[[1, 2], [3]]')).toBeNull();
    expect(listToGrid('{"a": 1}')).toBeNull();
    expect(listToGrid('[1, 2')).toBeNull();
    expect(tableable('[{"a": 1}]')).toBe(true);
    expect(tableable('')).toBe(false);
  });
});

describe('where a repeater gets its items', () => {
  it('offers lists, data, typing and a formula', () => {
    expect(itemsChoices(project()).map((c) => c.value)).toEqual(['list:people', 'data:products', 'own', 'formula']);
  });

  it('reads an Items expression as one of those', () => {
    const p = project();
    expect(itemsChoiceOf('people', p)).toBe('list:people');
    expect(itemsChoiceOf(' products ', p)).toBe('data:products');
    expect(itemsChoiceOf('[1, 2, 3]', p)).toBe(OWN_ITEMS);
    expect(itemsChoiceOf('[{"text": "a"}]', p)).toBe(OWN_ITEMS);
    expect(itemsChoiceOf('products.filter(p => p.inStock)', p)).toBe('formula');
    expect(itemsChoiceOf('score', p)).toBe('formula');
    expect(itemsChoiceOf('', p)).toBe('formula');
  });

  it('turns a choice back into the expression', () => {
    expect(itemsFor('list:people', 'x')).toBe('people');
    expect(itemsFor('data:products', 'x')).toBe('products');
    expect(itemsFor('own', 'products')).toBe(STARTER_ITEMS);
    expect(itemsFor('own', '[1, 2]')).toBe('[1, 2]');
    expect(itemsFor('formula', 'people')).toBe('people');
  });

  it('starts a new repeater on the first list, else data, else three typed items', () => {
    const p = project();
    expect(defaultItems(p)).toBe('people');
    expect(defaultItems({ variables: [], dataSources: p.dataSources })).toBe('products');
    expect(defaultItems({ variables: [], dataSources: [] })).toBe(STARTER_ITEMS);
    expect(listToGrid(STARTER_ITEMS)!.grid.rows).toHaveLength(3);
  });

  it('says how to use typed items inside', () => {
    expect(itemExample('[{"text": "a"}]')).toBe('{item.text}');
    expect(itemExample('[{"first name": "a"}]')).toBe('{item["first name"]}');
    expect(itemExample('[1, 2]')).toBe('{item}');
  });
});
