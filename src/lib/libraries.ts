/**
 * Component libraries, the project side.
 *
 * A library is another project (marked `settings.library`) that publishes some of its artboards as components,
 * plus its named colour and text styles and the assets they need (the server side is `index.js`, the shared snapshot
 * code is `shared/library.mjs`). This file is what a project does with one, all as plain functions on a project (a
 * draft inside `store.update`, or any copy in tests):
 *
 * - `applyComponents` copies components into the project as linked, read-only artboards (`Artboard.library`), with
 *   whatever they need: variables, fonts, data sources, asset records. The copies keep the library's layer ids, so
 *   an update can replace one in place and everything that points at it (instances, inputs) stays pointed.
 * - `libraryUpdates` says what is newer in the library, `describeChange` says what changed in a component.
 * - `updateComponents` brings copies up to a new version. Instances placed in your own artboards, their inputs and
 *   your variables are not part of the copy, so they are kept as they are.
 * - `detachArtboard` makes a copy an ordinary editable artboard (not a brand kit's, see `brand.ts`, unless overridden).
 * - styles: `syncLibraryStyles` keeps the library's styles in the project, and `syncNodeStyles` re-applies styles to
 *   the layers that follow them.
 */
import {
  createNode,
  createProject,
  isContainer,
  uid,
  type Artboard,
  type ColorStyle,
  type InstanceNode,
  type Project,
  type SceneNode,
  type StyleRefs,
  type TextStyleDef,
} from 'interactives-player';
import { closureOf, hashArtboard, hashOf, type LibrarySnapshot, type SnapshotComponent } from '../../shared/library.mjs';
import { analyzeUsage } from './dependencies';
import { brandCopyViolated, kitPalette } from './brand';

export type { LibrarySnapshot, SnapshotComponent };

/** A library as the server lists it (no snapshot). */
export interface LibraryInfo {
  id: string;
  name: string;
  owner: { username: string | null; name: string | null } | null;
  version: number;
  updated: string;
  note: string;
  mine: boolean;
  /** Only for the owner. */
  shared?: { everyone: boolean; users: string[] };
  components: SnapshotComponent[];
  internals: { id: string; name: string; hash: string }[];
  styles: { colors: ColorStyle[]; texts: TextStyleDef[] };
  /** Published as a brand kit: what projects take from it is locked (`brand.ts`). */
  brand?: boolean;
  history: { version: number; created: string; by: string | null; note: string }[];
}

/** What a full fetch of a library gives: the snapshot also says which version it is. */
export type LibraryContent = LibrarySnapshot & { version: number; brand?: boolean };

// ---------------------------------------------------------------- reading what is linked

export const isLocked = (ab: Artboard | undefined | null): boolean => !!ab?.library;

/** The artboards of a project that came from one library. */
export function linkedArtboards(project: Project, libraryId?: string): Artboard[] {
  return project.artboards.filter((a) => a.library && (!libraryId || a.library.libraryId === libraryId));
}

/** The local copy of a library component, if the project has one. */
export function localCopy(project: Project, libraryId: string, componentId: string): Artboard | undefined {
  return project.artboards.find((a) => a.library?.libraryId === libraryId && a.library.componentId === componentId);
}

/** Library artboard id -> this project's id for the copy, for one library. */
function idMapOf(project: Project, libraryId: string): Map<string, string> {
  return new Map(linkedArtboards(project, libraryId).map((a) => [a.library!.componentId, a.id]));
}

/**
 * The first edit that touches a library artboard, or null. Position, name and guides are yours to change; the rest of a
 * copy comes from the library. Immer shares everything that did not change, so comparing the parts by reference is enough.
 * A brand kit's copies are stricter (they can't be deleted either, and only text the kit marked editable may change, see
 * `brandCopyViolated`) and are the only ones `override` lets through.
 */
