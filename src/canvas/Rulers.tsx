import { useRef, useState } from 'react';
import { keyHint } from '../lib/keymap';
import type { Artboard } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { usePrefs } from '../lib/prefs';
import { addGuide, addUniversalGuide, attachToPage, guidesMenuItems, guidesOf, makeUniversal, moveGuide, moveUniversalGuide, pageForUniversal, removeGuide, removeUniversalGuide, universalGuidesOf, type Axis, type GuideKind, type GuideRef } from '../lib/guides';

const SIZE = 20;
//How far past its own page an attached guide can still be grabbed
const GUIDE_REACH = 32;

/** A tick spacing that leaves roughly 60-120px between labels at this zoom. */
function stepFor(zoom: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s * zoom >= 60) ?? 10000;
}

type Drag = { axis: Axis; kind: GuideKind; index: number | null; at: number; out: boolean; cx: number; cy: number; abId: string };

/**
 * Rulers along the top and left of the canvas, measured from the active artboard's top-left.
 * Drag out of a ruler to make a guide. A new guide is universal (fixed on the canvas, canvas coordinates) unless the "attach new
 * guides" preference is on, and Alt while dragging gives the other kind: an attached guide belongs to the page it is dropped on and
 * moves with it. Both are one endless dashed line across the canvas. Drag a guide to move it; let go onto the ruler to remove either
 * kind, an attached one also off its page, a universal one also off the edge of the canvas.
 * Every universal guide is drawn (and grabbable along its whole length) here; the open page's attached guides too, but the other
 * pages' are drawn by the canvas, dimmer, and can't be grabbed until that page is open.
 */
