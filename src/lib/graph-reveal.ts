//Show the person what they just added. Adding "When clicked: go to the next page" from the Inspector writes nodes into the page's
//graph, and the author can't see what was made unless they go looking. So after an add the Interactions tab opens, the graph
//frames the new nodes, and focus goes to the new event, so Delete and the arrow keys are the graph's. Only ever called by the
//thing the person just did: a change from someone else live editing, undo or redo, or an agent never comes through here.
import { store } from '../store/store';
import { prefs } from './prefs';
import { setLastKeyArea } from './key-area';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameOptions {
  /** Space kept round the nodes, as a fraction of the view's width and height. */
  padding?: number;
  /** Space kept round them whatever the fraction comes to, in pixels. */
  minPad?: number;
  /** Never closer than this (100%). */
  maxZoom?: number;
  /** Never further out than this: the graph's own limit. */
  minZoom?: number;
}

/** The pan and zoom that fit all of `rects` in a view of `size`: centred, with padding, and never past 100% (or the graph's furthest zoom out). */
export function frameRects(rects: Rect[], size: { width: number; height: number }, o: FrameOptions = {}): { x: number; y: number; zoom: number } | null {
  if (!rects.length || size.width <= 0 || size.height <= 0) return null;
  const { padding = 0.12, minPad = 24, maxZoom = 1, minZoom = 0.2 } = o;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const padX = Math.max(minPad, size.width * padding);
  const padY = Math.max(minPad, size.height * padding);
  const fit = Math.min((size.width - 2 * padX) / bw, (size.height - 2 * padY) / bh);
  const zoom = Math.max(minZoom, Math.min(maxZoom, Number.isFinite(fit) && fit > 0 ? fit : minZoom));
  return { zoom, x: size.width / 2 - ((x0 + x1) / 2) * zoom, y: size.height / 2 - ((y0 + y1) / 2) * zoom };
}

export interface RevealRequest {
  seq: number;
  abId: string;
  /** Everything that was added: what gets framed, picked and glowed. */
  ids: string[];
  /** The one that takes keyboard focus (the event). */
  focusId: string;
}

let seq = 0;
let pending: RevealRequest | null = null;
let lastAt = 0;
const listeners = new Set<(r: RevealRequest) => void>();

export const showsNewInteractions = (): boolean => prefs().showNewInteractions !== false;

/** The reveal still waiting for the graph to draw its nodes (the graph asks, so its own auto-framing can stand back). */
export const pendingReveal = (): RevealRequest | null => pending;

/** The graph says it has framed (or given up on) a reveal. */
export function finishReveal(r: RevealRequest): void {
  if (pending === r) pending = null;
  lastAt = Date.now();
}

/** Was something revealed this moment? A dialog closing hands focus back to where it came from, and must not take it from the graph. */
export const revealedWithin = (ms: number): boolean => !!pending || Date.now() - lastAt < ms;

/** The graph (while it is mounted) hears about each reveal as it is asked for. */
export function onReveal(fn: (r: RevealRequest) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export interface AddedInfo {
  abId: string;
  /** Every node that was written. */
  ids: string[];
  /** The one to focus: the event the flow starts from. */
  focusId: string;
  /** Said aloud and shown as a toast: "Added When clicked: go to the next page". */
  say?: string;
  /** What to do when the preference is off: the editor's old, quieter behaviour. */
  quiet?: () => void;
}

/**
 * Open the Interactions tab on the graph, pick what was added and ask the graph to frame it. Returns false (and does the `quiet`
 * thing instead) when the person has the preference off.
 */
export function revealAdded(a: AddedInfo): boolean {
  if (!showsNewInteractions() || !a.ids.length) {
    a.quiet?.();
    return false;
  }
  const s = store();
  //A refused edit (a locked library page) wrote nothing, so there is nothing to show
  const present = new Set(s.get().project.artboards.find((x) => x.id === a.abId)?.logic.nodes.map((n) => n.id));
  const ids = a.ids.filter((id) => present.has(id));
  if (!present.has(a.focusId)) return false;
  const here = s.get().activeArtboardId;
  s.set({
    ...(here !== a.abId ? { activeArtboardId: a.abId, artboardSelected: false } : {}),
    bottomTab: 'logic',
    logicView: 'graph',
    logicSelection: a.focusId,
    logicPicked: ids,
  });
  //Keys go to the graph from here (lib/key-area.ts), whichever panel the click that started this was in
  setLastKeyArea('graph');
  if (a.say) s.toast(a.say);
  const req: RevealRequest = { seq: ++seq, abId: a.abId, ids, focusId: a.focusId };
  pending = req;
  for (const l of [...listeners]) l(req);
  //Nothing is drawing the graph yet (the tab was on something else): it picks the request up when it mounts, and
  //if nothing ever does the request is let go so it doesn't frame something later, long after
  setTimeout(() => {
    if (pending === req) finishReveal(req);
  }, 3000);
  return true;
}

/** The person asked the system for less movement: no animated pan, no glow. */
export const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
