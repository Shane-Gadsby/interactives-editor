import { useRef, useState } from 'react';
import { keyHint } from '../lib/keymap';
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
  const [drag, setDrag] = useState<{ axis: Axis; index: number | null; at: number; scope: GuideScope; out: boolean; cx: number; cy: number } | null>(null);
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

  //Past the page (or over the ruler) is where letting go removes a guide, or drops a new one. It is only decided on
  //release: while the pointer is out there the guide stays where it last was on the page, so nothing goes mid-drag
  const outside = (axis: Axis, clientX: number, clientY: number, at: number) => overRuler(axis, clientX, clientY) || at < 0 || at > (axis === 'x' ? ab.width : ab.height);

  const start = (e: React.PointerEvent, axis: Axis, ref: GuideRef | null) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button === 2) return;
    if (locked) {
      store().toast('The guides are locked. Unlock them from the button in the corner of the rulers.', 'info');
      return;
    }
    const key = `guide-${ab.id}-${Date.now()}`;
    // a new guide is the kind the corner menu says, or the other kind with Alt held
    const base = getGuideScope();
    const scope: GuideScope = ref ? ref.scope : e.altKey ? (base === 'project' ? 'page' : 'project') : base;
    //on the window, not the guide's own element: a guide can stop being drawn while it is dragged, and the drag must not
    //go with it
    const move = (ev: PointerEvent) => {
      const at = toLocal(axis, ev.clientX, ev.clientY);
      const out = outside(axis, ev.clientX, ev.clientY, at);
      setDrag({ axis, index: ref ? ref.index : null, at, scope, out, cx: ev.clientX, cy: ev.clientY });
      if (ref && !out) store().update((d) => moveGuide(d, ab.id, ref, at), { coalesce: key });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setDrag(null);
      const at = toLocal(axis, ev.clientX, ev.clientY);
      const out = outside(axis, ev.clientX, ev.clientY, at);
      if (ref && out) store().update((d) => removeGuide(d, ab.id, ref));
      else if (!ref && !out) store().update((d) => addGuide(d, ab.id, scope, axis, at));
      store().commit();
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setDrag(null);
      store().commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
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
        className={`guide-line ${g.axis} ${g.scope}${locked ? ' locked' : ''}${drag?.out && drag.index === g.index && drag.axis === g.axis && drag.scope === g.scope ? ' removing' : ''}`}
        style={{ ...(g.axis === 'x' ? { left: pos - 3 } : { top: pos - 3 }), ...along }}
        title={`${g.scope === 'project' ? 'Guide for every page' : 'Guide for this page only'} at ${g.at}px: ${locked ? 'locked. Right-click for the guides menu' : 'drag to move, drag off the page (or onto the ruler) and let go to remove, right-click for more'}`}
        onPointerDown={(e) => start(e, g.axis, g)}
        onContextMenu={(e) => guideMenu(e, g)}
      />
    );
  });
  const preview = drag && drag.index === null && !drag.out && (
    <div
      className={`guide-line ${drag.axis} ${drag.scope} preview`}
      style={{ ...(drag.axis === 'x' ? { left: ox + drag.at * zoom - 3, top: oy - reach, height: ab.height * zoom + reach * 2, bottom: 'auto' } : { top: oy + drag.at * zoom - 3, left: ox - reach, width: ab.width * zoom + reach * 2, right: 'auto' }) }}
    />
  );
  return (
    <div ref={root} className="rulers">
      {lines}
      {preview}
      {drag?.out && root.current && (
        <div className="guide-remove-hint" role="status" style={{ left: drag.cx - root.current.getBoundingClientRect().left + 14, top: drag.cy - root.current.getBoundingClientRect().top + 14 }}>
          {drag.index === null ? 'Let go here and no guide is made' : 'Let go to remove this guide'}
        </div>
      )}
      {drag && !drag.out && (
        <div className="guide-pos" style={drag.axis === 'x' ? { left: ox + drag.at * zoom + 6, top: SIZE + 4 } : { top: oy + drag.at * zoom + 6, left: SIZE + 4 }}>
          {drag.at}
        </div>
      )}
      <div className="canvas-ruler top" title={`Drag down to make a horizontal guide${keyHint('toggle-rulers') ? ` (${keyHint('toggle-rulers')} hides rulers)` : ''}. Hold Alt for the other kind: every page or this page only`} onPointerDown={(e) => start(e, 'y', null)}>
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
