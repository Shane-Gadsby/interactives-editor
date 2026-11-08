import { Children, useEffect, useRef, useState, type ReactNode } from 'react';

/** A fixed-width column (resizable) or the one flexible column that takes the rest. */
export type ColumnSpec =
  // `hideBelow`: an extra column (a reference list, say) that goes away while the columns' box is narrower than this many px
  | { width: number; min?: number; max?: number; hideBelow?: number }
  | 'flex';

const load = (id: string): number[] | null => {
  try {
    const v = JSON.parse(localStorage.getItem(`ix-cols:${id}`) ?? 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Columns with draggable dividers between them. Fixed columns keep their width
 * (remembered per `id` in this browser); the 'flex' column takes the rest.
 */
export function SplitColumns({ id, columns, children, className }: { id: string; columns: ColumnSpec[]; children: ReactNode; className?: string }) {
  const [widths, setWidths] = useState<number[]>(() => {
    const saved = load(id);
    return columns.map((c, i) => (c === 'flex' ? 0 : (saved?.[i] ?? c.width)));
  });
  const kids = Children.toArray(children);
  // The box's own width decides which optional columns there is room for (a bottom panel moved into a narrow side area)
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setBoxW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const shown = columns.map((c, i) => i < kids.length && !(c !== 'flex' && c.hideBelow && boxW > 0 && boxW < c.hideBelow));
  const lastShown = shown.lastIndexOf(true);

  const startDrag = (e: React.PointerEvent, divider: number) => {
    e.preventDefault();
    // The divider resizes the fixed column next to it: the one on its left, or on its right if the left one is flexible.
    const target = columns[divider] !== 'flex' ? divider : divider + 1;
    const spec = columns[target];
    if (spec === 'flex' || !spec) return;
    const sign = target === divider ? 1 : -1;
    const x0 = e.clientX;
    const w0 = widths[target];
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.max(spec.min ?? 100, Math.min(spec.max ?? 800, w0 + (ev.clientX - x0) * sign)));
      setWidths((ws) => {
        const next = ws.slice();
        next[target] = w;
        try {
          localStorage.setItem(`ix-cols:${id}`, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div ref={box} className={`split-columns${className ? ` ${className}` : ''}`}>
      {kids.map((child, i) => !shown[i] ? null : (
        <div key={i} className="split-col-wrap" style={columns[i] === 'flex' ? { flex: 1, minWidth: 160 } : { width: widths[i], flex: 'none' }}>
          {child}
          {i < lastShown && (
            <div className="split-divider" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={(e) => startDrag(e, i)} />
          )}
        </div>
      ))}
    </div>
  );
}
