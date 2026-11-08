import type { Handle } from './transform';

type Pt = { x: number; y: number };

/**
 * Canvas cursors. A cursor says what a press here will do, so every target that does something on hover gets one:
 * the standard keyword where it says it (move, grab, text, crosshair, the resize arrows) and a small SVG where it
 * doesn't (bend, add a point, the pen, rotate). Each custom one is white-edged so it shows on any background, has its
 * hotspot on the spot that acts, and ends in a standard keyword for when data urls are refused.
 */

const enc = (svg: string) => encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');

/** A cursor from svg markup (drawn on a `size` square), with its hotspot and a fallback keyword. */
export function svgCursor(inner: string, size: number, hx: number, hy: number, fallback: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}</svg>`;
  return `url("data:image/svg+xml,${enc(svg)}") ${hx} ${hy}, ${fallback}`;
}

/** Draw a shape twice, a fat white stroke under a thin dark one, so it reads on dark and light canvases. */
const edged = (d: string, extra = '') => `<path d="${d}" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" ${extra}/><path d="${d}" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

/** The arrow every "pointer plus a badge" cursor starts with, its tip at (3, 2). */
const ARROW = '<path d="M3 2v15l4-3.8 3 6.8 2.6-1.2-3-6.6H15z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>';

/** Over an edge the Bend tool can bend: the arrow with a bowed line and a dot on it, the point that moves. */
export const BEND_CURSOR = svgCursor(`${ARROW}${edged('M14 27Q19 15 28 22')}<circle cx="20.2" cy="19.4" r="2.6" fill="#111" stroke="#fff" stroke-width="1.4"/>`, 32, 3, 2, 'pointer');

/** Over the outline of the path being edited: a double-click puts a point there. */
export const ADD_POINT_CURSOR = svgCursor(`${ARROW}${edged('M22 15v11M16.5 20.5h11')}`, 32, 3, 2, 'copy');

/** The pen: a nib whose tip (bottom left) is where the point goes. */
const NIB = '<path d="M3 29l3-11L19 5l7 7L13 25z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 18l7 7" stroke="#fff" stroke-width="1.2"/><circle cx="9.6" cy="21.4" r="1.6" fill="#fff"/>';
export const PEN_CURSOR = svgCursor(NIB, 32, 3, 29, 'crosshair');
/** Over the first point of the path being drawn: the nib with a ring, because a click here closes the shape. */
export const PEN_CLOSE_CURSOR = svgCursor(`${NIB}<circle cx="26" cy="26" r="3.6" fill="none" stroke="#fff" stroke-width="3.4"/><circle cx="26" cy="26" r="3.6" fill="none" stroke="#111" stroke-width="1.4"/>`, 32, 3, 29, 'crosshair');
/** The pencil, tip at the bottom left. */
export const PENCIL_CURSOR = svgCursor(`${edged('M4 28l2-7L21 6l5 5L11 26z')}${edged('M18 9l5 5')}`, 32, 4, 28, 'crosshair');

/** Over a bone's tip with the Bone tool: a crosshair with a ring, because the next bone grows from this joint. */
export const BONE_CHAIN_CURSOR = svgCursor(`${edged('M16 3v8M16 21v8M3 16h8M21 16h8')}<circle cx="16" cy="16" r="3.6" fill="none" stroke="#fff" stroke-width="3.4"/><circle cx="16" cy="16" r="3.6" fill="none" stroke="#111" stroke-width="1.4"/>`, 32, 16, 16, 'crosshair');

/** A speech bubble with the point at its tail (bottom left), where the pin will land. */
export const COMMENT_CURSOR = svgCursor(`${edged('M4 28V8a3 3 0 013-3h18a3 3 0 013 3v12a3 3 0 01-3 3H12z')}${edged('M10 12h12M10 17h7')}`, 32, 4, 28, 'crosshair');

/** A sticky note with a turned corner, its top left (the corner the note starts from) at the hotspot. */
export const NOTE_CURSOR = svgCursor(`${edged('M5 5h20v13l-6 7H5z')}${edged('M19 25v-7h6')}${edged('M10 11h10M10 15h6')}`, 32, 5, 5, 'crosshair');

const rotateCache = new Map<number, string>();

/**
 * The rotate arrows, turned to sit around a corner. `deg` is the direction from the selection's centre out to the
 * corner on screen (0 is right, 90 is down); a north-west corner (-135) is how the arrows are drawn.
 */