export function lockViolation(before: Project, after: Project, override = false): Artboard | null {
  for (const a of before.artboards) {
    if (!a.library) continue;
    const b = after.artboards.find((x) => x.id === a.id);
    if (a.library.brand) {
      if (!override && brandCopyViolated(a, b)) return a;
      continue;
    }
    if (!b || b === a) continue;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (k === 'canvasX' || k === 'canvasY' || k === 'canvasHidden' || k === 'name' || k === 'guides') continue;
      if ((a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return a;
    }
  }
  return null;
}

// ---------------------------------------------------------------- ids inside a copy

/** Replace string values that equal a key of `map` (artboard ids, in places like instance layers and graph params). */
function remapStrings(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapStrings(v, map));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapStrings(v, map);
    return out;
  }
  return value;
}

function walkNodes(list: SceneNode[], fn: (n: SceneNode) => void): void {
  for (const n of list) {
    fn(n);
    if (isContainer(n)) walkNodes(n.children, fn);
  }
}

// ---------------------------------------------------------------- what a component brings with it

/** Variables, fonts, data sources and assets the given library artboards use, so the copy works on its own. */
function neededBy(snap: LibrarySnapshot, ids: string[]) {
  const artboards = snap.artboards.filter((a) => ids.includes(a.id));
  const synth: Project = {
    ...createProject('library'),
    artboards,
    variables: snap.variables,
    dataSources: snap.dataSources,
    assets: snap.assets,
    fonts: snap.fonts,
    scripts: [],
  };
  const report = analyzeUsage(synth);
  const usedVars = new Set(report.variables.filter((v) => v.usedBy.length).map((v) => v.id));
  const usedData = new Set(report.dataSources.filter((v) => v.usedBy.length).map((v) => v.id));
  const text = JSON.stringify(artboards);
  const variables = snap.variables.filter((v) => usedVars.has(v.id));
  const dataSources = snap.dataSources.filter((d) => usedData.has(d.id));
  const fonts = snap.fonts.filter((f) => text.includes(JSON.stringify(f.family)));
  const assetText = JSON.stringify([artboards, fonts, dataSources]);
  const assets = snap.assets.filter((a) => assetText.includes(`"${a.id}"`));
  return { variables, dataSources, fonts, assets };
}

/** Asset ids a set of components needs that the project does not have yet (to download before applying). */
export function missingAssets(project: Project, snap: LibrarySnapshot, componentIds: string[]): string[] {
  const ids = unionClosure(snap, componentIds);
  const have = new Set(project.assets.map((a) => a.id));
  return neededBy(snap, ids)
    .assets.map((a) => a.id)
    .filter((id) => !have.has(id));
}

function unionClosure(snap: LibrarySnapshot, componentIds: string[]): string[] {
  const out: string[] = [];
  for (const c of componentIds) for (const id of closureOf(snap.artboards, c)) if (!out.includes(id)) out.push(id);
  return out;
}

// ---------------------------------------------------------------- insert / update

export interface ApplyResult {
  /** Library component id -> the artboard id here. */
  ids: Record<string, string>;
  /** Artboards that were added (not just replaced). */
  added: string[];
}

/**
 * Put components into the project as linked artboards, or bring existing copies to this snapshot. A component's
 * own nested artboards come along as internal copies. Existing copies keep their id, position and everything pointing
 * at them. Nothing else in the project is touched, except that variables, fonts, data sources and assets the copies
 * need are added when missing (by name; yours win).
 */
