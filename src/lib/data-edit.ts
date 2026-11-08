import { parseDelimited, type DataKind } from 'interactives-player';

/**
 * The text side of editing a data file: where a mistake is, how CSV/TSV and JSON become a grid or a tree to edit and go
 * back to text, and the small operations the table and tree views run. All pure, so the panel only wires them to the
 * document. The text is the one source of truth; both views read it and write it back whole.
 */

export type Scalar = string | number | boolean | null;
export type Json = Scalar | Json[] | { [key: string]: Json };
export type Path = (string | number)[];

export interface Problem {
  message: string;
  /** Characters from the start of the text, and the same spot as a 1-based line and column. */
  offset: number;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const at = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) {
    line++;
    last = i;
  }
  return { line, column: at - last };
}

const problem = (text: string, offset: number, message: string, severity: Problem['severity'] = 'error'): Problem => ({ message, offset, severity, ...lineColumn(text, offset) });

/** Where JSON stops parsing, with a message in plain words. Null when it parses (an empty file is one). */
export function jsonProblem(text: string): Problem | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let offset = -1;
    const pos = /position (\d+)/.exec(msg);
    const lc = /line (\d+) column (\d+)/.exec(msg);
    if (pos) offset = Number(pos[1]);
    else if (lc) {
      const lines = text.split('\n');
      const line = Math.min(Number(lc[1]), lines.length);
      offset = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + Number(lc[2]) - 1;
    } else if (/end of (JSON|data)|Unexpected end/i.test(msg)) offset = text.trimEnd().length;
    if (offset < 0) offset = firstBadSpot(text);
    return problem(text, offset, plainJsonMessage(msg, text, offset));
  }
}

/** Engines word a JSON error differently (and some leave out where); this keeps the part an author can use. */
function plainJsonMessage(msg: string, text: string, offset: number): string {
  if (/end of (JSON|data)|Unexpected end/i.test(msg)) return 'The file ends too early: a bracket, brace or quote is still open.';
  const ch = text[offset];
  if (ch === undefined) return 'The file ends too early: a bracket, brace or quote is still open.';
  const shown = ch === '\n' ? 'the end of the line' : `“${ch}”`;
  if ((ch === ']' || ch === '}') && /,\s*$/.test(text.slice(0, offset))) return `There is a comma just before this ${ch}. JSON doesn't allow a comma after the last item; remove it.`;
  if (/Expected double-quoted property name|property name/i.test(msg)) return `Expected a name in double quotes, found ${shown}. A comma after the last item also causes this.`;
  if (/Expected ',' or '[}\]]'|after (array element|property value)/i.test(msg)) return `Expected a comma or a closing bracket, found ${shown}.`;
  if (/Expected ':'|after property name/i.test(msg)) return `Expected a colon after the name, found ${shown}.`;
  if (/Unterminated string|Bad control character|bad string/i.test(msg)) return 'A text value is missing its closing quote, or has a line break inside it.';
  return `Unexpected ${shown}.`;
}

/** The engines that say nothing about where: find the spot with a small scan for the first token that cannot belong. */
function firstBadSpot(text: string): number {
  let lo = 0;
  let hi = text.length;
  // The longest prefix that still ends in a state a parse error would complain about; binary search on "does the prefix get an error that is not just 'ended too early'"
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    let early = false;
    try {
      JSON.parse(text.slice(0, mid));
      early = true;
    } catch (e) {
      early = /end of (JSON|data)|Unexpected end|Unterminated/i.test(e instanceof Error ? e.message : '');
    }
    if (early) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, Math.max(0, text.length - 1));
}

