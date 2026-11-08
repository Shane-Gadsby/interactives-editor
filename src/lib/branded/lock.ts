/**
 * The lock on a branded project (one with `project.brandLook`, made from a branded starter pack). It rides on the same
 * machinery as the brand kit lock (`../brand.ts`, `store.update`, the F9 `brandOverride`), with three rules:
 *
 * - layers tagged chrome (the logo, sweeps, accent bars, footer line) can't be edited, moved, deleted or detached;
 * - a colour set on a layer or page has to be one of the project's theme tokens (so the colourway can swap them);
 * - fonts are Open Sans.
 *
 * Layers that are new in a change (drawn, pasted, a new page) are not refused for their colours and fonts: they are snapped
 * to the nearest token and to Open Sans, since the tools make them with plain defaults. Editing an existing layer to a hex or
 * another font is refused. Deleting a whole page is allowed, chrome and all; the chrome on a page can't be taken off it.
 * `brandLook.strict === false` turns all of it off.
 */
import { produce } from 'immer';
import { defaultTheme, isTokenRef, tokenRef, tokenValue, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { toRgba } from '../a11y/colour';
import { BRAND_FONT } from './looks';

/** CHROME_TAG as kit.ts has it (not imported: the kit pulls in the SVG importer, this stays light). */
const CHROME = 'brand-chrome';

export const isChromeNode = (n: SceneNode): boolean => (n as { tags?: string[] }).tags?.includes(CHROME) ?? false;

/** A project that was made from a branded pack and is still held to its look. */
export const isBrandLocked = (p: Pick<Project, 'brandLook'> | null | undefined): boolean => !!p?.brandLook && p.brandLook.strict !== false;

/**
 * Is this layer held by the brand lock right now: tagged chrome, in a project that is held to its look, and the F9 override off.
 * The Layers panel uses it to show the lock without letting the layer be picked. (The canvas needs nothing more: chrome also
 * carries the ordinary `locked` flag, which the canvas already skips.)
 */
export const isBrandHeld = (project: Pick<Project, 'brandLook'> | null | undefined, n: SceneNode, override = false): boolean => !override && isBrandLocked(project) && isChromeNode(n);

/** The ids of every brand layer in a branded project and of everything inside one (a group's children), for the Layers panel. Empty with the override on. */
export function brandHeldIds(p: Project, override = false): Set<string> {
  const out = new Set<string>();
  if (override || !isBrandLocked(p)) return out;
  const down = (list: SceneNode[], inside: boolean) => {
    for (const n of list) {
      const held = inside || isChromeNode(n);
      if (held) out.add(n.id);
      down((n as { children?: SceneNode[] }).children ?? [], held);
    }
  };
  for (const ab of p.artboards) down(ab.children, false);
  return out;
}

/**
 * A branded project with its chrome layers marked `locked`, for projects made before chrome carried the ordinary lock. Returns
 * the project itself when every chrome layer already is, so the common case costs one walk and no copy.
 */
export function lockBrandChrome(p: Project): Project {
  if (!isBrandLocked(p)) return p;
  const open = (list: SceneNode[]): boolean => list.some((n) => (isChromeNode(n) && !n.locked) || open((n as { children?: SceneNode[] }).children ?? []));
  if (!p.artboards.some((ab) => open(ab.children))) return p;
  return produce(p, (d) => {
    const down = (list: SceneNode[]) => {
      for (const n of list) {
        if (isChromeNode(n)) n.locked = true;
        down((n as { children?: SceneNode[] }).children ?? []);
      }
    };
    for (const ab of d.artboards as Artboard[]) down(ab.children);
  });
}

type Rec = Record<string, unknown>;

//What the colour scan doesn't walk into: layer lists, point lists and the like
const SKIP = new Set(['children', 'paths', 'points', 'keyframes', 'tracks', 'logic', 'timelines']);

const NO_COLOUR = new Set(['', 'transparent', 'none', 'currentcolor', 'inherit']);

/** A value that is a plain (non token) colour, or null. */
function plainColour(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (NO_COLOUR.has(t.toLowerCase()) || isTokenRef(t)) return null;
  return toRgba(t) ? t : null;
}

const firstFamily = (stack: string): string => {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|([^,]*))/.exec(stack ?? '');
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
};
const isBrandFont = (v: unknown): boolean => typeof v !== 'string' || !v.trim() || firstFamily(v).toLowerCase() === BRAND_FONT.toLowerCase();

