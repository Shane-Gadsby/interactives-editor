/**
 * Picking something up by its header and dropping it between its neighbours (inspector sections, the tool rail's groups and the
 * tools inside one). Pointer based, so it behaves the same everywhere: a press that moves more than a few pixels becomes a drag,
 * a gold line shows where it will land, the list scrolls itself near an edge, and Escape puts it back. Touch is left to scroll
 * the panel (the keyboard and the context menu do the moving there).
 */

export type Layout = 'column' | 'row' | 'grid';
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a drop at the pointer lands: the gap it is in (0 to n, before the item at that index) and the line to draw for it. */
export function gapAt(boxes: Box[], x: number, y: number, layout: Layout): { gap: number; line: Box } {
  const n = boxes.length;
  if (!n) return { gap: 0, line: { left: x, top: y, right: x, bottom: y } };
  const union = boxes.reduce((u, b) => ({ left: Math.min(u.left, b.left), top: Math.min(u.top, b.top), right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) }));
  if (layout === 'grid') {
    // the nearest item, and its before or after side depending on which half of it the pointer is in
    let best = 0;
    let bestD = Infinity;
    boxes.forEach((b, i) => {
      const dx = Math.max(b.left - x, 0, x - b.right);
      const dy = Math.max(b.top - y, 0, y - b.bottom);
      const d = dx * dx + dy * dy;
      if (d < bestD) [best, bestD] = [i, d];
    });
    const b = boxes[best];
    const after = x > (b.left + b.right) / 2;
    const at = after ? b.right + 1 : b.left - 1;
    return { gap: best + (after ? 1 : 0), line: { left: at, right: at, top: b.top, bottom: b.bottom } };
  }
  const vertical = layout === 'column';
  const mid = (b: Box) => (vertical ? (b.top + b.bottom) / 2 : (b.left + b.right) / 2);
  const p = vertical ? y : x;
  let gap = 0;
  boxes.forEach((b) => {
    if (mid(b) < p) gap++;
  });
  const edge = (i: number) => (vertical ? boxes[i].top : boxes[i].left);
  const far = (i: number) => (vertical ? boxes[i].bottom : boxes[i].right);
  const at = gap === 0 ? edge(0) : gap === n ? far(n - 1) : (far(gap - 1) + edge(gap)) / 2;
  return { gap, line: vertical ? { left: union.left, right: union.right, top: at, bottom: at } : { left: at, right: at, top: union.top, bottom: union.bottom } };
}

/** The place the item at `from` ends up when it is dropped in `gap` (the list with it taken out). */
export const landing = (from: number, gap: number): number => (gap > from ? gap - 1 : gap);

const THRESHOLD = 5;
let busy = false;

export interface DragConfig {
  /** The press that may become a drag. */
  event: { clientX: number; clientY: number; button: number; pointerType: string; pointerId: number };
  /** The thing being moved (it dims while it is carried). */
  el: HTMLElement;
  /** What the little label under the pointer says. */
  label: string;
  /** Every item in its group in the order they show, the moved one included. */
  items: () => HTMLElement[];
  layout: Layout;
  /** Dropped somewhere new: the place it ends up in the list. */
  onMove: (to: number) => void;
}

const scroller = (el: HTMLElement | null): HTMLElement | null => {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
};

/** Start listening for a drag from a press. Does nothing for touch (it scrolls), a non-primary button or a second drag at once. */
export function armReorderDrag(cfg: DragConfig): void {
  const { event, el } = cfg;
  if (busy || event.button !== 0 || event.pointerType === 'touch') return;
  const x0 = event.clientX;
  const y0 = event.clientY;
  let x = x0;
  let y = y0;
  let on = false;
  let line: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let gap = -1;
  let raf = 0;
  let from = 0;
  const box = (e: HTMLElement): Box => e.getBoundingClientRect();

  const place = () => {
    const items = cfg.items();
    from = items.indexOf(el);
    const hit = gapAt(items.map(box), x, y, cfg.layout);
    gap = hit.gap;
    if (line) {
      const l = hit.line;
      const same = landing(from, gap) === from;
      line.classList.toggle('noop', same);
      const thick = 3;
      Object.assign(line.style, {
        left: `${l.left - (l.left === l.right ? thick / 2 : 0)}px`,
        top: `${l.top - (l.top === l.bottom ? thick / 2 : 0)}px`,
        width: l.left === l.right ? `${thick}px` : `${l.right - l.left}px`,
        height: l.top === l.bottom ? `${thick}px` : `${l.bottom - l.top}px`,
      });
    }
    if (ghost) ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  };
  const tick = () => {
    if (!on) return;
    // near the top or bottom edge of the scrolling panel it scrolls itself, faster the nearer the edge
    const s = scroller(el);
    if (s) {
      const r = s.getBoundingClientRect();
      const zone = 36;
      const by = y < r.top + zone ? -Math.ceil((r.top + zone - y) / 4) : y > r.bottom - zone ? Math.ceil((y - (r.bottom - zone)) / 4) : 0;
      if (by) s.scrollTop += by;
    }
    place();
    raf = requestAnimationFrame(tick);
  };
  const begin = () => {
    on = true;
    busy = true;
    el.classList.add('reorder-lifted');
    document.body.classList.add('reorder-active');
    line = document.createElement('div');
    line.className = 'reorder-line';
    line.setAttribute('aria-hidden', 'true');
    ghost = document.createElement('div');
    ghost.className = 'reorder-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = cfg.label;
    document.body.append(line, ghost);
    place();
    raf = requestAnimationFrame(tick);
  };
  const end = (drop: boolean) => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('keydown', key, true);
    if (!on) return;
    cancelAnimationFrame(raf);
    el.classList.remove('reorder-lifted');
    document.body.classList.remove('reorder-active');
    line?.remove();
    ghost?.remove();
    busy = false;
    // the press that ended the drag would click whatever is under it: swallow that one click
    const eat = (e: Event) => (e.stopPropagation(), e.preventDefault());
    window.addEventListener('click', eat, true);
    setTimeout(() => window.removeEventListener('click', eat, true), 0);
    if (drop && gap >= 0 && landing(from, gap) !== from) cfg.onMove(landing(from, gap));
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return;
    x = e.clientX;
    y = e.clientY;
    if (!on && Math.hypot(x - x0, y - y0) >= THRESHOLD) begin();
    else if (on) place();
  };
  const up = (e: PointerEvent) => e.pointerId === event.pointerId && end(true);
  const cancel = (e: PointerEvent) => e.pointerId === event.pointerId && end(false);
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    end(false);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('keydown', key, true);
}
