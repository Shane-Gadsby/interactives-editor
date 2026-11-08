/**
 * Reading and writing what the Fill in panel edits. A form (`Project.contentForm`) only says where things are; this is the
 * code that follows a binding into the document: a variable's starting value, a layer's text, a question's settings, a graph
 * node's value, a picture slot. Every write is plain document data, made inside `EditorStore.update`, so it undoes, saves
 * and goes out as live ops like any other edit, and the Variables, Layers, Question and Interactions views show it.
 */
import { MAX_BLANKS, MAX_CARDS, MAX_EXTRAS, MAX_GROUPS, MAX_OPTIONS, MAX_PAIRS, formFields, type Artboard, type ContentForm, type FormBind, type FormChoice, type FormColumn, type FormField, type FormRows, type Project, type Question, type SceneNode, type Variable } from 'interactives-player';
import { locate } from '../store/doc';
import { store } from '../store/store';
import { setQuestionSettings } from './question-kit';
import { setDock, showPanel } from './dock';

type Obj = Record<string, unknown>;
export type Row = Record<string, unknown>;

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function layerOf(p: Project, a: string, n: string): SceneNode | null {
  const ab = p.artboards.find((x) => x.id === a);
  return (ab && locate(ab, n)?.node) || null;
}

const variableOf = (p: Project, id: string): Variable | undefined => p.variables.find((v) => v.id === id);

const pathGet = (root: unknown, path: (string | number)[]): unknown => {
  let at: unknown = root;
  for (const k of path) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Obj)[k as string];
  }
  return at;
};

/** A copy of `root` with the value at `path` replaced (arrays and objects along the way copied, not changed). */
function pathSet<T>(root: T, path: (string | number)[], value: unknown): T {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  const copy = Array.isArray(root) ? [...root] : { ...((root as Obj) ?? {}) };
  (copy as Obj)[k as string] = pathSet((copy as Obj)[k as string], rest, value);
  return copy as T;
}