/** CSV/TSV never refuse to parse, so what they get is warnings: a quote that never closes, and rows that don't match the header. */
export function tableProblems(text: string, delimiter: string): Problem[] {
  const out: Problem[] = [];
  // A quote left open runs to the end of the file: the parser reads the rest as one cell
  let quoted = false;
  let openAt = 0;
  let cellStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else {
          quoted = false;
          cellStart = false;
        }
      }
      continue;
    }
    if (c === '"' && cellStart) {
      quoted = true;
      openAt = i;
    } else if (c === delimiter || c === '\n' || c === '\r') cellStart = true;
    else cellStart = false;
  }
  if (quoted) out.push(problem(text, openAt, 'This quote never closes, so everything after it is read as one cell.', 'warning'));
  else {
    const rows = parseDelimited(text, delimiter);
    const width = rows[0]?.length ?? 0;
    const odd = rows.findIndex((r, i) => i > 0 && r.length !== width);
    if (odd > 0) {
      // Which line the row starts on, when nothing earlier spans lines
      const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/).filter((l) => l !== '');
      const at = lines.slice(0, odd).reduce((n, l) => n + l.length + 1, 0);
      out.push(problem(text, Math.min(at, text.length), `Row ${odd + 1} has ${rows[odd].length} cell${rows[odd].length === 1 ? '' : 's'} but the header has ${width}. Short rows are filled with blanks; extra cells are ignored.`, 'warning'));
    }
  }
  return out;
}

/** Everything wrong with the text of a file of this kind. A JSON error stops the file saving; warnings never do. */
export function problemsOf(text: string, kind: DataKind): Problem[] {
  if (kind === 'json') {
    const p = jsonProblem(text);
    return p ? [p] : [];
  }
  if (kind === 'csv') return tableProblems(text, ',');
  if (kind === 'tsv') return tableProblems(text, '\t');
  return [];
}

export const hasError = (list: Problem[]) => list.some((p) => p.severity === 'error');

export const delimiterOf = (kind: DataKind) => (kind === 'tsv' ? '\t' : ',');

/** The file's own line ending and whether it ends with one, so a table edit doesn't rewrite every line. */
export function layoutOf(text: string): { eol: string; trailing: boolean; bom: boolean } {
  return { eol: text.includes('\r\n') ? '\r\n' : '\n', trailing: /\n$/.test(text), bom: text.startsWith('﻿') };
}

/** How a JSON file is indented: a tab, a count of spaces, or 0 for one compact line. */
export function indentOf(text: string): string | number {
  if (!/\n/.test(text.trim())) return 0;
  const m = /\n([ \t]+)\S/.exec(text);
  if (!m) return 2;
  return m[1][0] === '\t' ? '\t' : Math.min(8, m[1].length);
}

export function jsonText(value: Json, indent: string | number = 2, trailing = true): string {
  const s = JSON.stringify(value, null, indent === 0 ? undefined : indent) ?? 'null';
  return trailing && indent !== 0 ? `${s}\n` : s;
}

// ------------------------------------------------------------------ the grid (table view)

/** A table: header names and rows of cells. `undefined` is a cell the row doesn't have (a JSON object missing that key). */
export interface Grid {
  columns: string[];
  rows: (Scalar | undefined)[][];
  /** JSON cells keep their type (number, yes/no, empty); CSV cells are all text. */
  typed: boolean;
}

