//Which panel a key belongs to. A key goes to the panel you last pressed in, not to the canvas just because the browser has
//nothing focused (React Flow swallows the mousedown, so a click on a graph node never moves focus). The keymap (lib/keymap.ts)
//then picks the command for that panel: the same letter can mean a tool on the canvas and a property in the Timeline.
import { CONTEXT_ORDER, commandFor, type CommandDef, type Context } from './keymap';

export type KeyArea = 'canvas' | 'layers' | 'inspector' | 'timeline' | 'graph' | 'other';

let area: KeyArea = 'other';

const AREAS: [string, KeyArea][] = [
  ['.logic-root', 'graph'],
  ['.timeline', 'timeline'],
  ['.inspector', 'inspector'],
  ['.left-panel', 'layers'],
  ['.canvas', 'canvas'],
];

export function areaOf(el: EventTarget | null): KeyArea {
  if (!(el instanceof Element)) return 'other';
  for (const [sel, a] of AREAS) if (el.closest(sel)) return a;
  return 'other';
}

export const lastKeyArea = (): KeyArea => area;
export const setLastKeyArea = (a: KeyArea): void => void (area = a);

/** Where a key press is: the panel it was typed in when one has focus, else the panel last pressed in. */
export function areaFor(e: KeyboardEvent): KeyArea {
  const here = areaOf(e.target);
  return here === 'other' ? area : here;
}

/** The contexts a key press is looked up in. The window handler never takes the graph's own keys (the graph handles those itself). */
export const contextsFor = (a: KeyArea, forWindow = true): Context[] => (a === 'graph' && forWindow ? ['canvas', 'everywhere'] : CONTEXT_ORDER[a]);

/** Returns the cleanup for an effect. */
export function watchKeyArea(): () => void {
  const f = (e: PointerEvent) => void (area = areaOf(e.target));
  document.addEventListener('pointerdown', f, true);
  return () => document.removeEventListener('pointerdown', f, true);
}

/** The command a window-level key press is, looking in the places that press belongs to. */
export function windowCommand(e: KeyboardEvent): CommandDef | null {
  return commandFor(e, contextsFor(areaFor(e)));
}

/**
 * The window shortcut handler asks this first. When the last press was in the graph and nothing in the graph has focus
 * (focus fell back to the page after a menu or a dialog), a key that edits goes to the graph's own handler instead of the
 * canvas selection. Returns true when it was handled that way.
 */
export function routeToGraph(e: KeyboardEvent): boolean {
  if (area !== 'graph') return false;
  const theirs = commandFor(e, ['graph']);
  const canvas = commandFor(e, ['canvas']);
  if (!(theirs?.edits || canvas?.edits)) return false;
  const pane = document.querySelector<HTMLElement>('.logic-canvas');
  if (!pane) {
    //The graph is closed now, so the press that said "graph" is stale
    area = 'other';
    return false;
  }
  if (!pane.contains(document.activeElement)) pane.focus({ preventScroll: true });
  e.preventDefault();
  pane.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, bubbles: true, cancelable: true }));
  return true;
}
