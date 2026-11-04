/**
 * Merging a re-imported design file into the artboard it was imported into, for linked files.
 *
 * Pure: no DOM, no store, no network. `reconcileArtboard(current, next, hashes)` takes the artboard as it is in the
 * project now, the artboard the importer just made from the changed file, and returns the merged artboard.
 *
 * It is a three-way merge. The "base" is what the file looked like at the last import, which the artboard keeps as
 * `source.baseline` (a hash per property per layer, so it stays small). A property is taken from the file only when the
 * file changed it since the base and the artboard still has the base value, which means you haven't touched it.
 * Layers are matched by their position in the file's tree (name, and a counter for repeated names), recognising a
 * layer renamed in the file by its content and box. New layers go in at their place in the file's order, layers gone
 * from the file are removed, unless you hung interactions, keys or bindings on them (then they stay, hidden, and are
 * renamed "(removed from file)"), and layers you added yourself are left alone.
 */
import { produce } from 'immer';
import { isContainer, type Artboard, type ArtboardSource, type Id, type SceneNode, type SourceLayerBaseline } from 'interactives-player';

// ---------------------------------------------------------------- hashing

/** JSON with sorted keys, so equal values always give equal text. */
export function stable(v: unknown): string {
  if (v === undefined) return 'u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'u';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

/** A 53-bit string hash (cyrb53) as base 36. */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The same over bytes (a picture), with the length mixed in. */
export function hashBytes(b: Uint8Array): string {
  let h1 = 0xdeadbeef ^ b.length;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 2654435761);
    h2 = Math.imul(h2 ^ b[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}.${b.length.toString(36)}`;
}

const hv = (v: unknown): string | undefined => (v === undefined ? undefined : hashText(stable(v)));

// ---------------------------------------------------------------- keys and baselines

/** Properties that aren't compared one by one: identity, structure, and the picture (handled by its hash). */
const SKIP = new Set(['id', 'type', 'children', 'assetId']);
/** Artboard properties that come from the file. */
const AB_PROPS = ['width', 'height', 'background'] as const;

type Rec = Record<string, unknown>;

/** Hashes of the artboard's own properties that come from the file. */
export function artboardHashes(ab: Artboard): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of AB_PROPS) {
    const h = hv((ab as unknown as Rec)[k]);
    if (h !== undefined) out[k] = h;
  }
  return out;
}

function propHashes(node: SceneNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node as unknown as Rec)) {
    if (SKIP.has(k) || v === undefined) continue;
    out[k] = hashText(stable(v));
  }
  return out;
}

/** Siblings' keys: the name, with `~n` for the nth sibling of the same name and type. */
function siblingKeys(list: SceneNode[]): string[] {
  const seen = new Map<string, number>();
  return list.map((n) => {
    const base = `${n.type}:${n.name}`;
    const i = seen.get(base) ?? 0;
    seen.set(base, i + 1);
    return i ? `${n.name}~${i}` : n.name;
  });
}

const round = (n: number) => Math.round(n * 2) / 2;

/** Content plus box: the same layer renamed in the file keeps the same fingerprint. */
function fingerprint(n: SceneNode, hashes: Record<string, string>): string {
  const content = n.type === 'image' ? hashes[n.assetId ?? ''] ?? '' : n.type === 'text' ? n.text : '';
  return hashText(`${n.type}|${content}|${round(n.x)},${round(n.y)},${round(n.width)},${round(n.height)}`);
}

function entryOf(n: SceneNode, hashes: Record<string, string>, k: string, p: Id): SourceLayerBaseline {
  const e: SourceLayerBaseline = { k, p, t: n.type, f: fingerprint(n, hashes), h: propHashes(n) };
  if (n.type === 'image' && n.assetId) e.a = [n.assetId, hashes[n.assetId] ?? ''];
  return e;
}

/** The base for a freshly imported artboard: one entry per layer, by the layer's id. */
export function baselineOf(ab: Artboard, hashes: Record<string, string>): Record<Id, SourceLayerBaseline> {
  const out: Record<Id, SourceLayerBaseline> = {};
  const visit = (list: SceneNode[], parent: Id) => {
    const keys = siblingKeys(list);
    list.forEach((n, i) => {
      out[n.id] = entryOf(n, hashes, keys[i], parent);
      if (isContainer(n)) visit(n.children, n.id);
    });
  };
  visit(ab.children, '');
  return out;
}

/** The `source` for an artboard right after a plain import. */
export function newSource(ab: Artboard, hashes: Record<string, string>, info: Pick<ArtboardSource, 'kind' | 'fileName' | 'linkId' | 'lastModified' | 'importedAt'> & Partial<Pick<ArtboardSource, 'part' | 'partIndex' | 'by'>>): ArtboardSource {
  return { ...info, baseline: baselineOf(ab, hashes), ab: artboardHashes(ab) };
}

// ---------------------------------------------------------------- the merge

export interface ReconcileStats {
  /** Layers that took something from the file. */
  changed: number;
  /** Layers added (the top of each added branch). */
  added: number;
  /** Layers removed from the artboard because the file no longer has them. */
  removed: number;
  /** Layers gone from the file that stay because they have interactions (or your layers inside them). */
  kept: number;
  /** Layers matched to a layer whose name changed in the file. */
  renamed: number;
  /** Properties the file changed that you had also changed: yours were kept. */
  protectedEdits: number;
  /** The artboard's own size or background changed. */
  artboardChanged: boolean;
}

export interface ReconcileResult {
  artboard: Artboard;
  stats: ReconcileStats;
  /** Assets from the new import that the merged artboard uses and the project needs to have. */
  usedAssetIds: string[];
  /** Assets the artboard used to point at that it no longer does. Delete them if nothing else uses them. */
  releasedAssetIds: string[];
  /** Anything about the layers or artboard changed (the baseline alone moving doesn't count). */
  changed: boolean;
}

export const REMOVED_SUFFIX = ' (removed from file)';

/** Words for the toast. */
export function describeStats(file: string, s: ReconcileStats): string {
  const parts: string[] = [];
  if (s.changed) parts.push(`${s.changed} layer${s.changed === 1 ? '' : 's'} changed`);
  if (s.added) parts.push(`${s.added} added`);
  if (s.removed) parts.push(`${s.removed} removed`);
  if (s.kept) parts.push(`${s.kept} kept (removed from the file but used here)`);
  if (s.artboardChanged) parts.push('artboard resized');
  if (!parts.length) return `${file} reloaded: nothing changed`;
  return `${file} updated: ${parts.join(', ')}${s.protectedEdits ? `; ${s.protectedEdits} of your edits kept` : ''}`;
}

/** Everything from `list` down, with its parent (null at the top). */
function indexTree(list: SceneNode[], into = new Map<Id, SceneNode>()): Map<Id, SceneNode> {
  for (const n of list) {
    into.set(n.id, n);
    if (isContainer(n)) indexTree(n.children, into);
  }
  return into;
}

const imagesIn = (n: SceneNode, into: string[]) => {
  if (n.type === 'image' && n.assetId) into.push(n.assetId);
  if (isContainer(n)) for (const c of n.children) imagesIn(c, into);
};

type Status = { kind: 'match'; id: Id; entry: SourceLayerBaseline } | { kind: 'skip'; id: Id } | { kind: 'add' };

export function reconcileArtboard(current: Artboard, next: Artboard, assetHashes: Record<string, string>): ReconcileResult {
  const src = current.source;
  const baseline = src?.baseline ?? baselineOf(current, {});
  const curIndex = indexTree(current.children);
  const stats: ReconcileStats = { changed: 0, added: 0, removed: 0, kept: 0, renamed: 0, protectedEdits: 0, artboardChanged: false };
  const used = new Set<string>();
  const released = new Set<string>();

  // ---- who is who: walk the file's tree from the top, matching each level against the baseline's children
  const status = new Map<SceneNode, Status>();
  const claimed = new Set<Id>();
  const byParent = new Map<Id, Id[]>();
  for (const [id, e] of Object.entries(baseline)) byParent.set(e.p, [...(byParent.get(e.p) ?? []), id]);

  const matchLevel = (kids: SceneNode[], parent: Id) => {
    const cands = (byParent.get(parent) ?? []).filter((id) => !claimed.has(id));
    const keys = siblingKeys(kids);
    const take = (n: SceneNode, id: Id) => {
      claimed.add(id);
      const entry = baseline[id];
      if (!curIndex.has(id)) status.set(n, { kind: 'skip', id }); // you deleted it: it stays deleted
      else status.set(n, { kind: 'match', id, entry });
    };
    kids.forEach((n, i) => {
      const id = cands.find((c) => !claimed.has(c) && baseline[c].k === keys[i] && baseline[c].t === n.type);
      if (id) take(n, id);
    });
    // a layer renamed in the file: one leftover layer and one leftover entry with the same content and box
    const left = kids.filter((n) => !status.has(n));
    const prints = new Map<string, SceneNode[]>();
    for (const n of left) prints.set(fingerprint(n, assetHashes), [...(prints.get(fingerprint(n, assetHashes)) ?? []), n]);
    for (const [fp, ns] of prints) {
      const es = cands.filter((c) => !claimed.has(c) && baseline[c].f === fp && baseline[c].t === ns[0].type);
      if (ns.length === 1 && es.length === 1) {
        take(ns[0], es[0]);
        stats.renamed++;
      }
    }
    kids.forEach((n) => {
      const st = status.get(n);
      if (!st) status.set(n, { kind: 'add' });
      else if (st.kind === 'match' && isContainer(n)) matchLevel(n.children, st.id);
    });
  };
  matchLevel(next.children, '');

  // layers in the baseline that the file no longer has (and that still exist here)
  const removedIds = new Set<Id>();
  for (const id of Object.keys(baseline)) if (!claimed.has(id) && curIndex.has(id)) removedIds.add(id);

  // what would be lost: interactions, keys and bindings that point at a layer
  const refs = JSON.stringify([current.logic, current.timelines, current.joysticks ?? null, current.blends ?? null]);
  const hasInteractions = (n: SceneNode) => !!(n.bindings && Object.keys(n.bindings).length) || !!n.constraints?.length || !!n.link || refs.includes(`"${n.id}"`);

  const merged = produce(current, (d) => {
    // ---- properties of the layers that are in both
    const draftIndex = indexTree(d.children as SceneNode[]);
    const newHashes = new Map<Id, SourceLayerBaseline>();
    const mergeNode = (n: SceneNode, st: Extract<Status, { kind: 'match' }>) => {
      const orig = curIndex.get(st.id)! as unknown as Rec;
      const draft = draftIndex.get(st.id)! as unknown as Rec;
      const file = n as unknown as Rec;
      const entry = st.entry;
      let touched = false;
      const keys = new Set([...Object.keys(entry.h), ...Object.keys(file)]);
      for (const k of keys) {
        if (SKIP.has(k)) continue;
        // a text layer that sizes itself has its size measured by the editor, so it isn't yours to protect or the file's to set
        if (orig.type === 'text' && ((orig.autoSize === 'width' && (k === 'width' || k === 'height')) || (orig.autoSize === 'height' && k === 'height'))) continue;
        const fileHash = hv(file[k]);
        if (fileHash === entry.h[k]) continue; // the file didn't change it
        if (hv(orig[k]) !== entry.h[k]) {
          stats.protectedEdits++; // you changed it too: yours wins
          continue;
        }
        if (file[k] === undefined) delete draft[k];
        else draft[k] = file[k];
        touched = true;
      }
      // the picture
      let asset = entry.a;
      if (n.type === 'image') {
        const fileAsset = n.assetId ?? '';
        const fileSum = assetHashes[fileAsset] ?? '';
        if (!entry.a || entry.a[1] !== fileSum) {
          if (!entry.a || orig.assetId === entry.a[0]) {
            if (orig.assetId !== fileAsset) {
              if (orig.assetId) released.add(orig.assetId as string);
              draft.assetId = fileAsset || null;
              if (fileAsset) used.add(fileAsset);
              touched = true;
            }
          } else stats.protectedEdits++; // you swapped the picture
          asset = [fileAsset, fileSum];
        }
      }
      if (touched) stats.changed++;
      const e: SourceLayerBaseline = { k: entry.k, p: entry.p, t: entry.t, f: fingerprint(n, assetHashes), h: propHashes(n) };
      if (asset) e.a = asset;
      newHashes.set(st.id, e);
    };
    const visitMatched = (kids: SceneNode[]) => {
      for (const n of kids) {
        const st = status.get(n);
        if (st?.kind === 'match') {
          mergeNode(n, st);
          if (isContainer(n)) visitMatched(n.children);
        }
      }
    };
    visitMatched(next.children);

    // ---- new layers, at their place in the file's order
    const curIdOf = new Map<SceneNode, Id>();
    for (const [n, st] of status) if (st.kind === 'match') curIdOf.set(n, st.id);
    const place = (kids: SceneNode[], list: SceneNode[]) => {
      kids.forEach((n, j) => {
        const st = status.get(n)!;
        if (st.kind === 'skip') return;
        if (st.kind === 'match') {
          const dn = draftIndex.get(st.id)!;
          if (isContainer(n) && isContainer(dn)) place(n.children, dn.children);
          return;
        }
        const at = (id: Id | undefined) => (id === undefined ? -1 : list.findIndex((c) => c.id === id));
        let idx = -1;
        for (let i = j - 1; i >= 0 && idx < 0; i--) {
          const p = at(curIdOf.get(kids[i]) ?? (status.get(kids[i])?.kind === 'add' ? kids[i].id : undefined));
          if (p >= 0) idx = p + 1;
        }
        for (let i = j + 1; i < kids.length && idx < 0; i++) {
          const p = at(curIdOf.get(kids[i]));
          if (p >= 0) idx = p;
        }
        if (idx < 0) idx = 0;
        list.splice(idx, 0, n);
        stats.added++;
        const imgs: string[] = [];
        imagesIn(n, imgs);
        for (const a of imgs) used.add(a);
      });
    };
    place(next.children, d.children as SceneNode[]);

    // ---- layers the file dropped
    const parentMap = new Map<Id, Id>();
    const mapParents = (list: SceneNode[], parent: Id) => {
      for (const n of list) {
        parentMap.set(n.id, parent);
        if (isContainer(n)) mapParents(n.children, n.id);
      }
    };
    mapParents(current.children, '');
    const deleted = new Set<Id>();
    const keptRemoved = new Set<Id>();
    const prune = (list: SceneNode[]) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        if (isContainer(n)) prune(n.children as SceneNode[]);
        if (!removedIds.has(n.id)) continue;
        const kids = isContainer(n) ? (n.children as SceneNode[]) : [];
        // something here that the file doesn't own (yours, or matched elsewhere) or an interaction on a layer inside
        const own = kids.some((c) => !removedIds.has(c.id) || keptRemoved.has(c.id));
        const orig = curIndex.get(n.id)!;
        if (hasInteractions(orig) || own) {
          keptRemoved.add(n.id);
          stats.kept++;
          if (!n.name.endsWith(REMOVED_SUFFIX)) n.name += REMOVED_SUFFIX;
          // your own layers inside stay visible with it; a layer that's only kept for its interactions hides
          if (!own || !kids.some((c) => !removedIds.has(c.id))) n.visible = false;
        } else {
          const imgs: string[] = [];
          imagesIn(orig, imgs);
          for (const a of imgs) released.add(a);
          deleted.add(n.id);
          list.splice(i, 1);
        }
      }
    };
    prune(d.children as SceneNode[]);
    // count the top of each removed branch only
    for (const id of deleted) if (!deleted.has(parentMap.get(id) ?? '')) stats.removed++;

    // ---- the artboard itself
    const abBase = src?.ab ?? {};
    const abNext = artboardHashes(next);
    for (const k of AB_PROPS) {
      if (abNext[k] === abBase[k]) continue;
      if (hv((current as unknown as Rec)[k]) !== abBase[k]) {
        stats.protectedEdits++;
        continue;
      }
      (d as unknown as Rec)[k] = (next as unknown as Rec)[k];
      stats.artboardChanged = true;
    }

    // ---- the new base: the file as it is now, keyed by the ids the layers have here
    const fresh: Record<Id, SourceLayerBaseline> = {};
    const freshWalk = (kids: SceneNode[], parent: Id) => {
      const keys = siblingKeys(kids);
      kids.forEach((n, i) => {
        const st = status.get(n);
        if (st?.kind === 'skip') {
          fresh[st.id] = baseline[st.id]; // you deleted it; remember that
          return;
        }
        const id = st?.kind === 'match' ? st.id : n.id;
        fresh[id] = { ...(st?.kind === 'match' ? newHashes.get(st.id)! : entryOf(n, assetHashes, keys[i], parent)), k: keys[i], p: parent };
        if (isContainer(n)) freshWalk(n.children, id);
      });
    };
    freshWalk(next.children, '');
    if (src && !(stable(src.baseline) === stable(fresh) && stable(src.ab) === stable(abNext))) d.source = { ...src, baseline: fresh, ab: abNext };
  });

  const changed = stats.changed + stats.added + stats.removed + stats.kept > 0 || stats.artboardChanged;
  return { artboard: merged, stats, usedAssetIds: [...used], releasedAssetIds: [...released], changed };
}
