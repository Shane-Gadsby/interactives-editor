//What each canvas, layers and everywhere command does when its key is pressed (the registry is lib/keymap.ts). Pulled out of the
//window key handler so a key only looks up a command and runs it. The timeline and property commands are in timeline-keys.ts.
import { store, type Tool } from '../store/store';
import { copySelection } from './clipboard';
import { copySelectedKeys, keyContext } from './key-edit';
import { deleteSelectedKeys } from '../panels/Timeline';
import { deleteSelectionCommand } from './artboard-commands';
import { gridFor, nudgeDelta, shiftSteps } from './grid';
import { snapSettings, toggleSnap } from './snapping';
import { keyMoveTarget } from './layer-drop';
import { selectionBounds } from '../store/doc';
import { prefs, setPrefs } from './prefs';
import { COMMANDS, runnerOf, setRunner } from './keymap';
import { routeToGraph, windowCommand } from './key-area';
import { canCrop } from './crop';
import { openInsertComponentPicker } from './components';
import { ensureCommandKeys } from './command-keys';

type Run = (e?: KeyboardEvent) => boolean | void;
const stop = (e?: KeyboardEvent) => e?.preventDefault();

/** Nudge the selection by (dx, dy) screen steps: onto the next grid line when the grid is on (Shift a major step), unless `free`. */
function nudge(e: KeyboardEvent | undefined, dir: 'Left' | 'Right' | 'Up' | 'Down', big: boolean, free: boolean): boolean {
  const s = store();
  const st = s.get();
  if (!st.selection.length) return false;
  stop(e);
  const d = big ? 10 : 1;
  let dx = dir === 'Left' ? -d : dir === 'Right' ? d : 0;
  let dy = dir === 'Up' ? -d : dir === 'Down' ? d : 0;
  const ab = snapSettings().grid && !free ? s.artboard() : null;
  const sb = ab && selectionBounds(ab, st.selection);
  if (ab && sb) {
    const g = gridFor(ab, prefs());
    const steps = big ? shiftSteps(g) : 1;
    if (dx) dx = nudgeDelta(sb.x, dx < 0 ? -1 : 1, g.size, steps);
    if (dy) dy = nudgeDelta(sb.y, dy < 0 ? -1 : 1, g.size, steps);
  }
  const changes = new Map<string, Record<string, unknown>>();
  for (const n of s.selectedNodes()) if (!n.locked) changes.set(n.id, { x: n.x + dx, y: n.y + dy });
  s.setEach(changes, 'nudge');
  return true;
}

/** Keyboard version of dragging in the Layers panel: up and down step past a layer, left and right leave or enter a group. */
function layerMove(e: KeyboardEvent | undefined, how: 'up' | 'down' | 'out' | 'in'): boolean {
  const s = store();
  const st = s.get();
  if (st.selection.length !== 1) return false;
  stop(e);
  const ab = s.artboard();
  const to = ab && keyMoveTarget(ab, st.selection[0], how);
  if (to) s.moveNode(st.selection[0], to.parentId, to.at);
  return true;
}

