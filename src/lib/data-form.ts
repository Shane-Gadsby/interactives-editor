import { isContainer, kindOf, type Json, type Kind, type Path } from './data-edit';

/**
 * The pure side of the Form view of a JSON data file: plain labels for key names, titles for the cards of a list, what a
 * new item of a list starts as, and the outline. The shape comes from the data itself (there is no schema), so all of it
 * reads the values. The edits themselves are `treeOps` in data-edit.ts.
 */

const isAcronym = (w: string) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);

/** A key name as a label: startLabel, start_label and start-label all become "Start label"; ID and URL keep their capitals. */
/** Short words that read as capitals even when the key is written in lower case (ai, id, url). */
const KNOWN_ACRONYMS = new Set(['ai', 'id', 'ids', 'url', 'urls', 'uri', 'html', 'css', 'json', 'csv', 'api', 'pdf', 'faq', 'lti', 'gpa']);

export function labelOf(key: string): string {
  if (!/[A-Za-z]/.test(key)) return key === '' ? '(no name)' : key;
  // SHOUTED_NAMES are sentence case too; a single ID or URL keeps its capitals
  const base = /[_\-.\s]/.test(key) && !/[a-z]/.test(key) ? key.toLowerCase() : key;
  const words = base
    .replace(/[_\-.\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z]{2,})(\d)/g, '$1 $2')
    .trim()
    .split(/\s+/);
  return words.map((w, i) => (isAcronym(w) ? w : KNOWN_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ');
}

const IRREGULAR: Record<string, string> = { people: 'person', children: 'child', men: 'man', women: 'woman', data: 'datum', criteria: 'criterion', media: 'medium' };

/** The last word of a label made singular, for naming the items of a list: "Dilemmas" gives "Dilemma", "Choices" gives "Choice". */
export function singularOf(label: string): string {
  const m = /^(.*?)([A-Za-z]+)$/.exec(label.trim());
  if (!m) return label || 'Item';
  const [, head, last] = m;
  const lower = last.toLowerCase();
  let word = last;
  const irregular = IRREGULAR[lower];
  if (irregular) word = last[0] === last[0].toUpperCase() ? irregular.charAt(0).toUpperCase() + irregular.slice(1) : irregular;
  else if (isAcronym(last)) word = last;
  else if (/[^aeiou]ies$/i.test(last)) word = `${last.slice(0, -3)}${last[last.length - 3] === last[last.length - 3].toUpperCase() ? 'Y' : 'y'}`;
  else if (/(ss|sh|ch|x|z)es$/i.test(last)) word = last.slice(0, -2);
  else if (/(ss|us|is)$/i.test(last)) word = last;
  else if (/s$/i.test(last)) word = last.slice(0, -1);
  return `${head}${word}` || 'Item';
}

/** The noun a list's items go by: from the list's key ("choices" gives "Choice"), or Item when it has none (a list in a list, or the file itself). */
export const nounOf = (key: string | number | undefined) => (typeof key === 'string' && key !== '' && /[A-Za-z]/.test(key) ? singularOf(labelOf(key)) : 'Item');

// A title field is a good name for its card; id comes after the words that say more than "d1" does
const TITLE_KEYS = ['title', 'name', 'label', 'heading', 'question', 'id'];
const SHORT = 60;
const TITLE_MAX = 48;

const oneLine = (s: string) => {
  const line = s.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const t = line.trim();
  return t.length > TITLE_MAX || line !== s.trim() ? `${t.slice(0, TITLE_MAX).trimEnd()}…` : t;
};

/** What names a group among its neighbours: title, name, label, heading, question or id, else its first short text. Empty when it has none. */
export function nameOf(group: { [key: string]: Json }): string {
  const entries = Object.entries(group);
  for (const want of TITLE_KEYS) {
    const hit = entries.find(([k, v]) => k.toLowerCase() === want && typeof v === 'string' && v.trim() !== '');
    if (hit) return oneLine(hit[1] as string);
  }
  const first = entries.find(([, v]) => typeof v === 'string' && v.trim() !== '' && v.length <= SHORT && !/\n/.test(v));
  return first ? oneLine(first[1] as string) : '';
}

/** "Dilemma 1: The old assignment", counting from 1. A list inside a list, or a group with nothing to name it by, is just "Item 3". */
export function cardTitle(value: Json, noun: string, index: number): string {
  const n = `${noun} ${index + 1}`;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const name = nameOf(value);
    return name ? `${n}: ${name}` : n;
  }
  return n;
}