export function csvToGrid(text: string, delimiter: string): Grid {
  const rows = parseDelimited(text, delimiter);
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const columns = Array.from({ length: width }, (_, i) => rows[0]?.[i] ?? '');
  return { columns, rows: rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')), typed: false };
}

const quoteCell = (v: string, delimiter: string) => (v === '' ? v : /["\r\n]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v);

export function gridToCsv(grid: Grid, delimiter: string, layout: { eol: string; trailing: boolean; bom: boolean } = { eol: '\n', trailing: true, bom: false }): string {
  const line = (cells: (Scalar | undefined)[]) => cells.map((c) => quoteCell(c === undefined || c === null ? '' : String(c), delimiter)).join(delimiter);
  const out = [line(grid.columns), ...grid.rows.map(line)].join(layout.eol);
  return `${layout.bom ? '﻿' : ''}${out}${layout.trailing ? layout.eol : ''}`;
}

const isScalar = (v: unknown): v is Scalar => v === null || typeof v !== 'object';

/** A list of objects whose values are all plain (text, number, yes/no, empty): the shape a table can show and edit. */
export function isFlatTable(v: unknown): v is Record<string, Scalar>[] {
  return Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === 'object' && !Array.isArray(r) && Object.values(r).every(isScalar));
}

export function jsonToGrid(list: Record<string, Scalar>[]): Grid {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  return { columns, rows: list.map((r) => columns.map((c) => (c in r ? r[c] : undefined))), typed: true };
}

export function gridToJson(grid: Grid): Record<string, Scalar>[] {
  return grid.rows.map((r) => {
    const o: Record<string, Scalar> = {};
    grid.columns.forEach((c, i) => {
      if (r[i] !== undefined) o[c] = r[i] as Scalar;
    });
    return o;
  });
}

/** What a cell shows in its box. Empty and missing are both a blank box; the type shows beside it. */
export function cellText(v: Scalar | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

export type CellType = 'text' | 'number' | 'yesno' | 'empty';

export function cellTypeOf(v: Scalar | undefined): CellType {
  return v === null ? 'empty' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'yesno' : 'text';
}

const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** What typing into a cell makes of it: a number stays a number while it still reads as one, a yes/no stays yes/no, text stays text. */
export function cellFromText(text: string, was: Scalar | undefined, typed: boolean): Scalar | undefined {
  if (!typed) return text;
  if (typeof was === 'number') return NUMBER.test(text.trim()) ? Number(text) : text;
  if (typeof was === 'boolean') return /^(true|yes)$/i.test(text.trim()) ? true : /^(false|no)$/i.test(text.trim()) ? false : text;
  if (was === null) return text === '' ? null : text;
  if (was === undefined && text === '') return undefined;
  return text;
}

/** Change a cell's type, keeping what can be kept ("12" becomes 12 and back; anything else starts from a blank of the new type). */
export function retypeScalar(v: Scalar | undefined, to: CellType): Scalar {
  const t = cellText(v);
  switch (to) {
    case 'number':
      return NUMBER.test(t.trim()) ? Number(t) : 0;
    case 'yesno':
      return /^(true|yes)$/i.test(t.trim()) ? true : false;
    case 'empty':
      return null;
    default:
      return t;
  }
}

const blankFor = (grid: Grid, col: number): Scalar => {
  if (!grid.typed) return '';
  const sample = grid.rows.map((r) => r[col]).find((v) => v !== undefined && v !== null);
  return typeof sample === 'number' ? 0 : typeof sample === 'boolean' ? false : '';
};

const blankRow = (grid: Grid): (Scalar | undefined)[] => grid.columns.map((_, i) => blankFor(grid, i));

function moved<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = list.slice();
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

export const gridOps = {
  setCell(g: Grid, row: number, col: number, v: Scalar | undefined): Grid {
    return { ...g, rows: g.rows.map((r, i) => (i === row ? r.map((c, j) => (j === col ? v : c)) : r)) };
  },
  /** A blank row below `after` (or at the top for -1). */
  addRow(g: Grid, after: number): Grid {
    const rows = g.rows.slice();
    rows.splice(after + 1, 0, blankRow(g));
    return { ...g, rows };
  },
  duplicateRow(g: Grid, row: number): Grid {
    const rows = g.rows.slice();
    rows.splice(row + 1, 0, g.rows[row].slice());
    return { ...g, rows };
  },
  deleteRow(g: Grid, row: number): Grid {
    return { ...g, rows: g.rows.filter((_, i) => i !== row) };
  },
  moveRow(g: Grid, row: number, to: number): Grid {
    return { ...g, rows: moved(g.rows, row, to) };
  },
  /** A column named so no other has the name (a JSON key can't repeat), after `after`. */
  addColumn(g: Grid, after: number): Grid {
    const taken = new Set(g.columns);
    let n = g.columns.length + 1;
    while (taken.has(`column${n}`)) n++;
    const at = after + 1;
    const columns = g.columns.slice();
    columns.splice(at, 0, `column${n}`);
    return { ...g, columns, rows: g.rows.map((r) => [...r.slice(0, at), '', ...r.slice(at)]) };
  },
  renameColumn(g: Grid, col: number, name: string): Grid {
    return { ...g, columns: g.columns.map((c, i) => (i === col ? name : c)) };
  },
  deleteColumn(g: Grid, col: number): Grid {
    return { ...g, columns: g.columns.filter((_, i) => i !== col), rows: g.rows.map((r) => r.filter((_, i) => i !== col)) };
  },
  moveColumn(g: Grid, col: number, to: number): Grid {
    if (col === to || to < 0 || to >= g.columns.length) return g;
    return { ...g, columns: moved(g.columns, col, to), rows: g.rows.map((r) => moved(r, col, to)) };
  },
};

/** A JSON table can't have two columns of one name (the second would swallow the first), nor a blank one. */
export function columnNameProblem(columns: string[], col: number, typed: boolean): string | null {
  const name = columns[col];
  if (!typed) return null;
  if (name === '') return 'A column needs a name.';
  if (columns.some((c, i) => i !== col && c === name)) return `Another column is already called “${name}”.`;
  return null;
}

// ------------------------------------------------------------------ the tree

export type Kind = 'text' | 'number' | 'yesno' | 'empty' | 'list' | 'group';

export const kindOf = (v: Json): Kind => (v === null ? 'empty' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'group' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'yesno' : 'text');

export const isContainer = (v: Json): v is Json[] | { [key: string]: Json } => v !== null && typeof v === 'object';

export const pathKey = (p: Path) => JSON.stringify(p);

export function getAt(root: Json, path: Path): Json | undefined {
  let cur: Json | undefined = root;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, Json>)[k];
  }
  return cur;
}

/** A copy of `root` with the value at `path` made by `fn`; the branches the path doesn't touch are shared, not copied. */
function edit(root: Json, path: Path, fn: (v: Json) => Json): Json {
  if (!path.length) return fn(root);
  const [k, ...rest] = path;
  if (Array.isArray(root)) return root.map((x, i) => (i === k ? edit(x, rest, fn) : x));
  if (root && typeof root === 'object') return Object.fromEntries(Object.entries(root).map(([key, x]) => [key, key === k ? edit(x, rest, fn) : x]));
  return root;
}

export const treeOps = {
  set(root: Json, path: Path, v: Json): Json {
    return edit(root, path, () => v);
  },
  remove(root: Json, path: Path): Json {
    if (!path.length) return root;
    const k = path[path.length - 1];
    return edit(root, path.slice(0, -1), (p) => (Array.isArray(p) ? p.filter((_, i) => i !== k) : Object.fromEntries(Object.entries(p as object).filter(([key]) => key !== k))));
  },
  /** Add to a list (at `at`, default the end) or a group (under a key nobody has, `key` or "newKey"). Returns the new tree and the path of what was added. */
  add(root: Json, parent: Path, v: Json, opts: { at?: number; key?: string } = {}): { root: Json; path: Path } {
    const target = getAt(root, parent);
    if (Array.isArray(target)) {
      const at = opts.at === undefined ? target.length : Math.max(0, Math.min(opts.at, target.length));
      return { root: edit(root, parent, (p) => [...(p as Json[]).slice(0, at), v, ...(p as Json[]).slice(at)]), path: [...parent, at] };
    }
    if (target && typeof target === 'object') {
      const taken = new Set(Object.keys(target));
      const base = opts.key || 'newKey';
      let key = base;
      for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
      return { root: edit(root, parent, (p) => ({ ...(p as object), [key]: v })), path: [...parent, key] };
    }
    return { root, path: parent };
  },
  /** Rename a group's key, keeping its place. An existing name is refused (returns null). */
  rename(root: Json, path: Path, name: string): Json | null {
    const k = path[path.length - 1];
    const parent = path.slice(0, -1);
    const p = getAt(root, parent);
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof k !== 'string') return null;
    if (name === k) return root;
    if (name in p) return null;
    return edit(root, parent, (g) => Object.fromEntries(Object.entries(g as object).map(([key, x]) => [key === k ? name : key, x])));
  },
  /** Move an item or key up (-1) or down (+1) among its siblings. */
  move(root: Json, path: Path, by: number): { root: Json; path: Path } {
    const k = path[path.length - 1];
    const parent = path.slice(0, -1);
    const p = getAt(root, parent);
    if (Array.isArray(p) && typeof k === 'number') {
      const to = k + by;
      if (to < 0 || to >= p.length) return { root, path };
      return { root: edit(root, parent, (a) => moved(a as Json[], k, to)), path: [...parent, to] };
    }
    if (p && typeof p === 'object' && typeof k === 'string') {
      const keys = Object.keys(p);
      const from = keys.indexOf(k);
      const to = from + by;
      if (to < 0 || to >= keys.length) return { root, path };
      const order = moved(keys, from, to);
      return { root: edit(root, parent, (g) => Object.fromEntries(order.map((key) => [key, (g as Record<string, Json>)[key]]))), path };
    }
    return { root, path };
  },
  duplicate(root: Json, path: Path): { root: Json; path: Path } {
    const k = path[path.length - 1];
    const parent = path.slice(0, -1);
    const v = getAt(root, path);
    if (v === undefined) return { root, path };
    if (typeof k === 'number') return treeOps.add(root, parent, structuredCloneJson(v), { at: k + 1 });
    return treeOps.add(root, parent, structuredCloneJson(v), { key: `${k}Copy` });
  },
};

