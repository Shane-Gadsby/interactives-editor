/**
 * Rigging helpers for the editor: drawing bones, binding layers to them and editing weights. Everything works on a
 * project artboard (a plain object or an immer draft), so callers run it inside `store().update`.
 */
import {
  apply,
  autoWeights,
  bindMesh,
  bindPath,
  boneEnds,
  createNode,
  gridMesh,
  invert,
  isContainer,
  worldMatrices,
  type Artboard,
  type BoneNode,
  type Matrix,
  type PathSkin,
  type SceneNode,
  type SkinInfluence,
} from 'interactives-player';
import { locate, nodeToArtboard } from '../store/doc';

export interface Pt {
  x: number;
  y: number;
}

/** Every bone of an artboard, in tree order. */
export function bonesOf(children: SceneNode[]): BoneNode[] {
  const out: BoneNode[] = [];
  const rec = (list: SceneNode[]) => {
    for (const n of list) {
      if (n.type === 'bone') out.push(n);
      if (isContainer(n)) rec(n.children);
    }
  };
  rec(children);
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A bone drawn from `a` to `b` (artboard space) inside `parentId` (a layer, or null for the artboard). Not added to the
 * document. With `chain`, a bone started on its parent bone's tip sits exactly there (its x is the parent's length).
 */
export function boneFromDrag(ab: Artboard, parentId: string | null, a: Pt, b: Pt, opts: { chain?: boolean } = {}): BoneNode {
  const pm = parentId ? nodeToArtboard(ab, parentId) : ([1, 0, 0, 1, 0, 0] as Matrix);
  const inv = invert(pm);
  const base = apply(inv, a.x, a.y);
  const tip = apply(inv, b.x, b.y);
  const parent = parentId ? locate(ab, parentId)?.node : null;
  const atTip = !!opts.chain && parent?.type === 'bone';
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  return createNode('bone', {
    name: 'Bone',
    x: r2(atTip ? parent!.width : base.x),
    y: r2(atTip ? 0 : base.y),
    width: Math.max(1, r2(Math.hypot(dx, dy))),
    rotation: r2((Math.atan2(dy, dx) * 180) / Math.PI),
  });
}

/** A bone's glyph geometry (artboard space), from the tree as drawn, so IK and animation show. */
export interface BoneGlyph {
  id: string;
  name: string;
  parentId: string | null;
  base: Pt;
  tip: Pt;
}

export function boneGlyphs(children: SceneNode[]): BoneGlyph[] {
  // No bones (nearly always): nothing to work out, and the world matrices of every layer are not cheap
  if (!bonesOf(children).length) return [];
  const world = worldMatrices(children);
  const out: BoneGlyph[] = [];
  const rec = (list: SceneNode[], parent: string | null) => {
    for (const n of list) {
      if (n.type === 'bone') {
        const { base, tip } = boneEnds(world.get(n.id)!, n.width);
        out.push({ id: n.id, name: n.name, parentId: parent, base, tip });
      }
      if (isContainer(n)) rec(n.children, n.type === 'bone' ? n.id : parent);
    }
  };
  rec(children, null);
  return out;
}

