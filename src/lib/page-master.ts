// Page masters in the editor: the cached copies the canvas draws, the actions that attach, detach and delete masters, and
// extractMaster, which turns the chrome repeated on a project's pages (logo, accent bar, footer) into masters. The runtime
// side (what a master layer is on a page, text slots, hiding by name) is the player's master.ts.
import { current, isDraft } from 'immer';
import { cloneWithNewIds, masterLayers, masterOf, MASTER_PREFIX, createArtboard, walk, withMaster, type Artboard, type Project, type SceneNode } from 'interactives-player';

// ------------------------------------------------------------------ drawing

interface Cached {
  hide: unknown;
  slots: unknown;
  width: number;
  height: number;
  list: SceneNode[];
}
const cache = new WeakMap<Artboard, Map<string, Cached>>();

/**
 * The player's `withMaster`, with the master's copies kept between draws. The canvas redraws a page on every drag frame and
 * finds what changed by reference, so the copies have to be the same objects until the master (or what the page hides or
 * fills in) changes, or every frame would redraw the whole master.
 */
export function withMasterCached(artboards: Artboard[], page: Artboard, nodes: SceneNode[] = page.children): SceneNode[] {
  const m = masterOf(artboards, page);
  if (!m) return nodes;
  let per = cache.get(m);
  if (!per) cache.set(m, (per = new Map()));
  let c = per.get(page.id);
  if (!c || c.hide !== page.masterHide || c.slots !== page.masterSlots || c.width !== page.width || c.height !== page.height) {
    c = { hide: page.masterHide, slots: page.masterSlots, width: page.width, height: page.height, list: withMaster(artboards, page, []) };
    per.set(page.id, c);
  }
  if (!c.list.length) return nodes;
  const under = c.list.filter((n) => n.id === `${MASTER_PREFIX}under`);
  const over = c.list.filter((n) => n.id === `${MASTER_PREFIX}over`);
  return [...under, ...nodes, ...over];
}

// ------------------------------------------------------------------ actions (recipes for EditorStore.update)

/** Use `masterId` as this page's master (null: none). Not itself, and not a page that has a master of its own. */
export function setMaster(d: Project, pageId: string, masterId: string | null): boolean {
  const page = d.artboards.find((a) => a.id === pageId);
  if (!page) return false;
  //None keeps the page's slot text and hidden names, so a master given back later picks them up again
  if (!masterId) {
    delete page.master;
    return true;
  }
  const m = d.artboards.find((a) => a.id === masterId);
  if (!m || m === page || m.master || d.artboards.some((a) => a.master === pageId)) return false;
  page.master = masterId;
  m.isMaster = true;
  return true;
}

/** Keep this artboard as a master (or not). A master that pages still use stays one. */
export function markMaster(d: Project, id: string, on: boolean): void {
  const ab = d.artboards.find((a) => a.id === id);
  if (!ab) return;
  if (on) {
    // A master has none of its own
    delete ab.master;
    delete ab.masterHide;
    delete ab.masterSlots;
    ab.isMaster = true;
  } else if (!d.artboards.some((a) => a.master === id)) {
    delete ab.isMaster;
    delete ab.masterOver;
  }
}

/** Take the page off its master and put the master's layers in the page as ordinary, editable layers (fresh ids, hidden names left out, slots filled). */
export function detachMaster(d: Project, pageId: string): boolean {
  const page = d.artboards.find((a) => a.id === pageId);
  if (!page || !masterOf(d.artboards, page)) return false;
  const master = masterOf(d.artboards, page)!;
  // immer drafts can't be copied by structuredClone, so the layers are read from the plain document
  const plain = (isDraft(d) ? current(d) : d) as Project;
  const { under, over } = masterLayers(plain.artboards, plain.artboards.find((a) => a.id === pageId)!);
  const original = new Map<string, SceneNode>();
  walk(master.children, (n) => void original.set(MASTER_PREFIX + n.id, n));
  // The player marks its copies decorative and locked to keep them out of the way: here they come back as the master had them
  const place = (list: SceneNode[]) =>
    list.map((copy) => {
      walk([copy], (k) => {
        const was = original.get(k.id);
        if (was?.decorative === undefined) delete k.decorative;
        else k.decorative = was.decorative;
        if (was?.locked === undefined) delete k.locked;
        else k.locked = was.locked;
      });
      return cloneWithNewIds(copy);
    });
  page.children = [...place(under), ...page.children, ...place(over)] as typeof page.children;
  delete page.master;
  delete page.masterHide;
  delete page.masterSlots;
  return true;
}

