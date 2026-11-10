//The "By value" source of a binding: a small table "when [something] is [value] then [result]" plus an "otherwise" row.
//It writes nothing new. It is the Look up converter (a map) on a binding whose formula is the variable, the item field or the
//condition the table is about, so the Formula and Converters views show exactly what the table does. These are the pure
//parts: which "when" choices there are, what the table rows are, and how a row changes.
import { isIdentifier, tryEvaluate, type Converter, type Variable } from 'interactives-player';

export type MapConverter = Extract<Converter, { type: 'map' }>;
export type MapValue = string | number | boolean;

/** A binding is shown as a table when its only converter is a Look up. */
export const isByValue = (list: Converter[] | undefined): boolean => !!list && list.length === 1 && list[0].type === 'map';

export interface WhenChoice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * What a table can be about: each variable, and (inside a repeater) the item's own fields, the item itself when it is plain
 * text or a number, and its place in the list. `repeat` is what the Inspector knows about the repeater's first copy.
 */
export function whenChoices(variables: Variable[], repeat?: { locals?: string[]; values?: Record<string, unknown> }): WhenChoice[] {
  const out: WhenChoice[] = variables.filter((v) => isIdentifier(v.name)).map((v) => ({ value: v.name, label: v.name, hint: v.type }));
  const item = repeat?.values?.item;
  if (repeat?.locals?.includes('item')) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item)) if (isIdentifier(k)) out.push({ value: `item.${k}`, label: `item.${k}`, hint: 'this item' });
    } else out.push({ value: 'item', label: 'item', hint: 'this item' });
  }
  if (repeat?.locals?.includes('index')) out.push({ value: 'index', label: 'index', hint: 'its place in the list' });
  if (repeat?.locals?.includes('isSelected')) out.push({ value: 'isSelected', label: 'isSelected', hint: 'true when this copy is picked' });
  return out;
}

/** Is the formula one of the plain choices (so the table can show a picker rather than a formula box). */
export const isPlainWhen = (expr: string, choices: WhenChoice[]): boolean => !expr.trim() || choices.some((c) => c.value === expr.trim());

/** What the "when" side can hold: the options of a choice variable, true and false, or anything typed. */
export type WhenKind = { kind: 'options'; options: string[] } | { kind: 'boolean' } | { kind: 'text' };

export function whenKind(expr: string, variables: Variable[], scope: Record<string, unknown>): WhenKind {
  const name = expr.trim();
  const v = variables.find((x) => x.name === name);
  if (v?.type === 'enum') return { kind: 'options', options: v.options ?? [] };
  if (v?.type === 'boolean') return { kind: 'boolean' };
  if (name && typeof tryEvaluate(name, { vars: scope }, undefined) === 'boolean') return { kind: 'boolean' };
  return { kind: 'text' };
}

/** The value a new row starts with: what the layer has now (so a colour starts as the colour it already is), or a plain default. */
export function defaultResult(kind: string | undefined, current: unknown): MapValue {
  if (kind === 'number') return typeof current === 'number' ? current : 0;
  if (kind === 'boolean') return typeof current === 'boolean' ? current : false;
  if (kind === 'color') return typeof current === 'string' && current ? current : '#888888';
  return typeof current === 'string' ? current : '';
}

/** The table a binding starts with when it is switched to By value: a row per option or per true and false, none for free text. */
export function startMap(when: WhenKind, kind: string | undefined, current: unknown): MapConverter {
  const keys = when.kind === 'options' ? when.options : when.kind === 'boolean' ? ['true', 'false'] : [];
  return { type: 'map', map: Object.fromEntries(keys.map((k) => [k, defaultResult(kind, current)])) };
}

/** The rows in the order they sit. */
export const rowsOf = (c: MapConverter): [string, MapValue][] => Object.entries(c.map);

/** A key the table does not have yet: `base`, then `base 2`, `base 3`... */
export function freeKey(c: MapConverter, base: string): string {
  if (!(base in c.map)) return base;
  for (let i = 2; ; i++) if (!(`${base} ${i}` in c.map)) return `${base} ${i}`;
}

/** The next unused option of a choice (so Add a value on a choice variable offers the ones still missing). */
export const nextOption = (c: MapConverter, options: string[]): string | undefined => options.find((o) => !(o in c.map));

export function addRow(c: MapConverter, key: string, value: MapValue): MapConverter {
  return { ...c, map: { ...c.map, [key]: value } };
}

/** Change what a row is about. The row keeps its place, and a name another row has is refused (the table is returned as it was). */
export function renameRow(c: MapConverter, from: string, to: string): MapConverter {
  if (from === to || to in c.map) return c;
  return { ...c, map: Object.fromEntries(Object.entries(c.map).map(([k, v]) => [k === from ? to : k, v])) };
}

export function setRow(c: MapConverter, key: string, value: MapValue): MapConverter {
  return { ...c, map: { ...c.map, [key]: value } };
}

export function removeRow(c: MapConverter, key: string): MapConverter {
  const { [key]: _gone, ...rest } = c.map;
  return { ...c, map: rest };
}

/** The otherwise row: undefined keeps whatever the formula gave. */
export const setOtherwise = (c: MapConverter, value: MapValue | undefined): MapConverter => ({ ...c, fallback: value });
