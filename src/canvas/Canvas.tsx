import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  apply,
  createNode,
  invert,
  isContainer,
  nodeMatrix,
  pathBounds,
  polygonPoints,
  starPoints,
  subPathsToD,
  sampleArtboard,
  uid,
  defaultParams,
  applyConstraints,
  type Artboard,
  type Matrix,
  type NodeType,
  type PathNode,
  type PathPoint,
  type SceneNode,
} from 'interactives-player';
import { store, useEditor, type Tool } from '../store/store';
import { getArtboard, hitTest, locate, nodeCorners, nodeToArtboard, parentToArtboard, selectionBounds, topmost, type Rect } from '../store/doc';
import { assetUrls } from '../lib/assets';
import { dataCache } from '../lib/data';
import { prefs, setPrefs, usePrefs } from '../lib/prefs';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { copySelection, pasteNodes } from '../lib/clipboard';
import { openHelp } from '../help/Help';
import { Rulers } from './Rulers';
import { Icons } from '../components/icons';
import { freehandToPath } from './freehand';
import { ArtboardView } from './ArtboardView';
import { HANDLE_POS, HANDLES, normalizePath, placeBox, resizeBox, scalePaths, type Handle } from './transform';
import { insertFiles } from '../lib/insert';
import { liveSession } from '../lib/live';

type Pt = { x: number; y: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'move'; abId: string; start: Pt; items: { id: string; x0: number; y0: number; inv: Matrix }[]; bounds0: Rect; alt: boolean; duplicated: boolean; moved: boolean }
  | { kind: 'resize'; handle: Handle; id: string; node0: SceneNode; parentM: Matrix }
  | { kind: 'resizeMulti'; handle: Handle; bounds0: Rect; items: { id: string; node0: SceneNode; off: Pt }[] }
  | { kind: 'rotate'; center: Pt; angle0: number; items: { id: string; r0: number }[] }
  | { kind: 'moveAb'; id: string; x0: number; y0: number; start: Pt }
  | { kind: 'resizeAb'; handle: Handle; id: string; ab0: Artboard }
  | { kind: 'create'; tool: Tool; abId: string | null; start: Pt; parentId: string | null }
  | { kind: 'marquee'; abId: string | null; start: Pt; additive: string[] }
  | { kind: 'penHandle'; index: number }
  | { kind: 'pencil'; abId: string; points: Pt[] }
  | { kind: 'pathPoint'; si: number; pi: number; start: Pt; node0: PathNode; parentM: Matrix }
  | { kind: 'pathHandle'; si: number; pi: number; which: 'in' | 'out'; node0: PathNode; parentM: Matrix; mirror: boolean };

const CREATE_TYPES: Partial<Record<Tool, NodeType>> = {
  rect: 'rect',
  ellipse: 'ellipse',
  polygon: 'polygon',
  star: 'star',
  text: 'text',
  frame: 'frame',
  button: 'button',
  input: 'input',
  link: 'link',
  embed: 'embed',
  video: 'video',
};

const SNAP_PX = 6;

