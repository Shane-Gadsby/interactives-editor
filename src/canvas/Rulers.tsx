import { useRef, useState } from 'react';
import type { Artboard } from 'interactives-player';
import { store } from '../store/store';

const SIZE = 20;

/** A tick spacing that leaves roughly 60-120px between labels at this zoom. */
function stepFor(zoom: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s * zoom >= 60) ?? 10000;
}

function setGuides(abId: string, fn: (g: { x: number[]; y: number[] }) => void, coalesce?: string) {
  store().update(
    (d) => {
      const a = d.artboards.find((x) => x.id === abId);
      if (!a) return;
      a.guides ??= { x: [], y: [] };
      fn(a.guides);
    },
    { coalesce },
  );
}

/**
 * Rulers along the top and left of the canvas, measured from the active artboard's top-left.
 * Drag out of a ruler to make a guide; drag a guide to move it, or back onto the ruler to remove it.
 */
export function Rulers({ ab, zoom, panX, panY, width, height }: { ab: Artboard | undefined; zoom: number; panX: number; panY: number; width: number; height: number }) {
  const [drag, setDrag] = useState<{ axis: 'x' | 'y'; index: number | null; at: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  if (!ab) return null;
  const ox = panX + ab.canvasX * zoom;
  const oy = panY + ab.canvasY * zoom;
  const toLocal = (axis: 'x' | 'y', clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? Math.round((clientX - r.left - ox) / zoom) : Math.round((clientY - r.top - oy) / zoom);
  };
  const overRuler = (axis: 'x' | 'y', clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? clientX - r.left < SIZE : clientY - r.top < SIZE;
  };

  const start = (e: React.PointerEvent, axis: 'x' | 'y', index: number | null) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    const key = `guide-${ab.id}-${Date.now()}`;
    let idx = index;
    const move = (ev: PointerEvent) => {
      const at = toLocal(axis, ev.clientX, ev.clientY);
      setDrag({ axis, index: idx, at });
      if (idx !== null && !overRuler(axis, ev.clientX, ev.clientY)) setGuides(ab.id, (g) => void (g[axis][idx!] = at), key);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDrag(null);
      const at = toLocal(axis, ev.clientX, ev.clientY);
      if (overRuler(axis, ev.clientX, ev.clientY)) {
        if (idx !== null) setGuides(ab.id, (g) => void g[axis].splice(idx!, 1));
      } else if (idx === null) {
        setGuides(ab.id, (g) => void g[axis].push(at));
      }
      store().commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const step = stepFor(zoom);
  const ticks = (len: number, origin: number) => {
    const out: number[] = [];
    const first = Math.floor(-origin / zoom / step) * step;
    for (let v = first; (v - first) * zoom < len + step * zoom; v += step) out.push(v);
    return out;
  };
  const guides = ab.guides ?? { x: [], y: [] };
  // Guides drawn as long thin lines (vertical for x, horizontal for y) with a wider grab zone
  const lines = (['x', 'y'] as const).flatMap((axis) =>
    guides[axis].map((v, i) => {
      const pos = axis === 'x' ? ox + v * zoom : oy + v * zoom;
      return (
        <div
          key={`${axis}${i}`}
          className={`guide-line ${axis}`}
          style={axis === 'x' ? { left: pos - 3 } : { top: pos - 3 }}
          title={`Guide at ${v}px: drag to move, drag onto the ruler to remove`}
          onPointerDown={(e) => start(e, axis, i)}
        />
      );
    }),
  );
  const preview = drag && drag.index === null && (
    <div className={`guide-line ${drag.axis} preview`} style={drag.axis === 'x' ? { left: ox + drag.at * zoom - 3 } : { top: oy + drag.at * zoom - 3 }} />
  );
  return (
    <div ref={root} className="rulers">
      {lines}
      {preview}
      {drag && (
        <div className="guide-pos" style={drag.axis === 'x' ? { left: ox + drag.at * zoom + 6, top: SIZE + 4 } : { top: oy + drag.at * zoom + 6, left: SIZE + 4 }}>
          {drag.at}
        </div>
      )}
      <div className="canvas-ruler top" title="Drag down to make a horizontal guide (Shift+R hides rulers)" onPointerDown={(e) => start(e, 'y', null)}>
        {ticks(width, ox).map((v) => (
          <span key={v} style={{ left: ox + v * zoom }}>
            {v}
          </span>
        ))}
      </div>
      <div className="canvas-ruler left" title="Drag right to make a vertical guide" onPointerDown={(e) => start(e, 'x', null)}>
        {ticks(height, oy).map((v) => (
          <span key={v} style={{ top: oy + v * zoom }}>
            {v}
          </span>
        ))}
      </div>
      <div className="ruler-corner" />
    </div>
  );
}