interface Visit {
  colour?: (v: string, set: (next: string) => void) => void;
  font?: (v: string, set: (next: string) => void) => void;
}

/** Visits every plain colour and font family of one layer (or page) itself, not its children. */
function scan(o: unknown, visit: Visit, key = '', top = true): void {
  if (Array.isArray(o)) {
    //bare strings in arrays are never colours here (a gradient stop's colour is a field of an object)
    o.forEach((x, i) => typeof x !== 'string' && scan(x, visit, `${key}[${i}]`, false));
    return;
  }
  if (!o || typeof o !== 'object') return;
  const r = o as Rec;
  for (const k of Object.keys(r)) {
    if (top && SKIP.has(k)) continue;
    const v = r[k];
    if (typeof v === 'string') {
      if (k === 'fontFamily' && visit.font) visit.font(v, (n) => (r[k] = n));
      else if ((k === 'color' || /Color$/.test(k)) && visit.colour) visit.colour(v, (n) => (r[k] = n));
    } else if (v && typeof v === 'object') scan(v, visit, k, false);
  }
}

/** Every plain colour of a layer, and every font family that isn't Open Sans. */
function offences(o: unknown): { colours: string[]; fonts: string[] } {
  const colours: string[] = [];
  const fonts: string[] = [];
  scan(o, {
    colour: (v) => {
      const c = plainColour(v);
      if (c) colours.push(c);
    },
    font: (v) => {
      if (!isBrandFont(v)) fonts.push(firstFamily(v));
    },
  });
  return { colours, fonts };
}

interface Entry {
  node: SceneNode;
  parent: string;
  board: string;
}

function indexOf(p: Project): { nodes: Map<string, Entry>; boards: Map<string, Artboard> } {
  const nodes = new Map<string, Entry>();
  const boards = new Map<string, Artboard>();
  const visit = (list: SceneNode[], parent: string, board: string) => {
    for (const n of list) {
      nodes.set(n.id, { node: n, parent, board });
      const kids = (n as { children?: SceneNode[] }).children;
      if (Array.isArray(kids)) visit(kids, n.id, board);
    }
  };
  for (const ab of p.artboards) {
    boards.set(ab.id, ab);
    visit(ab.children, ab.id, ab.id);
  }
  return { nodes, boards };
}

