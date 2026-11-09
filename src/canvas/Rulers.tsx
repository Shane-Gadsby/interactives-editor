import { useRef, useState } from 'react';
import type { Artboard } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { GUIDE_REACH, addGuide, convertGuide, getGuideScope, guidesMenuItems, guidesOn, moveGuide, removeGuide, type Axis, type GuideRef, type GuideScope } from '../lib/guides';

const SIZE = 20;

/** A tick spacing that leaves roughly 60-120px between labels at this zoom. */
function stepFor(zoom: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s * zoom >= 60) ?? 10000;
}

/**
 * Rulers along the top and left of the canvas, measured from the active artboard's top-left.
 * Drag out of a ruler to make a guide; drag a guide to move it, or back onto the ruler to remove it. A guide is either for
 * every page (a project guide, dashed) or for this page only (solid): the corner button and a guide's right-click menu
 * choose, and Alt while dragging out a new one gives the other kind. The guides of the other pages are drawn by the canvas.
 */
export function Rulers({ ab, zoom, panX, panY, width, height }: { ab: Artboard | undefined; zoom: number; panX: number; panY: number; width: number; height: number }) {
  const [drag, setDrag] = useState<{ axis: Axis; index: number | null; at: number; scope: GuideScope } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const project = useEditor((st) => st.project);
  const root = useRef<HTMLDivElement>(null);
  if (!ab) return null;
  const locked = !!project.guidesLocked;
  const ox = panX + ab.canvasX * zoom;
  const oy = panY + ab.canvasY * zoom;
  const toLocal = (axis: Axis, clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? Math.round((clientX - r.left - ox) / zoom) : Math.round((clientY - r.top - oy) / zoom);
  };
  const overRuler = (axis: Axis, clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? clientX - r.left < SIZE : clientY - r.top < SIZE;
  };

  const start = (e: React.PointerEvent, axis: Axis, ref: GuideRef | null) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button === 2) return;
    if (locked) {
      store().toast('The guides are locked. Unlock them from the button in the corner of the rulers.', 'info');
      return;
    }
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    const key = `guide-${ab.id}-${Date.now()}`;
    // a new guide is the kind the corner menu says, or the other kind with Alt held
    const base = getGuideScope();
    const scope: GuideScope = ref ? ref.scope : e.altKey ? (base === 'project' ? 'page' : 'project') : base;
    const move = (ev: PointerEvent) => {
      const at = toLocal(axis, ev.clientX, ev.clientY);
      setDrag({ axis, index: ref ? ref.index : null, at, scope });
      if (ref && !overRuler(axis, ev.clientX, ev.clientY)) store().update((d) => moveGuide(d, ab.id, ref, at), { coalesce: key });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDrag(null);
      const at = toLocal(axis, ev.clientX, ev.clientY);
      if (overRuler(axis, ev.clientX, ev.clientY)) {
        if (ref) store().update((d) => removeGuide(d, ab.id, ref));
      } else if (!ref) {
        store().update((d) => addGuide(d, ab.id, scope, axis, at));
      }
      store().commit();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const guideMenu = (e: React.MouseEvent, g: GuideRef) => {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [
      { heading: `${g.axis === 'x' ? 'Vertical' : 'Horizontal'} guide at ${g.at} px, ${g.scope === 'project' ? 'on every page' : 'on this page only'}` },
      g.scope === 'page'
        ? { label: 'Show on every page', title: 'Make it a project guide: it shows on every page it fits', disabled: locked, onClick: () => store().update((d) => convertGuide(d, ab.id, g, 'project')) }
        : { label: 'Keep on this page only', title: 'Make it a page guide: the other pages stop showing it', disabled: locked, onClick: () => store().update((d) => convertGuide(d, ab.id, g, 'page')) },
      { label: 'Remove guide', danger: true, disabled: locked, onClick: () => store().update((d) => removeGuide(d, ab.id, g)) },
      { separator: true },
      ...guidesMenuItems(ab.id),
    ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const cornerMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: e.clientX || r.right, y: e.clientY || r.bottom, items: guidesMenuItems(ab.id) });
  };

const step = stepFor(zoom);
  const ticks = (len: number, origin: number) => {
    const out: number[] = [];
    const first = Math.floor(-origin / zoom / step) * step;
    for (let v = first; (v - first) * zoom < len + step * zoom; v += step) out.push(v);
    return out;
  };
  // Guides are drawn as thin lines the length of the page (and a little past it) with a wider grab zone
  const reach = GUIDE_REACH;
  const lines = guidesOn(project, ab).map((g) => {
    const pos = (g.axis === 'x' ? ox : oy) + g.at * zoom;
    const along = g.axis === 'x' ? { top: oy - reach, height: ab.height * zoom + reach * 2, bottom: 'auto' } : { left: ox - reach, width: ab.width * zoom + reach * 2, right: 'auto' };
    return (
      <div
        key={`${g.scope}-${g.axis}${g.index}`}
        className={`guide-line ${g.axis} ${g.scope}${locked ? ' locked' : ''}`}
        style={{ ...(g.axis === 'x' ? { left: pos - 3 } : { top: pos - 3 }), ...along }}
        title={`${g.scope === 'project' ? 'Guide for every page' : 'Guide for this page only'} at ${g.at}px: ${locked ? 'locked. Right-click for the guides menu' : 'drag to move, drag onto the ruler to remove, right-click for more'}`}
        onPointerDown={(e) => start(e, g.axis, g)}
        onContextMenu={(e) => guideMenu(e, g)}
      />
    );
  });
  const preview = drag && drag.index === null && (
    <div
      className={`guide-line ${drag.axis} ${drag.scope} preview`}
      style={{ ...(drag.axis === 'x' ? { left: ox + drag.at * zoom - 3, top: oy - reach, height: ab.height * zoom + reach * 2, bottom: 'auto' } : { top: oy + drag.at * zoom - 3, left: ox - reach, width: ab.width * zoom + reach * 2, right: 'auto' }) }}
    />
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
      <div className="canvas-ruler top" title="Drag down to make a horizontal guide (Shift+R hides rulers). Hold Alt for the other kind: every page or this page only" onPointerDown={(e) => start(e, 'y', null)}>
        {ticks(width, ox).map((v) => (
          <span key={v} style={{ left: ox + v * zoom }}>
            {v}
          </span>
        ))}
      </div>
      <div className="canvas-ruler left" title="Drag right to make a vertical guide. Hold Alt for the other kind: every page or this page only" onPointerDown={(e) => start(e, 'x', null)}>
        {ticks(height, oy).map((v) => (
          <span key={v} style={{ top: oy + v * zoom }}>
            {v}
          </span>
        ))}
      </div>
      <button className="ruler-corner" aria-label="Guides menu" aria-haspopup="menu" title="Guides: choose whether new ones are for every page or this page only, lock them, or clear them" onPointerDown={(e) => e.stopPropagation()} onClick={cornerMenu} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