export function rotateCursor(deg: number): string {
  const a = (((Math.round((deg + 135) / 5) * 5) % 360) + 360) % 360;
  let c = rotateCache.get(a);
  if (!c) {
    const arcs = 'M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9';
    const heads = 'M17.5 3.5v4h-4M6.5 20.5v-4h4';
    c = svgCursor(`<g transform="rotate(${a} 12 12)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${arcs}" stroke="#fff" stroke-width="4"/><path d="${heads}" stroke="#fff" stroke-width="4"/><path d="${arcs}" stroke="#111" stroke-width="1.8"/><path d="${heads}" stroke="#111" stroke-width="1.8"/></g>`, 24, 12, 12, 'alias');
    rotateCache.set(a, c);
  }
  return c;
}

/** The resize arrow for a direction on screen (any angle, 0 is right and 90 is down): the double arrow along that line. */
export function resizeCursorForAngle(deg: number): 'ew-resize' | 'nwse-resize' | 'ns-resize' | 'nesw-resize' {
  const bucket = ((Math.round((((deg % 180) + 180) % 180) / 45) % 4) + 4) % 4;
  return (['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const)[bucket];
}

const norm = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/**
 * Which way a handle pushes on screen, given the selection's four corners there in order nw, ne, se, sw (turned with
 * the layer, so a rotated layer's handles point the way they really drag). An edge handle pushes along its edge's
 * normal; a corner handle along the sum of its two edges' normals (not the box's diagonal, which would flatten the
 * arrow on a long thin box).
 */
export function handleDirection(h: Handle, quad: [Pt, Pt, Pt, Pt]): Pt {
  const [nw, ne, se, sw] = quad;
  const c = { x: (nw.x + ne.x + se.x + sw.x) / 4, y: (nw.y + ne.y + se.y + sw.y) / 4 };
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const out = (a: Pt, b: Pt): Pt => {
    const m = mid(a, b);
    return norm({ x: m.x - c.x, y: m.y - c.y });
  };
  const n = out(nw, ne);
  const e = out(ne, se);
  const s = out(se, sw);
  const w = out(sw, nw);
  const sum = (a: Pt, b: Pt): Pt => norm({ x: a.x + b.x, y: a.y + b.y });
  switch (h) {
    case 'n':
      return n;
    case 'e':
      return e;
    case 's':
      return s;
    case 'w':
      return w;
    case 'ne':
      return sum(n, e);
    case 'se':
      return sum(s, e);
    case 'sw':
      return sum(s, w);
    case 'nw':
      return sum(n, w);
  }
}

export const angleOf = (v: Pt): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** The resize cursor of a handle on a (possibly turned) selection. */
export const resizeCursor = (h: Handle, quad: [Pt, Pt, Pt, Pt]): string => resizeCursorForAngle(angleOf(handleDirection(h, quad)));

/** The rotate cursor of a corner handle on a (possibly turned) selection. */
export const rotateCursorAt = (h: Handle, quad: [Pt, Pt, Pt, Pt]): string => rotateCursor(angleOf(handleDirection(h, quad)));

/** The cursor a tool shows over empty canvas, before the pointer is on anything it acts on. */
export function toolCursor(tool: string): string {
  switch (tool) {
    case 'hand':
      return 'grab';
    case 'select':
    case 'bend':
      return 'default';
    case 'text':
      return 'text';
    case 'pen':
      return PEN_CURSOR;
    case 'pencil':
      return PENCIL_CURSOR;
    case 'comment':
      return COMMENT_CURSOR;
    case 'note':
      return NOTE_CURSOR;
    default:
      return 'crosshair';
  }
}

/** While a drag is going the pointer is captured, so the canvas itself has to show what is being done. */
export function dragCursor(kind: string, handleCursor?: string): string | null {
  switch (kind) {
    case 'pan':
      return 'grabbing';
    case 'move':
    case 'moveAb':
    case 'boneMove':
      return 'move';
    case 'bend':
      return BEND_CURSOR;
    case 'resize':
    case 'resizeMulti':
    case 'resizeAb':
    case 'rotate':
    case 'boneRotate':
    case 'pathPoint':
    case 'pathHandle':
      return handleCursor || null;
    case 'gradPt':
      return 'grabbing';
    default:
      return null;
  }
}
