import { useSyncExternalStore } from 'react';

/**
 * Where the editor's panels are: four docked areas around the canvas (left, right, bottom, and a top one under the header that
 * takes no room until something is docked in it), each a group of tabs, plus
 * any number of floating windows over the canvas, and which side the tool rail is on. Panels move between them by
 * dragging their tab (components/Dock.tsx) or from the tab's right-click menu. It's about this screen, not the
 * project, so it's kept in this browser like the panel widths.
 *
 * Every panel is in exactly one place. A group shows its active tab; the bottom area can also be folded down to its
 * tab strip (so can the top one). Something asking for a panel from code (store.set({ bottomTab })) shows it wherever it is.
 */

export type PanelId =
  | 'layers'
  | 'assets'
  | 'libraries'
  | 'comments'
  | 'inspector'
  | 'timeline'
  | 'logic'
  | 'scripts'
  | 'variables'
  | 'data'
  | 'a11y'
  | 'insights'
  | 'interface'
  | 'themes'
  | 'usage'
  | 'credits'
  | 'checklist';

export type Zone = 'left' | 'right' | 'bottom' | 'top';
export const ZONES: Zone[] = ['left', 'right', 'bottom', 'top'];

/** How tall the top area is to begin with, the least and the most (it is also kept per layout, so workspaces carry it). */
export const TOP_HEIGHT = { def: 160, min: 80, max: 600 };
/** Height of a folded area: its tab strip. */
export const FOLDED_HEIGHT = 34;

export interface DockGroup {
  tabs: PanelId[];
  active: PanelId | null;
}

export interface FloatWin extends DockGroup {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the tool rail is: any of the docked areas (at the top or bottom it is a horizontal strip) or floating. */
export type ToolsPlace = Zone | 'float';
export const TOOLS_PLACES: ToolsPlace[] = ['left', 'right', 'bottom', 'top', 'float'];

export interface DockLayout {
  v: 1;
  zones: Record<Zone, DockGroup>;
  /** The bottom area folded down to its tabs. */
  bottomFolded: boolean;
  /** The top area folded down to its tabs. */
  topFolded: boolean;
  /** The top area's height. */
  topHeight: number;
  floats: FloatWin[];
  tools: { place: ToolsPlace; x: number; y: number };
  /**
   * Panels put away until wanted (the Essentials workspace). A hidden panel still has its place in a group, it just has no tab
   * until something asks for it (`showPanel`), the project uses what it is for (lib/essentials.ts), or the person shows all.
   */
  hidden?: PanelId[];
  /** Tool rail groups (`TOOL_GROUPS` ids) put away the same way. The one holding the tool in use always shows. */
  hiddenTools?: string[];
}

/** Where a tab can be dropped: a docked area or a floating window (at a position in its tabs), or a new window. */
export type DropTarget = { zone: Zone; index: number } | { float: string; index: number } | { newFloat: { x: number; y: number } };

export const ALL_PANELS: PanelId[] = ['layers', 'assets', 'libraries', 'comments', 'inspector', 'timeline', 'logic', 'scripts', 'variables', 'data', 'a11y', 'insights', 'interface', 'checklist', 'themes', 'usage', 'credits'];

/** Where each panel lives in the default layout (and goes back to when its floating window is closed). */
export const HOME: Record<PanelId, Zone> = {
  layers: 'left',
  assets: 'left',
  libraries: 'left',
  comments: 'left',
  inspector: 'right',
  timeline: 'bottom',
  logic: 'bottom',
  scripts: 'bottom',
  variables: 'bottom',
  data: 'bottom',
  a11y: 'bottom',
  insights: 'bottom',
  interface: 'bottom',
  themes: 'bottom',
  usage: 'bottom',
  credits: 'bottom',
  checklist: 'bottom',
};

export function defaultLayout(): DockLayout {
  const zones = Object.fromEntries(ZONES.map((z) => [z, { tabs: ALL_PANELS.filter((p) => HOME[p] === z), active: null }])) as Record<Zone, DockGroup>;
  zones.left.active = 'layers';
  zones.right.active = 'inspector';
  zones.bottom.active = 'timeline';
  return { v: 1, zones, bottomFolded: false, topFolded: false, topHeight: TOP_HEIGHT.def, floats: [], tools: { place: 'left', x: 80, y: 120 } };
}

const isPanel = (v: unknown): v is PanelId => typeof v === 'string' && (ALL_PANELS as string[]).includes(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * A saved layout made safe: unknown panels dropped, each panel in one place only, any panel missing (one added since it
 * was saved) put back in its home area, active tabs that exist.
 */
export function normalise(raw: unknown): DockLayout {
  const def = defaultLayout();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<DockLayout>;
  const seen = new Set<PanelId>();
  const clean = (g: Partial<DockGroup> | undefined): DockGroup => {
    const tabs = (Array.isArray(g?.tabs) ? g!.tabs : []).filter((p): p is PanelId => isPanel(p) && !seen.has(p) && (seen.add(p), true));
    return { tabs, active: isPanel(g?.active) && tabs.includes(g!.active) ? g!.active : (tabs[0] ?? null) };
  };
  const zones = Object.fromEntries(ZONES.map((z) => [z, clean(r.zones?.[z])])) as Record<Zone, DockGroup>;
  const floats: FloatWin[] = [];
  for (const f of Array.isArray(r.floats) ? r.floats : []) {
    const g = clean(f);
    if (!g.tabs.length) continue;
    floats.push({ ...g, id: typeof f.id === 'string' ? f.id : `fl${floats.length}`, x: num(f.x, 120), y: num(f.y, 120), w: Math.max(220, num(f.w, 360)), h: Math.max(140, num(f.h, 320)) });
  }
  for (const p of ALL_PANELS) if (!seen.has(p)) zones[HOME[p]].tabs.push(p);
  for (const z of ZONES) if (!zones[z].active) zones[z].active = zones[z].tabs[0] ?? null;
  // layouts saved before the rail could go to the bottom only ever said left, right or float, and still read the same
  const place = (TOOLS_PLACES as unknown[]).includes(r.tools?.place) ? (r.tools!.place as ToolsPlace) : 'left';
  // layouts saved before the top area had no top group, and read as an empty one
  const topHeight = Math.max(TOP_HEIGHT.min, Math.min(TOP_HEIGHT.max, Math.round(num(r.topHeight, TOP_HEIGHT.def))));
  const out: DockLayout = { v: 1, zones, bottomFolded: !!r.bottomFolded, topFolded: !!r.topFolded, topHeight, floats, tools: { place, x: num(r.tools?.x, 80), y: num(r.tools?.y, 120) } };
  // only written when something is put away, so a layout that hides nothing reads the same as it always did
  const hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.filter(isPanel))] : [];
  if (hidden.length) out.hidden = hidden;
  const hiddenTools = Array.isArray(r.hiddenTools) ? [...new Set(r.hiddenTools.filter((g): g is string => typeof g === 'string' && g.length > 0 && g.length < 30))].slice(0, 20) : [];
  if (hiddenTools.length) out.hiddenTools = hiddenTools;
  return out;
}

