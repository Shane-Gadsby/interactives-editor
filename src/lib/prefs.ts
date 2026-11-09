import { useSyncExternalStore } from 'react';
import { DEFAULT_GRID } from './grid';
import { installSessionHeader, sessionUser } from './session';
import { fetchOrEarly } from './early-fetch';

/**
 * Per-person editor preferences. The server keeps them per user (GET/PUT api/prefs), so they follow you between
 * browsers; this browser keeps a copy per user so the theme is right before the server answers.
 */
export interface Prefs {
  /** 'zoom': the wheel zooms and Shift+wheel pans; 'ctrl': the wheel pans and Ctrl/Cmd+wheel zooms. */
  wheel: 'zoom' | 'ctrl';
  /** Show hover tooltips. */
  tooltips: boolean;
  /** Rulers along the canvas edges (Shift+R). */
  rulers: boolean;
  /** The grid drawn on the canvas (Shift+G). It never shows in Preview or exports. */
  showGrid: boolean;
  /** Snapping at all (the master switch; the choices below are kept while it is off). Ctrl while dragging turns snapping off for that drag. */
  snapOn: boolean;
  /** Snap target Grid: moves, resizes, new shapes, pen points and arrow-key nudges land on the grid (Ctrl+'). */
  snapGrid: boolean;
  /** Snap target Artboard: the artboard's edges and centre (and, moving an artboard, the other artboards'). */
  snapArtboard: boolean;
  /** Snap target Layers: edges and centres of other layers. */
  snapLayers: boolean;
  /** Layers reach every layer on the artboard, not only the ones in the same parent as what is dragged. */
  snapLayersAll: boolean;
  /** Dragging a guide out of a ruler attaches it to the page under the pointer (it moves with that page). Off (the default): it is a universal guide, fixed on the canvas. Alt while dragging gives the other kind. */
  attachGuides: boolean;
  /** Snap target Guides: ruler guides. */
  snapGuides: boolean;
  /** Snap target Spacing: equal gaps between neighbouring layers, drawn with the distance. */
  snapSpacing: boolean;
  /** Snap target Pixels: whole-pixel positions and sizes. */
  snapPixels: boolean;
  /** Snap target Points: path anchor points and bone joints. */
  snapPoints: boolean;
  /** How close (screen pixels) something has to be to snap. */
  snapDistance: number;
  /** Grid cell size in artboard pixels. An artboard can override it (`artboard.grid`). */
  gridSize: number;
  /** A stronger line every this many cells. */
  gridSubdivisions: number;
  /** Colour theme; 'auto' follows the system. */
  theme: 'dark' | 'light' | 'auto';
  /** Colours of every code editor (Scripts, the Data tab's raw text, the Inspector's code boxes): 'follow' the editor's theme, or always 'light' or 'dark' (lib/code-theme.ts). */
  codeTheme: 'follow' | 'light' | 'dark';
  /** Font family for new text layers and the font every new project includes. */
  defaultFont: string;
  /**
   * Layer semantics and keyboard operation in Preview (the player's `accessibility` option): tab stops, Enter/Space, ARIA
   * roles, focus ring, announcements. On by default; switch it off to check whether a problem comes from it.
   */
  accessibility: boolean;
  /** The Screen reader strip under Preview, showing what would be announced. Off by default; it only shows while accessibility is on too. */
  screenReader: boolean;
  /** In-app notices for review comments handed to you, mentioning you, or replied to. On by default; the server checks it too. */
  commentNotices: boolean;
  /** Draw the parts of layers that hang outside an artboard that clips faintly beside it, so they can be seen and picked. On by default; the player and exports still clip. */
  ghostOutside: boolean;
  /** Draw the sticky notes authors leave on the canvas (never part of the player or an export). On by default; templates carry their own explanations as notes, so this is how they are put away. */
  showNotes: boolean;
  /** Ask "What is this a picture of?" on a picture or video as it is added (lib/alt-prompt.ts). On by default; never blocks, and skipping is remembered per project. */
  askPictureDescription: boolean;
  /** After + When clicked… and the other ways of adding an interaction: open the Interactions graph, frame the new nodes and focus them (lib/graph-reveal.ts). On by default; off for people who build only from the Inspector. */
  showNewInteractions: boolean;
  /** Say "Alt: drag a copy" on every plain drag, not just the first three (lib/alt-drag.ts). Off by default. */
  altDragHintAlways: boolean;
  /** Show the technical names (On pointer, Set variable, ...) instead of the plain wording for the interaction nodes and their choices. Off by default. */
  technicalWording: boolean;
  /** Inspector sections the person folded or opened, by section key, only where that differs from the section's own default (lib/section-fold.ts). */
  sectionFolds?: Record<string, boolean>;
  /** The order the person put each panel's inspector sections in, by panel kind (`layer:rect`, `page`, ...) to section keys (lib/reorder.ts). */
  sectionOrder?: Record<string, string[]>;
  /** The order of the tool rail's groups (`groups`) and of the tools inside each group (the group's id), as keys (lib/reorder.ts). */
  toolOrder?: Record<string, string[]>;
  /** The "Getting started" strip in the editor (lib/onboarding.ts). On by default; it also puts itself away once every job on it is done. */
  gettingStarted: boolean;
  /** The Timeline's side list of the artboard's timelines is open (lib/timeline-list.ts). On by default. */
  timelineList: boolean;
  /** The Sound and captions lanes start folded to one row on a timeline that has no clips or cues (lib/timeline-view.ts). On by default. */
  timelineFoldEmpty: boolean;
  /** Lanes the Timeline's View menu has hidden. Off by default, so all three show. */
  timelineHideSound?: boolean;
  timelineHideCaptions?: boolean;
  timelineHideDescriptions?: boolean;
  /** What first-run remembers, as short keys to booleans: `job-<id>` for a ticked job, `dismissed`, `fresh`, `essentials`, `welcomed` (lib/onboarding.ts). */
  onboarding?: Record<string, boolean>;
  /** Keys the person set themselves, by command id (lib/keymap.ts). Only what differs from the default, so a new default still reaches everyone. */
  keymap?: Record<string, string[]>;
  /** The set of keys the defaults start from (lib/keymap.ts PRESETS). */
  keymapPreset?: 'default' | 'illustration';
  /** Keyboard shortcut sets saved under a name (lib/keymap-sets.ts). Each is a base plus its own overrides, so a new default key still reaches everyone. */
  keymapSets?: KeymapSet[];
  /** The saved set `keymap` and `keymapPreset` belong to. Edits to the keys write through to it. Absent: a built-in set, with or without changes on top. */
  keymapActive?: string;
  /** Single-letter shortcuts on or off (WCAG 2.1.4 Character Key Shortcuts). On by default. */
  singleKeys: boolean;
  /** Panel arrangements saved under a name (lib/workspaces.ts checks each one before using it). */
  workspaces?: unknown[];
}

