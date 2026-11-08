//Editing a data file as text: where the mistake is, and what the table and tree operations write back.
import { describe, expect, it } from 'vitest';
import { parseData } from 'interactives-player';
import {
  cellFromText, columnNameProblem, convertTo, csvToGrid, getAt, gridOps, gridToCsv, gridToJson, guiFor, indentOf, isFlatTable, jsonProblem, jsonText, jsonToGrid, layoutOf, lineColumn, problemsOf, retypeScalar,
  scalarFromText, tableProblems, textOfValue, treeOps, type Json, type Scalar,
} from '../src/lib/data-edit';

describe('where a JSON mistake is', () => {
  it('accepts valid and empty text', () => {
    expect(jsonProblem('{"a": [1, 2]}')).toBeNull();
    expect(jsonProblem('  \n')).toBeNull();
  });
  it('points at a trailing comma', () => {
    const text = '{\n  "a": 1,\n}';
    const p = jsonProblem(text)!;
    expect(p.severity).toBe('error');
    expect(p.line).toBe(3);
    expect(p.column).toBe(1);
    expect(p.message).toMatch(/comma just before this }/);
  });
  it('points at a missing comma', () => {
    const p = jsonProblem('[\n  1\n  2\n]')!;
    expect(p.line).toBe(3);
    expect(p.message).toMatch(/comma/);
  });
  it('says so when the file ends too early', () => {
    const text = '{"a": [1, 2';
    const p = jsonProblem(text)!;
    expect(p.message).toMatch(/ends too early/);
    expect(p.offset).toBeLessThanOrEqual(text.length);
  });
  it('flags a stray character on its line and column', () => {
    const p = jsonProblem('{\n  "a": 1\n}\nx')!;
    expect(p.line).toBe(4);
    expect(p.column).toBe(1);
  });
  it('line and column from an offset', () => {
    expect(lineColumn('ab\ncd', 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
  });
});

describe('CSV and TSV warnings', () => {
  it('warns about a quote that never closes, never errors', () => {
    const p = tableProblems('a,b\n1,"two\n3,4', ',');
    expect(p).toHaveLength(1);
    expect(p[0].severity).toBe('warning');
    expect(p[0].line).toBe(2);
  });
  it('warns about a row of a different width', () => {
    const p = tableProblems('a,b\n1,2\n3\n', ',');
    expect(p[0].message).toMatch(/Row 3 has 1 cell but the header has 2/);
    expect(p[0].line).toBe(3);
  });
  it('is clean for a tidy file', () => {
    expect(tableProblems('a,b\n1,2\n', ',')).toEqual([]);
    expect(problemsOf('x', 'text')).toEqual([]);
    expect(problemsOf('{', 'json')).toHaveLength(1);
  });
});

describe('CSV round trips', () => {
  const sample = 'name,score,note\r\nAda,3,"likes, commas"\r\nBo,4,"say ""hi"""\r\n';
  it('reads and writes the same text', () => {
    const g = csvToGrid(sample, ',');
    expect(g.columns).toEqual(['name', 'score', 'note']);
    expect(g.rows[0]).toEqual(['Ada', '3', 'likes, commas']);
    expect(gridToCsv(g, ',', layoutOf(sample))).toBe(sample);
  });
  it('keeps the line ending, no trailing newline and a BOM', () => {
    const text = '﻿a;b\n1;2';
    const g = csvToGrid(text, ';');
    expect(gridToCsv(g, ';', layoutOf(text))).toBe('﻿a;b\n1;2');
  });
  it('a tab file', () => {
    const g = csvToGrid('a\tb\n1\t2\n', '\t');
    expect(gridToCsv(gridOps.setCell(g, 0, 1, '9'), '\t')).toBe('a\tb\n1\t9\n');
  });
  it('quotes only what needs it, and what is written parses back to the same cells', () => {
    let g = csvToGrid('a,b\n1,2\n', ',');
    g = gridOps.setCell(g, 0, 0, 'x,y');
    g = gridOps.setCell(g, 0, 1, 'line\nbreak "q"');
    const text = gridToCsv(g, ',');
    expect(text).toBe('a,b\n"x,y","line\nbreak ""q"""\n');
    expect(csvToGrid(text, ',').rows).toEqual(g.rows);
  });
  it('a short row is filled out, and the player reads what was written', () => {
    const g = csvToGrid('a,b,c\n1\n2,3,4\n', ',');
    expect(g.rows[0]).toEqual(['1', '', '']);
    expect(parseData(gridToCsv(g, ','), 'csv')).toEqual([{ a: 1, b: '', c: '' }, { a: 2, b: 3, c: 4 }]);
  });
});

describe('table operations', () => {
  const g0 = csvToGrid('a,b\n1,2\n3,4\n5,6\n', ',');
  const rowsOf = (g: { rows: unknown[][] }) => g.rows.map((r) => r.join('|'));
  it('adds, duplicates, deletes and moves rows', () => {
    expect(rowsOf(gridOps.addRow(g0, 0))).toEqual(['1|2', '|', '3|4', '5|6']);
    expect(rowsOf(gridOps.addRow(g0, -1))[0]).toBe('|');
    expect(rowsOf(gridOps.duplicateRow(g0, 1))).toEqual(['1|2', '3|4', '3|4', '5|6']);
    expect(rowsOf(gridOps.deleteRow(g0, 0))).toEqual(['3|4', '5|6']);
    expect(rowsOf(gridOps.moveRow(g0, 0, 2))).toEqual(['3|4', '5|6', '1|2']);
    expect(gridOps.moveRow(g0, 0, -1).rows).toEqual(g0.rows);
  });
  it('adds, renames, deletes and moves columns', () => {
    const a = gridOps.addColumn(g0, 0);
    expect(a.columns).toEqual(['a', 'column3', 'b']);
    expect(rowsOf(a)[0]).toBe('1||2');
    expect(gridOps.renameColumn(g0, 1, 'score').columns).toEqual(['a', 'score']);
    expect(gridOps.deleteColumn(g0, 0).columns).toEqual(['b']);
    const m = gridOps.moveColumn(g0, 0, 1);
    expect(m.columns).toEqual(['b', 'a']);
    expect(rowsOf(m)[0]).toBe('2|1');
  });
  it('refuses duplicate and blank JSON column names', () => {
    const g = jsonToGrid([{ a: 1, b: 2 }]);
    expect(columnNameProblem(['a', 'a'], 1, g.typed)).toMatch(/already called/);
    expect(columnNameProblem(['a', ''], 1, true)).toMatch(/needs a name/);
    expect(columnNameProblem(['a', 'a'], 1, false)).toBeNull();
  });
});

describe('a JSON list of flat objects as a table', () => {
  const data: Record<string, Scalar>[] = [{ id: 1, name: 'Ada', ok: true }, { id: 2, name: 'Bo', ok: false, extra: null }];
  it('is a flat table, and a nested one is not', () => {
    expect(isFlatTable(data)).toBe(true);
    expect(isFlatTable([{ a: [1] }])).toBe(false);
    expect(isFlatTable([])).toBe(false);
    expect(isFlatTable({ a: 1 })).toBe(false);
    expect(guiFor(JSON.stringify(data), 'json')).toBe('table');
    expect(guiFor('{"a":{"b":1}}', 'json')).toBe('tree');
    expect(guiFor('a,b', 'csv')).toBe('table');
    expect(guiFor('hello', 'text')).toBe('none');
  });
  it('keeps every key, in order, and leaves out the ones a row never had', () => {
    const g = jsonToGrid(data);
    expect(g.columns).toEqual(['id', 'name', 'ok', 'extra']);
    expect(g.rows[0][3]).toBeUndefined();
    expect(gridToJson(g)).toEqual(data);
  });
  it('typing keeps a cell its type while it fits', () => {
    expect(cellFromText('42', 1, true)).toBe(42);
    expect(cellFromText('4x', 1, true)).toBe('4x');
    expect(cellFromText('yes', false, true)).toBe(true);
    expect(cellFromText('', null, true)).toBeNull();
    expect(cellFromText('7', 'seven', true)).toBe('7');
    expect(cellFromText('', undefined, true)).toBeUndefined();
    expect(cellFromText('1', '0', false)).toBe('1');
  });
  it('changing a cell type keeps what can be kept', () => {
    expect(retypeScalar('12', 'number')).toBe(12);
    expect(retypeScalar('abc', 'number')).toBe(0);
    expect(retypeScalar(12, 'text')).toBe('12');
    expect(retypeScalar('true', 'yesno')).toBe(true);
    expect(retypeScalar('x', 'empty')).toBeNull();
  });
  it('a new row copies the types of its column', () => {
    const g = gridOps.addRow(jsonToGrid(data), 1);
    expect(g.rows[2]).toEqual([0, '', false, '']);
  });
  it('writes with the file\'s indent', () => {
    expect(indentOf('[\n\t{"a":1}\n]')).toBe('\t');
    expect(indentOf('[\n    {"a":1}\n]')).toBe(4);
    expect(indentOf('[{"a":1}]')).toBe(0);
    expect(indentOf('[\n{"a":1}\n]')).toBe(2);
    expect(jsonText([{ a: 1 }], 0)).toBe('[{"a":1}]');
    expect(jsonText([{ a: 1 }], 2)).toBe('[\n  {\n    "a": 1\n  }\n]\n');
  });
});

describe('tree operations', () => {
  const doc: Json = { title: 'Game', opening: [{ text: 'hi' }], dilemmas: [{ id: 'd1', choices: [{ label: 'A', ok: true }, { label: 'B', ok: false }] }], n: 1 };
  it('sets and removes by path without touching the rest', () => {
    const a = treeOps.set(doc, ['dilemmas', 0, 'choices', 1, 'label'], 'Z') as typeof doc & { dilemmas: { choices: { label: string }[] }[] };
    expect(getAt(a, ['dilemmas', 0, 'choices', 1, 'label'])).toBe('Z');
    expect(getAt(doc, ['dilemmas', 0, 'choices', 1, 'label'])).toBe('B');
    expect(getAt(a, ['opening'])).toBe(getAt(doc, ['opening']));
    expect(getAt(treeOps.remove(doc, ['dilemmas', 0, 'choices', 0]), ['dilemmas', 0, 'choices', 0, 'label'])).toBe('B');
    expect(Object.keys(treeOps.remove(doc, ['n']) as object)).not.toContain('n');
  });
  it('adds to a list at a place, and to a group under a free key', () => {
    const l = treeOps.add(doc, ['opening'], { text: '' }, { at: 0 });
    expect(l.path).toEqual(['opening', 0]);
    expect(getAt(l.root, ['opening', 1, 'text'])).toBe('hi');
    const g = treeOps.add(doc, [], '', { key: 'title' });
    expect(g.path).toEqual(['title2']);
    expect(getAt(g.root, ['title'])).toBe('Game');
  });
  it('renames a key in place and refuses one that exists', () => {
    const r = treeOps.rename(doc, ['n'], 'count')!;
    expect(Object.keys(r as object)).toEqual(['title', 'opening', 'dilemmas', 'count']);
    expect(treeOps.rename(doc, ['n'], 'title')).toBeNull();
  });
  it('moves list items and group keys', () => {
    const m = treeOps.move(doc, ['dilemmas', 0, 'choices', 0], 1);
    expect(m.path).toEqual(['dilemmas', 0, 'choices', 1]);
    expect(getAt(m.root, ['dilemmas', 0, 'choices', 0, 'label'])).toBe('B');
    expect(Object.keys(treeOps.move(doc, ['n'], -1).root as object).slice(-2)).toEqual(['n', 'dilemmas']);
    expect(treeOps.move(doc, ['dilemmas', 0], 1).root).toBe(doc);
  });
  it('duplicates an item beside itself, and a key under a new name', () => {
    const d = treeOps.duplicate(doc, ['dilemmas', 0, 'choices', 0]);
    expect(d.path).toEqual(['dilemmas', 0, 'choices', 1]);
    expect(getAt(d.root, ['dilemmas', 0, 'choices', 2, 'label'])).toBe('B');
    expect(treeOps.duplicate(doc, ['n']).path).toEqual(['nCopy']);
  });
  it('changes a value\'s type', () => {
    expect(convertTo('12', 'number')).toBe(12);
    expect(convertTo(12, 'text')).toBe('12');
    expect(convertTo('', 'list')).toEqual([]);
    expect(convertTo('a', 'list')).toEqual(['a']);
    expect(convertTo(['a', 'b'], 'group')).toEqual({ item1: 'a', item2: 'b' });
    expect(convertTo({ x: 1, y: 2 }, 'list')).toEqual([1, 2]);
    expect(convertTo('x', 'empty')).toBeNull();
    expect(convertTo(5, 'yesno')).toBe(false);
    expect(scalarFromText('3.5', 'number')).toBe(3.5);
    expect(scalarFromText('abc', 'number')).toBe('abc');
  });
  it('the whole tree goes back to the same data', () => {
    const text = jsonText(doc, 2);
    expect(JSON.parse(text)).toEqual(doc);
  });
});

describe('a file that is not ours to edit', () => {
  it('is shown as text from what was loaded', () => {
    expect(textOfValue([{ a: 1, b: 'x' }], 'csv')).toBe('a,b\n1,x\n');
    expect(textOfValue([{ a: 1 }], 'json')).toBe('[\n  {\n    "a": 1\n  }\n]\n');
    expect(textOfValue('plain', 'text')).toBe('plain');
  });
});