/** Is the panel put away (and nothing has asked for it)? */
export const isHidden = (l: DockLayout, p: PanelId): boolean => !!l.hidden?.includes(p);

/** The layout with these panels put away (and, optionally, these tool groups). */
export function hideSome(l: DockLayout, panels: PanelId[], tools: string[] = []): DockLayout {
  const next: DockLayout = { ...l };
  if (panels.length) next.hidden = [...new Set(panels)];
  else delete next.hidden;
  if (tools.length) next.hiddenTools = [...new Set(tools)];
  else delete next.hiddenTools;
  return next;
}

/** Bring a panel back (and make it the one showing). */
export function unhidePanel(l: DockLayout, p: PanelId): DockLayout {
  return showPanel(l, p);
}

/** Show every panel and tool group again. */
export function showAll(l: DockLayout): DockLayout {
  return hideSome(l, [], []);
}

/** What is under a dragged tool rail: an edge to dock it on, the tab strip of a panel group (it can't be a tab), or the open canvas. */
export type ToolsDrop = { place: Zone } | { tabs: true } | { float: true };

/** Where a dragged rail would go. Edges dock it, tab strips refuse it (it is a rail, not a tab), anywhere else it floats. */
export function toolsDropFor(hit: { edge?: Zone | null; strip?: boolean }): ToolsDrop {
  if (hit.edge) return { place: hit.edge };
  if (hit.strip) return { tabs: true };
  return { float: true };
}

/** The rail moved to a docked area or put floating (at a position, when given). */
export function placeTools(l: DockLayout, place: ToolsPlace, at?: { x: number; y: number }): DockLayout {
  return { ...l, tools: { place, x: at ? Math.round(at.x) : l.tools.x, y: at ? Math.round(at.y) : l.tools.y } };
}

/** Where a panel is now. */
export function locatePanel(l: DockLayout, p: PanelId): { zone: Zone } | { float: string } {
  for (const z of ZONES) if (l.zones[z].tabs.includes(p)) return { zone: z };
  const f = l.floats.find((x) => x.tabs.includes(p));
  return f ? { float: f.id } : { zone: HOME[p] };
}

/** Is the panel on screen: the active tab of its group, and not in a folded bottom or top area. */
export function isShown(l: DockLayout, p: PanelId): boolean {
  for (const z of ZONES) if (l.zones[z].active === p) return !(z === 'bottom' && l.bottomFolded) && !(z === 'top' && l.topFolded);
  return l.floats.some((f) => f.active === p);
}

