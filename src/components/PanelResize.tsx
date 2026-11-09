import { useSyncExternalStore } from 'react';

/**
 * Widths of the side panels (layers on the left, properties on the right), dragged from their inner edge. They're
 * about this screen, so they're kept in this browser rather than with the other preferences.
 */
export type Side = 'left' | 'right';
export const PANEL_WIDTH = { left: { def: 300, min: 180, max: 560 }, right: { def: 380, min: 240, max: 640 } } as const;
// Only widths someone dragged to are kept (the old key also saved the defaults on every load, so a new default never
// reached anyone who had opened the editor before)
const KEY = 'ix-panel-widths-v2';

export const clampWidth = (side: Side, w: number): number => {
  const { min, max } = PANEL_WIDTH[side];
  // never so wide the canvas disappears
  const room = typeof window !== 'undefined' ? Math.max(min, window.innerWidth - 56 - 320 - (side === 'left' ? PANEL_WIDTH.right.min : PANEL_WIDTH.left.min)) : max;
  return Math.round(Math.max(min, Math.min(max, room, w)));
};

function load(): Record<Side, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Side, number>>;
    //320 was the old default, so a right panel still at exactly that was never sized by hand: it gets the new one, roomy
    //enough for X and Y of 8888 side by side
    const right = Number(v.right) === 320 ? PANEL_WIDTH.right.def : Number(v.right) || PANEL_WIDTH.right.def;
    return { left: Number(v.left) || PANEL_WIDTH.left.def, right };
  } catch {
    return { left: PANEL_WIDTH.left.def, right: PANEL_WIDTH.right.def };
  }
}

//Read from storage the first time anything asks, not when the module loads
let widths: Record<Side, number> | null = null;
const current = (): Record<Side, number> => (widths ??= typeof window !== 'undefined' ? load() : { left: PANEL_WIDTH.left.def, right: PANEL_WIDTH.right.def });
const listeners = new Set<() => void>();

/** Set the side panels' widths (dragging an edge, or a workspace being applied) and remember them. */
export function setPanelWidths(next: Partial<Record<Side, number>>): void {
  const cur = current();
  widths = { left: clampWidth('left', next.left ?? cur.left), right: clampWidth('right', next.right ?? cur.right) };
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn();
}
export const getPanelWidths = (): Record<Side, number> => current();
/** Read the widths from storage again (the tests; another tab having changed them). */
export function reloadPanelWidths(): void {
  widths = null;
  for (const fn of listeners) fn();
}

/** The panel widths, and a setter that remembers them. */
export function usePanelWidths(): [Record<Side, number>, (side: Side, w: number) => void] {
  const w = useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    current,
  );
  return [w, (side, px) => setPanelWidths({ [side]: px })];
}

/** The strip on a panel's inner edge: drag it, use the arrow keys on it, or double-click it to put the width back. */
export function PanelResizeHandle({ side, width, onWidth }: { side: Side; width: number; onWidth: (w: number) => void }) {
  const name = side === 'left' ? 'layers panel' : 'properties panel';
  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('col-resizing');
    const move = (ev: PointerEvent) => onWidth(side === 'left' ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('col-resizing');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div
      className={`col-resize ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${name}`}
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH[side].min}
      aria-valuemax={PANEL_WIDTH[side].max}
      tabIndex={0}
      title={`Drag to resize the ${name} (double-click to reset)`}
      onPointerDown={start}
      onDoubleClick={() => onWidth(PANEL_WIDTH[side].def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (e.key === grow) onWidth(width + step);
        else if (e.key === shrink) onWidth(width - step);
        else if (e.key === 'Home' || e.key === 'Enter') onWidth(PANEL_WIDTH[side].def);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  );
}
