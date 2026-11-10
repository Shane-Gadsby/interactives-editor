import { CONTEXT_FIELDS, FUNCTION_HINTS, LOCAL_SCOPE_HINTS, PLAYER_SCOPE_HINTS, SAFE_GLOBAL_NAMES, memberNames, tryEvaluate, type Project } from 'interactives-player';

/**
 * Suggestions for expression fields. Pure: give it the text, the caret and what the project has in scope, and it says
 * what could be typed here and how to put a choice into the text. The component (components/ExprField.tsx) is the
 * keyboard and the list; none of the rules live there.
 */

export type SuggestKind = 'variable' | 'data' | 'scope' | 'local' | 'function' | 'global' | 'field' | 'method' | 'layer';

export interface Suggestion {
  /** What the list shows, and what is matched against. */
  label: string;
  /** What goes into the text (a function adds its opening bracket). */
  insert: string;
  kind: SuggestKind;
  /** text, number, true/false, list, object, function... */
  type: string;
  /** The current value, or a signature for a function, or a line of help. */
  detail?: string;
}

export interface SuggestEnv {
  project: Project;
  /** What the canvas preview has in scope, by name. A function because building it works out every formula. */
  scope: () => Record<string, unknown>;
  /** Layers of the artboard being edited, for layer("..."). */
  layers: () => { name: string; type: string }[];
  /** Names the field sees besides the project's (event, value, item, index, self...), keys of LOCAL_SCOPE_HINTS. */
  locals?: string[];
  /** Their values when known, so `self.` can list the layer's own settings. */
  localValues?: Record<string, unknown>;
}

export type SlotKind = 'name' | 'member' | 'layer';

/** The piece of text a suggestion would replace. */
export interface Slot {
  kind: SlotKind;
  /** The word typed so far (for a layer, what is typed inside the quote). */
  prefix: string;
  /** Where the replaced text starts and ends in the whole field text. */
  start: number;
  end: number;
  /** member: the expression before the dot. */
  path?: string;
  /** layer: the quote character the name is inside. */
  quote?: string;
}

const IDENT_PART = /[\w$]/;
// the chain of names, [..] and (..) in front of a dot: self.width, layer("Knob"), items[0]
const CHAIN_BEFORE_DOT = /([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^[\]]*\]|\([^()]*\))*)\??\.$/;

/** The text of the `{...}` the caret is inside (not a `{{` escape), or null. */
export function braceSpan(text: string, caret: number): { start: number } | null {
  let open = -1;
  for (let i = 0; i < caret; i++) {
    const c = text[i];
    if (open < 0) {
      if (c === '{') {
        if (text[i + 1] === '{') i++;
        else open = i;
      }
    } else if (c === '}') {
      open = -1;
    }
  }
  return open < 0 ? null : { start: open + 1 };
}

/** If the caret is inside a string literal in `before`, where it opened and with which quote. */
function openString(before: string): { at: number; quote: string } | null {
  let quote = '';
  let at = -1;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
      at = i;
    }
  }
  return quote ? { at, quote } : null;
}

/** Work out what is being typed at `caret`, or null when nothing is to be suggested. `template` means only inside `{...}`. */
export function findSlot(text: string, caret: number, template = false): Slot | null {
  let from = 0;
  if (template) {
    const span = braceSpan(text, caret);
    if (!span) return null;
    from = span.start;
  }
  const before = text.slice(from, caret);
  const str = openString(before);
  if (str) {
    // only layer("...") and instanceInput("...") take a name worth suggesting
    if (!/\b(?:layer|instanceInput)\s*\(\s*$/.test(before.slice(0, str.at))) return null;
    const prefix = before.slice(str.at + 1);
    return { kind: 'layer', prefix, start: caret - prefix.length, end: wordEnd(text, caret, true, str.quote), quote: str.quote };
  }
  const m = /[A-Za-z_$][\w$]*$/.exec(before);
  const prefix = m ? m[0] : '';
  const wordStart = caret - prefix.length;
  const ahead = text.slice(from, wordStart);
  if (prefix && IDENT_PART.test(ahead.slice(-1))) return null;
  const dot = CHAIN_BEFORE_DOT.exec(ahead);
  if (dot) return { kind: 'member', prefix, start: wordStart, end: wordEnd(text, caret), path: dot[1] };
  // a number's decimal point, not a member access
  if (/\.$/.test(ahead)) return null;
  if (!prefix) return null;
  return { kind: 'name', prefix, start: wordStart, end: wordEnd(text, caret) };
}

/** The end of the word the caret is in (so choosing replaces all of it); for a layer name, up to the closing quote. */
function wordEnd(text: string, caret: number, layer = false, quote = ''): number {
  let i = caret;
  if (layer) {
    while (i < text.length && text[i] !== quote && text[i] !== '\n') i++;
    return i;
  }
  while (i < text.length && IDENT_PART.test(text[i])) i++;
  return i;
}

const FRIENDLY: Record<string, string> = { boolean: 'true/false', string: 'text' };

/** A short look at a value: the number, the text in quotes (cut), the size of a list. */
export function preview(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return `“${v.length > 24 ? v.slice(0, 23) + '…' : v}”`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'function') return '';
  return typeof v === 'object' ? 'object' : '';
}

/** The type word to show beside a value. */
export function typeOf(v: unknown): string {
  if (v === undefined) return 'nothing';
  if (v === null) return 'nothing';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return 'true/false';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'function') return 'function';
  return typeof v === 'object' ? 'object' : typeof v;
}

