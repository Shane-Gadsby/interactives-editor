/**
 * Templates, the project side.
 *
 * A template is a saved snapshot of a whole project with a title, a description and a checklist of the parts whoever uses it
 * should change (server: `index.js`, the shared pure part: `shared/template.mjs`). A project made from one carries `project.template`:
 * the checklist with what is ticked, the version it was copied from and a hash per artboard, layer, timeline, graph node and
 * variable as the template had them (`base`). This file is what the editor does with that, all as plain functions on a project (a
 * draft inside `store.update`, or any copy in tests):
 *
 * - the checklist: progress, where an item points, whether the layer it is about still holds the template's content, the review.
 * - `planTemplateUpdate` / `applyTemplateUpdate`: pull a newer version of the template into the project for the parts that nobody
 *   has touched (like a library update), and add what is new. Parts the person changed are kept and listed.
 */
import { isContainer, type Artboard, type Asset, type Project, type SceneNode, type TemplateChecklistItem, type TemplateUse } from 'interactives-player';
import { dropMasterRefs } from './page-master';
import { artboardProps, baselineOf, nodeProps, partHash, partsOf } from '../../shared/template.mjs';

/** A template as the server lists it (no snapshot). */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  owner: { username: string | null; name: string | null } | null;
  version: number;
  created: string;
  updated: string;
  mine: boolean;
  /** Visible to everyone, not only its owner. */
  everyone: boolean;
  checklist: { id: string; text: string; artboardId?: string; nodeId?: string }[];
  /** The brand kits the template starts with (a pre-branded template), when it has any. */
  brand?: { id: string; name: string }[];
  artboards: number;
  preview: { width: number; height: number; background: string } | null;
  thumb: number | null;
  /** Only for the owner: the project it was saved from. */
  source?: string | null;
  history: { version: number; created: string; by: string | null; note: string }[];
}

export { baselineOf };

/** Set (to the project id) before opening a project that was just made from a template, so the editor opens its Checklist tab. */
export const CHECKLIST_FLAG = 'ix.checklist.open';

// ---------------------------------------------------------------- the checklist

export const hasChecklist = (p: Project): boolean => !!p.template?.checklist?.length;

export function checklistProgress(p: Project): { done: number; total: number } {
  const list = p.template?.checklist ?? [];
  return { done: list.filter((i) => i.done).length, total: list.length };
}

