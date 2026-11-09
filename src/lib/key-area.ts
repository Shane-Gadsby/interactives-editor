//Which panel the last pointer press landed in. A key goes to the panel you last clicked, not to the canvas just because
//the browser has nothing focused (React Flow swallows the mousedown, so a click on a graph node never moves focus)
export type KeyArea = 'graph' | 'timeline' | 'other';

let area: KeyArea = 'other';

export function areaOf(el: EventTarget | null): KeyArea {
  if (!(el instanceof Element)) return 'other';
  if (el.closest('.logic-root')) return 'graph';
  if (el.closest('.timeline-lanes, .key-editor')) return 'timeline';
  return 'other';
}

export const lastKeyArea = (): KeyArea => area;
export const setLastKeyArea = (a: KeyArea): void => void (area = a);

/** Returns the cleanup for an effect. */
export function watchKeyArea(): () => void {
  const f = (e: PointerEvent) => void (area = areaOf(e.target));
  document.addEventListener('pointerdown', f, true);
  return () => document.removeEventListener('pointerdown', f, true);
}

//The keys that change the document through the canvas selection. After a press in the graph they are the graph's to handle
const DOC_KEYS = /^(delete|backspace|enter|arrow(up|down|left|right)|\[|\])$/;
const isDocKey = (e: KeyboardEvent): boolean => {
  const k = e.key.toLowerCase();
  if (DOC_KEYS.test(k)) return true;
  return (e.ctrlKey || e.metaKey) && (k === 'd' || k === 'g' || k === 'x');
};

/**
 * The window shortcut handler asks this first. When the last press was in the graph and nothing in the graph has focus
 * (focus fell back to the page after a menu or a dialog), the key is passed to the graph's own handler instead of the
 * canvas selection. Returns true when it was handled that way.
 */
export function routeToGraph(e: KeyboardEvent): boolean {
  if (area !== 'graph' || !isDocKey(e)) return false;
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