export function applyComponents(draft: Project, libraryId: string, snap: LibraryContent, componentIds: string[]): ApplyResult {
  const ids = unionClosure(snap, componentIds);
  const idMap = idMapOf(draft, libraryId);
  for (const id of ids) if (!idMap.has(id)) idMap.set(id, uid('ab'));
  const styleMap = styleIdMap(draft, libraryId);
  const componentById = new Map(snap.components.map((c) => [c.id, c]));
  const internalById = new Map(snap.internals.map((c) => [c.id, c]));
  const result: ApplyResult = { ids: {}, added: [] };
  const use = draft.libraries?.find((l) => l.id === libraryId);
  const brand = snap.brand === undefined ? !!use?.brand : snap.brand;
  let right = draft.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);

  for (const id of ids) {
    const src = snap.artboards.find((a) => a.id === id);
    if (!src) continue;
    const copy = remapStrings(JSON.parse(JSON.stringify(src)), idMap) as Artboard;
    walkNodes(copy.children, (n) => {
      if (!n.styleRefs) return;
      const refs: StyleRefs = {};
      for (const part of ['fill', 'stroke', 'color', 'text'] as const) {
        const local = n.styleRefs[part] ? styleMap.get(n.styleRefs[part]!) : undefined;
        if (local) refs[part] = local;
      }
      if (Object.keys(refs).length) n.styleRefs = refs;
      else delete n.styleRefs;
    });
    const comp = componentById.get(id);
    const hash = comp?.hash ?? internalById.get(id)?.hash ?? hashArtboard(src);
    copy.library = { libraryId, componentId: id, version: snap.version, hash, ...(comp ? {} : { internal: true }), ...(brand ? { brand: true } : {}) };
    const localId = idMap.get(id)!;
    const at = draft.artboards.findIndex((a) => a.id === localId);
    if (at >= 0) {
      const old = draft.artboards[at];
      // Where it sits on the canvas, and what you called it, stay yours until the library renames it
      copy.canvasX = old.canvasX;
      copy.canvasY = old.canvasY;
      if (old.canvasHidden) copy.canvasHidden = true;
      if (brand) keepEditableText(old, copy);
      draft.artboards[at] = copy;
    } else {
      copy.canvasX = right + 100;
      copy.canvasY = 0;
      right = copy.canvasX + copy.width;
      draft.artboards.push(copy);
      result.added.push(localId);
    }
    if (comp) result.ids[id] = localId;
  }

  const need = neededBy(snap, ids);
  for (const v of need.variables) if (!draft.variables.some((x) => x.name === v.name)) draft.variables.push(JSON.parse(JSON.stringify(v)));
  for (const d of need.dataSources) if (!draft.dataSources.some((x) => x.name === d.name)) draft.dataSources.push(JSON.parse(JSON.stringify(d)));
  for (const f of need.fonts) if (!draft.fonts.some((x) => x.family === f.family && x.source === f.source)) draft.fonts.push(JSON.parse(JSON.stringify(f)));
  for (const a of need.assets) if (!draft.assets.some((x) => x.id === a.id)) draft.assets.push(JSON.parse(JSON.stringify(a)));
  return result;
}

/** A brand kit's text the kit marked editable keeps what the project wrote when the copy is replaced by a newer version. */
function keepEditableText(old: Artboard, copy: Artboard): void {
  const was = new Map<string, SceneNode>();
  walkNodes(old.children, (n) => void was.set(n.id, n));
  walkNodes(copy.children, (n) => {
    const prev = was.get(n.id);
    if (n.type !== 'text' || !n.brandEditable || prev?.type !== 'text') return;
    n.text = prev.text;
    if (prev.runs) n.runs = JSON.parse(JSON.stringify(prev.runs));
    else delete n.runs;
  });
}

/** Records the library in the project (the Libraries panel lists these) and takes its styles. A brand kit also leaves its palette for the off-brand check. */
export function addLibrary(draft: Project, info: Pick<LibraryInfo, 'id' | 'name' | 'brand'>, snap: LibraryContent): void {
  draft.libraries ??= [];
  let use = draft.libraries.find((l) => l.id === info.id);
  if (use) {
    use.name = info.name;
    use.version = snap.version;
  } else draft.libraries.push((use = { id: info.id, name: info.name, version: snap.version }));
  setBrand(draft, info.id, info.brand ?? snap.brand ?? !!use.brand, snap);
  syncLibraryStyles(draft, info.id, snap.styles);
}

/** Brings the project's idea of whether a library is a brand kit (and its copies' locks) in line with the server's. */
export function setBrand(draft: Project, libraryId: string, brand: boolean, snap: Pick<LibrarySnapshot, 'styles' | 'fonts'>): void {
  const use = draft.libraries?.find((l) => l.id === libraryId);
  if (use) {
    if (brand) use.brand = kitPalette(snap);
    else delete use.brand;
  }
  for (const a of draft.artboards) {
    if (a.library?.libraryId !== libraryId) continue;
    if (brand) a.library.brand = true;
    else delete a.library.brand;
  }
}

