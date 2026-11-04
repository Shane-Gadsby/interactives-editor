import { getPath, type SceneNode } from 'interactives-player';

export const CORNER_NAMES = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'] as const;

/** The four radii of a rect or frame: its own per corner, or the one radius four times. */
export function cornersOf(n: SceneNode): [number, number, number, number] {
  const one = Math.max(0, Number(getPath(n, 'cornerRadius')) || 0);
  const c = getPath(n, 'cornerRadii');
  if (Array.isArray(c) && c.length === 4 && c.every((v) => typeof v === 'number' && Number.isFinite(v))) return c.map((v) => Math.max(0, v)) as [number, number, number, number];
  return [one, one, one, one];
}

/** Locked means one value for all: no radii per corner, or all four the same. */
export function radiiLocked(n: SceneNode): boolean {
  const c = cornersOf(n);
  return c.every((v) => v === c[0]);
}

/** Only rects and frames draw radii per corner. */
export const hasCornerRadii = (n: SceneNode): boolean => n.type === 'rect' || n.type === 'frame';