/** The nearest bone tip (or base) to a point, within `radius` (artboard px). */
export function boneEndAt(glyphs: BoneGlyph[], p: Pt, radius: number, which: 'tip' | 'base' = 'tip'): BoneGlyph | null {
  let best: BoneGlyph | null = null;
  let bestD = radius;
  for (const g of glyphs) {
    const d = Math.hypot(g[which].x - p.x, g[which].y - p.y);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- binding

type Skinnable = Extract<SceneNode, { type: 'path' | 'image' }>;

/** The layers a skin can be bound to. */
export const skinnable = (n: SceneNode): n is Skinnable => n.type === 'path' || n.type === 'image';

/** The skin on a path, or on an image's mesh. */
export function skinOf(n: SceneNode): PathSkin | null {
  if (n.type === 'path') return n.skin ?? null;
  if (n.type === 'image') return n.mesh?.skin ?? null;
  return null;
}

/**
 * Binds a path (or an image, which gets a grid mesh first if it has none) to bones, with automatic weights from the
 * poses the layer and bones are in now. Returns the number of bones bound, 0 when nothing could be.
 */
export function bindLayer(ab: Artboard, layerId: string, boneIds: string[], opts: { maxInfluences?: number; cols?: number; rows?: number } = {}): number {
  const node = locate(ab, layerId)?.node;
  if (!node || !skinnable(node)) return 0;
  const world = worldMatrices(ab.children);
  const bones = boneIds
    .map((id) => locate(ab, id)?.node)
    .filter((b): b is BoneNode => !!b && b.type === 'bone')
    .map((b) => ({ id: b.id, world: world.get(b.id)!, length: b.width }));
  if (!bones.length) return 0;
  const lw = world.get(node.id)!;
  const max = opts.maxInfluences ?? 4;
  if (node.type === 'path') {
    node.skin = bindPath(node, lw, bones, max);
  } else {
    const cols = opts.cols ?? Math.max(2, Math.min(12, Math.round(node.width / 40)));
    const rows = opts.rows ?? Math.max(2, Math.min(12, Math.round(node.height / 40)));
    const mesh = node.mesh?.vertices.length ? { ...node.mesh, skin: null } : gridMesh(node.width, node.height, cols, rows);
    node.mesh = bindMesh(mesh, lw, bones, max);
  }
  return bones.length;
}

/** Takes the skin off. An image keeps its mesh, unbound, unless `dropMesh`. */
export function unbindLayer(ab: Artboard, layerId: string, dropMesh = false): void {
  const node = locate(ab, layerId)?.node;
  if (!node) return;
  if (node.type === 'path') delete node.skin;
  if (node.type === 'image' && node.mesh) {
    if (dropMesh) node.mesh = null;
    else node.mesh.skin = null;
  }
}

/** Keeps at most 4 influences with positive weights, scaled to sum to 1. */
export function normalizeInfluences(list: SkinInfluence[]): SkinInfluence[] {
  const kept = list.filter((i) => i.w > 0).sort((a, b) => b.w - a.w).slice(0, 4);
  const sum = kept.reduce((a, i) => a + i.w, 0);
  return sum > 0 ? kept.map((i) => ({ b: i.b, w: Math.round((i.w / sum) * 1000) / 1000 })) : [];
}

/** Sets one point's weights (the handles follow the point). */
export function setPointWeights(ab: Artboard, layerId: string, si: number, pi: number, infl: SkinInfluence[]): void {
  const node = locate(ab, layerId)?.node;
  const skin = node && skinOf(node);
  if (!skin) return;
  while (skin.weights.length <= si) skin.weights.push([]);
  while (skin.weights[si].length <= pi) skin.weights[si].push({ w: [] });
  const v = skin.weights[si][pi];
  v.w = normalizeInfluences(infl);
  // Separate handle weights (from an import) no longer match
  delete v.in;
  delete v.out;
}

/** Works one point's weights out again from the bones' distances (measured in the pose they were bound in). */
export function autoWeightPoint(ab: Artboard, layerId: string, si: number, pi: number, maxInfluences = 4): void {
  const node = locate(ab, layerId)?.node;
  const skin = node && skinOf(node);
  if (!node || !skin) return;
  const p = node.type === 'path' ? node.paths[si]?.points[pi] : node.type === 'image' ? node.mesh?.vertices[pi] : undefined;
  if (!p) return;
  // bind maps layer space to bone space, so its inverse puts each bone's base and tip back into the layer's space
  const ends = skin.bones.map((b) => {
    const inv = invert(b.bind as Matrix);
    const bone = locate(ab, b.bone)?.node;
    return { base: apply(inv, 0, 0), tip: apply(inv, bone?.type === 'bone' ? bone.width : 0, 0) };
  });
  setPointWeights(ab, layerId, si, pi, autoWeights({ x: p.x, y: p.y }, ends, maxInfluences));
}