/**
 * Bring the named copies up to the snapshot: the components and anything they use. Internal copies nothing uses any
 * more are removed. Returns the ids updated. Components the library no longer has are left alone (detach or delete them).
 */
export function updateComponents(draft: Project, libraryId: string, snap: LibraryContent, componentIds: string[]): string[] {
  const have = componentIds.filter((c) => snap.components.some((x) => x.id === c) && localCopy(draft, libraryId, c));
  if (have.length) applyComponents(draft, libraryId, snap, have);
  pruneInternals(draft);
  return have;
}

/** Update every copy that has changed, then take the library's styles and version. */
export function updateAll(draft: Project, info: Pick<LibraryInfo, 'id' | 'name' | 'brand'>, snap: LibraryContent): string[] {
  const changed = changedComponents(draft, info.id, snap.components).map((c) => c.componentId);
  // styles first: the copies point at this project's ids for them
  addLibrary(draft, info, snap);
  return updateComponents(draft, info.id, snap, changed);
}

/** Remove internal library copies that no artboard places any more (repeats, since they can use each other). */
export function pruneInternals(draft: Project): void {
  for (;;) {
    const used = new Set<string>();
    for (const a of draft.artboards) walkNodes(a.children, (n) => void (n.type === 'instance' && used.add((n as InstanceNode).artboardId)));
    const dead = draft.artboards.filter((a) => a.library?.internal && !used.has(a.id));
    if (!dead.length) return;
    draft.artboards = draft.artboards.filter((a) => !dead.includes(a));
    if (draft.settings.startArtboardId && !draft.artboards.some((a) => a.id === draft.settings.startArtboardId)) draft.settings.startArtboardId = draft.artboards[0]?.id ?? null;
  }
}

/** Make a copy an ordinary artboard: no link, editable. Whatever it places as instances stays as it is. A brand kit's copy only with `override`. */
export function detachArtboard(draft: Project, artboardId: string, override = false): boolean {
  const ab = draft.artboards.find((a) => a.id === artboardId);
  if (!ab?.library) return false;
  if (ab.library.brand && !override) return false;
  delete ab.library;
  delete ab.canvasHidden;
  return true;
}

/** Stop using a library: its copies become ordinary artboards, its styles become your own. A brand kit only with `override`. */
export function removeLibrary(draft: Project, libraryId: string, override = false): boolean {
  if (!override && isBrandKit(draft, libraryId)) return false;
  for (const a of draft.artboards) {
    if (a.library?.libraryId !== libraryId) continue;
    delete a.library;
    delete a.canvasHidden;
  }
  for (const s of [...(draft.styles?.colors ?? []), ...(draft.styles?.texts ?? [])]) if (s.library?.libraryId === libraryId) delete s.library;
  draft.libraries = (draft.libraries ?? []).filter((l) => l.id !== libraryId);
  return true;
}

/** Is this library a brand kit as far as the project knows (its use says so, or one of its copies carries the lock)? */
export const isBrandKit = (p: Project, libraryId: string): boolean => !!p.libraries?.find((l) => l.id === libraryId)?.brand || p.artboards.some((a) => a.library?.libraryId === libraryId && a.library.brand);

/** A new instance layer of a (local) artboard, centred in the host artboard or at a point. */
export function makeInstance(project: Project, hostId: string, artboardId: string, at?: { x: number; y: number }): InstanceNode | null {
  const host = project.artboards.find((a) => a.id === hostId);
  const target = project.artboards.find((a) => a.id === artboardId);
  if (!host || !target) return null;
  return createNode('instance', {
    name: target.name,
    artboardId,
    width: target.width,
    height: target.height,
    x: Math.round(at ? at.x - target.width / 2 : (host.width - target.width) / 2),
    y: Math.round(at ? at.y - target.height / 2 : (host.height - target.height) / 2),
  }) as InstanceNode;
}