/** A named keyboard shortcut set: one of the built-in bases and the keys changed on top of it. */
export interface KeymapSet {
  id: string;
  name: string;
  base: 'default' | 'illustration';
  keys: Record<string, string[]>;
}

export const DEFAULT_FONT = 'Open Sans';
const DEFAULTS: Prefs = { singleKeys: true, technicalWording: false, showNewInteractions: true, altDragHintAlways: false, askPictureDescription: true, wheel: 'zoom', tooltips: true, rulers: false, showGrid: false, attachGuides: false, snapOn: true, snapGrid: false, snapArtboard: true, snapLayers: true, snapLayersAll: false, snapGuides: true, snapSpacing: false, snapPixels: true, snapPoints: false, snapDistance: 6, gridSize: DEFAULT_GRID.size, gridSubdivisions: DEFAULT_GRID.subdivisions, theme: 'dark', codeTheme: 'follow', defaultFont: DEFAULT_FONT, accessibility: true, screenReader: false, commentNotices: true, ghostOutside: true, showNotes: true, gettingStarted: true, timelineList: true, timelineFoldEmpty: true };
/** What every preference starts as, for the Preferences window's Reset buttons. */
export const PREF_DEFAULTS: Readonly<Prefs> = DEFAULTS;
const LAST_USER = 'ix-prefs-user';
const keyFor = (user: string) => `ix-prefs:${user}`;

const read = (key: string): Partial<Prefs> => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

let user: string = (() => {
  try {
    return localStorage.getItem(LAST_USER) ?? 'guest';
  } catch {
    return 'guest';
  }
})();
let current: Prefs = { ...DEFAULTS, ...read(keyFor(user)) };
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function prefs(): Prefs {
  return current;
}

/** Who these preferences belong to ('guest' when there is no session, which is also the user the server shares between everyone without one). */
export const prefsUser = (): string => user;

const loadedHooks = new Set<(ok: boolean) => void>();
/** Run when the server's copy has arrived (ok), or when it could not be reached (not ok). Returns the cleanup. */
export function onPrefsLoaded(f: (ok: boolean) => void): () => void {
  loadedHooks.add(f);
  return () => loadedHooks.delete(f);
}
const loaded = (ok: boolean) => loadedHooks.forEach((f) => f(ok));

/** Put the theme on <html> so the stylesheet can switch colours. */
export function applyTheme(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = current.theme;
}
applyTheme();

const API = typeof document !== 'undefined' ? new URL('api/prefs', document.baseURI).href : '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void fetch(API, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: current }) }).catch(() => undefined);
  }, 400);
}

// Changes made before the server's copy arrived, laid back over it when it does
let early: Partial<Prefs> | null = {};

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  if (early) Object.assign(early, patch);
  applyTheme();
  write(keyFor(user), current);
  notify();
  save();
}

/** Put these preferences back to their defaults (the ones that have no default are taken away). */
export function resetPrefs(keys: readonly (keyof Prefs)[]): void {
  const patch: Record<string, unknown> = {};
  for (const k of keys) patch[k] = k in DEFAULTS ? DEFAULTS[k] : undefined;
  setPrefs(patch as Partial<Prefs>);
}

/** Load this person's preferences from the server (called once at start-up). */
export async function loadUserPrefs(): Promise<void> {
  try {
    // App.tsx calls this as it's imported, which is before main.tsx installs the session header. Without the header
    // and the session the server answers for "guest", and that copy replaced the person's own on every load
    installSessionHeader();
    await sessionUser();
    //index.html started this request before the bundle arrived (lib/early-fetch.ts)
    const res = await fetchOrEarly(API, { credentials: 'same-origin' });
    if (!res.ok) {
      early = null;
      loaded(false);
      return;
    }
    const body = (await res.json()) as { user: string; prefs: Partial<Prefs> };
    user = body.user || 'guest';
    write(LAST_USER, user);
    const fromServer = body.prefs ?? {};
    // Nothing on the server yet: start from what this browser had (preferences used to be per browser)
    const first = !Object.keys(fromServer).length;
    const local = first ? { ...read('ix-prefs'), ...read(keyFor(user)) } : {};
    const changed = early ?? {};
    early = null;
    current = { ...DEFAULTS, ...local, ...fromServer, ...changed };
    write(keyFor(user), current);
    applyTheme();
    notify();
    if ((first && Object.keys(local).length) || Object.keys(changed).length) save();
    loaded(true);
  } catch {
    early = null;
    loaded(false);
    /* offline: keep the cached copy */
  }
}

/** Run `f` whenever any preference changes. Returns the cleanup. */
export function subscribePrefs(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}