/** A blank of the same shape: every key kept, each value emptied but still the same type (text, 0, no, a list with nothing in it). */
export function blankLike(v: Json): Json {
  if (Array.isArray(v)) return [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankLike(x)]));
  return typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : v === null ? null : '';
}

/**
 * What "Add another" puts on the end of a list: the fields of the items already there, empty. The keys of every item are
 * gathered in the order they first appear, and each takes the type of the first item that has a value for it, so a field
 * one item left out (or left empty) still comes back. A list of plain values adds a blank of the last one's type.
 */
export function newItemFor(items: Json[]): Json {
  if (!items.length) return '';
  const groups = items.filter((x): x is { [key: string]: Json } => !!x && typeof x === 'object' && !Array.isArray(x));
  if (groups.length) {
    const out: { [key: string]: Json } = {};
    for (const g of groups) {
      for (const [k, v] of Object.entries(g)) {
        if (!(k in out)) out[k] = blankLike(v);
        else if (out[k] === null && v !== null) out[k] = blankLike(v);
      }
    }
    return out;
  }
  const last = items[items.length - 1];
  return Array.isArray(last) ? [] : blankLike(last === null ? '' : last);
}

/** What the same key holds in the other items of the list, so an empty value can be filled in as that: a number where the others are numbers. */
export function siblingKind(items: Json[] | undefined, key: string): Kind {
  for (const it of items ?? []) {
    if (it && typeof it === 'object' && !Array.isArray(it)) {
      const v = it[key];
      if (v !== undefined && v !== null) return kindOf(v);
    }
  }
  return 'text';
}

/** What an empty value becomes when it is filled in: text, a number or yes/no. A list or group is a structure change, so it stays in Tree. */
export const fillFor = (kind: Kind): Json => (kind === 'number' ? 0 : kind === 'yesno' ? false : '');

export interface OutlineItem {
  /** A stable key for the path (see `idOf`). */
  key: string;
  path: Path;
  /** What the outline shows. */
  title: string;
  /** The same with where it sits: "Dilemma 1: The old assignment > Choices". */
  trail: string;
  depth: number;
  kind: 'list' | 'card';
}

/** A path as an id-safe string, for ids and for finding a card again after the form redraws. */
export const idOf = (path: Path) => path.map((p) => (typeof p === 'number' ? `n${p}` : `k${p.replace(/[^A-Za-z0-9]/g, (c) => `-${c.charCodeAt(0)}-`)}`)).join('_') || 'root';

/**
 * Every list and every card of a file, in the order the form shows them, for the outline at its side and for Open all. A
 * group that is a field of another is a card (titled by its key); the items of a list are cards when they are groups or
 * lists, and not listed when they are plain values.
 */
export function outlineOf(root: Json | undefined, rootLabel: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  const visit = (v: Json, path: Path, noun: string, trail: string, depth: number) => {
    if (Array.isArray(v)) {
      v.forEach((it, i) => {
        if (!isContainer(it)) return;
        const title = cardTitle(it, noun, i);
        const t = trail ? `${trail} > ${title}` : title;
        const p = [...path, i];
        out.push({ key: idOf(p), path: p, title, trail: t, depth, kind: 'card' });
        visit(it, p, Array.isArray(it) ? 'Item' : nounOf(undefined), t, depth + 1);
      });
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const p = [...path, k];
        const name = labelOf(k);
        const t = trail ? `${trail} > ${name}` : name;
        if (Array.isArray(x)) {
          out.push({ key: idOf(p), path: p, title: `${name} (${x.length})`, trail: t, depth, kind: 'list' });
          visit(x, p, nounOf(k), t, depth + 1);
        } else if (x && typeof x === 'object') {
          out.push({ key: idOf(p), path: p, title: name, trail: t, depth, kind: 'card' });
          visit(x, p, 'Item', t, depth + 1);
        }
      }
    }
  };
  if (Array.isArray(root)) {
    out.push({ key: idOf([]), path: [], title: `${rootLabel} (${root.length})`, trail: rootLabel, depth: 0, kind: 'list' });
    visit(root, [], 'Item', rootLabel, 1);
  } else if (root && typeof root === 'object') visit(root, [], 'Item', '', 0);
  return out;
}