/**
 * Put a brand kit in the project the way a pre-branded template starts: the kit added, and every component the kit marked with a
 * place (`Artboard.brandPlace`: header, footer, logo...) placed in the first artboard of your own. The copies stay off the
 * canvas (the instances draw them). Returns the ids of the instances placed. A kit with nothing marked is only added.
 */
export function startFromBrandKit(draft: Project, info: Pick<LibraryInfo, 'id' | 'name' | 'brand'>, snap: LibraryContent, hostId?: string): string[] {
  addLibrary(draft, info, snap);
  const wanted = snap.components.filter((c) => snap.artboards.find((a) => a.id === c.id)?.brandPlace);
  const host = draft.artboards.find((a) => (hostId ? a.id === hostId : !a.library));
  if (!wanted.length || !host || host.library) return [];
  const applied = applyComponents(draft, info.id, snap, wanted.map((c) => c.id));
  for (const id of applied.added) {
    const ab = draft.artboards.find((a) => a.id === id);
    if (ab) ab.canvasHidden = true;
  }
  const placed: string[] = [];
  for (const c of wanted) {
    const localId = applied.ids[c.id];
    const node = localId ? makeInstance(draft, host.id, localId) : null;
    if (!node) continue;
    // Native size, or shrunk (keeping its proportions) to fit the artboard it goes on
    const fit = Math.min(1, host.width / node.width, host.height / node.height);
    node.width = Math.round(node.width * fit * 100) / 100;
    node.height = Math.round(node.height * fit * 100) / 100;
    const where = snap.artboards.find((a) => a.id === c.id)!.brandPlace!;
    const right = host.width - node.width;
    const bottom = host.height - node.height;
    const centre = Math.round(right / 2);
    const at: Record<string, [number, number]> = {
      top: [centre, 0],
      bottom: [centre, bottom],
      'top-left': [0, 0],
      'top-right': [right, 0],
      'bottom-left': [0, bottom],
      'bottom-right': [right, bottom],
      center: [centre, Math.round(bottom / 2)],
    };
    [node.x, node.y] = at[where] ?? at.center;
    host.children.push(node);
    placed.push(node.id);
  }
  return placed;
}

// ---------------------------------------------------------------- what is newer

export interface ComponentUpdate {
  componentId: string;
  /** The artboard here. */
  localId: string;
  name: string;
  /** `changed`: newer content; `removed`: the library no longer has it. */
  status: 'changed' | 'removed';
  fromVersion: number;
}

/** Copies (components only, not internal ones) whose content differs from the library's now. */
export function changedComponents(project: Project, libraryId: string, components: SnapshotComponent[]): ComponentUpdate[] {
  const out: ComponentUpdate[] = [];
  for (const a of linkedArtboards(project, libraryId)) {
    const link = a.library!;
    if (link.internal) continue;
    const now = components.find((c) => c.id === link.componentId);
    if (!now) out.push({ componentId: link.componentId, localId: a.id, name: a.name, status: 'removed', fromVersion: link.version });
    else if (now.hash !== link.hash) out.push({ componentId: link.componentId, localId: a.id, name: now.name, status: 'changed', fromVersion: link.version });
  }
  return out;
}

/** The local artboard as the library has it: this project's artboard ids put back to the library's. */
function asInLibrary(project: Project, libraryId: string, ab: Artboard): Artboard {
  const back = new Map([...idMapOf(project, libraryId)].map(([lib, local]) => [local, lib]));
  const styleBack = new Map([...styleIdMap(project, libraryId)].map(([lib, local]) => [local, lib]));
  const out = remapStrings(JSON.parse(JSON.stringify(ab)), back) as Artboard;
  walkNodes(out.children, (n) => {
    if (!n.styleRefs) return;
    for (const part of ['fill', 'stroke', 'color', 'text'] as const) if (n.styleRefs[part]) n.styleRefs[part] = styleBack.get(n.styleRefs[part]!) ?? n.styleRefs[part];
  });
  return out;
}

const LOCAL = ['canvasX', 'canvasY', 'canvasHidden', 'guides', 'publish', 'library', 'source', 'id', 'name'];
const without = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => !LOCAL.includes(k)));