/** Pages stop pointing at artboards that are going away. Returns how many pages lost their master. */
export function dropMasterRefs(d: Project, gone: Set<string>): number {
  let n = 0;
  for (const a of d.artboards) {
    if (a.master && gone.has(a.master)) {
      delete a.master;
      delete a.masterHide;
      delete a.masterSlots;
      n++;
    }
  }
  return n;
}

// ------------------------------------------------------------------ extractMaster

export interface ExtractOptions {
  /** Name of the master artboard (pages that differ get a numbered one: "Master 2"). Default "Master". */
  name?: string;
  /** Names of the extracted layers that go over the page instead of under it. */
  over?: string[];
  /** Fewest pages that have to share the same layers to be worth a master. Default 2. */
  minPages?: number;
  /** Only look at these pages (ids). Default every artboard that is not a master or a library copy. */
  pages?: string[];
}

export interface ExtractResult {
  masters: Artboard[];
  /** Layers taken off pages. */
  removed: number;
  /** Pages kept as they were: a timeline or an interaction points at one of the layers. */
  kept: { page: string; reason: string }[];
}

/** A layer's content without the ids, so two copies of the same layer on different pages compare equal. */
function signature(n: SceneNode): string {
  return JSON.stringify(n, (k, v) => (k === 'id' ? undefined : v));
}

/**
 * Turn chrome repeated on a project's pages into masters. `layerNames` are the top-level layers to look for (by name). Pages are
 * grouped by the page size and the exact content of those layers (ignoring ids); every group of at least `minPages` pages
 * becomes one master artboard that takes over the layers from the first page of the group, and the other pages lose their copies
 * and name the master. A page whose copy differs (the hero page's bigger logo) is in a group of its own, and a lone page keeps
 * its layers. Layers from the last non-extracted layer on up go over the page; the rest go under. Mutates `project` (a draft is
 * fine). It does not touch pages where a timeline or an interaction mentions one of the layers (reported in `kept`).
 */
export function extractMaster(project: Project, layerNames: string[], opts: ExtractOptions = {}): ExtractResult {
  const names = new Set(layerNames);
  const min = Math.max(2, opts.minPages ?? 2);
  const base = opts.name ?? 'Master';
  const result: ExtractResult = { masters: [], removed: 0, kept: [] };
  const candidates = project.artboards.filter((a) => !a.isMaster && !a.library && !a.master && (!opts.pages || opts.pages.includes(a.id)));
  const groups = new Map<string, Artboard[]>();
  for (const page of candidates) {
    const mine = page.children.filter((n) => names.has(n.name));
    if (!mine.length) continue;
    // A layer a timeline, an interaction or a binding names stays where it is
    const refs = JSON.stringify([page.timelines, page.logic, page.steps ?? null]);
    const bound = mine.find((n) => refs.includes(`"${n.id}"`));
    if (bound) {
      result.kept.push({ page: page.name, reason: `“${bound.name}” is used by a timeline or interaction` });
      continue;
    }
    const key = `${page.width}x${page.height}|${mine.map(signature).join('|')}`;
    const list = groups.get(key) ?? [];
    list.push(page);
    groups.set(key, list);
  }
  let made = 0;
  let right = project.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  for (const pages of groups.values()) {
    if (pages.length < min) continue;
    const src = pages[0];
    const take = src.children.filter((n) => names.has(n.name));
    const lastOther = src.children.reduce((at, n, i) => (names.has(n.name) ? at : i), -1);
    const over = take.filter((n) => src.children.indexOf(n) > lastOther || opts.over?.includes(n.name));
    made++;
    const master = createArtboard({
      name: made === 1 ? base : `${base} ${made}`,
      width: src.width,
      height: src.height,
      canvasX: right + 100,
      canvasY: src.canvasY,
      background: null,
      isMaster: true,
      children: take as Artboard['children'],
    });
    right = master.canvasX + master.width;
    if (over.length) master.masterOver = over.map((n) => n.id);
    result.masters.push(master);
    for (const page of pages) {
      const before = page.children.length;
      page.children = page.children.filter((n) => !names.has(n.name)) as typeof page.children;
      result.removed += before - page.children.length;
      page.master = master.id;
    }
  }
  project.artboards.push(...result.masters);
  return result;
}