/** Find a layer anywhere on an artboard (or on any artboard when none is given). */
export function findLayer(p: Project, nodeId: string, artboardId?: string): { artboard: Artboard; node: SceneNode } | null {
  const boards = artboardId ? p.artboards.filter((a) => a.id === artboardId) : p.artboards;
  const look = (list: SceneNode[]): SceneNode | null => {
    for (const n of list) {
      if (n.id === nodeId) return n;
      if (isContainer(n)) {
        const hit = look(n.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const artboard of boards) {
    const node = look(artboard.children);
    if (node) return { artboard, node };
  }
  // The layer may have moved to another artboard
  return artboardId ? findLayer(p, nodeId) : null;
}

export type ItemState = 'general' | 'missing' | 'untouched' | 'changed';

/**
 * What the layer an item points at looks like now: still exactly what the template had (nobody has changed it yet), changed,
 * gone (deleted), or an item that points at nothing in particular.
 */
export function itemState(p: Project, item: TemplateChecklistItem): ItemState {
  if (!item.nodeId) return 'general';
  const hit = findLayer(p, item.nodeId, item.artboardId);
  if (!hit) return 'missing';
  const base = p.template?.base?.['n:' + item.nodeId];
  // A built-in starter or a copy with no baseline can't say: count the layer as changed, so it never nags falsely
  if (!base) return 'changed';
  return partHash(nodeProps(hit.node as unknown as Record<string, unknown>)) === base ? 'untouched' : 'changed';
}

export interface ReviewReport {
  /** Not ticked yet. */
  open: TemplateChecklistItem[];
  /** Ticked, but the layer it is about is still exactly as the template had it. */
  untouched: TemplateChecklistItem[];
  /** Pointing at a layer that is gone. */
  missing: TemplateChecklistItem[];
  /** Ready to call finished: everything ticked, nothing untouched. */
  clean: boolean;
}

/** The review step: what is left before this can be called finished. */
export function reviewReport(p: Project): ReviewReport {
  const list = p.template?.checklist ?? [];
  const open = list.filter((i) => !i.done);
  const untouched = list.filter((i) => i.done && itemState(p, i) === 'untouched');
  const missing = list.filter((i) => itemState(p, i) === 'missing');
  return { open, untouched, missing, clean: !open.length && !untouched.length };
}

export function setItemDone(d: Project, itemId: string, done: boolean): void {
  const item = d.template?.checklist.find((i) => i.id === itemId);
  if (item) item.done = done;
  // Changing anything after the review opens it again
  if (d.template && !done) delete d.template.reviewed;
}

export function markReviewed(d: Project): void {
  if (d.template) d.template.reviewed = new Date().toISOString();
}

/** Drop the template link (the checklist goes, the project is on its own). */
export function detachTemplate(d: Project): void {
  delete d.template;
}

// ---------------------------------------------------------------- update from template

export type PartKind = 'artboard' | 'layer' | 'timeline' | 'graph' | 'edge' | 'variable';

export interface TemplateChange {
  /** Part key: a:<artboard> n:<layer> t:<timeline> g:<graph node> e:<edge> v:<variable>. */
  key: string;
  kind: 'update' | 'add';
  part: PartKind;
  /** What the person sees, e.g. `Layer "Title"`. */
  label: string;
  /** The artboard it belongs to, by name, to group the list. */
  where: string;
}

export interface UpdatePlan {
  /** Things the template changed that nobody touched here, and things it added. */
  changes: TemplateChange[];
  /** Changed in the template and by you: yours are kept. */
  kept: TemplateChange[];
  /** Removed from the template since: yours stay. */
  removed: number;
}

const PART_OF: Record<string, PartKind> = { a: 'artboard', n: 'layer', t: 'timeline', g: 'graph', e: 'edge', v: 'variable' };

interface Located {
  key: string;
  kind: PartKind;
  value: any;
  hash: string;
  artboard: string | null;
  artboardName: string;
  /** Layers: the parent layer's id (null on the artboard itself) and the layer's place among its siblings. */
  parent?: string | null;
}

/** Every part of a project with its hash, where it sits, and (for layers) what its parent is. */
function locate(p: Project): Map<string, Located> {
  const out = new Map<string, Located>();
  for (const [key, value] of partsOf(p)) out.set(key, { key, kind: PART_OF[key[0]], value, hash: partHash(value), artboard: null, artboardName: '' });
  for (const ab of p.artboards) {
    const set = (key: string, extra: Partial<Located> = {}) => {
      const have = out.get(key);
      if (have) Object.assign(have, { artboard: ab.id, artboardName: ab.name }, extra);
    };
    set('a:' + ab.id);
    const walk = (list: SceneNode[], parent: string | null) => {
      for (const n of list) {
        set('n:' + n.id, { parent });
        if (isContainer(n)) walk(n.children, n.id);
      }
    };
    walk(ab.children, null);
    for (const t of ab.timelines) set('t:' + t.id);
    for (const g of ab.logic.nodes) set('g:' + g.id);
    for (const e of ab.logic.edges) set('e:' + e.id);
  }
  return out;
}

const nameOf = (l: Located): string => {
  const v = l.value ?? {};
  const label = typeof v.name === 'string' && v.name ? v.name : typeof v.kind === 'string' ? v.kind : l.key.slice(2);
  switch (l.kind) {
    case 'artboard':
      return `Artboard "${label}"`;
    case 'layer':
      return `Layer "${label}"`;
    case 'timeline':
      return `Timeline "${label}"`;
    case 'graph':
      return `Interaction node "${label}"`;
    case 'edge':
      return 'A connection between interaction nodes';
    default:
      return `Variable "${label}"`;
  }
};

/**
 * What a newer version of the template would change here. A part is offered when the template changed it and this project's copy
 * still matches what the template had (so nobody here touched it), or when the template added it since this project was made.
 * A part the template changed and this project changed too is left alone and listed under `kept`.
 */
export function planTemplateUpdate(project: Project, snapshot: Project): UpdatePlan {
  const base = project.template?.base ?? {};
  const mine = locate(project);
  const theirs = locate(snapshot);
  const changes: TemplateChange[] = [];
  const kept: TemplateChange[] = [];
  const added = new Set<string>();
  for (const [key, t] of theirs) {
    const m = mine.get(key);
    const make = (kind: 'update' | 'add'): TemplateChange => ({ key, kind, part: t.kind, label: nameOf(t), where: t.artboardName });
    if (!m) {
      // Not in the baseline: the template added it since. In the baseline but gone here: this person deleted it, so it stays deleted
      if (base[key] === undefined) {
        changes.push(make('add'));
        added.add(key);
      }
      continue;
    }
    if (t.hash === m.hash) continue;
    if (base[key] === undefined) continue; // no baseline for it: can't tell, so it is left as it is
    if (m.hash === base[key]) changes.push(make('update'));
    else if (t.hash !== base[key]) kept.push(make('update'));
  }
  // A part inside something new comes with it, it is not a change of its own
  const inside = (c: TemplateChange): boolean => {
    const t = theirs.get(c.key)!;
    if (t.kind === 'artboard') return false;
    if (t.artboard && added.has('a:' + t.artboard)) return true;
    return t.kind === 'layer' && !!t.parent && added.has('n:' + t.parent);
  };
  const top = changes.filter((c) => c.kind !== 'add' || !inside(c));
  let removed = 0;
  for (const key of Object.keys(base)) if (!theirs.has(key) && mine.get(key)?.hash === base[key]) removed++;
  return { changes: top, kept, removed };
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Layers and graph nodes by id on one artboard, with the list each sits in. */
function listOf(ab: Artboard, id: string): SceneNode[] | null {
  const look = (list: SceneNode[]): SceneNode[] | null => {
    for (const n of list) {
      if (n.id === id) return list;
      if (isContainer(n)) {
        const hit = look(n.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return look(ab.children);
}

/** The ids of every layer on an artboard. */
function layerIds(ab: Artboard): Set<string> {
  const ids = new Set<string>();
  const walk = (list: SceneNode[]) => {
    for (const n of list) {
      ids.add(n.id);
      if (isContainer(n)) walk(n.children);
    }
  };
  walk(ab.children);
  return ids;
}

/**
 * Apply the chosen changes (their part keys) to a project draft: updated parts take the template's version, new parts are added
 * where they sit in the template, and the baseline is refreshed for everything taken (and for everything that already matches).
 * Layers, timelines, graph nodes and edges are matched by id. Returns the asset records the project did not have and now needs
 * the bytes of (the caller fetches them from the template).
 */
export function applyTemplateUpdate(d: Project, snapshot: Project, keys: string[], info: { version: number; checklist?: TemplateInfo['checklist'] }): Asset[] {
  const use = d.template;
  if (!use) return [];
  const base = (use.base ??= {});
  const want = new Set(keys);
  const theirs = locate(snapshot);
  const taken: any[] = [];

  // Artboards first: a new one brings everything inside it
  const newBoards = new Set<string>();
  for (const ab of snapshot.artboards) {
    if (!want.has('a:' + ab.id)) continue;
    const mine = d.artboards.find((a) => a.id === ab.id);
    if (!mine) {
      d.artboards.push(copy(ab));
      newBoards.add(ab.id);
      taken.push(ab);
    } else {
      const next = copy(artboardProps(ab as unknown as Record<string, unknown>)) as Record<string, unknown>;
      for (const k of Object.keys(mine)) if (!['children', 'timelines', 'logic', 'canvasX', 'canvasY', 'canvasHidden', 'guides', 'grid', 'source', 'notes'].includes(k) && !(k in next)) delete (mine as unknown as Record<string, unknown>)[k];
      Object.assign(mine, next);
      taken.push(next);
    }
  }

  for (const ab of snapshot.artboards) {
    const mine = d.artboards.find((a) => a.id === ab.id);
    if (!mine || newBoards.has(ab.id)) continue;

    // Layers: updates in place, then additions in the order the template has them
    const walkUpdate = (list: SceneNode[]) => {
      for (const t of list) {
        if (want.has('n:' + t.id)) {
          const own = listOf(mine, t.id);
          const at = own?.find((n) => n.id === t.id);
          if (at) {
            const next = copy(nodeProps(t as unknown as Record<string, unknown>)) as Record<string, unknown>;
            const kids = (at as { children?: SceneNode[] }).children;
            for (const k of Object.keys(at)) if (k !== 'children') delete (at as unknown as Record<string, unknown>)[k];
            Object.assign(at, next);
            if (kids) (at as { children?: SceneNode[] }).children = kids;
            taken.push(next);
          }
        }
        if (isContainer(t)) walkUpdate(t.children);
      }
    };
    walkUpdate(ab.children);

    const walkAdd = (list: SceneNode[], parent: SceneNode | null) => {
      list.forEach((t, i) => {
        if (want.has('n:' + t.id) && !layerIds(mine).has(t.id)) {
          const home = parent ? listOf(mine, parent.id)?.find((n) => n.id === parent.id) : null;
          const target = parent ? (home && isContainer(home) ? home.children : null) : mine.children;
          if (target) {
            const node = copy(t);
            // After the previous sibling the project has, else before the next one it has, else at the end
            const before = list.slice(0, i).reverse().find((s) => target.some((n) => n.id === s.id));
            const after = list.slice(i + 1).find((s) => target.some((n) => n.id === s.id));
            const at = before ? target.findIndex((n) => n.id === before.id) + 1 : after ? target.findIndex((n) => n.id === after.id) : target.length;
            target.splice(at, 0, node);
            taken.push(node);
          }
        }
        if (isContainer(t)) walkAdd(t.children, t);
      });
    };
    walkAdd(ab.children, null);

    const have = layerIds(mine);

    for (const t of ab.timelines) {
      if (!want.has('t:' + t.id)) continue;
      // A track on a layer that isn't here (deleted by the person) would point at nothing
      const next = copy(t);
      next.tracks = next.tracks.filter((tr) => have.has(tr.nodeId));
      const i = mine.timelines.findIndex((x) => x.id === t.id);
      if (i >= 0) mine.timelines[i] = next;
      else mine.timelines.push(next);
      taken.push(next);
    }
    for (const g of ab.logic.nodes) {
      if (!want.has('g:' + g.id)) continue;
      const next = copy(g);
      const i = mine.logic.nodes.findIndex((x) => x.id === g.id);
      if (i >= 0) mine.logic.nodes[i] = { ...next, x: mine.logic.nodes[i].x, y: mine.logic.nodes[i].y };
      else mine.logic.nodes.push(next);
      taken.push(next);
    }
    for (const e of ab.logic.edges) {
      if (!want.has('e:' + e.id)) continue;
      if (!mine.logic.nodes.some((n) => n.id === e.from) || !mine.logic.nodes.some((n) => n.id === e.to)) continue;
      const next = copy(e);
      const i = mine.logic.edges.findIndex((x) => x.id === e.id);
      if (i >= 0) mine.logic.edges[i] = next;
      else mine.logic.edges.push(next);
      taken.push(next);
    }
  }

  for (const v of snapshot.variables) {
    if (!want.has('v:' + v.id)) continue;
    const next = copy(v);
    const i = d.variables.findIndex((x) => x.id === v.id);
    if (i >= 0) d.variables[i] = next;
    else d.variables.push(next);
    taken.push(next);
  }

  // A page whose master was not taken (or is gone) stands on its own
  dropMasterRefs(d, new Set(d.artboards.map((a) => a.master).filter((m): m is string => !!m && !d.artboards.some((a) => a.id === m))));

  // Everything that now matches the template (taken just now, or already) has the template's hash as its baseline
  const now = locate(d);
  for (const [key, m] of now) {
    const t = theirs.get(key);
    if (t && t.hash === m.hash) base[key] = t.hash;
  }

  // What the new parts need: fonts and assets the project did not have
  const text = JSON.stringify(taken);
  for (const f of snapshot.fonts) if (text.includes(JSON.stringify(f.family)) && !d.fonts.some((x) => x.family === f.family)) d.fonts.push(copy(f));
  const needs: Asset[] = [];
  for (const a of snapshot.assets) {
    if (text.includes(`"${a.id}"`) && !d.assets.some((x) => x.id === a.id)) {
      const rec = copy(a);
      d.assets.push(rec);
      needs.push(rec);
    }
  }

  // New checklist items the author added since (existing ones keep their ticks)
  for (const item of info.checklist ?? []) if (!use.checklist.some((i) => i.id === item.id)) use.checklist.push({ ...item, done: false });
  use.version = info.version;
  delete use.reviewed;
  return needs;
}

/** True when the project was made from a saved template that has moved on to a newer version. */
export const updateAvailable = (use: TemplateUse | undefined, latest: number | null | undefined): boolean => !!use?.id && !!latest && latest > use.version;