const subtract = (a: string[], b: string[]): string[] => {
  const left = [...b];
  return a.filter((x) => {
    const i = left.indexOf(x);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
};

/** The names of the chrome layers on an artboard (at any depth). */
function chromeNames(ab: Artboard): string[] {
  const out: string[] = [];
  const down = (list: SceneNode[]) => {
    for (const n of list) {
      if (isChromeNode(n)) out.push(n.name);
      down((n as { children?: SceneNode[] }).children ?? []);
    }
  };
  down(ab.children);
  return out;
}

/**
 * Page masters (`master.ts`) carry the chrome now: the master's own layers are held by the layer rules above, and this holds the
 * links around them. A page keeps its master, can't leave the master's chrome layers off by name, a master that has chrome can't be
 * deleted while a page still uses it, and which of its layers go over the page is not for changing.
 */
function masterViolation(before: Map<string, Artboard>, after: Map<string, Artboard>): string | null {
  for (const [id, was] of before) {
    const now = after.get(id);
    if (now && was.master) {
      const m = before.get(was.master);
      const chrome = m ? chromeNames(m) : [];
      if (chrome.length && now.master !== was.master) return `“${now.name}” gets its brand layers from “${m!.name}” and keeps them in a branded project.`;
      const hid = (now.masterHide ?? []).filter((x) => !(was.masterHide ?? []).includes(x) && chrome.includes(x))[0];
      if (hid) return `“${hid}” is part of the UniSQ brand and can't be left off a page in a branded project.`;
    }
    if (now && chromeNames(was).length && JSON.stringify(was.masterOver ?? []) !== JSON.stringify(now.masterOver ?? [])) return `“${was.name}” holds the brand layers, so what is drawn over the pages is locked in a branded project.`;
    if (!now && chromeNames(was).length && [...before.values()].some((a) => a.master === id && after.has(a.id))) return `“${was.name}” holds the brand layers of pages that are still in the project, so it is locked in a branded project.`;
  }
  return null;
}

/**
 * Says what in the change from `before` to `after` a branded project refuses, as a sentence for a toast, or null when it is
 * fine. Compares by reference first (immer shares what didn't change) and by content only for the layers that were rebuilt, so it is cheap on a big project.
 */
export function brandLookViolation(before: Project, after: Project): string | null {
  if (!isBrandLocked(before) || after === before) return null;
  const a = indexOf(after);
  const b = indexOf(before);
  for (const [id, e] of b.nodes) {
    if (!isChromeNode(e.node)) continue;
    const now = a.nodes.get(id);
    if (!now) {
      //taking the whole page away takes its chrome with it, which is fine
      if (a.boards.has(e.board)) return `“${e.node.name}” is part of the UniSQ brand and is locked in a branded project.`;
      continue;
    }
    //(some edits rebuild a group's object without changing it, so same by content counts)
    if (now.parent !== e.parent || (now.node !== e.node && JSON.stringify(now.node) !== JSON.stringify(e.node))) return `“${e.node.name}” is part of the UniSQ brand and is locked in a branded project.`;
  }
  const masterBad = masterViolation(b.boards, a.boards);
  if (masterBad) return masterBad;
  const check = (was: unknown, now: unknown, label: string): string | null => {
    if (was === now) return null;
    const had = offences(was);
    const has = offences(now);
    const colour = subtract(has.colours, had.colours)[0];
    if (colour) return `This is a branded project, so colours come from its theme. Pick a swatch from the Tokens tab instead of ${colour} (${label}).`;
    const font = subtract(has.fonts, had.fonts)[0];
    if (font) return `This is a branded project, so the font is ${BRAND_FONT}, not ${font} (${label}).`;
    return null;
  };
  for (const [id, e] of a.nodes) {
    const was = b.nodes.get(id);
    if (!was) continue;
    const bad = check(was.node, e.node, e.node.name);
    if (bad) return bad;
  }
  for (const [id, ab] of a.boards) {
    const was = b.boards.get(id);
    if (!was) continue;
    const bad = check({ ...was, children: [] }, { ...ab, children: [] }, ab.name);
    if (bad) return bad;
  }
  return null;
}

const dist = (x: number[], y: number[]) => (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;

/** The project's tokens as colours in its default theme, for matching. */
function tokenColours(p: Project): { ref: string; rgb: number[] }[] {
  const t = p.themes;
  if (!t?.tokens.length) return [];
  const theme = defaultTheme(t);
  const out: { ref: string; rgb: number[] }[] = [];
  for (const tk of t.tokens) {
    const v = theme ? tokenValue(t, tk, theme.id) : undefined;
    const c = v ? toRgba(v) : null;
    if (c) out.push({ ref: tokenRef(tk.id), rgb: [c[0], c[1], c[2]] });
  }
  return out;
}

/**
 * The layers and pages that are new in `after` (not in `before`) with their plain colours put onto the nearest theme token and
 * their fonts onto Open Sans. Returns `after` itself when nothing needed it.
 */
export function snapToBrand(before: Project, after: Project): Project {
  if (!isBrandLocked(before) || after === before) return after;
  const a = indexOf(after);
  const b = indexOf(before);
  const fresh = [...a.nodes.values()].filter((e) => !b.nodes.has(e.node.id) && (offences(e.node).colours.length || offences(e.node).fonts.length)).map((e) => e.node.id);
  const freshBoards = [...a.boards.keys()].filter((id) => !b.boards.has(id) && (offences({ ...a.boards.get(id)!, children: [] }).colours.length || offences({ ...a.boards.get(id)!, children: [] }).fonts.length));
  if (!fresh.length && !freshBoards.length) return after;
  const tokens = tokenColours(after);
  const nearest = (v: string): string => {
    const c = toRgba(v);
    if (!c || !tokens.length) return v;
    let best = tokens[0];
    for (const t of tokens) if (dist(t.rgb, c) < dist(best.rgb, c)) best = t;
    return best.ref;
  };
  const snap: Visit = {
    colour: (v, set) => {
      if (plainColour(v)) set(nearest(v));
    },
    font: (v, set) => {
      if (!isBrandFont(v)) set(BRAND_FONT);
    },
  };
  return produce(after, (d) => {
    const ids = new Set(fresh);
    const boards = new Set(freshBoards);
    const down = (list: SceneNode[]) => {
      for (const n of list) {
        if (ids.has(n.id)) scan(n, snap);
        const kids = (n as { children?: SceneNode[] }).children;
        if (Array.isArray(kids)) down(kids);
      }
    };
    for (const ab of d.artboards as Artboard[]) {
      if (boards.has(ab.id)) scan(ab, snap);
      down(ab.children);
    }
  });
}
