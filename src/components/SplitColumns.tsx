import { Children, useState, type ReactNode } from 'react';

/** A fixed-width column (resizable) or the one flexible column that takes the rest. */
export type ColumnSpec = { width: number; min?: number; max?: number } | 'flex';

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
    <div className={`split-columns${className ? ` ${className}` : ''}`}>
      {kids.map((child, i) => (
        <div key={i} className="split-col-wrap" style={columns[i] === 'flex' ? { flex: 1, minWidth: 0 } : { width: widths[i], flex: 'none' }}>
          {child}
          {i < kids.length - 1 && (
            <div className="split-divider" role="separator" aria-orientation="vertical" title="Drag to resize" onPointerDown={(e) => startDrag(e, i)} />
          )}
        </div>
      ))}
    </div>
  );
}