export function Rulers({ ab, zoom, panX, panY, width, height }: { ab: Artboard | undefined; zoom: number; panX: number; panY: number; width: number; height: number }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const project = useEditor((st) => st.project);
  const attachNew = usePrefs().attachGuides;
  const root = useRef<HTMLDivElement>(null);
  if (!ab) return null;
  const locked = !!project.guidesLocked;
  const ox = panX + ab.canvasX * zoom;
  const oy = panY + ab.canvasY * zoom;
  const toLocal = (axis: Axis, clientX: number, clientY: number, on: Artboard = ab) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? Math.round((clientX - r.left - panX - on.canvasX * zoom) / zoom) : Math.round((clientY - r.top - panY - on.canvasY * zoom) / zoom);
  };
  //the same in canvas pixels, for a universal guide
  const toCanvas = (axis: Axis, clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? Math.round((clientX - r.left - panX) / zoom) : Math.round((clientY - r.top - panY) / zoom);
  };
  //a universal guide's number is where it is on the open page, so the rulers and the guides read the same
  const onOpenPage = (axis: Axis, canvasAt: number) => canvasAt - (axis === 'x' ? ab.canvasX : ab.canvasY);
  //The page under the pointer, so a new guide goes on whichever page it is dragged over, not only the open one
  const pageAt = (clientX: number, clientY: number): Artboard | undefined => {
    const r = root.current!.getBoundingClientRect();
    const x = (clientX - r.left - panX) / zoom;
    const y = (clientY - r.top - panY) / zoom;
    return project.artboards.find((a) => !a.canvasHidden && x >= a.canvasX && x <= a.canvasX + a.width && y >= a.canvasY && y <= a.canvasY + a.height);
  };
  const overRuler = (axis: Axis, clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return axis === 'x' ? clientX - r.left < SIZE : clientY - r.top < SIZE;
  };
  //past the edge of the canvas itself
  const offCanvas = (clientX: number, clientY: number) => {
    const r = root.current!.getBoundingClientRect();
    return clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom;
  };

  //Past the page (or over the ruler) is where letting go removes an attached guide, or drops a new one. It is only decided on
  //release: while the pointer is out there the guide stays where it last was on the page, so nothing goes mid-drag.
  //A universal guide has no page to be off: its edge is the ruler or the edge of the canvas
  const outside = (axis: Axis, clientX: number, clientY: number, at: number, on: Artboard = ab) => overRuler(axis, clientX, clientY) || at < 0 || at > (axis === 'x' ? on.width : on.height);
  const outsideCanvas = (axis: Axis, clientX: number, clientY: number) => overRuler(axis, clientX, clientY) || offCanvas(clientX, clientY);

  const start = (e: React.PointerEvent, axis: Axis, ref: GuideRef | null) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button === 2) return;
    if (locked) {
      store().toast('The guides are locked. Unlock them from the button in the corner of the rulers.', 'info');
      return;
    }
    const key = `guide-${ab.id}-${Date.now()}`;
    //Alt while dragging a new guide gives the other kind from the preference, for that one guide
    let alt = e.altKey;
    const kindNow = (): GuideKind => (ref ? ref.kind : attachNew !== alt ? 'page' : 'universal');
    //on the window, not the guide's own element: a guide can stop being drawn while it is dragged, and the drag must not
    //go with it
    //A new attached guide follows the page under the pointer (and stays with the last one while it is between pages);
    //a guide that already exists stays on its own page
    let on: Artboard = ab;
    let last = { x: e.clientX, y: e.clientY };
    const where = (x: number, y: number) => {
      const kind = kindNow();
      //a new guide follows the page under the pointer either way: it is the page an attached one lands on, and the one the hint names
      if (!ref) on = pageAt(x, y) ?? on;
      if (kind === 'universal') {
        const at = toCanvas(axis, x, y);
        return { kind, at, out: outsideCanvas(axis, x, y) };
      }
      const at = toLocal(axis, x, y, on);
      return { kind, at, out: outside(axis, x, y, at, on) };
    };
    const move = (ev: PointerEvent) => {
      alt = ev.altKey;
      last = { x: ev.clientX, y: ev.clientY };
      show();
    };
    const show = () => {
      const w = where(last.x, last.y);
      setDrag({ axis, kind: w.kind, index: ref ? ref.index : null, at: w.at, out: w.out, cx: last.x, cy: last.y, abId: on.id });
      if (ref && !w.out) store().update((d) => (ref.kind === 'universal' ? moveUniversalGuide(d, ref, w.at) : moveGuide(d, ab.id, ref, w.at)), { coalesce: key });
    };
    //pressing or letting go of Alt without moving still changes what the guide will be
    const keys = (ev: KeyboardEvent) => {
      if (ev.key !== 'Alt' || ref) return;
      alt = ev.type === 'keydown';
      show();
    };
    const up = (ev: PointerEvent) => {
      end();
      alt = ev.altKey;
      const w = where(ev.clientX, ev.clientY);
      if (ref && w.out) store().update((d) => (ref.kind === 'universal' ? removeUniversalGuide(d, ref) : removeGuide(d, ab.id, ref)));
      else if (!ref && !w.out) {
        if (w.kind === 'universal') store().update((d) => addUniversalGuide(d, axis, w.at));
        else {
          store().update((d) => addGuide(d, on.id, axis, w.at));
          //the rulers measure from the page the guide went on
          if (on.id !== ab.id) store().set({ activeArtboardId: on.id });
        }
      }
      store().commit();
    };
    const cancel = () => {
      end();
      store().commit();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', keys);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', keys);
  };

  const guideMenu = (e: React.MouseEvent, g: GuideRef) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = g.axis === 'x' ? 'Vertical' : 'Horizontal';
    const items: MenuItem[] = [];
    if (g.kind === 'page') {
      items.push(
        { heading: `${dir} guide at ${g.at} px, attached to ${ab.name}` },
        { label: 'Remove guide', danger: true, disabled: locked, onClick: () => store().update((d) => removeGuide(d, ab.id, g)) },
        { label: 'Make it universal', title: 'Fix it on the canvas where it is now, so it stays put when this page is moved', disabled: locked, onClick: () => store().update((d) => makeUniversal(d, ab.id, g)) },
      );
    } else {
      const page = pageForUniversal(project, g, ab.id);
      items.push(
        { heading: `${dir} guide at ${onOpenPage(g.axis, g.at)} px on ${ab.name}, universal` },
        { label: 'Remove guide', danger: true, disabled: locked, onClick: () => store().update((d) => removeUniversalGuide(d, g)) },
        {
          label: page ? `Attach to ${page.name}` : 'Attach to a page',
          title: page ? 'Tie it to this page, so it moves with it' : 'This guide does not cross any page, so there is nothing to attach it to',
          disabled: locked || !page,
          onClick: () => page && store().update((d) => attachToPage(d, page.id, g)),
        },
      );
    }
    items.push({ separator: true }, ...guidesMenuItems(ab.id));
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const cornerMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: e.clientX || r.right, y: e.clientY || r.bottom, items: guidesMenuItems(ab.id) });
  };

  const step = stepFor(zoom);
  const newTip = attachNew ? 'It attaches to the page it is dropped on and moves with it (hold Alt for a universal guide, fixed on the canvas)' : 'It is universal, fixed on the canvas, and stays put when pages move (hold Alt to attach it to the page it is dropped on)';
  const ticks = (len: number, origin: number) => {
    const out: number[] = [];
    const first = Math.floor(-origin / zoom / step) * step;
    for (let v = first; (v - first) * zoom < len + step * zoom; v += step) out.push(v);
    return out;
  };
  // Guides are endless: thin lines across the whole canvas, with a wider grab zone
  const same = (g: GuideRef) => !!drag && drag.index === g.index && drag.axis === g.axis && drag.kind === g.kind;
  //the open page's attached guides: grabbable over that page (and a little past it), so they never get in the way of clicking
  //layers on the pages they cross
  const lines = guidesOf(ab).map((g) => {
    const pos = (g.axis === 'x' ? ox : oy) + g.at * zoom;
    return (
      <div
        key={`${g.axis}${g.index}`}
        className={`guide-line ${g.axis}${locked ? ' locked' : ''}${drag?.out && same(g) ? ' removing' : ''}`}
        style={g.axis === 'x' ? { left: pos - 3 } : { top: pos - 3 }}
        title={`Guide at ${g.at}px, attached to ${ab.name} (it moves with the page), a line across the whole canvas: ${locked ? 'locked. Right-click for the guides menu' : 'drag to move, drag off this page (or onto the ruler) and let go to remove, right-click for more'}`}
        onPointerDown={(e) => start(e, g.axis, g)}
        onContextMenu={(e) => guideMenu(e, g)}
      >
        <span className="guide-grab" style={g.axis === 'x' ? { top: oy - GUIDE_REACH, height: ab.height * zoom + GUIDE_REACH * 2 } : { left: ox - GUIDE_REACH, width: ab.width * zoom + GUIDE_REACH * 2 }} />
      </div>
    );
  });
  //universal guides: fixed on the canvas, so they are drawn whichever page is open, and grabbed anywhere along their length
  const loose = universalGuidesOf(project).map((g) => {
    const pos = (g.axis === 'x' ? panX : panY) + g.at * zoom;
    const rel = onOpenPage(g.axis, g.at);
    return (
      <div
        key={`u${g.axis}${g.index}`}
        className={`guide-line universal ${g.axis}${locked ? ' locked' : ''}${drag?.out && same(g) ? ' removing' : ''}`}
        style={g.axis === 'x' ? { left: pos - 3 } : { top: pos - 3 }}
        title={`Universal guide at ${rel}px on ${ab.name}, fixed on the canvas (it stays put when pages move): ${locked ? 'locked. Right-click for the guides menu' : 'drag to move, drag onto the ruler or off the canvas and let go to remove, right-click for more'}`}
        onPointerDown={(e) => start(e, g.axis, g)}
        onContextMenu={(e) => guideMenu(e, g)}
      >
        <span className="guide-grab" />
      </div>
    );
  });
  //the new guide is drawn where it is dragged: on the page it is over (attached), or at the canvas position (universal)
  const pv = drag ? project.artboards.find((a) => a.id === drag.abId) ?? ab : ab;
  const pox = panX + pv.canvasX * zoom;
  const poy = panY + pv.canvasY * zoom;
  const dragAt = drag ? (drag.kind === 'universal' ? (drag.axis === 'x' ? panX : panY) + drag.at * zoom : (drag.axis === 'x' ? pox : poy) + drag.at * zoom) : 0;
  //the number shown is measured on the open page for a universal guide, like the rulers
  const dragNumber = drag ? (drag.kind === 'universal' ? onOpenPage(drag.axis, drag.at) : drag.at) : 0;
  const preview = drag && drag.index === null && !drag.out && <div className={`guide-line ${drag.axis} preview${drag.kind === 'universal' ? ' universal' : ''}`} style={drag.axis === 'x' ? { left: dragAt - 3 } : { top: dragAt - 3 }} />;
  const box = root.current?.getBoundingClientRect();
  return (
    <div ref={root} className="rulers">
      {loose}
      {lines}
      {preview}
      {drag?.out && box && (
        <div className="guide-remove-hint" role="status" style={{ left: drag.cx - box.left + 14, top: drag.cy - box.top + 14 }}>
          {drag.index === null ? 'Let go here and no guide is made' : 'Let go to remove this guide'}
        </div>
      )}
      {drag && !drag.out && (
        <div className="guide-pos" style={drag.axis === 'x' ? { left: dragAt + 6, top: SIZE + 4 } : { top: dragAt + 6, left: SIZE + 4 }}>
          {dragNumber}
        </div>
      )}
      {drag && !drag.out && drag.index === null && box && (
        <div className="guide-kind-hint" role="status" style={{ left: drag.cx - box.left + 14, top: drag.cy - box.top + 14 }}>
          {drag.kind === 'universal' ? `Universal guide, fixed on the canvas. Hold Alt to attach it to ${pv.name}` : `Attached to ${pv.name}, moves with it. Hold Alt for a universal guide`}
        </div>
      )}
      <div className="canvas-ruler top" title={`Drag down to make a horizontal guide, a line across the whole canvas. ${newTip}${keyHint('toggle-rulers') ? ` (${keyHint('toggle-rulers')} hides rulers)` : ''}`} onPointerDown={(e) => start(e, 'y', null)}>
        {ticks(width, ox).map((v) => (
          <span key={v} style={{ left: ox + v * zoom }}>
            {v}
          </span>
        ))}
      </div>
      <div className="canvas-ruler left" title={`Drag right to make a vertical guide, a line across the whole canvas. ${newTip}`} onPointerDown={(e) => start(e, 'x', null)}>
        {ticks(height, oy).map((v) => (
          <span key={v} style={{ top: oy + v * zoom }}>
            {v}
          </span>
        ))}
      </div>
      <button className="ruler-corner" aria-label="Guides menu" aria-haspopup="menu" title="Guides: lock them, or clear this page's, the universal ones or all of them" onPointerDown={(e) => e.stopPropagation()} onClick={cornerMenu} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
