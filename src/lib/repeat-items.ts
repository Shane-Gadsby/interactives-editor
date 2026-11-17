//Where a repeater's items come from, as a choice a course designer can make without typing a formula: a list variable, a data
//source, items typed into a table, or (still there for anyone who wants it) a formula. All of them end up as the one Items
//expression on the repeater, so nothing here is a hidden kind of thing: a name, a JSON list, or the formula itself.
import type { Project } from 'interactives-player';
import { STARTER_ITEMS, listToGrid, parseList } from './list-table';

export const OWN_ITEMS = 'own';
export const FORMULA_ITEMS = 'formula';

const LIST = 'list:';
const DATA = 'data:';

export interface ItemsChoice {
  value: string;
  label: string;
}

/** Everything the "Repeat for each" picker offers for this project. */
export function itemsChoices(project: Pick<Project, 'variables' | 'dataSources'>): ItemsChoice[] {
  return [
    ...project.variables.filter((v) => v.type === 'list').map((v) => ({ value: LIST + v.name, label: `List: ${v.name}` })),
    ...project.dataSources.map((d) => ({ value: DATA + d.name, label: `Data: ${d.name}` })),
    { value: OWN_ITEMS, label: 'Type my own items' },
    { value: FORMULA_ITEMS, label: 'A formula (advanced)' },
  ];
}

/** Which choice an Items expression is: exactly a list variable's or data source's name, a JSON list a table can show, or a formula. */
export function itemsChoiceOf(items: string, project: Pick<Project, 'variables' | 'dataSources'>): string {
  const text = items.trim();
  const list = project.variables.find((v) => v.type === 'list' && v.name === text);
  if (list) return LIST + list.name;
  const data = project.dataSources.find((d) => d.name === text);
  if (data) return DATA + data.name;
  if (text && listToGrid(text)) return OWN_ITEMS;
  return FORMULA_ITEMS;
}

/** The Items expression a choice means, given what is there now (so "Type my own items" keeps a list that is already typed). */
export function itemsFor(choice: string, current: string): string {
  if (choice.startsWith(LIST)) return choice.slice(LIST.length);
  if (choice.startsWith(DATA)) return choice.slice(DATA.length);
  if (choice === OWN_ITEMS) return current.trim() && listToGrid(current) ? current : STARTER_ITEMS;
  return current;
}

/** What a repeater starts with when it is switched on: the first list in the project, else a table of three items to change. */
export function defaultItems(project: Pick<Project, 'variables' | 'dataSources'>): string {
  return project.variables.find((v) => v.type === 'list')?.name ?? project.dataSources[0]?.name ?? STARTER_ITEMS;
}

/** How a layer inside the repeater reads the typed items: `{item}` for plain ones, `{item.field}` for records. */
export function itemExample(items: string): string {
  const list = parseList(items);
  const first = list?.find((x) => x !== undefined);
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const key = Object.keys(first)[0];
    if (key) return /^[A-Za-z_$][\w$]*$/.test(key) ? `{item.${key}}` : `{item["${key}"]}`;
  }
  return '{item}';
}