const rank = (label: string, q: string): number => {
  if (!q) return 0;
  const l = label.toLowerCase();
  const w = q.toLowerCase();
  if (l === w) return 0;
  if (l.startsWith(w)) return 1;
  // a camelCase word start: "fn" finds firstName
  const caps = label.replace(/[^A-Z]/g, '').toLowerCase();
  if (label[0].toLowerCase() + caps === w || l.includes('_' + w)) return 2;
  return l.includes(w) ? 3 : -1;
};

const GROUP: Record<SuggestKind, number> = { variable: 0, data: 1, local: 2, scope: 3, function: 4, global: 5, field: 0, method: 1, layer: 0 };
const LIMIT = 12;

function pick(items: Suggestion[], q: string): Suggestion[] {
  const scored: { s: Suggestion; r: number }[] = [];
  for (const s of items) {
    const r = rank(s.label, q);
    if (r >= 0) scored.push({ s, r });
  }
  scored.sort((a, b) => a.r - b.r || GROUP[a.s.kind] - GROUP[b.s.kind] || a.s.label.localeCompare(b.s.label));
  return scored.slice(0, LIMIT).map((x) => x.s);
}

function nameItems(env: SuggestEnv): Suggestion[] {
  const scope = env.scope();
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (s: Suggestion) => {
    if (!seen.has(s.label)) (seen.add(s.label), out.push(s));
  };
  for (const v of env.project.variables) {
    add({ label: v.name, insert: v.name, kind: 'variable', type: FRIENDLY[v.type] ?? v.type, detail: preview(scope[v.name]) });
  }
  for (const d of env.project.dataSources) {
    add({ label: d.name, insert: d.name, kind: 'data', type: 'data', detail: d.kind });
  }
  for (const name of env.locals ?? []) {
    const h = LOCAL_SCOPE_HINTS[name];
    if (h) add({ label: name, insert: name, kind: 'local', type: h.type, detail: h.hint });
  }
  for (const [name, h] of Object.entries(PLAYER_SCOPE_HINTS)) {
    if (h.type === 'function') continue;
    add({ label: name, insert: name, kind: 'scope', type: h.type, detail: name in scope && preview(scope[name]) ? `${preview(scope[name])}  ${h.hint}` : h.hint });
  }
  for (const [name, f] of Object.entries(FUNCTION_HINTS)) {
    add({ label: name, insert: name + '(', kind: 'function', type: 'function', detail: f.signature + '  ' + f.hint });
  }
  for (const name of SAFE_GLOBAL_NAMES) {
    if (/^[A-Z]/.test(name) || name === 'JSON') add({ label: name, insert: name, kind: 'global', type: typeof (scope[name] ?? 0) === 'function' ? 'function' : 'object' });
    else add({ label: name, insert: name + '(', kind: 'global', type: 'function' });
  }
  return out;
}

function memberItems(path: string, env: SuggestEnv): Suggestion[] {
  const scope = env.scope();
  let value: unknown;
  try {
    value = tryEvaluate(path, { vars: scope, extra: env.localValues }, undefined);
  } catch {
    value = undefined;
  }
  if (value === undefined || value === null) return [];
  const arrayLike = Array.isArray(value) || typeof value === 'string';
  const readable = typeof value === 'function' || (typeof value === 'object' && !arrayLike && !(value instanceof Date) && !(value instanceof RegExp));
  const ctx = path === 'context' ? new Map(CONTEXT_FIELDS.map((f) => [f.name as string, f.label])) : null;
  return memberNames(value).map((name): Suggestion => {
    // objects and namespaces (Math) can say what each member is; a string, list or date has the same few properties and the rest are methods
    if (readable) {
      const v = (value as Record<string, unknown>)[name];
      if (typeof v === 'function') return { label: name, insert: name + '(', kind: 'method', type: 'function' };
      const help = ctx?.get(name);
      return { label: name, insert: name, kind: 'field', type: typeOf(v), detail: [preview(v), help].filter(Boolean).join('  ') || undefined };
    }
    if (name === 'length' || name === 'source' || name === 'flags') return { label: name, insert: name, kind: 'field', type: name === 'length' ? 'number' : 'text' };
    return { label: name, insert: name + '(', kind: 'method', type: 'function' };
  });
}

function layerItems(env: SuggestEnv): Suggestion[] {
  return env.layers().map((l) => ({ label: l.name, insert: l.name, kind: 'layer' as const, type: l.type }));
}

/** The suggestions for the caret, with the slot they would replace; null when there is nothing to offer. */
export function suggest(text: string, caret: number, env: SuggestEnv, template = false): { slot: Slot; items: Suggestion[] } | null {
  const slot = findSlot(text, caret, template);
  if (!slot) return null;
  const pool = slot.kind === 'layer' ? layerItems(env) : slot.kind === 'member' ? memberItems(slot.path!, env) : nameItems(env);
  const items = pick(pool, slot.prefix);
  // nothing to add: the only thing on offer is what is already typed
  if (!items.length || (items.length === 1 && items[0].insert === slot.prefix && !items[0].insert.endsWith('('))) return null;
  return { slot, items };
}

/** The text after choosing `item`, and where the caret goes. */
export function accept(text: string, slot: Slot, item: Suggestion): { text: string; caret: number } {
  let insert = item.insert;
  let end = slot.end;
  if (slot.kind === 'layer') {
    const q = slot.quote ?? '"';
    insert = item.insert.replace(/\\/g, '\\\\').split(q).join('\\' + q);
    if (text[end] === q) end++;
    insert += q;
  }
  const next = text.slice(0, slot.start) + insert + text.slice(end);
  // a function already followed by its bracket keeps it, and the caret goes past it
  if (insert.endsWith('(') && text[end] === '(') return { text: text.slice(0, slot.start) + insert.slice(0, -1) + text.slice(end), caret: slot.start + insert.length };
  return { text: next, caret: slot.start + insert.length };
}