function flatNodes(ab: Artboard): Map<string, { n: SceneNode; path: string }> {
  const out = new Map<string, { n: SceneNode; path: string }>();
  const go = (list: SceneNode[], path: string) => {
    for (const n of list) {
      out.set(n.id, { n, path: path ? `${path} / ${n.name}` : n.name });
      if (isContainer(n)) go(n.children, path ? `${path} / ${n.name}` : n.name);
    }
  };
  go(ab.children, '');
  return out;
}

/** A layer's own settings, without its children. */
const own = (n: SceneNode) => hashOf({ ...n, children: undefined });

const list = (names: string[], max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What changed between the copy you have and the library's newer artboard, in plain words (empty: nothing visible). */
export function describeChange(project: Project, libraryId: string, localId: string, next: Artboard): string[] {
  const local = project.artboards.find((a) => a.id === localId);
  if (!local) return [];
  const old = asInLibrary(project, libraryId, local);
  const out: string[] = [];
  if (old.width !== next.width || old.height !== next.height) out.push(`Size ${old.width} × ${old.height} to ${next.width} × ${next.height}`);
  if (hashOf(old.background) !== hashOf(next.background)) out.push('Background changed');
  const a = flatNodes(old);
  const b = flatNodes(next);
  const added = [...b.values()].filter((x) => !a.has(x.n.id)).map((x) => x.n.name);
  const removed = [...a.values()].filter((x) => !b.has(x.n.id)).map((x) => x.n.name);
  const changed = [...b.values()].filter((x) => a.has(x.n.id) && own(a.get(x.n.id)!.n) !== own(x.n)).map((x) => x.n.name);
  if (added.length) out.push(`${plural(added.length, 'layer')} added: ${list(added)}`);
  if (removed.length) out.push(`${plural(removed.length, 'layer')} removed: ${list(removed)}`);
  if (changed.length) out.push(`${plural(changed.length, 'layer')} changed: ${list(changed)}`);
  if (!added.length && !removed.length) {
    const order = (m: Map<string, unknown>) => [...m.keys()].join('|');
    if (order(a) !== order(b)) out.push('Layer order changed');
  }
  const tlNames = (ab: Artboard) => ab.timelines.map((t) => t.name);
  const tlAdded = tlNames(next).filter((n) => !tlNames(old).includes(n));
  const tlRemoved = tlNames(old).filter((n) => !tlNames(next).includes(n));
  if (tlAdded.length) out.push(`${plural(tlAdded.length, 'timeline')} added: ${list(tlAdded)}`);
  if (tlRemoved.length) out.push(`${plural(tlRemoved.length, 'timeline')} removed: ${list(tlRemoved)}`);
  if (!tlAdded.length && !tlRemoved.length && hashOf(old.timelines) !== hashOf(next.timelines)) out.push('Timelines changed');
  if (hashOf(old.logic) !== hashOf(next.logic)) out.push('Interactions changed');
  if (!out.length && hashOf(without(old)) !== hashOf(without(next))) out.push('Other settings changed');
  return out;
}

/** What differs between the styles a project has from a library and the library's now (names). */
export function describeStyleChanges(project: Project, libraryId: string, styles: LibraryInfo['styles']): string[] {
  const out: string[] = [];
  const colors = (project.styles?.colors ?? []).filter((s) => s.library?.libraryId === libraryId);
  const texts = (project.styles?.texts ?? []).filter((s) => s.library?.libraryId === libraryId);
  for (const c of styles.colors) {
    const had = colors.find((x) => x.library!.styleId === c.id);
    if (!had) out.push(`New colour “${c.name}”`);
    else if (had.color !== c.color || had.name !== c.name) out.push(`Colour “${c.name}” changed`);
  }
  for (const c of colors) if (!styles.colors.some((x) => x.id === c.library!.styleId)) out.push(`Colour “${c.name}” removed`);
  for (const t of styles.texts) {
    const had = texts.find((x) => x.library!.styleId === t.id);
    if (!had) out.push(`New text style “${t.name}”`);
    else if (hashOf({ ...had, id: '', library: 0 }) !== hashOf({ ...t, id: '', library: 0 })) out.push(`Text style “${t.name}” changed`);
  }
  for (const t of texts) if (!styles.texts.some((x) => x.id === t.library!.styleId)) out.push(`Text style “${t.name}” removed`);
  return out;
}

// ---------------------------------------------------------------- styles

/** Library style id -> the style's id in this project. */
function styleIdMap(project: Project, libraryId: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of [...(project.styles?.colors ?? []), ...(project.styles?.texts ?? [])]) if (s.library?.libraryId === libraryId) m.set(s.library.styleId, s.id);
  return m;
}