export function Canvas() {
  const peers = useEditor((st) => st.peers);
  const s = useEditor((st) => ({
    project: st.project,
    activeArtboardId: st.activeArtboardId,
    selection: st.selection,
    artboardSelected: st.artboardSelected,
    tool: st.tool,
    zoom: st.zoom,
    panX: st.panX,
    panY: st.panY,
    editingPathId: st.editingPathId,
    editingTextId: st.editingTextId,
    focusId: st.focusId,
    bottomTab: st.bottomTab,
    activeTimelineId: st.activeTimelineId,
    playhead: st.playhead,
  }));
  const assetVersion = useSyncExternalStore(
    (fn) => assetUrls.subscribe(fn),
    () => assetUrls.version,
  );
  const dataVersion = useSyncExternalStore(
    (fn) => dataCache.subscribe(fn),
    () => dataCache.version,
  );
  useEffect(() => dataCache.sync(s.project), [s.project.dataSources, assetVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const vp = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pencil, setPencil] = useState<Pt[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [lockedHover, setLockedHover] = useState<{ abId: string; id: string } | null>(null);
  const lockedSeen = useRef<number | null>(null);
  const [box, setBoxState] = useState<{ abId: string | null; rect: Rect } | null>(null); // marquee / create preview
  // Mirrored in a ref: a quick click can fire pointerup before React re-renders with the new box.
  const boxRef = useRef(box);
  const setBox = (b: typeof box) => {
    boxRef.current = b;
    setBoxState(b);
  };
  const [guides, setGuides] = useState<{ abId: string; x: number[]; y: number[] } | null>(null);
  const [pen, setPen] = useState<{ abId: string; points: PathPoint[]; cursor: Pt | null } | null>(null);
  const [selPoint, setSelPoint] = useState<{ si: number; pi: number } | null>(null);
  const penRef = useRef(pen);
  penRef.current = pen;

  const { project, zoom, panX, panY } = s;
  const baseActive = getArtboard(project, s.activeArtboardId);
  const timeline = s.bottomTab === 'timeline' ? baseActive?.timelines.find((t) => t.id === s.activeTimelineId) ?? null : null;
  // While a timeline is open the canvas shows its frame at the playhead, so outlines and handles follow that frame too.
  // Constrained layers are drawn where their constraints put them, so their outlines go there too.
  const active = useMemo(() => {
    if (!baseActive) return baseActive;
    const kids = timeline ? sampleArtboard(baseActive.children, timeline, s.playhead) : baseActive.children;
    const placed = applyConstraints(kids);
    return placed === baseActive.children ? baseActive : { ...baseActive, children: placed };
  }, [baseActive, timeline, s.playhead]);

  // ---------------------------------------------------------------- coordinates

  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const r = vp.current!.getBoundingClientRect();
      return { x: (cx - r.left - panX) / zoom, y: (cy - r.top - panY) / zoom };
    },
    [panX, panY, zoom],
  );
  const abAt = (w: Pt): Artboard | undefined =>
    [...project.artboards].reverse().find((a) => w.x >= a.canvasX && w.y >= a.canvasY && w.x <= a.canvasX + a.width && w.y <= a.canvasY + a.height);
  const local = (ab: Artboard, w: Pt): Pt => ({ x: w.x - ab.canvasX, y: w.y - ab.canvasY });
  const screen = (ab: Artboard | { canvasX: number; canvasY: number } | null, p: Pt): Pt => ({
    x: panX + ((ab?.canvasX ?? 0) + p.x) * zoom,
    y: panY + ((ab?.canvasY ?? 0) + p.y) * zoom,
  });

  // ---------------------------------------------------------------- wheel zoom / pan (non-passive)

  useEffect(() => {
    const el = vp.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = store().get();
      // Ctrl/Cmd+wheel (and trackpad pinch, which arrives as ctrl+wheel) always zooms.
      // With the default preference the plain wheel zooms too; Shift+wheel and sideways scrolling pan.
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const zoomIt = e.ctrlKey || e.metaKey || (prefs().wheel === 'zoom' && !e.shiftKey && !sideways);
      if (zoomIt) {
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        const wx = (cx - st.panX) / st.zoom;
        const wy = (cy - st.panY) / st.zoom;
        const z = Math.min(32, Math.max(0.05, st.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025))));
        store().set({ zoom: z, panX: cx - wx * z, panY: cy - wy * z });
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        store().set({ panX: st.panX - dx, panY: st.panY - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        spaceDown.current = true;
        if (vp.current) vp.current.style.cursor = 'grab';
      }
      const st = store().get();
      if (penRef.current && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        finishPen(false);
      }
      if (st.editingPathId && !isTyping(e)) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selPointRef.current) {
          e.preventDefault();
          e.stopImmediatePropagation();
          deletePathPoint(st.editingPathId, selPointRef.current);
        } else if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
          exitPathEdit();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (vp.current) vp.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
    };
  });
  const selPointRef = useRef(selPoint);
  selPointRef.current = selPoint;

  // Finish the pen path when switching tools.
  useEffect(() => {
    if (s.tool !== 'pen' && penRef.current) finishPen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.tool]);

  // ---------------------------------------------------------------- selection helpers

  const pickFromHit = (path: SceneNode[], deep: boolean): SceneNode | null => {
    if (!path.length) return null;
    if (deep) return path[path.length - 1];
    const st = store().get();
    if (st.focusId) {
      const i = path.findIndex((n) => n.id === st.focusId);
      if (i >= 0 && path[i + 1]) return path[i + 1];
    }
    return path[0];
  };

  function startMove(ab: Artboard, start: Pt, alt: boolean) {
    const ids = topmost(ab, store().get().selection);
    const items = ids
      .map((id) => {
        const loc = locate(ab, id);
        if (!loc || loc.node.locked) return null;
        const pm = parentToArtboard(ab, id);
        const inv = invert([pm[0], pm[1], pm[2], pm[3], 0, 0]);
        return { id, x0: loc.node.x, y0: loc.node.y, inv };
      })
      .filter(Boolean) as { id: string; x0: number; y0: number; inv: Matrix }[];
    const bounds0 = selectionBounds(ab, ids) ?? { x: 0, y: 0, width: 0, height: 0 };
    drag.current = { kind: 'move', abId: ab.id, start, items, bounds0, alt, duplicated: false, moved: false };
  }

  // ---------------------------------------------------------------- pointer down

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const st = store().get();
    const target = e.target as HTMLElement;
    const handle = (target.closest('[data-handle]') as HTMLElement | null)?.dataset.handle;
    const w = toWorld(e.clientX, e.clientY);
    try {
      vp.current!.setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already-released pointer
    }
    if (st.editingTextId && !target.closest('.text-editor')) store().set({ editingTextId: null });

    if (e.button === 1 || spaceDown.current || st.tool === 'hand') {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: st.panX, py: st.panY };
      return;
    }

    const ab = getArtboard(st.project, st.activeArtboardId);

    // Handles (drawn on the overlay)
    if (handle) {
      const [kind, a, b] = handle.split(':');
      if (kind === 'ab') {
        const target = getArtboard(st.project, a)!;
        store().set({ activeArtboardId: a, artboardSelected: true, selection: [], focusId: null, activeTimelineId: target.timelines[0]?.id ?? null });
        drag.current = { kind: 'moveAb', id: a, x0: target.canvasX, y0: target.canvasY, start: w };
        return;
      }
      if (kind === 'abresize' && ab) {
        drag.current = { kind: 'resizeAb', handle: a as Handle, id: ab.id, ab0: structuredClone(ab) };
        return;
      }
      if (kind === 'resize' && ab) {
        const ids = topmost(ab, st.selection);
        if (ids.length === 1) {
          const loc = locate(ab, ids[0])!;
          drag.current = { kind: 'resize', handle: a as Handle, id: ids[0], node0: structuredClone(loc.node), parentM: parentToArtboard(ab, ids[0]) };
        } else {
          const bounds0 = selectionBounds(ab, ids)!;
          drag.current = {
            kind: 'resizeMulti',
            handle: a as Handle,
            bounds0,
            items: ids.map((id) => {
              const pm = parentToArtboard(ab, id);
              return { id, node0: structuredClone(locate(ab, id)!.node), off: { x: pm[4], y: pm[5] } };
            }),
          };
        }
        return;
      }
      if (kind === 'rotate' && ab) {
        const ids = topmost(ab, st.selection);
        const bb = selectionBounds(ab, ids)!;
        const center = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
        const p = local(ab, w);
        drag.current = {
          kind: 'rotate',
          center,
          angle0: Math.atan2(p.y - center.y, p.x - center.x),
          items: ids.map((id) => ({ id, r0: locate(ab, id)!.node.rotation })),
        };
        return;
      }
      if ((kind === 'pt' || kind === 'hin' || kind === 'hout') && ab && st.editingPathId) {
        const loc = locate(ab, st.editingPathId);
        if (!loc || loc.node.type !== 'path') return;
        const si = Number(a);
        const pi = Number(b);
        if (kind === 'pt') {
          setSelPoint({ si, pi });
          if (e.altKey) {
            togglePointSmooth(loc.node, si, pi);
            return;
          }
          drag.current = { kind: 'pathPoint', si, pi, start: local(ab, w), node0: structuredClone(loc.node), parentM: parentToArtboard(ab, loc.node.id) };
        } else {
          drag.current = {
            kind: 'pathHandle',
            si,
            pi,
            which: kind === 'hin' ? 'in' : 'out',
            node0: structuredClone(loc.node),
            parentM: parentToArtboard(ab, loc.node.id),
            mirror: !e.altKey,
          };
        }
        return;
      }
      if (kind === 'penstart' && penRef.current) {
        finishPen(true);
        return;
      }
    }

    const hitAb = abAt(w) ?? null;
    const tool = st.tool;

    if (tool === 'pen') {
      const pab = penRef.current ? getArtboard(st.project, penRef.current.abId) : hitAb ?? ab;
      if (!pab) return;
      const p = local(pab, w);
      const pts = penRef.current?.points ?? [];
      setPen({ abId: pab.id, points: [...pts, { x: p.x, y: p.y }], cursor: p });
      if (!penRef.current) store().set({ activeArtboardId: pab.id, selection: [] });
      drag.current = { kind: 'penHandle', index: pts.length };
      return;
    }

    if (tool === 'pencil') {
      const cab = hitAb ?? ab;
      if (!cab) return;
      if (cab.id !== st.activeArtboardId) store().set({ activeArtboardId: cab.id, selection: [] });
      drag.current = { kind: 'pencil', abId: cab.id, points: [local(cab, w)] };
      setPencil([local(cab, w)]);
      return;
    }

    if (tool === 'artboard') {
      drag.current = { kind: 'create', tool, abId: null, start: w, parentId: null };
      setBox({ abId: null, rect: { x: w.x, y: w.y, width: 0, height: 0 } });
      return;
    }

    if (tool === 'line' || CREATE_TYPES[tool]) {
      const cab = hitAb ?? ab;
      if (!cab) return;
      const p = local(cab, w);
      // Draw into the frame under the pointer, if any.
      const path = hitTest(cab, p.x, p.y);
      const frame = [...path].reverse().find((n) => n.type === 'frame');
      drag.current = { kind: 'create', tool, abId: cab.id, start: p, parentId: tool === 'frame' ? null : frame?.id ?? null };
      setBox({ abId: cab.id, rect: { x: p.x, y: p.y, width: 0, height: 0 } });
      if (cab.id !== st.activeArtboardId) store().set({ activeArtboardId: cab.id, selection: [], activeTimelineId: cab.timelines[0]?.id ?? null });
      return;
    }

    // Select tool
    if (st.editingPathId) exitPathEdit();
    if (hitAb) {
      const p = local(hitAb, w);
      const hit = pickFromHit(hitTest(hitAb, p.x, p.y), e.ctrlKey || e.metaKey);
      if (hitAb.id !== st.activeArtboardId) {
        store().set({ activeArtboardId: hitAb.id, selection: [], focusId: null, activeTimelineId: hitAb.timelines[0]?.id ?? null });
      }
      if (hit) {
        let sel = store().get().selection;
        if (e.shiftKey) sel = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
        else if (!sel.includes(hit.id)) sel = [hit.id];
        store().set({ selection: sel, artboardSelected: false });
        if (sel.includes(hit.id)) startMove(hitAb, p, e.altKey);
        return;
      }
      // Empty part of an artboard: marquee.
      store().set({ selection: e.shiftKey ? st.selection : [], artboardSelected: false, focusId: e.shiftKey ? st.focusId : null });
      drag.current = { kind: 'marquee', abId: hitAb.id, start: p, additive: e.shiftKey ? st.selection : [] };
      setBox({ abId: hitAb.id, rect: { x: p.x, y: p.y, width: 0, height: 0 } });
      return;
    }
    store().set({ selection: [], artboardSelected: false, focusId: null });
    drag.current = { kind: 'marquee', abId: null, start: w, additive: [] };
  };

  // ---------------------------------------------------------------- pointer move

  const onPointerMove = (e: React.PointerEvent) => {
    const st = store().get();
    const d = drag.current;
    const w = toWorld(e.clientX, e.clientY);
    liveSession()?.presence({ cursor: w, artboardId: st.activeArtboardId });
    if (!d) {
      // Hover feedback
      if (st.tool === 'select' && !spaceDown.current) {
        const hab = abAt(w);
        if (hab) {
          const p = local(hab, w);
          const hit = pickFromHit(hitTest(hab, p.x, p.y), e.ctrlKey || e.metaKey);
          setHover(hit ? `${hab.id}/${hit.id}` : null);
          // A locked layer under the pointer gets a quick-unlock button
          const lockedTrail = hitTest(hab, p.x, p.y, { includeLocked: true });
          const locked = lockedTrail.find((n) => n.locked);
          setLockedHover((cur) => (locked ? (cur?.id === locked.id ? cur : { abId: hab.id, id: locked.id }) : cur && Date.now() - (lockedSeen.current ?? 0) < 600 ? cur : null));
          if (locked) lockedSeen.current = Date.now();
        } else setHover(null);
      }
      if (st.tool === 'pen' && penRef.current) {
        const pab = getArtboard(st.project, penRef.current.abId);
        if (pab) setPen({ ...penRef.current, cursor: local(pab, w) });
      }
      return;
    }
    const ab = getArtboard(st.project, st.activeArtboardId);
    switch (d.kind) {
      case 'pan':
        store().set({ panX: d.px + e.clientX - d.sx, panY: d.py + e.clientY - d.sy });
        break;
      case 'move': {
        const mab = getArtboard(st.project, d.abId);
        if (!mab) break;
        const p = local(mab, w);
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * zoom < 3) break;
        if (!d.moved && d.alt && !d.duplicated) {
          store().duplicateSelection(0);
          d.duplicated = true;
          const nab = getArtboard(store().get().project, d.abId)!;
          startMove(nab, d.start, false);
          (drag.current as typeof d).duplicated = true;
          (drag.current as typeof d).moved = true;
          return;
        }
        d.moved = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const snap = e.ctrlKey || e.metaKey ? { dx: 0, dy: 0, guides: { x: [], y: [] } } : snapMove(mab, d.bounds0, dx, dy, d.items.map((i) => i.id), zoom);
        dx += snap.dx;
        dy += snap.dy;
        setGuides(snap.guides.x.length || snap.guides.y.length ? { abId: mab.id, ...snap.guides } : null);
        const changes = new Map<string, Record<string, unknown>>();
        for (const it of d.items) {
          const q = apply(it.inv, dx, dy);
          changes.set(it.id, { x: round(it.x0 + q.x), y: round(it.y0 + q.y) });
        }
        store().setEach(changes, 'move');
        break;
      }
      case 'resize': {
        if (!ab) break;
        const pp = apply(invert(d.parentM), w.x - ab.canvasX, w.y - ab.canvasY);
        const lp = apply(invert(nodeMatrix(d.node0)), pp.x, pp.y);
        const keep = e.shiftKey || d.node0.type === 'image';
        const nb = resizeBox(d.node0.width, d.node0.height, d.handle, lp.x, lp.y, e.shiftKey ? true : keep && e.shiftKey, e.altKey);
        const placed = placeBox(d.node0, nb.l, nb.t, nb.w, nb.h);
        const props: Record<string, unknown> = { x: round(placed.x), y: round(placed.y), width: round(nb.w), height: round(nb.h) };
        if (d.node0.type === 'path') props.paths = scalePaths(d.node0.paths, nb.w / Math.max(1, d.node0.width), nb.h / Math.max(1, d.node0.height));
        if (d.node0.type === 'text' && d.node0.autoSize !== 'none') {
          const [, hy] = HANDLE_POS[d.handle];
          props.autoSize = hy === 0.5 ? 'height' : 'none';
        }
        store().setProps([d.id], props, 'resize');
        break;
      }
      case 'resizeMulti': {
        if (!ab) break;
        const b0 = d.bounds0;
        const p = local(ab, w);
        const nb = resizeBox(b0.width, b0.height, d.handle, p.x - b0.x, p.y - b0.y, e.shiftKey, e.altKey);
        const sx = nb.w / Math.max(1, b0.width);
        const sy = nb.h / Math.max(1, b0.height);
        const changes = new Map<string, Record<string, unknown>>();
        for (const it of d.items) {
          const n0 = it.node0;
          const ax = it.off.x + n0.x;
          const ay = it.off.y + n0.y;
          const props: Record<string, unknown> = {
            x: round(b0.x + nb.l + (ax - b0.x) * sx - it.off.x),
            y: round(b0.y + nb.t + (ay - b0.y) * sy - it.off.y),
            width: round(n0.width * sx),
            height: round(n0.height * sy),
          };
          if (n0.type === 'path') props.paths = scalePaths(n0.paths, sx, sy);
          changes.set(it.id, props);
        }
        store().setEach(changes, 'resize');
        break;
      }
      case 'rotate': {
        if (!ab) break;
        const p = local(ab, w);
        let delta = ((Math.atan2(p.y - d.center.y, p.x - d.center.x) - d.angle0) * 180) / Math.PI;
        const changes = new Map<string, Record<string, unknown>>();
        for (const it of d.items) {
          let r = it.r0 + delta;
          if (e.shiftKey) r = Math.round(r / 15) * 15;
          r = ((r % 360) + 540) % 360 - 180;
          changes.set(it.id, { rotation: round(r, 1) });
        }
        delta = 0;
        store().setEach(changes, 'rotate');
        break;
      }
      case 'moveAb': {
        const nx = round(d.x0 + w.x - d.start.x);
        const ny = round(d.y0 + w.y - d.start.y);
        store().update(
          (dr) => {
            const a = dr.artboards.find((x) => x.id === d.id);
            if (a) {
              a.canvasX = nx;
              a.canvasY = ny;
            }
          },
          { coalesce: 'moveAb' },
        );
        break;
      }
      case 'resizeAb': {
        const a0 = d.ab0;
        const nb = resizeBox(a0.width, a0.height, d.handle, w.x - a0.canvasX, w.y - a0.canvasY, e.shiftKey, e.altKey);
        store().update(
          (dr) => {
            const a = dr.artboards.find((x) => x.id === d.id);
            if (!a) return;
            a.canvasX = round(a0.canvasX + nb.l);
            a.canvasY = round(a0.canvasY + nb.t);
            a.width = round(nb.w);
            a.height = round(nb.h);
          },
          { coalesce: 'resizeAb' },
        );
        break;
      }
      case 'pencil': {
        const pab = getArtboard(st.project, d.abId);
        if (!pab) break;
        d.points.push(local(pab, w));
        setPencil(d.points.slice());
        break;
      }
      case 'create': {
        const cab = d.abId ? getArtboard(st.project, d.abId) : null;
        const p = cab ? local(cab, w) : w;
        let x2 = p.x;
        let y2 = p.y;
        if (e.shiftKey && d.tool !== 'line') {
          const side = Math.max(Math.abs(x2 - d.start.x), Math.abs(y2 - d.start.y));
          x2 = d.start.x + side * Math.sign(x2 - d.start.x || 1);
          y2 = d.start.y + side * Math.sign(y2 - d.start.y || 1);
        }
        if (d.tool === 'line') setBox({ abId: d.abId, rect: { x: d.start.x, y: d.start.y, width: x2 - d.start.x, height: y2 - d.start.y } });
        else setBox({ abId: d.abId, rect: normRect(d.start, { x: x2, y: y2 }) });
        break;
      }
      case 'marquee': {
        const mab = d.abId ? getArtboard(st.project, d.abId) : null;
        const p = mab ? local(mab, w) : w;
        const rect = normRect(d.start, p);
        setBox({ abId: d.abId, rect });
        if (mab) {
          const list = st.focusId ? (locate(mab, st.focusId)?.node as { children?: SceneNode[] })?.children ?? mab.children : mab.children;
          const hits = list
            .filter((n) => n.visible && !n.locked)
            .filter((n) => {
              const b = selectionBounds(mab, [n.id]);
              return b && intersects(b, rect);
            })
            .map((n) => n.id);
          store().set({ selection: [...new Set([...d.additive, ...hits])] });
        }
        break;
      }
      case 'penHandle': {
        const pn = penRef.current;
        if (!pn) break;
        const pab = getArtboard(st.project, pn.abId);
        if (!pab) break;
        const p = local(pab, w);
        const pts = pn.points.slice();
        const pt = pts[d.index];
        if (!pt) break;
        const out = { x: p.x - pt.x, y: p.y - pt.y };
        pts[d.index] = Math.hypot(out.x, out.y) * zoom > 3 ? { ...pt, out, in: { x: -out.x, y: -out.y } } : { x: pt.x, y: pt.y };
        setPen({ ...pn, points: pts, cursor: p });
        break;
      }
      case 'pathPoint': {
        if (!ab) break;
        const lp = toNodeLocal(d.node0, d.parentM, local(ab, w));
        const sp = toNodeLocal(d.node0, d.parentM, d.start);
        const paths = structuredClone(d.node0.paths);
        const pt = paths[d.si]?.points[d.pi];
        if (!pt) break;
        pt.x = round(pt.x + lp.x - sp.x, 2);
        pt.y = round(pt.y + lp.y - sp.y, 2);
        store().setProps([d.node0.id], { paths }, 'path-edit');
        break;
      }
      case 'pathHandle': {
        if (!ab) break;
        const lp = toNodeLocal(d.node0, d.parentM, local(ab, w));
        const paths = structuredClone(d.node0.paths);
        const pt = paths[d.si]?.points[d.pi];
        if (!pt) break;
        const v = { x: round(lp.x - pt.x, 2), y: round(lp.y - pt.y, 2) };
        pt[d.which] = v;
        const other = d.which === 'in' ? 'out' : 'in';
        if (d.mirror && pt[other]) pt[other] = { x: -v.x, y: -v.y };
        store().setProps([d.node0.id], { paths }, 'path-edit');
        break;
      }
    }
  };

  // ---------------------------------------------------------------- pointer up

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    store().commit();
    setGuides(null);
    if (!d) return;
    const st = store().get();
    if (d.kind === 'pencil') {
      setPencil(null);
      const pab = getArtboard(st.project, d.abId);
      if (!pab || d.points.length < 2) return;
      // Ends close together: a closed, filled shape
      const first = d.points[0];
      const last = d.points[d.points.length - 1];
      const closed = d.points.length > 8 && Math.hypot(first.x - last.x, first.y - last.y) < 10 / zoom;
      const pts = freehandToPath(d.points, 0.5, closed);
      if (pts.length < 2) return;
      const b = pathBounds([{ points: pts, closed }]);
      const node = createNode('path', {
        name: 'Pencil',
        x: round(b.x, 2),
        y: round(b.y, 2),
        width: Math.max(1, b.width),
        height: Math.max(1, b.height),
        paths: [{ closed, points: pts.map((p) => ({ ...p, x: round(p.x - b.x, 2), y: round(p.y - b.y, 2) })) }],
        fill: closed ? { type: 'solid', color: '#d9d9d9' } : null,
      });
      store().addNodes([node], { artboardId: pab.id });
      return;
    }
    if (d.kind === 'create') {
      const b = boxRef.current?.rect;
      setBox(null);
      if (!b) return;
      if (d.tool === 'artboard') {
        const tiny = Math.abs(b.width) < 4 && Math.abs(b.height) < 4;
        store().addArtboard({ canvasX: round(b.x), canvasY: round(b.y), width: tiny ? 800 : round(b.width), height: tiny ? 600 : round(b.height) });
        store().set({ tool: 'select' });
        return;
      }
      const cab = d.abId ? getArtboard(st.project, d.abId) : undefined;
      if (!cab) return;
      createFromBox(cab, d.tool, b, d.parentId, e.shiftKey);
      return;
    }
    if (d.kind === 'marquee') {
      setBox(null);
      return;
    }
    if (d.kind === 'move' && !d.moved) {
      // Plain click on an already-selected node within a multi-selection selects just it.
      const ab = getArtboard(st.project, d.abId);
      if (ab && !e.shiftKey && st.selection.length > 1) {
        const w = toWorld(e.clientX, e.clientY);
        const p = local(ab, w);
        const hit = pickFromHit(hitTest(ab, p.x, p.y), e.ctrlKey || e.metaKey);
        if (hit) store().set({ selection: [hit.id] });
      }
    }
  };

  // ---------------------------------------------------------------- double click

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = store().get();
    if (st.tool === 'pen') {
      finishPen(false);
      return;
    }
    if (st.tool !== 'select') return;
    const w = toWorld(e.clientX, e.clientY);
    const ab = abAt(w);
    if (!ab) return;
    const p = local(ab, w);
    const path = hitTest(ab, p.x, p.y);
    const picked = pickFromHit(path, e.ctrlKey || e.metaKey);
    if (!picked) return;
    if (isContainer(picked)) {
      const i = path.indexOf(picked);
      const child = path[i + 1];
      store().set({ focusId: picked.id, selection: child ? [child.id] : [] });
      return;
    }
    if (picked.type === 'path') {
      store().set({ editingPathId: picked.id, selection: [picked.id] });
      setSelPoint(null);
      return;
    }
    if (picked.type === 'text' || picked.type === 'button' || picked.type === 'link') {
      store().set({ editingTextId: picked.id, selection: [picked.id] });
    }
  };

  // ---------------------------------------------------------------- creation

  function createFromBox(ab: Artboard, tool: Tool, b: Rect, parentId: string | null, shift: boolean) {
    let parentOffset = { x: 0, y: 0 };
    if (parentId) {
      const m = nodeToArtboard(ab, parentId);
      const inv = invert(m);
      const o = apply(inv, b.x, b.y);
      parentOffset = { x: b.x - o.x, y: b.y - o.y };
    }
    const tiny = Math.abs(b.width) < 3 && Math.abs(b.height) < 3;
    let node: SceneNode;
    if (tool === 'line') {
      if (tiny) return;
      const x1 = b.x;
      const y1 = b.y;
      const x2 = b.x + b.width;
      const y2 = b.y + b.height;
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      node = createNode('path', {
        name: 'Line',
        x: round(minX - parentOffset.x),
        y: round(minY - parentOffset.y),
        width: Math.max(1, Math.abs(b.width)),
        height: Math.max(1, Math.abs(b.height)),
        paths: [{ closed: false, points: [{ x: x1 - minX, y: y1 - minY }, { x: x2 - minX, y: y2 - minY }] }],
      });
    } else {
      const type = CREATE_TYPES[tool]!;
      const proto = createNode(type);
      const width = tiny ? proto.width : Math.max(1, b.width);
      const height = tiny ? proto.height : Math.max(1, b.height);
      const x = tiny && type !== 'text' ? b.x - width / 2 : b.x;
      const y = tiny && type !== 'text' ? b.y - height / 2 : b.y;
      const extra: Record<string, unknown> = {};
      if (type === 'text') extra.autoSize = tiny ? 'width' : 'height';
      node = createNode(type, { x: round(x - parentOffset.x), y: round(y - parentOffset.y), width: round(width), height: round(height), ...extra, ...fontDefaults(type) } as never);
    }
    store().addNodes([node], { parentId, artboardId: ab.id });
    if (!shift) store().set({ tool: 'select' });
    if (node.type === 'text') store().set({ editingTextId: node.id });
  }

  function finishPen(close: boolean) {
    const pn = penRef.current;
    setPen(null);
    if (!pn || pn.points.length < 2) return;
    const ab = getArtboard(store().get().project, pn.abId);
    if (!ab) return;
    const b = pathBounds([{ points: pn.points, closed: close }]);
    const points = pn.points.map((p) => ({ ...p, x: round(p.x - b.x, 2), y: round(p.y - b.y, 2) }));
    const node = createNode('path', {
      x: round(b.x, 2),
      y: round(b.y, 2),
      width: Math.max(1, b.width),
      height: Math.max(1, b.height),
      paths: [{ closed: close, points }],
      fill: close ? { type: 'solid', color: '#d9d9d9' } : null,
    });
    store().addNodes([node], { artboardId: ab.id });
  }

  function exitPathEdit() {
    const st = store().get();
    const ab = getArtboard(st.project, st.activeArtboardId);
    const id = st.editingPathId;
    store().set({ editingPathId: null });
    setSelPoint(null);
    if (!ab || !id) return;
    const loc = locate(ab, id);
    if (loc?.node.type !== 'path') return;
    const n = normalizePath(loc.node);
    store().setProps([id], { x: round(n.x, 2), y: round(n.y, 2), width: round(n.width, 2), height: round(n.height, 2), paths: n.paths });
  }

  function togglePointSmooth(n: PathNode, si: number, pi: number) {
    const paths = structuredClone(n.paths);
    const sp = paths[si];
    const pt = sp?.points[pi];
    if (!pt) return;
    if (pt.in || pt.out) {
      pt.in = null;
      pt.out = null;
    } else {
      const prev = sp.points[(pi - 1 + sp.points.length) % sp.points.length];
      const next = sp.points[(pi + 1) % sp.points.length];
      const dx = (next.x - prev.x) / 4;
      const dy = (next.y - prev.y) / 4;
      pt.out = { x: dx, y: dy };
      pt.in = { x: -dx, y: -dy };
    }
    store().setProps([n.id], { paths });
  }

  function deletePathPoint(id: string, sel: { si: number; pi: number }) {
    const ab = store().artboard();
    const loc = ab && locate(ab, id);
    if (!loc || loc.node.type !== 'path') return;
    const paths = structuredClone(loc.node.paths);
    paths[sel.si]?.points.splice(sel.pi, 1);
    const cleaned = paths.filter((p) => p.points.length >= 2);
    setSelPoint(null);
    if (!cleaned.length) {
      store().set({ editingPathId: null });
      store().deleteSelection();
      return;
    }
    store().setProps([id], { paths: cleaned });
  }

  // ---------------------------------------------------------------- drop files

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    const w = toWorld(e.clientX, e.clientY);
    const ab = abAt(w) ?? active;
    if (!ab) return;
    await insertFiles(files, ab.id, local(ab, w));
  };

  // ---------------------------------------------------------------- overlay

  const overlay: JSX.Element[] = [];
  const toS = (ab: Artboard, p: Pt) => screen(ab, p);

  for (const ab of project.artboards) {
    const tl = screen(ab, { x: 0, y: 0 });
    const isActive = ab.id === s.activeArtboardId;
    overlay.push(
      <text
        key={`label-${ab.id}`}
        data-handle={`ab:${ab.id}`}
        className={`ab-label${isActive ? ' active' : ''}`}
        x={tl.x}
        y={tl.y - 8}
      >
        {ab.name}
        {project.settings.startArtboardId === ab.id ? '  ▸ start' : ''}
      </text>,
    );
  }

  if (active) {
    if (hover && !drag.current) {
      const [habId, hid] = hover.split('/');
      const hab = getArtboard(project, habId);
      if (hab && !s.selection.includes(hid) && locate(hab, hid)) {
        const pts = nodeCorners(hab, hid).map((p) => toS(hab, p));
        overlay.push(<polygon key="hover" className="hover-outline" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />);
      }
    }
    if (s.focusId && locate(active, s.focusId)) {
      const pts = nodeCorners(active, s.focusId).map((p) => toS(active, p));
      overlay.push(<polygon key="focus" className="focus-outline" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />);
    }

    if (s.artboardSelected) {
      const a = toS(active, { x: 0, y: 0 });
      const bw = active.width * zoom;
      const bh = active.height * zoom;
      overlay.push(<rect key="ab-sel" className="sel-outline" x={a.x} y={a.y} width={bw} height={bh} />);
      for (const h of HANDLES) {
        const [fx, fy] = HANDLE_POS[h];
        overlay.push(<rect key={`abh-${h}`} data-handle={`abresize:${h}`} className={`handle h-${h}`} x={a.x + fx * bw - 4} y={a.y + fy * bh - 4} width={8} height={8} />);
      }
      overlay.push(
        <text key="ab-size" className="size-label" x={a.x + bw / 2} y={a.y + bh + 18}>
          {Math.round(active.width)} × {Math.round(active.height)}
        </text>,
      );
    }

    const ids = topmost(active, s.selection.filter((id) => locate(active, id)));
    if (ids.length && !s.editingPathId && !s.editingTextId) {
      let quad: Pt[];
      let size: { w: number; h: number };
      if (ids.length === 1) {
        quad = nodeCorners(active, ids[0]).map((p) => toS(active, p));
        const n = locate(active, ids[0])!.node;
        size = { w: n.width, h: n.height };
      } else {
        const b = selectionBounds(active, ids)!;
        quad = [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y },
          { x: b.x + b.width, y: b.y + b.height },
          { x: b.x, y: b.y + b.height },
        ].map((p) => toS(active, p));
        size = { w: b.width, h: b.height };
        for (const id of ids) {
          const pts = nodeCorners(active, id).map((p) => toS(active, p));
          overlay.push(<polygon key={`m-${id}`} className="hover-outline" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />);
        }
      }
      overlay.push(<polygon key="sel" className="sel-outline" points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />);
      const at = (fx: number, fy: number): Pt => {
        const top = { x: quad[0].x + (quad[1].x - quad[0].x) * fx, y: quad[0].y + (quad[1].y - quad[0].y) * fx };
        const bot = { x: quad[3].x + (quad[2].x - quad[3].x) * fx, y: quad[3].y + (quad[2].y - quad[3].y) * fx };
        return { x: top.x + (bot.x - top.x) * fy, y: top.y + (bot.y - top.y) * fy };
      };
      const center = at(0.5, 0.5);
      const locked = ids.some((id) => locate(active, id)!.node.locked);
      if (!locked) {
        for (const h of ['nw', 'ne', 'se', 'sw'] as Handle[]) {
          const [fx, fy] = HANDLE_POS[h];
          const c = at(fx, fy);
          const dx = c.x - center.x;
          const dy = c.y - center.y;
          const len = Math.hypot(dx, dy) || 1;
          overlay.push(<circle key={`rot-${h}`} data-handle={`rotate:${h}`} className="rotate-zone" cx={c.x + (dx / len) * 14} cy={c.y + (dy / len) * 14} r={10} />);
        }
        for (const h of HANDLES) {
          const [fx, fy] = HANDLE_POS[h];
          const c = at(fx, fy);
          overlay.push(<rect key={`h-${h}`} data-handle={`resize:${h}`} className={`handle h-${h}`} x={c.x - 4} y={c.y - 4} width={8} height={8} />);
        }
      }
      const bottom = Math.max(...quad.map((p) => p.y));
      overlay.push(
        <text key="size" className="size-label" x={center.x} y={bottom + 18}>
          {Math.round(size.w)} × {Math.round(size.h)}
        </text>,
      );
    }

    // Path editing
    if (s.editingPathId) {
      const loc = locate(active, s.editingPathId);
      if (loc && loc.node.type === 'path') {
        const m = nodeToArtboard(active, loc.node.id);
        const P = (x: number, y: number) => toS(active, apply(m, x, y));
        loc.node.paths.forEach((sp, si) =>
          sp.points.forEach((pt, pi) => {
            const a = P(pt.x, pt.y);
            const sel = selPoint?.si === si && selPoint.pi === pi;
            for (const which of ['in', 'out'] as const) {
              const hnd = pt[which];
              if (!hnd) continue;
              const hp = P(pt.x + hnd.x, pt.y + hnd.y);
              overlay.push(<line key={`hl-${si}-${pi}-${which}`} className="path-handle-line" x1={a.x} y1={a.y} x2={hp.x} y2={hp.y} />);
              overlay.push(<circle key={`hh-${si}-${pi}-${which}`} data-handle={`h${which}:${si}:${pi}`} className="path-handle" cx={hp.x} cy={hp.y} r={4} />);
            }
            overlay.push(<rect key={`pt-${si}-${pi}`} data-handle={`pt:${si}:${pi}`} className={`path-point${sel ? ' selected' : ''}`} x={a.x - 4} y={a.y - 4} width={8} height={8} />);
          }),
        );
      }
    }
  }

  // Freehand stroke in progress
  if (pencil && pencil.length > 1) {
    const pab = drag.current?.kind === 'pencil' ? getArtboard(project, drag.current.abId) ?? null : null;
    const d = pencil.map((p, i) => {
      const q = screen(pab, p);
      return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    });
    overlay.push(<path key="pencil" className="pencil-stroke" d={d.join('')} />);
  }

  // Marquee / creation preview
  if (box) {
    const bab = box.abId ? getArtboard(project, box.abId) ?? null : null;
    if (drag.current?.kind === 'create' && drag.current.tool === 'line') {
      const a = screen(bab, { x: box.rect.x, y: box.rect.y });
      const b = screen(bab, { x: box.rect.x + box.rect.width, y: box.rect.y + box.rect.height });
      overlay.push(<line key="box" className="create-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
    } else {
      const a = screen(bab, { x: box.rect.x, y: box.rect.y });
      if (drag.current?.kind === 'create') overlay.push(<g key="shape-preview">{shapePreview(drag.current.tool, a.x, a.y, box.rect.width * zoom, box.rect.height * zoom, zoom)}</g>);
      overlay.push(
        <rect
          key="box"
          className={drag.current?.kind === 'marquee' ? 'marquee' : 'create-box'}
          x={a.x}
          y={a.y}
          width={box.rect.width * zoom}
          height={box.rect.height * zoom}
        />,
      );
      if (drag.current?.kind === 'create')
        overlay.push(
          <text key="box-size" className="size-label" x={a.x + (box.rect.width * zoom) / 2} y={a.y + box.rect.height * zoom + 18}>
            {Math.round(box.rect.width)} × {Math.round(box.rect.height)}
          </text>,
        );
    }
  }

  // Snap guides
  if (guides) {
    const gab = getArtboard(project, guides.abId);
    if (gab) {
      for (const x of guides.x) {
        const a = screen(gab, { x, y: -10000 });
        overlay.push(<line key={`gx-${x}`} className="guide" x1={a.x} x2={a.x} y1={0} y2={10000} />);
      }
      for (const y of guides.y) {
        const a = screen(gab, { x: -10000, y });
        overlay.push(<line key={`gy-${y}`} className="guide" x1={0} x2={10000} y1={a.y} y2={a.y} />);
      }
    }
  }

  // Pen preview
  if (pen) {
    const pab = getArtboard(project, pen.abId);
    if (pab) {
      const sp = pen.points.map((p) => ({ ...p, ...screen(pab, p) }));
      let d = '';
      sp.forEach((p, i) => {
        if (i === 0) d += `M${p.x} ${p.y}`;
        else {
          const a = pen.points[i - 1];
          const b = pen.points[i];
          const c1 = screen(pab, { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) });
          const c2 = screen(pab, { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) });
          d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`;
        }
      });
      if (pen.cursor && !drag.current && sp.length) {
        const c = screen(pab, pen.cursor);
        d += `L${c.x} ${c.y}`;
      }
      overlay.push(<path key="pen" className="pen-preview" d={d} />);
      sp.forEach((p, i) => {
        overlay.push(
          <rect key={`pp-${i}`} data-handle={i === 0 && sp.length > 1 ? 'penstart' : undefined} className={`path-point${i === 0 ? ' first' : ''}`} x={p.x - 4} y={p.y - 4} width={8} height={8} />,
        );
        if (pen.points[i].out) {
          const o = screen(pab, { x: pen.points[i].x + pen.points[i].out!.x, y: pen.points[i].y + pen.points[i].out!.y });
          overlay.push(<line key={`pl-${i}`} className="path-handle-line" x1={p.x} y1={p.y} x2={o.x} y2={o.y} />);
          overlay.push(<circle key={`ph-${i}`} className="path-handle" cx={o.x} cy={o.y} r={3} />);
        }
      });
    }
  }

  // Other people: their selections on this artboard, and their cursors anywhere on the canvas
  for (const peer of Object.values(peers)) {
    const pab = peer.artboardId ? getArtboard(project, peer.artboardId) : undefined;
    if (pab && peer.selection?.length) {
      for (const id of peer.selection) {
        if (!locate(pab, id)) continue;
        const pts = nodeCorners(pab, id).map((p) => screen(pab, p));
        overlay.push(<polygon key={`peer-${peer.clientId}-${id}`} className="peer-outline" stroke={peer.color} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />);
      }
    }
    if (peer.cursor) {
      const c = screen(null, peer.cursor);
      overlay.push(
        <g key={`cursor-${peer.clientId}`} className="peer-cursor" transform={`translate(${c.x} ${c.y})`}>
          <path d="M0 0L0 16L4.5 12L7.5 18.5L10 17.5L7 11L13 11Z" fill={peer.color} stroke="#fff" strokeWidth={1} />
          <text x={14} y={24} fill="#fff" style={{ paintOrder: 'stroke', stroke: peer.color, strokeWidth: 8, strokeLinejoin: 'round' }}>
            {peer.name}
          </text>
        </g>,
      );
    }
  }

  // ---------------------------------------------------------------- right-click menus

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    const st = store().get();
    const w = toWorld(e.clientX, e.clientY);
    const hab = abAt(w);
    const s2 = store();
    const NEW: { type: NodeType; label: string }[] = [
      { type: 'rect', label: 'Rectangle' },
      { type: 'ellipse', label: 'Ellipse' },
      { type: 'polygon', label: 'Polygon' },
      { type: 'star', label: 'Star' },
      { type: 'text', label: 'Text' },
      { type: 'frame', label: 'Frame' },
      { type: 'button', label: 'Button' },
      { type: 'input', label: 'Input field' },
      { type: 'link', label: 'Link' },
      { type: 'embed', label: 'Embed' },
      { type: 'video', label: 'Video' },
    ];
    const newHere = (ab: Artboard): MenuItem => ({
      label: 'New',
      items: NEW.map((t) => ({
        label: t.label,
        onClick: () => {
          const p = local(ab, w);
          const proto = createNode(t.type);
          const node = createNode(t.type, { x: round(p.x - (t.type === 'text' ? 0 : proto.width / 2)), y: round(p.y - (t.type === 'text' ? 0 : proto.height / 2)), ...fontDefaults(t.type) } as never);
          s2.set({ activeArtboardId: ab.id });
          s2.addNodes([node], { artboardId: ab.id });
          if (node.type === 'text') s2.set({ editingTextId: node.id });
        },
      })),
    });
    const paste: MenuItem = {
      label: 'Paste',
      hint: 'Ctrl+V',
      onClick: () => {
        void (navigator.clipboard?.readText?.() ?? Promise.resolve('')).then((t) => pasteNodes(t), () => pasteNodes());
      },
    };
    let items: MenuItem[];
    const hit = hab ? pickFromHit(hitTest(hab, local(hab, w).x, local(hab, w).y), e.ctrlKey || e.metaKey) : null;
    if (hab && hit) {
      // A layer: select it (keeping a multi-selection it belongs to), then act on the selection
      if (!(st.activeArtboardId === hab.id && st.selection.includes(hit.id))) s2.select([hit.id], { artboardId: hab.id });
      const sel = s2.selectedNodes();
      const one = sel.length === 1 ? sel[0] : null;
      items = [
        { heading: one ? one.name : `${sel.length} layers` },
        { label: 'Cut', hint: 'Ctrl+X', onClick: () => copySelection(true) },
        { label: 'Copy', hint: 'Ctrl+C', onClick: () => copySelection() },
        paste,
        { label: 'Duplicate', hint: 'Ctrl+D', onClick: () => s2.duplicateSelection() },
        { label: 'Delete', hint: 'Del', danger: true, onClick: () => s2.deleteSelection() },
        { separator: true },
        {
          label: 'Order',
          items: [
            { label: 'Bring to front', hint: 'Ctrl+]', onClick: () => s2.reorder(Infinity) },
            { label: 'Bring forward', hint: ']', onClick: () => s2.reorder(1) },
            { label: 'Send backward', hint: '[', onClick: () => s2.reorder(-1) },
            { label: 'Send to back', hint: 'Ctrl+[', onClick: () => s2.reorder(-Infinity) },
          ],
        },
        { label: 'Group', hint: 'Ctrl+G', onClick: () => s2.groupSelection() },
        ...(one && (one.type === 'group' || one.type === 'frame') ? [{ label: 'Ungroup', hint: 'Ctrl+Shift+G', onClick: () => s2.ungroupSelection() } as MenuItem] : []),
        ...(sel.length > 1
          ? [
              {
                label: 'Combine shapes',
                items: (['union', 'subtract', 'intersect', 'exclude'] as const).map((op) => ({ label: op[0].toUpperCase() + op.slice(1), onClick: () => s2.booleanSelection(op) })),
              } as MenuItem,
            ]
          : []),
        { separator: true },
        { label: one?.visible === false ? 'Show' : 'Hide', onClick: () => s2.setProps(sel.map((n) => n.id), { visible: one?.visible === false }) },
        { label: 'Lock', onClick: () => s2.setProps(sel.map((n) => n.id), { locked: true }) },
        ...(one
          ? [
              {
                label: 'Add interaction',
                items: [
                  { label: 'On click…', onClick: () => addInteraction(hab, one.id, 'click') },
                  { label: 'On hover…', onClick: () => addInteraction(hab, one.id, 'pointerenter') },
                ],
              } as MenuItem,
              ...(one.type === 'text' || one.type === 'button' || one.type === 'link' ? [{ label: 'Edit text', hint: 'Enter', onClick: () => s2.set({ editingTextId: one.id }) } as MenuItem] : []),
            ]
          : []),
        { separator: true },
        newHere(hab),
      ];
    } else if (hab) {
      // An artboard's empty area
      s2.set({ activeArtboardId: hab.id, artboardSelected: true, selection: [] });
      items = [
        { heading: hab.name },
        newHere(hab),
        paste,
        { separator: true },
        { label: 'Make start artboard', disabled: st.project.settings.startArtboardId === hab.id, onClick: () => s2.update((d) => void (d.settings.startArtboardId = hab.id)) },
        { label: 'Duplicate artboard', onClick: () => s2.duplicateArtboard(hab.id) },
        { label: 'Zoom to artboard', onClick: () => zoomToBox({ x: hab.canvasX, y: hab.canvasY, width: hab.width, height: hab.height }) },
        { separator: true },
        { label: 'Delete artboard', danger: true, onClick: () => s2.deleteArtboard(hab.id) },
      ];
    } else {
      items = [
        { label: 'New artboard here', onClick: () => s2.addArtboard({ canvasX: round(w.x), canvasY: round(w.y) }) },
        paste,
        { separator: true },
        { label: 'Zoom to fit everything', hint: 'Shift+1', onClick: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true })) },
        { label: prefs().rulers ? 'Hide rulers' : 'Show rulers', hint: 'Shift+R', onClick: () => setPrefs({ rulers: !prefs().rulers }) },
        { label: 'Help', hint: 'F1', onClick: () => openHelp('canvas') },
      ];
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  /** Add an "On pointer" event for a layer with an action to fill in, and open the Interactions tab on it. */
  function addInteraction(ab: Artboard, nodeId: string, type: 'click' | 'pointerenter') {
    const ev = { id: uid('lg'), kind: 'event.pointer', x: 40, y: 40 + ab.logic.nodes.length * 30, params: { ...defaultParams('event.pointer'), target: nodeId, type } };
    const act = { id: uid('lg'), kind: 'action.timeline', x: 300, y: ev.y, params: defaultParams('action.timeline') };
    store().update((d) => {
      const a = d.artboards.find((x) => x.id === ab.id);
      if (!a) return;
      a.logic.nodes.push(ev, act);
      a.logic.edges.push({ id: uid('e'), from: ev.id, fromPort: 'out', to: act.id, toPort: 'in' });
    });
    store().set({ bottomTab: 'logic', logicSelection: act.id });
  }

  function zoomToBox(b: Rect) {
    const el = vp.current;
    if (!el) return;
    const z = Math.min(8, Math.min(el.clientWidth / (b.width + 80), el.clientHeight / (b.height + 80)));
    store().set({ zoom: z, panX: el.clientWidth / 2 - (b.x + b.width / 2) * z, panY: el.clientHeight / 2 - (b.y + b.height / 2) * z });
  }

  const showRulers = usePrefs().rulers;
  const cursor = s.tool === 'hand' ? 'grab' : s.tool === 'select' ? 'default' : s.tool === 'text' ? 'text' : 'crosshair';

  return (
    <div
      ref={vp}
      className="canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={openMenu}
    >
      <div className="world" style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}>
        {project.artboards.map((ab) => (
          <ArtboardView
            key={ab.id}
            artboard={ab}
            project={project}
            timeline={ab.id === s.activeArtboardId ? timeline : null}
            time={s.playhead}
            active={ab.id === s.activeArtboardId}
            assetVersion={assetVersion}
            dataVersion={dataVersion}
          />
        ))}
      </div>
      <svg className="overlay">{overlay}</svg>
      {lockedHover &&
        s.tool === 'select' &&
        (() => {
          const lab = getArtboard(project, lockedHover.abId);
          const b = lab && selectionBounds(lab, [lockedHover.id]);
          const n = lab && locate(lab, lockedHover.id)?.node;
          if (!lab || !b || !n?.locked) return null;
          const at = screen(lab, { x: b.x + b.width, y: b.y });
          return (
            <button
              className="quick-unlock"
              style={{ left: at.x - 26, top: at.y + 4 }}
              title={`Unlock “${n.name}”`}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={() => (lockedSeen.current = Date.now() + 100000)}
              onPointerLeave={() => (lockedSeen.current = Date.now())}
              onClick={(e) => {
                e.stopPropagation();
                store().set({ activeArtboardId: lab.id });
                store().setProps([n.id], { locked: false });
                store().select([n.id], { artboardId: lab.id });
                setLockedHover(null);
              }}
            >
              <Icons.lock width={13} />
            </button>
          );
        })()}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {showRulers && <Rulers ab={active} zoom={zoom} panX={panX} panY={panY} width={vp.current?.clientWidth ?? 2000} height={vp.current?.clientHeight ?? 1200} />}
      {s.editingTextId && active && <TextEditor ab={active} id={s.editingTextId} zoom={zoom} panX={panX} panY={panY} />}
    </div>
  );
}

// ---------------------------------------------------------------- in-place text editing

function TextEditor({ ab, id, zoom, panX, panY }: { ab: Artboard; id: string; zoom: number; panX: number; panY: number }) {
  const loc = locate(ab, id);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [id]);
  if (!loc) return null;
  const n = loc.node;
  if (n.type !== 'text' && n.type !== 'button' && n.type !== 'link') return null;
  const prop = n.type === 'button' ? 'label' : 'text';
  const value = n.type === 'button' ? n.label : n.text;
  const b = selectionBounds(ab, [id])!;
  const style: React.CSSProperties = {
    left: panX + (ab.canvasX + b.x) * zoom,
    top: panY + (ab.canvasY + b.y) * zoom,
    width: Math.max(40, b.width * zoom + 4),
    minHeight: b.height * zoom,
    fontFamily: n.fontFamily,
    fontSize: n.fontSize * zoom,
    fontWeight: n.fontWeight,
    fontStyle: n.fontStyle,
    lineHeight: n.lineHeight,
    letterSpacing: n.letterSpacing * zoom,
    textAlign: n.align,
    color: n.type === 'button' ? '#111' : n.color,
  };
  return (
    <textarea
      ref={ref}
      className="text-editor"
      style={style}
      value={value}
      onChange={(e) => store().setProps([id], { [prop]: e.target.value }, `text-${id}`)}
      onBlur={() => {
        store().commit();
        store().set({ editingTextId: null });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

// ---------------------------------------------------------------- helpers

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function toNodeLocal(n: SceneNode, parentM: Matrix, p: Pt): Pt {
  const pp = apply(invert(parentM), p.x, p.y);
  return apply(invert(nodeMatrix(n)), pp.x, pp.y);
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target instanceof HTMLElement ? e.target : null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest?.('.cm-editor'));
}

/** Snap a moved selection's edges/centre to the artboard and to other top-level layers. */
function snapMove(ab: Artboard, b: Rect, dx: number, dy: number, moving: string[], zoom: number): { dx: number; dy: number; guides: { x: number[]; y: number[] } } {
  const th = SNAP_PX / zoom;
  const xs = [0, ab.width / 2, ab.width, ...(ab.guides?.x ?? [])];
  const ys = [0, ab.height / 2, ab.height, ...(ab.guides?.y ?? [])];
  const set = new Set(moving);
  for (const n of ab.children) {
    if (set.has(n.id) || !n.visible) continue;
    const nb = selectionBounds(ab, [n.id]);
    if (!nb) continue;
    xs.push(nb.x, nb.x + nb.width / 2, nb.x + nb.width);
    ys.push(nb.y, nb.y + nb.height / 2, nb.y + nb.height);
  }
  const best = (cands: number[], targets: number[]) => {
    let bestD = Infinity;
    let at = 0;
    for (const c of cands)
      for (const t of targets) {
        const d = t - c;
        if (Math.abs(d) < Math.abs(bestD)) {
          bestD = d;
          at = t;
        }
      }
    return Math.abs(bestD) <= th ? { d: bestD, at } : null;
  };
  const cx = [b.x + dx, b.x + dx + b.width / 2, b.x + dx + b.width];
  const cy = [b.y + dy, b.y + dy + b.height / 2, b.y + dy + b.height];
  const sx = best(cx, xs);
  const sy = best(cy, ys);
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides: { x: sx ? [sx.at] : [], y: sy ? [sy.at] : [] } };
}


/** What a shape will look like while it is being drawn, in screen pixels (the defaults the new layer gets). */
function shapePreview(tool: Tool, x: number, y: number, w: number, h: number, zoom: number) {
  if (w < 1 || h < 1) return null;
  const grey = { fill: '#d9d9d9', fillOpacity: 0.85 };
  const label = (text: string, color: string, size = 16, extra: Record<string, unknown> = {}) => (
    <text x={x + w / 2} y={y + h / 2} fill={color} fontSize={size * zoom} fontFamily="Inter, system-ui, sans-serif" textAnchor="middle" dominantBaseline="central" {...extra}>
      {text}
    </text>
  );
  switch (tool) {
    case 'rect':
      return <rect x={x} y={y} width={w} height={h} {...grey} />;
    case 'ellipse':
      return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...grey} />;
    case 'polygon':
      return <path transform={`translate(${x} ${y})`} d={subPathsToD([{ points: polygonPoints(6, w, h), closed: true }])} {...grey} />;
    case 'star':
      return <path transform={`translate(${x} ${y})`} d={subPathsToD([{ points: starPoints(5, 0.45, w, h), closed: true }])} {...grey} />;
    case 'frame':
      return <rect x={x} y={y} width={w} height={h} fill="#ffffff" fillOpacity={0.92} />;
    case 'button':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={8 * zoom} fill="#3b5bfd" fillOpacity={0.9} />
          {h > 12 * zoom && label('Button', '#fff', 16, { fontWeight: 600 })}
        </>
      );
    case 'input':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={6 * zoom} fill="#fff" stroke="#c4c4c4" />
          {h > 12 * zoom && (
            <text x={x + 10 * zoom} y={y + h / 2} fill="#999" fontSize={16 * zoom} fontFamily="Inter, system-ui, sans-serif" dominantBaseline="central">
              Type here
            </text>
          )}
        </>
      );
    case 'link':
      return label('Link', '#3b5bfd', 16, { textDecoration: 'underline' });
    case 'embed':
    case 'video':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="#2a2b30" fillOpacity={0.9} />
          {h > 14 * zoom && label(tool === 'embed' ? 'Embed' : 'Video', '#9a9ea8', 14)}
        </>
      );
    default:
      return null;
  }
}

/** New text-like layers use the person's default font (Preferences). */
function fontDefaults(type: NodeType): { fontFamily?: string } {
  if (type !== 'text' && type !== 'button' && type !== 'input' && type !== 'link') return {};
  const f = prefs().defaultFont.trim();
  return f ? { fontFamily: `${f.includes(' ') ? `"${f}"` : f}, system-ui, sans-serif` } : {};
}
