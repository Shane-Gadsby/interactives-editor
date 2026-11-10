//A list typed as JSON, shown as a table: a list of records is a row per record with a column per field, and a plain list of
//text or numbers is a one-column table. The text stays the one source of truth: the table reads it and writes it back whole.
//The same Grid the Data panel's table edits, so every row and column button there works here. Pure; the component is ListTable.
import { gridToJson, jsonToGrid, type Grid, type Scalar } from './data-edit';

/** The column a plain list of text or numbers shows its items in. */
export const PLAIN_COLUMN = 'value';

/** What a table starts a brand new list with when someone picks "Type my own items": three records with one field. */
export const STARTER_ITEMS = '[\n  {"text": "First"},\n  {"text": "Second"},\n  {"text": "Third"}\n]';

export interface ListGrid {
  grid: Grid;
  /** The items were plain values, not records: the table writes them back as plain values while it is still one column. */
  plain: boolean;
}

const isScalar = (v: unknown): v is Scalar => v === null || typeof v !== 'object';
const isRecord = (v: unknown): v is Record<string, Scalar> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isScalar);

/** The JSON array in some text, or null when it is not one. */
export function parseList(text: string): unknown[] | null {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The table for some list text, or null when the list cannot be one (it is not JSON, or an item holds a list or a group of its
 * own). Records give a column per field, plain values one column, and an empty list the columns it last had (`before`) or one.
 */
export function listToGrid(text: string, before?: string[]): ListGrid | null {
  const list = parseList(text);
  if (!list) return null;
  if (!list.length) return { grid: { columns: before?.length ? before : [PLAIN_COLUMN], rows: [], typed: true }, plain: !before?.length || (before.length === 1 && before[0] === PLAIN_COLUMN) };
  if (list.every(isScalar)) return { grid: { columns: [PLAIN_COLUMN], rows: list.map((v) => [v as Scalar]), typed: true }, plain: true };
  if (list.every(isRecord)) return { grid: jsonToGrid(list as Record<string, Scalar>[]), plain: false };
  return null;
}

/** The list text for an edited table. Still the plain column of a plain list: plain values again. Anything else: records. */
export function gridToListText(grid: Grid, plain: boolean): string {
  if (!grid.rows.length) return '[]';
  const items: unknown[] = plain && grid.columns.length === 1 && grid.columns[0] === PLAIN_COLUMN ? grid.rows.map((r) => r[0] ?? null) : gridToJson(grid);
  return `[\n${items.map((i) => `  ${JSON.stringify(i)}`).join(',\n')}\n]`;
}

/** Is this list text one a table can show (so the table view is offered, rather than only the JSON text). */
export const tableable = (text: string): boolean => listToGrid(text) !== null;
