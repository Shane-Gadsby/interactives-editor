/** Pure helpers over the project document (work on immer drafts or plain objects). */
import {
  apply,
  IDENTITY,
  invert,
  isContainer,
  multiply,
  nodeMatrix,
  type Artboard,
  type ContainerNode,
  type Matrix,
  type Project,
  type SceneNode,
} from 'interactives-player';

export interface Located {
  node: SceneNode;
  parent: ContainerNode | null;
  siblings: SceneNode[];
  index: number;
  /** Ancestors from the artboard root down to the parent. */
  ancestors: ContainerNode[];
}

export function getArtboard(p: Project, id: string | null): Artboard | undefined {
  return p.artboards.find((a) => a.id === id);
}

export function locate(artboard: Artboard, id: string): Located | null {
  const search = (list: SceneNode[], parent: ContainerNode | null, ancestors: ContainerNode[]): Located | null => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.id === id) return { node: n, parent, siblings: list, index: i, ancestors };
      if (isContainer(n)) {
        const f = search(n.children, n, [...ancestors, n]);
        if (f) return f;
      }
    }
    return null;
  };
  return search(artboard.children, null, []);
}

export function findArtboardOf(p: Project, nodeId: string): Artboard | undefined {
  return p.artboards.find((a) => locate(a, nodeId));
}

/** Matrix from a node's local space to artboard space. */
export function nodeToArtboard(artboard: Artboard, id: string): Matrix {
  const loc = locate(artboard, id);
  if (!loc) return [...IDENTITY];
  let m: Matrix = [...IDENTITY];
  for (const a of loc.ancestors) m = multiply(m, nodeMatrix(a));
  return multiply(m, nodeMatrix(loc.node));
}

/** Matrix from a node's parent space to artboard space. */
export function parentToArtboard(artboard: Artboard, id: string): Matrix {
  const loc = locate(artboard, id);
  if (!loc) return [...IDENTITY];
  let m: Matrix = [...IDENTITY];
  for (const a of loc.ancestors) m = multiply(m, nodeMatrix(a));
  return m;
}

export function nodeCorners(artboard: Artboard, id: string): { x: number; y: number }[] {
  const loc = locate(artboard, id);
  if (!loc) return [];
  const m = nodeToArtboard(artboard, id);
  const { width: w, height: h } = loc.node;
  return [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(points: { x: number; y: number }[]): Rect {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Axis-aligned bounds of nodes, in artboard space. */
export function selectionBounds(artboard: Artboard, ids: string[]): Rect | null {
  const pts = ids.flatMap((id) => nodeCorners(artboard, id));
  return pts.length ? boundsOf(pts) : null;
}

/** Topmost node under a point (artboard space). Walks into containers; returns the deepest hit path (top-level first). */
export function hitTest(artboard: Artboard, x: number, y: number, opts: { includeLocked?: boolean; includeHidden?: boolean } = {}): SceneNode[] {
  // `trail` is the stack of groups being walked into; it is only copied when something is hit
  const trail: SceneNode[] = [];
  const walk = (list: SceneNode[], parentM: Matrix): SceneNode[] | null => {
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if ((!n.visible && !opts.includeHidden) || (n.locked && !opts.includeLocked)) continue;
      const m = multiply(parentM, nodeMatrix(n));
      if (isContainer(n)) {
        trail.push(n);
        const inner = walk(n.children, m);
        trail.pop();
        if (inner) return inner;
        if (n.type === 'group' || n.type === 'bone') continue; // Groups are hit only through their children (a bone has no area: the canvas picks bones by their glyphs).
        if (n.type === 'frame' && n.clip) {
          // A clipped frame still counts as hit on its own box.
        }
      }
      const p = apply(invert(m), x, y);
      if (p.x >= 0 && p.y >= 0 && p.x <= n.width && p.y <= n.height) return [...trail, n];
    }
    return null;
  };
  return walk(artboard.children, [...IDENTITY]) ?? [];
}

/** Ids of every node in an artboard, depth first. */
export function allIds(list: SceneNode[]): string[] {
  const out: string[] = [];
  const rec = (l: SceneNode[]) => {
    for (const n of l) {
      out.push(n.id);
      if (isContainer(n)) rec(n.children);
    }
  };
  rec(list);
  return out;
}

/** Remove ids whose ancestor is also in the list (so moving a group doesn't move its children twice). */
export function topmost(artboard: Artboard, ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    const loc = locate(artboard, id);
    return loc && !loc.ancestors.some((a) => set.has(a.id));
  });
}

export function uniqueName(existing: Iterable<string>, base: string): string {
  const names = new Set(existing);
  if (!names.has(base)) return base;
  const stem = base.replace(/\s+\d+$/, '');
  for (let i = 2; ; i++) if (!names.has(`${stem} ${i}`)) return `${stem} ${i}`;
}

export function nodeNames(artboard: Artboard): string[] {
  const out: string[] = [];
  const rec = (l: SceneNode[]) => {
    for (const n of l) {
      out.push(n.name);
      if (isContainer(n)) rec(n.children);
    }
  };
  rec(artboard.children);
  return out;
}

export function isIdentifier(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED.has(name);
}

const RESERVED = new Set(
  'break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static enum await implements package protected interface private public Math event ix vars'.split(
    ' ',
  ),
);
