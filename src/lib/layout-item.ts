import type { ContainerNode, LayoutItem, LayoutSize, SceneNode } from 'interactives-player';

/** What a layer's parent does with it: lays it along a row or a column, puts it in a grid cell, or stacks it with the others. */
export type LayoutKind = 'row' | 'column' | 'grid' | 'stack';

/** The kind of auto layout a parent has, or null when it has none (a group, the artboard, a frame without auto layout). */
export function parentLayoutKind(parent: ContainerNode | null | undefined): LayoutKind | null {
  if (!parent || parent.type !== 'frame' || !parent.layout) return null;
  const g = parent.layout.grid;
  if (g) return g.stack ? 'stack' : 'grid';
  return parent.layout.direction === 'row' ? 'row' : 'column';
}

/** How a layer is sized on one axis (fixed when the item says nothing). */
export const sizeMode = (it: LayoutItem | null | undefined, axis: 'width' | 'height'): LayoutSize => it?.[axis] ?? 'fixed';

/** The sides of margin, in the order the inspector lists them (like padding). */
export const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * A layout item with a change applied, tidied so the document only holds what differs from the defaults: `undefined`
 * in a patch removes the key, default values (fixed size, in flow, grow 1, span 1, zero margin...) are left out, and a
 * layer with nothing left gets no item at all.
 */
export function patchLayoutItem(current: LayoutItem | null | undefined, patch: Partial<LayoutItem>): LayoutItem | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  const it = next as LayoutItem;
  if (it.position === 'flow') delete it.position;
  for (const [axis, pct] of [
    ['width', 'widthPercent'],
    ['height', 'heightPercent'],
  ] as const) {
    if (it[axis] === 'fixed') delete it[axis];
    if (it[axis] !== 'percent') delete it[pct];
  }
  if (it.margin && SIDES.every((s) => !it.margin![s])) delete it.margin;
  if (it.marginAuto) {
    const on = SIDES.filter((s) => it.marginAuto![s]);
    if (on.length) it.marginAuto = Object.fromEntries(on.map((s) => [s, true]));
    else delete it.marginAuto;
  }
  if (it.inset) {
    it.inset = Object.fromEntries(Object.entries(it.inset).filter(([, v]) => v !== undefined));
  }
  if (it.inset && it.inset.left === undefined && it.inset.top === undefined && it.inset.right === undefined && it.inset.bottom === undefined) delete it.inset;
  if (it.grow === 1) delete it.grow;
  if (it.basis === 0) delete it.basis;
  if (it.basisPercent !== undefined && it.basisPercent <= 0) delete it.basisPercent;
  // A basis is a px size, content or a percent; the last one set wins
  if (patch.basisPercent !== undefined && patch.basis === undefined) delete it.basis;
  if (patch.basis !== undefined && patch.basisPercent === undefined) delete it.basisPercent;
  if (!(it.aspectRatio && it.aspectRatio > 0)) {
    delete it.aspectRatio;
    delete it.aspectDerive;
  }
  if (it.aspectDerive === 'either') delete it.aspectDerive;
  for (const k of ['gridColumn', 'gridRow'] as const) if (!it[k]) delete it[k];
  for (const k of ['gridColumnSpan', 'gridRowSpan'] as const) if (!it[k] || it[k]! <= 1) delete it[k];
  if (!it.wrapText) delete it.wrapText;
  return Object.keys(it).length ? it : undefined;
}

/** The value a field shows for several layers: the first one's, and whether the others differ. */
export function commonValue<T>(nodes: SceneNode[], read: (n: SceneNode) => T): { value: T; mixed: boolean } {
  const value = read(nodes[0]);
  return { value, mixed: nodes.some((n) => read(n) !== value) };
}