const structuredCloneJson = (v: Json): Json => JSON.parse(JSON.stringify(v));

/** The value a new item of a kind starts as. */
export const blankOf = (kind: Kind): Json => (kind === 'number' ? 0 : kind === 'yesno' ? false : kind === 'empty' ? null : kind === 'list' ? [] : kind === 'group' ? {} : '');

/** Change a value's kind, keeping what can be kept: "12" and 12 swap, a list of one thing becomes that thing, anything else starts blank. */
export function convertTo(v: Json, kind: Kind): Json {
  if (kindOf(v) === kind) return v;
  const t = isContainer(v) ? '' : v === null ? '' : String(v);
  switch (kind) {
    case 'text':
      return t;
    case 'number':
      return NUMBER.test(t.trim()) ? Number(t) : 0;
    case 'yesno':
      return /^(true|yes)$/i.test(t.trim());
    case 'list':
      return v === null || v === '' ? [] : isContainer(v) ? (Array.isArray(v) ? v : Object.values(v)) : [v];
    case 'group':
      return Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [`item${i + 1}`, x])) : {};
    default:
      return null;
  }
}

/** Text typed into a text, number or yes/no value: a number reads as one while it can, else the text stays (and the kind with it). */
export function scalarFromText(text: string, kind: Kind): Json {
  if (kind === 'number') return NUMBER.test(text.trim()) ? Number(text) : text;
  if (kind === 'yesno') return /^(true|yes)$/i.test(text.trim());
  return text;
}