const without = (g: DockGroup, p: PanelId): DockGroup => {
  const i = g.tabs.indexOf(p);
  if (i < 0) return g;
  const tabs = g.tabs.filter((x) => x !== p);
  // the tab beside it takes over when the active one leaves
  return { tabs, active: g.active === p ? (tabs[Math.min(i, tabs.length - 1)] ?? null) : g.active };
};
const inserted = (g: DockGroup, p: PanelId, index: number): DockGroup => {
  const tabs = [...g.tabs];
  tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, p);
  return { tabs, active: p };
};

let floatSeq = 0;
const newFloatId = () => `fl${Date.now().toString(36)}${(floatSeq++).toString(36)}`;

/** Move a panel to a target, making it the active tab there. Floating windows left empty close. */
export function movePanel(l: DockLayout, p: PanelId, to: DropTarget): DockLayout {
  // Dropped where it already is: only the order changes, so count the index without it
  const from = locatePanel(l, p);
  let index = 'index' in to ? to.index : 0;
  const sameGroup = ('zone' in to && 'zone' in from && to.zone === from.zone) || ('float' in to && 'float' in from && to.float === from.float);
  if (sameGroup) {
    const tabs = 'zone' in to ? l.zones[to.zone].tabs : l.floats.find((f) => f.id === (to as { float: string }).float)!.tabs;
    if (tabs.indexOf(p) < index) index--;
  }
  const zones = Object.fromEntries(ZONES.map((z) => [z, without(l.zones[z], p)])) as Record<Zone, DockGroup>;
  let floats = l.floats.map((f) => ({ ...f, ...without(f, p) }));
  let bottomFolded = l.bottomFolded;
  let topFolded = l.topFolded;
  if ('zone' in to) {
    zones[to.zone] = inserted(zones[to.zone], p, index);
    if (to.zone === 'bottom') bottomFolded = false;
    if (to.zone === 'top') topFolded = false;
  } else if ('float' in to) floats = floats.map((f) => (f.id === to.float ? { ...f, ...inserted(f, p, index) } : f));
  else floats.push({ id: newFloatId(), tabs: [p], active: p, x: Math.round(to.newFloat.x), y: Math.round(to.newFloat.y), w: 380, h: 320 });
  floats = floats.filter((f) => f.tabs.length);
  return { ...l, zones, floats, bottomFolded, topFolded };
}

/** Make a panel the active tab of its group, unfolding the bottom or top area or bringing its window to the front. */
export function showPanel(l: DockLayout, p: PanelId): DockLayout {
  // asking for a panel is wanting it: it comes out of the put-away list first
  if (l.hidden?.includes(p)) l = hideSome(l, l.hidden.filter((x) => x !== p), l.hiddenTools ?? []);
  const at = locatePanel(l, p);
  if ('zone' in at) {
    const z = at.zone;
    if (!l.zones[z].tabs.includes(p)) return movePanel(l, p, { zone: z, index: l.zones[z].tabs.length });
    return { ...l, zones: { ...l.zones, [z]: { ...l.zones[z], active: p } }, bottomFolded: z === 'bottom' ? false : l.bottomFolded, topFolded: z === 'top' ? false : l.topFolded };
  }
  const f = l.floats.find((x) => x.id === at.float)!;
  return { ...l, floats: [...l.floats.filter((x) => x !== f), { ...f, active: p }] };
}

/** Close a floating window: its panels go back to their home areas. */
export function dockFloat(l: DockLayout, id: string): DockLayout {
  const f = l.floats.find((x) => x.id === id);
  if (!f) return l;
  let next: DockLayout = { ...l, floats: l.floats.filter((x) => x.id !== id) };
  for (const p of f.tabs) next = { ...next, zones: { ...next.zones, [HOME[p]]: inserted(next.zones[HOME[p]], p, next.zones[HOME[p]].tabs.length) } };
  return f.active ? showPanel(next, f.active) : next;
}

// ---------------------------------------------------------------- the live layout, kept in this browser

const KEY = 'ix-dock-v1';

function load(): DockLayout {
  try {
    return normalise(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return defaultLayout();
  }
}

/** Has this browser ever kept an arrangement of the panels (so a person who set theirs up is not handed a different one)? */
export function hasSavedLayout(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

let layout: DockLayout = typeof window !== 'undefined' ? load() : defaultLayout();
const listeners = new Set<() => void>();

export function getDock(): DockLayout {
  return layout;
}

export function setDock(next: DockLayout | ((l: DockLayout) => DockLayout)): void {
  const n = typeof next === 'function' ? next(layout) : next;
  if (n === layout) return;
  layout = n;
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn();
}

export function resetDock(): void {
  setDock(defaultLayout());
}

export function subscribeDock(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDock(): DockLayout {
  return useSyncExternalStore(subscribeDock, getDock, getDock);
}