export function installEditorKeys(zoomTo: (mode: 'fit' | '100' | 'selection' | 'page') => void): void {
  //The palette's commands get their place in the keymap first, so what is set below wins where both have one
  ensureCommandKeys();
  const set = (id: string, run: Run) => setRunner(id, run);
  for (const c of COMMANDS) {
    if (!c.id.startsWith('tool.')) continue;
    const tool = c.id.slice(5) as Tool;
    set(c.id, () => void store().set({ tool, editingPathId: null }));
  }
  set('undo', (e) => (stop(e), store().undo()));
  set('redo', (e) => (stop(e), store().redo()));
  set('duplicate', (e) => (stop(e), store().duplicateSelection()));
  set('group', (e) => (stop(e), store().groupSelection()));
  set('ungroup', (e) => (stop(e), store().ungroupSelection()));
  //Copy and cut leave the key to the browser; with keys picked in the Timeline they mean those keys
  set('copy', () => void (keyContext() && copySelectedKeys() ? undefined : copySelection()));
  set('cut', () => void (keyContext() && copySelectedKeys(true) ? deleteSelectedKeys() : copySelection(true)));
  set('select-all', (e) => {
    stop(e);
    const s = store();
    const ab = s.artboard();
    if (ab) s.select(ab.children.filter((n) => !n.locked).map((n) => n.id));
  });
  set('zoom-fit', (e) => (stop(e), zoomTo('fit')));
  set('zoom-100', (e) => (stop(e), zoomTo('100')));
  set('zoom-selection', (e) => (stop(e), zoomTo('selection')));
  set('zoom-page', (e) => (stop(e), zoomTo('page')));
  set('zoom-in', (e) => (stop(e), store().set({ zoom: Math.min(32, store().get().zoom * 1.25) })));
  set('zoom-out', (e) => (stop(e), store().set({ zoom: Math.max(0.05, store().get().zoom / 1.25) })));
  set('toggle-bones', (e) => (stop(e), store().set({ showBones: !store().get().showBones })));
  set('toggle-rulers', (e) => (stop(e), setPrefs({ rulers: !prefs().rulers })));
  set('toggle-grid', (e) => (stop(e), setPrefs({ showGrid: !prefs().showGrid })));
  set('snap-grid', (e) => (stop(e), toggleSnap('grid')));
  set('delete', (e) => {
    stop(e);
    if (!deleteSelectedKeys()) void deleteSelectionCommand({ keyboard: true });
  });
  set('escape', () => {
    const s = store();
    const st = s.get();
    if (st.croppingId) s.set({ croppingId: null });
    else if (st.editingTextId) s.set({ editingTextId: null });
    else if (st.focusId) s.set({ selection: [st.focusId], focusId: null });
    else if (st.selection.length || st.artboardSelected) s.set({ selection: [], artboardSelected: false });
    else s.set({ tool: 'select' });
  });
  set('enter', () => {
    const s = store();
    const st = s.get();
    if (st.selection.length !== 1) return false;
    const n = s.selectedNodes()[0];
    if (n?.type === 'group' || n?.type === 'frame') s.set({ focusId: n.id, selection: n.children.map((c) => c.id).slice(-1) });
    else if (n?.type === 'path') s.set({ editingPathId: n.id });
    else if (n?.type === 'text' || n?.type === 'button' || n?.type === 'link') s.set({ editingTextId: n.id });
    else if (n?.type === 'image' && canCrop(n)) s.set({ croppingId: n.id });
  });
  for (const dir of ['Left', 'Right', 'Up', 'Down'] as const) {
    const id = dir.toLowerCase();
    set(`nudge-${id}`, (e) => nudge(e, dir, false, false));
    set(`nudge-${id}-10`, (e) => nudge(e, dir, true, false));
    set(`nudge-${id}-free`, (e) => nudge(e, dir, false, true));
  }
  set('layer-up', (e) => layerMove(e, 'up'));
  set('layer-down', (e) => layerMove(e, 'down'));
  set('layer-out', (e) => layerMove(e, 'out'));
  set('layer-in', (e) => layerMove(e, 'in'));
  set('forward', (e) => (stop(e), store().reorder(1)));
  set('backward', (e) => (stop(e), store().reorder(-1)));
  set('front', (e) => (stop(e), store().reorder(Infinity)));
  set('back', (e) => (stop(e), store().reorder(-Infinity)));
  set('insert-component', (e) => {
    if (!openInsertComponentPicker()) return false;
    stop(e);
  });
  set('rename', (e) => {
    const st = store().get();
    if (st.selection.length !== 1) return false;
    stop(e);
    window.dispatchEvent(new CustomEvent('ix-rename-layer', { detail: st.selection[0] }));
  });
}

/** The window's keydown handler: look the key up for the panel it belongs to and run that command. */
export function handleEditorKey(e: KeyboardEvent): void {
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.cm-editor') || t.closest('.react-flow') || t.closest('.note'))) return;
  //The graph was the last place pressed: its keys are its own, never the canvas selection's
  if (routeToGraph(e)) return;
  const cmd = windowCommand(e);
  if (!cmd) return;
  //Enter and Space on a button, link or menu item press it; they are not shortcuts there
  if ((e.key === 'Enter' || e.key === ' ') && t?.closest('button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]')) return;
  //A panel that already used an arrow key (the Layers list moving or extending the pick) keeps it
  if (e.defaultPrevented && cmd.id.startsWith('nudge-')) return;
  runnerOf(cmd.id)?.(e);
}