/** Keep the library's styles in the project: new ones added, changed ones updated, removed ones dropped. Then restyle the layers that follow them. */
export function syncLibraryStyles(draft: Project, libraryId: string, styles: { colors: ColorStyle[]; texts: TextStyleDef[] }): void {
  draft.styles ??= { colors: [], texts: [] };
  const mine = draft.styles;
  const merge = <T extends ColorStyle | TextStyleDef>(have: T[], from: T[]): T[] => {
    const out: T[] = [];
    for (const s of have) if (!s.library || s.library.libraryId !== libraryId) out.push(s);
    for (const s of from) {
      const was = have.find((x) => x.library?.libraryId === libraryId && x.library.styleId === s.id);
      // (a style converted to a token stays one when the library updates)
      const copy = { ...JSON.parse(JSON.stringify(s)), id: was?.id ?? uid('st'), library: { libraryId, styleId: s.id } };
      // The library's own token ids mean nothing here; the link is the one this project made
      delete copy.token;
      const mine = (was as ColorStyle | undefined)?.token;
      out.push(mine ? { ...copy, token: mine } : copy);
    }
    return out;
  };
  mine.colors = merge(mine.colors, styles.colors);
  mine.texts = merge(mine.texts, styles.texts);
  syncNodeStyles(draft);
}

const TEXT_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing'] as const;

/** The colour a layer holds while it follows a style: the style's token when it became one, else its colour. */
export const styleColor = (s: ColorStyle): string => (s.token ? `token:${s.token}` : s.color);

/** Set a layer's fill, stroke colour or text colour from a colour style, and remember that it follows it. */
export function applyColorStyle(node: SceneNode, part: 'fill' | 'stroke' | 'color', style: ColorStyle): boolean {
  const n = node as unknown as Record<string, unknown>;
  if (part === 'fill' && 'fill' in n) n.fill = { type: 'solid', color: styleColor(style) };
  else if (part === 'stroke' && 'stroke' in n) {
    const cur = n.stroke as { width: number } | null;
    n.stroke = { ...(cur ?? { width: 1 }), paint: { type: 'solid', color: styleColor(style) } };
  } else if (part === 'color' && 'fontFamily' in n) n.color = styleColor(style);
  else return false;
  node.styleRefs = { ...node.styleRefs, [part]: style.id };
  return true;
}

/** Set a text layer's font settings (and colour, when the style has one) from a text style. */
export function applyTextStyle(node: SceneNode, style: TextStyleDef): boolean {
  const n = node as unknown as Record<string, unknown>;
  if (!('fontFamily' in n)) return false;
  for (const k of TEXT_KEYS) n[k] = style[k];
  if (style.color) n.color = style.color;
  node.styleRefs = { ...node.styleRefs, text: style.id };
  return true;
}

/** A layer's own property was edited: it stops following the style for that part. */
export function unlinkStyleRef(node: SceneNode, prop: string): void {
  const refs = node.styleRefs;
  if (!refs) return;
  const head = prop.split('.')[0];
  if (head === 'fill') delete refs.fill;
  else if (head === 'stroke') delete refs.stroke;
  else if (head === 'color') {
    delete refs.color;
    if (refs.text) delete refs.text;
  } else if ((TEXT_KEYS as readonly string[]).includes(head)) delete refs.text;
  else return;
  if (!Object.keys(refs).length) delete node.styleRefs;
}