const NAMING = ['name', 'title', 'label', 'id', 'question', 'text', 'speaker', 'line', 'key'];

/** What a row says about its contents: "3 items", "5 keys" (with the group's name or first words, so one question can be told from the next), or the value itself, shortened. */
export function summaryOf(v: Json): string {
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (v && typeof v === 'object') {
    const n = Object.keys(v).length;
    const own = NAMING.map((k) => (v as Record<string, Json>)[k]).find((x) => typeof x === 'string' && x !== '') as string | undefined;
    const first = own ?? (Object.values(v).find((x) => typeof x === 'string' && x !== '') as string | undefined);
    const words = first && first.length > 40 ? `${first.slice(0, 40)}…` : first;
    return `${n} key${n === 1 ? '' : 's'}${words ? `: “${words}”` : ''}`;
  }
  if (v === null) return 'empty';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** How to show a file the editor can't change (a URL's): its text, from what the player loaded. */
export function textOfValue(value: unknown, kind: DataKind): string {
  if (kind === 'text') return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if ((kind === 'csv' || kind === 'tsv') && Array.isArray(value) && value.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    return gridToCsv({ ...jsonToGrid(value as Record<string, Scalar>[]), typed: false }, delimiterOf(kind));
  }
  return jsonText(value as Json, 2);
}

/** Which view a file suits: a table for CSV/TSV and for JSON that is a list of flat objects, a tree for other JSON, none for plain text. */
export function guiFor(text: string, kind: DataKind): 'table' | 'tree' | 'none' {
  if (kind === 'csv' || kind === 'tsv') return 'table';
  if (kind !== 'json') return 'none';
  try {
    return isFlatTable(JSON.parse(text)) ? 'table' : 'tree';
  } catch {
    return 'tree';
  }
}