const parseList = (v: Variable): unknown[] => {
  if (typeof v.initial !== 'string') return [];
  try {
    const a = JSON.parse(v.initial);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------- one binding

/** Whether the thing a binding points at is still there (a deleted layer or variable leaves it dangling). */
export function bindExists(p: Project, b: FormBind): boolean {
  switch (b.k) {
    case 'var':
      return !!variableOf(p, b.v);
    case 'layer':
    case 'slot':
      return !!layerOf(p, b.a, b.n);
    case 'q': {
      const n = layerOf(p, b.a, b.n);
      return !!n && n.type === 'frame' && !!n.question;
    }
    case 'param':
      return !!p.artboards.find((x) => x.id === b.a)?.logic.nodes.some((x) => x.id === b.n);
    case 'project':
      return pathGet(p, b.path) !== undefined;
  }
}

const slotAsset = (n: SceneNode): string => {
  if (n.type === 'image' || n.type === 'video') return n.assetId ?? '';
  const f = (n as { fill?: { type?: string; assetId?: string } | null }).fill;
  return f && f.type === 'image' ? (f.assetId ?? '') : '';
};

/** The value a binding holds now (undefined when it is dangling). */
export function getBind(p: Project, b: FormBind): unknown {
  switch (b.k) {
    case 'var': {
      const v = variableOf(p, b.v);
      if (!v) return undefined;
      if (v.type === 'list') return b.path ? pathGet(parseList(v), b.path) : parseList(v);
      return v.initial;
    }
    case 'layer':
      return (layerOf(p, b.a, b.n) as unknown as Obj | null)?.[b.prop];
    case 'param': {
      const raw = p.artboards.find((x) => x.id === b.a)?.logic.nodes.find((x) => x.id === b.n)?.params?.[b.param];
      if (b.str) return raw === undefined ? undefined : String(raw);
      if (!b.json) return raw;
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    }
    case 'q': {
      const n = layerOf(p, b.a, b.n);
      return n && n.type === 'frame' && n.question ? pathGet(n.question, b.path) : undefined;
    }
    case 'slot': {
      const n = layerOf(p, b.a, b.n);
      return n ? slotAsset(n) : undefined;
    }
    case 'project':
      return pathGet(p, b.path);
  }
}

/** Write a value through a binding, inside an `EditorStore.update` recipe. Returns false when the binding is dangling. */
export function setBind(d: Project, b: FormBind, value: unknown): boolean {
  switch (b.k) {
    case 'var': {
      const v = variableOf(d, b.v);
      if (!v) return false;
      if (v.type === 'list') v.initial = JSON.stringify(b.path ? pathSet(parseList(v), b.path, value) : (value ?? []));
      else if (v.type === 'number') v.initial = Number.isFinite(Number(value)) ? Number(value) : 0;
      else if (v.type === 'boolean') v.initial = !!value;
      else v.initial = String(value ?? '');
      return true;
    }
    case 'layer': {
      const n = layerOf(d, b.a, b.n) as unknown as Obj | null;
      if (!n) return false;
      n[b.prop] = value;
      return true;
    }
    case 'param': {
      const node = d.artboards.find((x) => x.id === b.a)?.logic.nodes.find((x) => x.id === b.n);
      if (!node) return false;
      node.params = { ...node.params, [b.param]: b.json ? JSON.stringify(value) : b.str ? String(value ?? '') : value };
      return true;
    }
    case 'q': {
      const n = layerOf(d, b.a, b.n);
      if (!n || n.type !== 'frame' || !n.question) return false;
      const top = b.path[0] as keyof Question;
      const next = pathSet(clone(n.question), b.path, value);
      setQuestionSettings(d, b.a, b.n, { [top]: next[top] } as Partial<Question>);
      return true;
    }
    case 'slot': {
      const n = layerOf(d, b.a, b.n) as unknown as Obj | null;
      if (!n) return false;
      const id = String(value ?? '');
      if (n.type === 'image' || n.type === 'video') n.assetId = id || null;
      else if (id) n.fill = { type: 'image', assetId: id, fit: 'cover' };
      else if (b.restore) n.fill = clone(b.restore);
      for (const h of b.hide ?? []) {
        const hn = layerOf(d, b.a, h) as unknown as Obj | null;
        if (hn) hn.visible = !id;
      }
      return true;
    }
    case 'project': {
      let at: unknown = d;
      for (const k of b.path.slice(0, -1)) {
        if (at === null || typeof at !== 'object') return false;
        at = (at as Obj)[k];
      }
      if (at === null || typeof at !== 'object') return false;
      (at as Obj)[b.path[b.path.length - 1]] = value;
      return true;
    }
  }
}

// ---------------------------------------------------------------- lists

export interface RowView {
  /** A fixed row's own name ("Word 1"); list rows have none. */
  label?: string;
  values: Row;
}

const cellValue = (c: FormColumn, raw: unknown): unknown => {
  switch (c.type) {
    case 'toggle':
      return raw === true;
    case 'number':
    case 'pick':
      return typeof raw === 'number' ? raw : raw === undefined || raw === '' ? '' : Number(raw);
    case 'lines':
    case 'tags':
      return Array.isArray(raw) ? raw.map(String) : [];
    case 'numbers':
      return Array.isArray(raw) ? raw.map(Number).filter((x) => Number.isFinite(x)) : [];
    default:
      return raw === undefined || raw === null ? '' : String(raw);
  }
};

const bindRows = (p: Project, b: FormBind): Obj[] => {
  const v = getBind(p, b);
  return Array.isArray(v) ? (v as Obj[]) : [];
};

const questionRows = (p: Project, r: FormRows & { source: 'q' }): Obj[] => {
  const n = layerOf(p, r.a, r.n);
  const list = n && n.type === 'frame' && n.question ? (n.question as unknown as Obj)[r.key] : undefined;
  return Array.isArray(list) ? (list as Obj[]) : [];
};

/** The rows of a `list` field with each cell as the form shows it. */
export function readRows(p: Project, f: FormField): RowView[] {
  const cols = f.columns ?? [];
  const r = f.rows;
  if (!r) return [];
  if (r.source === 'fixed')
    return r.rows.map((row) => ({ label: row.label, values: Object.fromEntries(cols.map((c) => [c.key, cellValue(c, row.cells[c.key] ? getBind(p, row.cells[c.key]) : undefined)])) }));
  const list = r.source === 'var' ? (variableOf(p, r.v) ? parseList(variableOf(p, r.v)!) : []) : r.source === 'bind' ? bindRows(p, r.bind) : questionRows(p, r);
  const scalar = r.source === 'var' && r.scalar;
  return list.map((raw) => ({ values: Object.fromEntries(cols.map((c) => [c.key, cellValue(c, scalar ? raw : c.path ? pathGet(raw, c.path) : (raw as Obj | null)?.[c.key])])) }));
}

const emptyCell = (c: FormColumn): unknown => (c.type === 'toggle' ? false : c.type === 'lines' || c.type === 'tags' || c.type === 'numbers' ? [] : c.type === 'number' || c.type === 'pick' ? (c.type === 'pick' ? (c.base ?? 1) : 0) : '');

const nextId = (list: Obj[], prefix: string): string => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};
const ID_PREFIX = { options: 'o', blanks: 'b', pairs: 'p', groups: 'g', cards: 'c', extras: 'x' } as const;

const writeList = (d: Project, r: FormRows & { source: 'var' | 'q' | 'bind' }, list: unknown[]): boolean => {
  if (r.source === 'bind') return setBind(d, r.bind, list);
  if (r.source === 'var') {
    for (const s of r.sized ?? []) {
      const v = variableOf(d, s.v);
      if (!v) continue;
      const have = parseList(v);
      v.initial = JSON.stringify(have.length > list.length ? have.slice(0, list.length) : [...have, ...Array.from({ length: list.length - have.length }, () => clone(s.fill))]);
    }
    return setBind(d, { k: 'var', v: r.v }, list);
  }
  return setBind(d, { k: 'q', a: r.a, n: r.n, path: [r.key] }, list);
};

const currentList = (d: Project, r: FormRows & { source: 'var' | 'q' | 'bind' }): unknown[] => (r.source === 'var' ? (variableOf(d, r.v) ? parseList(variableOf(d, r.v)!) : []) : r.source === 'bind' ? clone(bindRows(d, r.bind)) : clone(questionRows(d, r)));

/** Change one cell. `row` counts from 0. */
export function setCell(d: Project, f: FormField, row: number, key: string, value: unknown): boolean {
  const r = f.rows;
  const col = f.columns?.find((c) => c.key === key);
  if (!r || !col) return false;
  if (r.source === 'fixed') {
    const b = r.rows[row]?.cells[key];
    return b ? setBind(d, b, value) : false;
  }
  const list = currentList(d, r);
  if (row < 0 || row >= list.length) return false;
  if (r.source === 'var' && r.scalar) list[row] = value;
  else {
    const put = (at: number, v: unknown) => {
      if (col.path) {
        list[at] = pathSet((list[at] as Obj) ?? {}, col.path, v);
        return;
      }
      const next = { ...((list[at] as Obj) ?? {}) };
      //a question's `correct` is only there when it is true
      if (v === undefined || (r.source === 'q' && col.type === 'toggle' && v === false)) delete next[key];
      else next[key] = v;
      list[at] = next;
    };
    put(row, value);
    //one right answer: switching one on switches the rest off
    if (col.exclusive && value === true) list.forEach((_, i) => i !== row && put(i, false));
  }
  return writeList(d, r, list);
}

export function canAdd(p: Project, f: FormField): boolean {
  const r = f.rows;
  if (!r || r.source === 'fixed' || f.fixed) return false;
  const n = readRows(p, f).length;
  if (f.maxRows !== undefined && n >= f.maxRows) return false;
  if (r.source === 'q') return n < { options: MAX_OPTIONS, blanks: MAX_BLANKS, pairs: MAX_PAIRS, extras: MAX_EXTRAS, groups: MAX_GROUPS, cards: MAX_CARDS }[r.key];
  return true;
}
export const canRemove = (p: Project, f: FormField): boolean => !!f.rows && f.rows.source !== 'fixed' && !f.fixed && readRows(p, f).length > (f.minRows ?? 0);

/** A new row at the end, from the field's `blank` row (every column left out starts empty). */
export function addRow(d: Project, f: FormField): boolean {
  const r = f.rows;
  if (!r || r.source === 'fixed' || !canAdd(d, f)) return false;
  const list = currentList(d, r);
  const blank = f.blank ?? {};
  const cols = f.columns ?? [];
  if (r.source === 'var' && r.scalar) list.push(blank[''] ?? '');
  else {
    const row: Obj = {};
    if (r.source === 'q') row.id = nextId(list as Obj[], ID_PREFIX[r.key]);
    let made: Obj = row;
    for (const c of cols) {
      if (r.source === 'q' && c.type === 'toggle') continue;
      const v = clone(blank[c.key] ?? (c.from === 'groups' ? (columnOptions(d, f, c)[0]?.value ?? '') : emptyCell(c)));
      if (c.path) made = pathSet(made, c.path, v);
      else made[c.key] = v;
    }
    Object.assign(row, made);
    if (r.source === 'q' && r.key === 'blanks' && blank.label === undefined && !row.label) row.label = `Answer ${list.length + 1}`;
    list.push(row);
  }
  return writeList(d, r, list);
}

export function removeRow(d: Project, f: FormField, row: number): boolean {
  const r = f.rows;
  if (!r || r.source === 'fixed' || !canRemove(d, f)) return false;
  const list = currentList(d, r);
  if (row < 0 || row >= list.length) return false;
  list.splice(row, 1);
  return writeList(d, r, list);
}

export function moveRow(d: Project, f: FormField, row: number, by: -1 | 1): boolean {
  const r = f.rows;
  if (!r || r.source === 'fixed' || f.fixed) return false;
  const list = currentList(d, r);
  const to = row + by;
  if (row < 0 || to < 0 || row >= list.length || to >= list.length) return false;
  const [moved] = list.splice(row, 1);
  list.splice(to, 0, moved);
  return writeList(d, r, list);
}

/** What a `choice` column offers: its own options, the project's page names, or the groups of the question a list belongs to. */
export function columnOptions(p: Project, f: FormField, c: FormColumn): FormChoice[] {
  if (c.from === 'pages') return [...p.artboards.filter((a) => !a.isMaster && !p.artboards.some((o) => o.master === a.id)).map((a) => ({ value: a.name, label: a.name })), ...(c.options ?? [])];
  if (c.from === 'groups' && f.rows?.source === 'q') {
    const n = layerOf(p, f.rows.a, f.rows.n);
    const groups = n && n.type === 'frame' && n.question ? (n.question.groups ?? []) : [];
    return groups.map((g) => ({ value: g.id, label: g.name || g.id }));
  }
  return c.options ?? [];
}

// ---------------------------------------------------------------- whole fields and forms

/** The value of a non-list field. */
export const readField = (p: Project, f: FormField): unknown => (f.bind ? getBind(p, f.bind) : undefined);

export function writeField(d: Project, f: FormField, value: unknown): boolean {
  if (!f.bind) return false;
  let v = value;
  if (f.type === 'number') {
    let n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    if (f.min !== undefined) n = Math.max(f.min, n);
    if (f.max !== undefined) n = Math.min(f.max, n);
    v = n;
  }
  return setBind(d, f.bind, v);
}

/** Every binding a field uses. */
export function fieldBinds(f: FormField): FormBind[] {
  const out: FormBind[] = [];
  if (f.bind) out.push(f.bind);
  const r = f.rows;
  if (r?.source === 'var') out.push({ k: 'var', v: r.v }, ...(r.sized ?? []).map((s) => ({ k: 'var' as const, v: s.v })));
  else if (r?.source === 'q') out.push({ k: 'q', a: r.a, n: r.n, path: [r.key] });
  else if (r?.source === 'bind') out.push(r.bind);
  else if (r?.source === 'fixed') for (const row of r.rows) out.push(...Object.values(row.cells));
  return out;
}

/** Problems with a form: ids used twice, bindings that point at nothing, a `pick` column with no lines to pick from, a bound variable that is worked out by a formula. */
export function checkForm(p: Project, form: ContentForm | undefined = p.contentForm): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const f of formFields(form)) {
    if (ids.has(f.id)) out.push(`${f.id}: used twice`);
    ids.add(f.id);
    for (const b of fieldBinds(f)) {
      if (!bindExists(p, b)) out.push(`${f.id}: points at something that is not there (${JSON.stringify(b)})`);
      if (b.k === 'var' && variableOf(p, b.v)?.formula) out.push(`${f.id}: variable ${variableOf(p, b.v)!.name} is worked out by a formula`);
    }
    if (f.type === 'list') {
      if (!f.rows || !f.columns?.length) out.push(`${f.id}: a list needs rows and columns`);
      for (const c of f.columns ?? []) if (c.type === 'pick' && !f.columns!.some((o) => o.key === c.of && o.type === 'lines')) out.push(`${f.id}: pick column ${c.key} has no lines column ${c.of}`);
    } else if (!f.bind) out.push(`${f.id}: no binding`);
  }
  return out;
}