/**
 * Make every layer that follows a style look like it (after a style was edited or a library updated). A ref to a
 * style that is gone is dropped. Library artboards are skipped: they arrive already styled by their library.
 */
export function syncNodeStyles(draft: Project): void {
  const colors = new Map((draft.styles?.colors ?? []).map((s) => [s.id, s]));
  const texts = new Map((draft.styles?.texts ?? []).map((s) => [s.id, s]));
  for (const ab of draft.artboards) {
    if (ab.library) continue;
    walkNodes(ab.children, (n) => {
      const refs = n.styleRefs;
      if (!refs) return;
      for (const part of ['fill', 'stroke', 'color'] as const) {
        const id = refs[part];
        if (!id) continue;
        const s = colors.get(id);
        if (!s) delete refs[part];
        else setIfDifferent(n, part, s);
      }
      if (refs.text) {
        const s = texts.get(refs.text);
        if (!s) delete refs.text;
        else {
          const r = n as unknown as Record<string, unknown>;
          for (const k of TEXT_KEYS) if (r[k] !== s[k]) r[k] = s[k];
          if (s.color && r.color !== s.color) r.color = s.color;
        }
      }
      if (!Object.keys(refs).length) delete n.styleRefs;
    });
  }
}

function setIfDifferent(n: SceneNode, part: 'fill' | 'stroke' | 'color', s: ColorStyle): void {
  const r = n as unknown as Record<string, unknown>;
  const color = styleColor(s);
  if (part === 'fill') {
    const f = r.fill as { type: string; color?: string } | null;
    if (!f || f.type !== 'solid' || f.color !== color) r.fill = { type: 'solid', color };
  } else if (part === 'stroke') {
    const st = r.stroke as { paint: { type: string; color?: string }; width: number } | null;
    if (!st) return;
    if (st.paint.type !== 'solid' || st.paint.color !== color) r.stroke = { ...st, paint: { type: 'solid', color } };
  } else if (r.color !== color) r.color = color;
}

// ---------------------------------------------------------------- own styles

export function addColorStyle(draft: Project, name: string, color: string): ColorStyle {
  draft.styles ??= { colors: [], texts: [] };
  const style: ColorStyle = { id: uid('cs'), name, color };
  draft.styles.colors.push(style);
  return style;
}

export function addTextStyle(draft: Project, name: string, from: Omit<TextStyleDef, 'id' | 'name' | 'library'>): TextStyleDef {
  draft.styles ??= { colors: [], texts: [] };
  const style: TextStyleDef = { id: uid('ts'), name, ...from };
  draft.styles.texts.push(style);
  return style;
}

/** Edit one of your own styles (not a library's) and restyle the layers that follow it. */
export function editStyle(draft: Project, id: string, patch: Partial<ColorStyle> & Partial<TextStyleDef>): boolean {
  const s = [...(draft.styles?.colors ?? []), ...(draft.styles?.texts ?? [])].find((x) => x.id === id);
  if (!s || s.library) return false;
  Object.assign(s, patch, { id: s.id });
  // A style that became a token: its colour is the token's value in the default theme
  const tk = 'color' in patch && 'token' in s && s.token ? draft.themes?.tokens.find((x) => x.id === s.token) : undefined;
  if (tk && typeof patch.color === 'string' && draft.themes) {
    const at = draft.themes.default ?? draft.themes.list[0]?.id;
    tk.values[at] = patch.color;
    // Edited by hand, so it no longer follows the palette
    if (tk.palette) {
      delete tk.palette[at];
      if (!Object.keys(tk.palette).length) delete tk.palette;
    }
  }
  syncNodeStyles(draft);
  return true;
}

export function deleteStyle(draft: Project, id: string): boolean {
  if (!draft.styles) return false;
  const before = draft.styles.colors.length + draft.styles.texts.length;
  draft.styles.colors = draft.styles.colors.filter((s) => s.id !== id || s.library);
  draft.styles.texts = draft.styles.texts.filter((s) => s.id !== id || s.library);
  if (draft.styles.colors.length + draft.styles.texts.length === before) return false;
  syncNodeStyles(draft);
  return true;
}
