import { apply, nodeMatrix, type Artboard, type GroupNode, type SceneNode } from 'interactives-player';

/**
 * Groups that size to their contents: after every change, a group's box is moved and resized to the box around its
 * layers, and the layers are moved back by the same amount, so nothing moves on the canvas. Keys on those layers' x and
 * y (and on the group's own) move with them.
 *
 * Left as they are: groups with `fitContents: false`, rotated or scaled groups (or ones whose rotation or scale is
 * animated: their pivot would move), repeaters, groups whose layers take x or y from a binding or a constraint, and empty
 * groups.
 */

const EPS = 0.01;

/** The box around a group's layers, in the group's own coordinates. */
export function contentBounds(children: SceneNode[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of children) {
    const m = nodeMatrix(c);
    for (const [px, py] of [
      [0, 0],
      [c.width, 0],
      [c.width, c.height],
      [0, c.height],
    ]) {
      const p = apply(m, px, py);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return Number.isFinite(x0) && Number.isFinite(y0) ? { x0, y0, x1, y1 } : null;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function canFit(g: GroupNode, animated: Set<string>): boolean {
  if (g.fitContents === false || !g.children.length || g.repeat) return false;
  if (g.rotation || g.scaleX !== 1 || g.scaleY !== 1) return false;
  if (animated.has(`${g.id}:rotation`) || animated.has(`${g.id}:scaleX`) || animated.has(`${g.id}:scaleY`)) return false;
  return !g.children.some((c) => c.bindings?.x || c.bindings?.y || c.constraints?.length);
}

/** What a group's box would become, or null when it already fits (or isn't fitted). */
function plan(g: GroupNode, animated: Set<string>): { dx: number; dy: number; width: number; height: number } | null {
  if (!canFit(g, animated)) return null;
  const b = contentBounds(g.children);
  if (!b) return null;
  const width = round(b.x1 - b.x0);
  const height = round(b.y1 - b.y0);
  const dx = round(b.x0);
  const dy = round(b.y0);
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS && Math.abs(width - g.width) < EPS && Math.abs(height - g.height) < EPS) return null;
  return { dx, dy, width, height };
}

/** Properties with keys on some timeline, as `nodeId:prop`. */
function animatedProps(ab: Artboard): Set<string> {
  const s = new Set<string>();
  for (const t of ab.timelines ?? []) for (const tr of t.tracks) s.add(`${tr.nodeId}:${tr.prop}`);
  return s;
}

/** Whether anything in an artboard needs fitting (read only, so a draft is only made when it does). */
export function artboardNeedsFit(ab: Artboard): boolean {
  const animated = animatedProps(ab);
  const walk = (list: SceneNode[]): boolean =>
    list.some((n) => (n.type === 'group' && plan(n, animated) !== null) || ('children' in n && walk((n as { children: SceneNode[] }).children)));
  return walk(ab.children);
}

/** Fit the groups of an artboard (a draft), innermost first so an outer group sees its inner groups' new boxes. */
export function fitArtboardGroups(ab: Artboard): void {
  const animated = animatedProps(ab);
  const shiftKeys = (nodeId: string, prop: 'x' | 'y', by: number) => {
    if (!by) return;
    for (const t of ab.timelines ?? [])
      for (const tr of t.tracks) if (tr.nodeId === nodeId && tr.prop === prop) for (const k of tr.keys) if (typeof k.value === 'number') k.value = round(k.value + by);
  };
  const walk = (list: SceneNode[]) => {
    for (const n of list) {
      if ('children' in n) walk((n as { children: SceneNode[] }).children);
      if (n.type !== 'group') continue;
      const p = plan(n, animated);
      if (!p) continue;
      for (const c of n.children) {
        c.x = round(c.x - p.dx);
        c.y = round(c.y - p.dy);
        shiftKeys(c.id, 'x', -p.dx);
        shiftKeys(c.id, 'y', -p.dy);
      }
      n.x = round(n.x + p.dx);
      n.y = round(n.y + p.dy);
      shiftKeys(n.id, 'x', p.dx);
      shiftKeys(n.id, 'y', p.dy);
      n.width = p.width;
      n.height = p.height;
    }
  };
  walk(ab.children);
}
