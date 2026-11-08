import { defaultLayout, getDock, movePanel, normalise, setDock, showPanel, type DockLayout, type PanelId } from './dock';
import { getPanelWidths, PANEL_WIDTH, setPanelWidths } from '../components/PanelResize';
import { prefs, setPrefs } from './prefs';
import { store } from '../store/store';
import { essentialsLayout } from './essentials';
import { noteEssentialsApplied, wantsEssentials } from './onboarding';

/**
 * Workspaces: whole panel arrangements to switch between (Preferences > Workspace). One is the dock layout (lib/dock.ts),
 * the side panels' widths and the bottom area's height. A few come built in; the ones people save are kept with their
 * preferences on the server, so they follow them between browsers.
 */
export interface Workspace {
  id: string;
  name: string;
  layout: DockLayout;
  widths: { left: number; right: number };
  bottomHeight: number;
}

/** The ones people saved (in their preferences). */
export interface SavedWorkspace extends Workspace {
  saved: true;
}

const def = () => ({ left: PANEL_WIDTH.left.def, right: PANEL_WIDTH.right.def });

/** Move several panels into one area, in order, the first one open. */
function gather(l: DockLayout, zone: 'left' | 'right' | 'bottom', panels: PanelId[]): DockLayout {
  let out = l;
  panels.forEach((p, i) => (out = movePanel(out, p, { zone, index: i })));
  return showPanel(out, panels[0]);
}

export const BUILT_IN: { id: string; name: string; about: string; make: () => Omit<Workspace, 'id' | 'name'> }[] = [
  {
    id: 'standard',
    name: 'Standard',
    about: 'Layers on the left, properties on the right, the timeline and the other tools underneath',
    make: () => ({ layout: defaultLayout(), widths: def(), bottomHeight: 260 }),
  },
  {
    id: 'essentials',
    name: 'Essentials',
    about: 'Only what a first project needs: Timeline, Interactions, Variables and the checklist along the bottom, and the Shapes, Text, Media and Web tools. Everything else is one click away under More panels',
    make: () => ({ layout: essentialsLayout(defaultLayout()), widths: def(), bottomHeight: 260 }),
  },
  {
    id: 'animate',
    name: 'Animate',
    about: 'A tall timeline across the bottom, with the layers and properties beside the canvas',
    make: () => ({ layout: showPanel(defaultLayout(), 'timeline'), widths: def(), bottomHeight: 380 }),
  },
  {
    id: 'interactions',
    name: 'Interactions',
    about: 'A big interaction graph underneath, with variables and scripts beside the properties',
    make: () => {
      let l = gather(defaultLayout(), 'right', ['inspector', 'variables', 'scripts']);
      l = showPanel(l, 'logic');
      return { layout: l, widths: { left: PANEL_WIDTH.left.def, right: 360 }, bottomHeight: 440 };
    },
  },
  {
    id: 'canvas',
    name: 'Big canvas',
    about: 'Everything on the right in one column of tabs, and the bottom tools folded away, for the most room to design',
    make: () => {
      const l = gather(defaultLayout(), 'right', ['inspector', 'layers', 'assets', 'icons', 'libraries', 'comments']);
      return { layout: { ...l, bottomFolded: true }, widths: { left: PANEL_WIDTH.left.def, right: 400 }, bottomHeight: 260 };
    },
  },
  {
    id: 'review',
    name: 'Review',
    about: 'Comments open on the left, the accessibility checker underneath',
    make: () => ({ layout: showPanel(showPanel(defaultLayout(), 'comments'), 'a11y'), widths: { left: 300, right: PANEL_WIDTH.right.def }, bottomHeight: 300 }),
  },
];

/** The saved ones, made safe (they come from the server and may be from an older version). */
export function savedWorkspaces(): SavedWorkspace[] {
  const raw = prefs().workspaces;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object' && typeof (w as { id?: unknown }).id === 'string' && typeof (w as { name?: unknown }).name === 'string')
    .map((w) => {
      const widths = (w.widths ?? {}) as { left?: unknown; right?: unknown };
      return {
        id: w.id as string,
        name: (w.name as string).slice(0, 60),
        layout: normalise(w.layout),
        widths: { left: Number(widths.left) || PANEL_WIDTH.left.def, right: Number(widths.right) || PANEL_WIDTH.right.def },
        bottomHeight: Number(w.bottomHeight) || 260,
        saved: true as const,
      };
    });
}

/** Switch to a workspace: its panels, widths and bottom height. */
export function applyWorkspace(w: Omit<Workspace, 'id' | 'name'>): void {
  setDock(normalise(w.layout));
  setPanelWidths(w.widths);
  // no more than half the window, so a short screen keeps room for the canvas and the tool bar
  store().set({ bottomHeight: Math.max(140, Math.min(window.innerHeight - 200, Math.round(window.innerHeight * 0.5), w.bottomHeight)) });
  // the tool panel that's open now is the one code thinks of as open
  const bottom = getDock().zones.bottom.active;
  if (bottom && !getDock().bottomFolded) store().set({ bottomTab: bottom as never });
}

/**
 * Someone new (they saw the first-run screen) opens their first project in Essentials, once. Whatever tab the project asked for
 * (a template's Checklist) stays the one that is open. Returns whether it did anything.
 */
export function applyNewcomerEssentials(): boolean {
  if (!wantsEssentials()) return false;
  const asked = store().get().bottomTab;
  applyWorkspace(BUILT_IN.find((w) => w.id === 'essentials')!.make());
  if (asked) store().set({ bottomTab: asked });
  noteEssentialsApplied();
  return true;
}

/** The current arrangement, to save. */
export function currentWorkspace(): Omit<Workspace, 'id' | 'name'> {
  return { layout: getDock(), widths: { ...getPanelWidths() }, bottomHeight: store().get().bottomHeight };
}

export const MAX_SAVED = 12;

function writeSaved(list: SavedWorkspace[]): void {
  setPrefs({ workspaces: list.map(({ saved: _s, ...w }) => w) });
}

export function saveWorkspace(name: string): void {
  const list = savedWorkspaces();
  const clean = name.trim().slice(0, 60) || 'My workspace';
  const same = list.find((w) => w.name.toLowerCase() === clean.toLowerCase());
  const entry: SavedWorkspace = { id: same?.id ?? `ws${Date.now().toString(36)}`, name: clean, ...currentWorkspace(), saved: true };
  writeSaved(same ? list.map((w) => (w.id === same.id ? entry : w)) : [...list, entry].slice(-MAX_SAVED));
}

export function renameWorkspace(id: string, name: string): void {
  writeSaved(savedWorkspaces().map((w) => (w.id === id ? { ...w, name: name.trim().slice(0, 60) || w.name } : w)));
}

export function deleteWorkspace(id: string): void {
  writeSaved(savedWorkspaces().filter((w) => w.id !== id));
}