/** Find a field by id. */
export const fieldById = (form: ContentForm | undefined | null, id: string): FormField | undefined => formFields(form).find((f) => f.id === id);

/** The layer a field is about, and its artboard: where "Show" takes the editor. */
export function fieldTarget(p: Project, f: FormField): { artboard: Artboard; id: string } | null {
  const pick = f.show ?? (() => {
    for (const b of fieldBinds(f)) if (b.k === 'layer' || b.k === 'slot' || b.k === 'q') return { a: b.a, n: b.n };
    return null;
  })();
  if (!pick) return null;
  const artboard = p.artboards.find((x) => x.id === pick.a);
  return artboard && locate(artboard, pick.n) ? { artboard, id: pick.n } : null;
}

/** The event the Fill in panel listens for to scroll to a field and put the cursor in it. */
export const FILL_IN_FOCUS = 'ix-fill-in-focus';

/** The form needs more room than the bottom area starts with: make it taller (never shorter) when the form is shown. */
export function roomForForm(): void {
  const s = store();
  const want = Math.min(440, Math.round(window.innerHeight * 0.55));
  if (s.get().bottomHeight < want) s.set({ bottomHeight: want });
}

/** Show the Fill in panel (wherever it is docked), with room to work in. */
export function showFillIn(): void {
  setDock((l) => showPanel(l, 'content'));
  roomForForm();
}

/** Open the Fill in panel at a field, from a checklist item. */
export function openFormField(id: string): void {
  showFillIn();
  window.dispatchEvent(new CustomEvent(FILL_IN_FOCUS, { detail: id }));
}
