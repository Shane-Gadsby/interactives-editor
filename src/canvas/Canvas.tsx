import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  apply,
  createNode,
  fillList,
  fillPath,
  getPath,
  linearLine,
  radialCircle,
  strokeList,
  strokePath,
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
  nodeRuns,
  rotationFor,
  type Artboard,
  type Matrix,
  type NodeType,
  type PathNode,
  type Paint,
  type PathPoint,
  type SceneNode,
  type Stroke,
  type TextRun,
  nodeTypeLabel,
} from 'interactives-player';
import { toggleRunStyle, type ToggleKind } from '../lib/rich-text';
import { paintRuns, readRuns, selectionOffsets, setSelectionOffsets } from '../lib/rich-text-dom';
import { store, useEditor, type Tool } from '../store/store';
import { drawnGeometryVersion, getArtboard, hitTest, locate, nodeCorners, nodeToArtboard, parentToArtboard, selectionBounds, subscribeDrawnGeometry, topmost, type Rect } from '../store/doc';
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
import { viewPlan } from './viewPlan';
import { HANDLE_POS, HANDLES, normalizePath, placeBox, resizeBox, scalePaths, type Handle } from './transform';
import { ADD_POINT_CURSOR, BEND_CURSOR, BONE_CHAIN_CURSOR, PEN_CLOSE_CURSOR, dragCursor, resizeCursor, rotateCursor, rotateCursorAt, toolCursor } from './cursors';
import { insertFiles } from '../lib/insert';
import { captureDrop } from '../lib/links';
import { liveSession } from '../lib/live';
import { bendPaths, hasShapeKeys, nearestSegment, shapeToPaths, type SegmentHit } from '../lib/path-edit';
import { confirmDialog } from '../components/dialogs';
import { COMPONENT_DRAG, dropComponent } from '../lib/library-actions';
import { boneEndAt, boneFromDrag, boneGlyphs } from '../lib/rig';

type Pt = { x: number; y: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'move'; abId: string; start: Pt; items: { id: string; x0: number; y0: number; inv: Matrix }[]; bounds0: Rect; alt: boolean; duplicated: boolean; moved: boolean }
  | { kind: 'resize'; handle: Handle; id: string; node0: SceneNode; parentM: Matrix }
  | { kind: 'gradPt'; id: string; prefix: string; part: 'from' | 'to' | 'center' | 'radius'; node0: SceneNode; parentM: Matrix }
  | { kind: 'resizeMulti'; handle: Handle; bounds0: Rect; items: { id: string; node0: SceneNode; off: Pt }[] }
  | { kind: 'rotate'; center: Pt; angle0: number; items: { id: string; r0: number }[] }
  | { kind: 'moveAb'; id: string; x0: number; y0: number; start: Pt }
  | { kind: 'resizeAb'; handle: Handle; id: string; ab0: Artboard }
  | { kind: 'create'; tool: Tool; abId: string | null; start: Pt; parentId: string | null }
  | { kind: 'marquee'; abId: string | null; start: Pt; additive: string[] }
  | { kind: 'penHandle'; index: number }
  | { kind: 'pencil'; abId: string; points: Pt[] }
  | { kind: 'bend'; id: string; si: number; i: number; t: number; start: Pt; node0: PathNode; parentM: Matrix }
  | { kind: 'pathPoint'; si: number; pi: number; start: Pt; node0: PathNode; parentM: Matrix }
  | { kind: 'pathHandle'; si: number; pi: number; which: 'in' | 'out'; node0: PathNode; parentM: Matrix; mirror: boolean }
  | { kind: 'boneDraw'; abId: string; parentId: string | null; chain: boolean; a: Pt }
  | { kind: 'boneRotate'; abId: string; id: string }
  | { kind: 'boneMove'; abId: string; id: string; start: Pt; x0: number; y0: number; inv: Matrix };

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
  draw: 'draw',
  shader: 'shader',
};

/** Tools that start a new layer where you press, so the selection's resize and rotate handles stay out of the way. */
const CREATION_TOOLS = new Set<Tool>(['artboard', 'line', 'pen', 'pencil', 'image', ...(Object.keys(CREATE_TYPES) as Tool[])]);

const SNAP_PX = 6;
/** Where world (0, 0) sits in the scrollable pan space; pan is measured from here. */
const PAN_ORIGIN = 4_000_000;

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
    showBones: st.showBones,
    bottomTab: st.bottomTab,
    heat: st.heat,
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
  // The selection outline uses where layers were drawn (doc.ts recordDrawnGeometry), which is known only after the artboard
  // draws: redraw the overlay when that changes
  useSyncExternalStore(subscribeDrawnGeometry, drawnGeometryVersion);
  useEffect(() => dataCache.sync(s.project), [s.project.dataSources, assetVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const vp = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  // What the pointer would do here (set while it moves with no drag going), and what the drag going now is doing
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  // A note beside the pointer when pressing here will ask something first (the Bend tool converting a shape to a path,
  // a drag moving layers to another artboard), so it isn't a surprise
  const [toolHint, setToolHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const hintAt = (text: string | null, cx: number, cy: number) => {
    const r = vp.current?.getBoundingClientRect();
    setToolHint((cur) => (!text || !r ? (cur ? null : cur) : cur?.text === text && Math.abs(cur.x - (cx - r.left)) < 2 && Math.abs(cur.y - (cy - r.top)) < 2 ? cur : { text, x: cx - r.left, y: cy - r.top }));
  };
  const [dragCursorNow, setDragCursorNow] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
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
  // A bone being drawn (artboard space), mirrored in a ref for a quick click
  const [boneDraft, setBoneDraftState] = useState<{ abId: string; a: Pt; b: Pt } | null>(null);
  const boneDraftRef = useRef(boneDraft);
  const setBoneDraft = (b: typeof boneDraft) => {
    boneDraftRef.current = b;
    setBoneDraftState(b);
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

  // Bone glyphs follow the frame on show: constraints (IK) and the timeline's playhead move them
  const glyphs = useMemo(() => (active ? boneGlyphs(active.children) : []), [active]);

  // ---------------------------------------------------------------- coordinates

  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const r = vp.current!.getBoundingClientRect();
      return { x: (cx - r.left - panX) / zoom, y: (cy - r.top - panY) / zoom };
    },
    [panX, panY, zoom],
  );
  // Hit tests use what's drawn: for the open artboard that's the timeline frame at the playhead (and constraints),
  // not the layers' base values, or keyed layers couldn't be clicked once the playhead moved
  const abAt = (w: Pt): Artboard | undefined => {
    const ab = [...project.artboards].reverse().find((a) => w.x >= a.canvasX && w.y >= a.canvasY && w.x <= a.canvasX + a.width && w.y <= a.canvasY + a.height);
    return ab && active && ab.id === active.id ? active : ab;
  };
  const local = (ab: Artboard, w: Pt): Pt => ({ x: w.x - ab.canvasX, y: w.y - ab.canvasY });
  /**
   * The layer under the pointer. The artboard under the pointer goes first; then layers hanging outside their
   * artboard (the open one, or any that doesn't clip), so things moved past the edge can still be picked.
   */
  const layerAt = (w: Pt, pickDeepest: boolean): { ab: Artboard; hit: SceneNode } | null => {
    const under = abAt(w);
    const others = [...(active ? [active] : []), ...[...project.artboards].reverse().filter((a) => a.id !== active?.id && a.clip === false)].filter((a) => a.id !== under?.id);
    const order = [...(under ? [under] : []), ...others];
    // Visible layers win; hidden ones (drawn as ghosts) are picked only where nothing visible is
    for (const includeHidden of [false, true]) {
      for (const ab of order) {
        const p = local(ab, w);
        const hit = pickFromHit(hitTest(ab, p.x, p.y, { includeHidden }), pickDeepest);
        if (hit) return { ab, hit };
      }
    }
    return null;
  };
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
        setSpaceHeld(true);
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
        setSpaceHeld(false);
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

  // What a press would do belongs to the tool and the path being edited; start from the tool's own until the pointer moves
  useEffect(() => setHoverCursor(null), [s.tool, s.editingPathId]);

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
    const target = e.target as HTMLElement;
    pointerDown(e);
    // The pointer is captured for the drag, so the canvas has to show what it is doing. A handle says it itself (its own cursor)
    const d = drag.current;
    const own = target.closest?.('[data-handle]') ? getComputedStyle(target).cursor : '';
    setDragCursorNow(d ? dragCursor(d.kind, own) : null);
  };
  const pointerDown = (e: React.PointerEvent) => {
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
    if (st.editingTextId && !target.closest('.text-editor')) store().set({ editingTextId: null, textSelection: null });

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
        store().set({ activeArtboardId: a, artboardSelected: true, selection: [], focusId: null, activeTimelineId: a === st.activeArtboardId ? st.activeTimelineId : null });
        drag.current = { kind: 'moveAb', id: a, x0: target.canvasX, y0: target.canvasY, start: w };
        return;
      }
      if (kind === 'abresize' && ab) {
        drag.current = { kind: 'resizeAb', handle: a as Handle, id: ab.id, ab0: structuredClone(ab) };
        return;
      }
      if (kind === 'grad' && ab) {
        // A gradient's start, end, centre or radius handle: dragged in the layer's own px
        const ids = topmost(ab, st.selection);
        const loc = ids.length === 1 ? locate(ab, ids[0]) : undefined;
        if (loc && !loc.node.locked) drag.current = { kind: 'gradPt', id: ids[0], prefix: a, part: b as 'from' | 'to' | 'center' | 'radius', node0: structuredClone(loc.node), parentM: parentToArtboard(ab, ids[0]) };
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
        // While recording, an edit starts from the frame shown at the playhead (its keyed points), not the layer's own points
        const node0 = structuredClone(recordedNode(loc.node));
        if (kind === 'pt') {
          setSelPoint({ si, pi });
          if (e.altKey) {
            togglePointSmooth(node0, si, pi);
            return;
          }
          drag.current = { kind: 'pathPoint', si, pi, start: local(ab, w), node0, parentM: parentToArtboard(ab, loc.node.id) };
        } else {
          drag.current = {
            kind: 'pathHandle',
            si,
            pi,
            which: kind === 'hin' ? 'in' : 'out',
            node0,
            parentM: parentToArtboard(ab, loc.node.id),
            mirror: !e.altKey,
          };
        }
        return;
      }
      if (kind === 'bone' && ab) {
        const glyph = glyphs.find((g) => g.id === a);
        const loc = locate(ab, a);
        if (!glyph || !loc) return;
        // With the Bone tool, a drag from a tip carries on the chain
        if (st.tool === 'bone' && b === 'tip') {
          drag.current = { kind: 'boneDraw', abId: ab.id, parentId: glyph.id, chain: true, a: glyph.tip };
          setBoneDraft({ abId: ab.id, a: glyph.tip, b: glyph.tip });
          return;
        }
        const sel = e.shiftKey ? (st.selection.includes(a) ? st.selection.filter((x) => x !== a) : [...st.selection, a]) : st.selection.includes(a) && st.selection.length > 1 ? st.selection : [a];
        store().set({ selection: sel, artboardSelected: false, editingPathId: null });
        if (loc.node.locked) return;
        if (b === 'base') {
          const pm = parentToArtboard(ab, a);
          drag.current = { kind: 'boneMove', abId: ab.id, id: a, start: local(ab, w), x0: loc.node.x, y0: loc.node.y, inv: invert([pm[0], pm[1], pm[2], pm[3], 0, 0]) };
        } else drag.current = { kind: 'boneRotate', abId: ab.id, id: a };
        return;
      }
      if (kind === 'penstart' && penRef.current) {
        finishPen(true);
        return;
      }
    }

    const hitAb = abAt(w) ?? null;
    const tool = st.tool;

    if (tool === 'bend') {
      bendDown(e, w);
      return;
    }

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

    if (tool === 'bone') {
      const cab = hitAb ?? ab;
      if (!cab) return;
      const p = local(cab, w);
      if (cab.id !== st.activeArtboardId) store().set({ activeArtboardId: cab.id, selection: [], activeTimelineId: null });
      // Starting on a bone's tip continues that bone's chain; elsewhere a new bone starts (inside the layer you went into, if any)
      const near = cab.id === active?.id ? boneEndAt(glyphs, p, 10 / zoom, 'tip') : null;
      const focus = st.focusId && locate(cab, st.focusId) ? st.focusId : null;
      const start = near ? near.tip : p;
      drag.current = { kind: 'boneDraw', abId: cab.id, parentId: near ? near.id : focus, chain: !!near, a: start };
      setBoneDraft({ abId: cab.id, a: start, b: start });
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
      if (cab.id !== st.activeArtboardId) store().set({ activeArtboardId: cab.id, selection: [], activeTimelineId: null });
      return;
    }

    // Select tool
    if (st.editingPathId) {
      // On the edited path's outline a double-click adds a point, so leave edit mode only for clicks elsewhere
      if (editedSegmentAt(w)) return;
      exitPathEdit();
    }
    const found = layerAt(w, e.ctrlKey || e.metaKey);
    const selAb = found?.ab ?? hitAb;
    if (selAb) {
      const hitAb = selAb;
      const p = local(hitAb, w);
      const hit = found?.hit ?? null;
      if (hitAb.id !== st.activeArtboardId) {
        store().set({ activeArtboardId: hitAb.id, selection: [], focusId: null, activeTimelineId: null });
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

  const hoverAt = useRef<{ x: number; y: number; deep: boolean } | null>(null);
  const hoverFrame = useRef(0);
  const hoverNow = useRef<(cx: number, cy: number, deep: boolean) => void>(() => undefined);
  hoverNow.current = (cx, cy, deep) => {
    const st = store().get();
    if (spaceDown.current) return;
    const w = toWorld(cx, cy);
    // The Bend tool only does something on an edge it can bend, so only there does the cursor say so
    if (st.tool === 'bend') {
      const t = bendTargetAt(w, deep);
      setHoverCursor(t?.h ? BEND_CURSOR : null);
      hintAt(t?.h && t.n && t.n.type !== 'path' ? `Bending this ${nodeTypeLabel(t.n.type).toLowerCase()} will ask to turn it into a path first` : null, cx, cy);
      return;
    }
    if (toolHint) setToolHint(null);
    if (st.tool !== 'select') return;
    const found = layerAt(w, deep);
    const hab = found?.ab ?? abAt(w);
    // Over the outline of the path being edited a double-click adds a point; over a selected layer a drag moves it
    setHoverCursor(st.editingPathId && editedSegmentAt(w) ? ADD_POINT_CURSOR : found?.hit && st.selection.includes(found.hit.id) ? 'move' : null);
    if (hab) {
      const p = local(hab, w);
      const hit = found?.hit;
      setHover(hit ? `${hab.id}/${hit.id}` : null);
      // A locked or hidden layer under the pointer gets quick unlock / show buttons
      const trail = hitTest(hab, p.x, p.y, { includeLocked: true, includeHidden: true });
      const locked = hit && !hit.visible ? hit : [...trail].reverse().find((n) => n.locked);
      setLockedHover((cur) => (locked ? (cur?.id === locked.id ? cur : { abId: hab.id, id: locked.id }) : cur && Date.now() - (lockedSeen.current ?? 0) < 600 ? cur : null));
      if (locked) lockedSeen.current = Date.now();
    } else setHover(null);
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = 0; // or the next mount (StrictMode's second one) would think a frame was still due
    },
    [],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const st = store().get();
    const d = drag.current;
    const w = toWorld(e.clientX, e.clientY);
    liveSession()?.presence({ cursor: w, artboardId: st.activeArtboardId });
    if (!d) {
      // Hover feedback. Hit-testing every layer is the costly part and pointers report far more often than the screen
      // draws, so it runs once per frame, for the latest position
      if ((st.tool === 'select' || st.tool === 'bend') && !spaceDown.current) {
        hoverAt.current = { x: e.clientX, y: e.clientY, deep: e.ctrlKey || e.metaKey };
        if (!hoverFrame.current) {
          hoverFrame.current = requestAnimationFrame(() => {
            hoverFrame.current = 0;
            const at = hoverAt.current;
            if (at && !drag.current) hoverNow.current(at.x, at.y, at.deep);
          });
        }
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
        // Letting go over another artboard offers to move the layers there: say so while it's possible
        const over = abAt(w);
        hintAt(over && over.id !== d.abId && !d.duplicated ? `Let go to move to “${over.name}” (you'll be asked first)` : null, e.clientX, e.clientY);
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
      case 'gradPt': {
        if (!ab) break;
        const pp = apply(invert(d.parentM), w.x - ab.canvasX, w.y - ab.canvasY);
        const lp = apply(invert(nodeMatrix(d.node0)), pp.x, pp.y);
        const x = round(lp.x, 1);
        const y = round(lp.y, 1);
        if (d.part === 'radius') {
          const c = getPath(d.node0, `${d.prefix}.center`) as { x?: number; y?: number } | undefined;
          store().setProps([d.id], { [`${d.prefix}.radius`]: Math.max(0.1, round(Math.hypot(lp.x - (c?.x ?? d.node0.width / 2), lp.y - (c?.y ?? d.node0.height / 2)), 1)) }, 'grad');
        } else store().setProps([d.id], { [`${d.prefix}.${d.part}.x`]: x, [`${d.prefix}.${d.part}.y`]: y }, 'grad');
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
        store().setPathPoints(d.node0.id, paths, { from: d.node0.paths, coalesce: 'path-edit' });
        break;
      }
      case 'bend': {
        if (!ab) break;
        const lp = toNodeLocal(d.node0, d.parentM, local(ab, w));
        const sp = toNodeLocal(d.node0, d.parentM, d.start);
        const paths = bendPaths(d.node0.paths, d.si, d.i, d.t, { x: lp.x - sp.x, y: lp.y - sp.y }, e.altKey);
        store().setPathPoints(d.node0.id, paths, { from: d.node0.paths, coalesce: 'bend' });
        break;
      }
      case 'boneDraw': {
        const bab = getArtboard(st.project, d.abId);
        if (!bab) break;
        let p = local(bab, w);
        if (e.shiftKey) {
          // Angles in steps of 15 degrees
          const len = Math.hypot(p.x - d.a.x, p.y - d.a.y);
          const ang = Math.round(Math.atan2(p.y - d.a.y, p.x - d.a.x) / (Math.PI / 12)) * (Math.PI / 12);
          p = { x: d.a.x + Math.cos(ang) * len, y: d.a.y + Math.sin(ang) * len };
        }
        setBoneDraft({ abId: d.abId, a: d.a, b: p });
        break;
      }
      case 'boneRotate': {
        const bab = getArtboard(st.project, d.abId);
        const loc = bab && locate(bab, d.id);
        if (!bab || !loc) break;
        const base = apply(nodeToArtboard(bab, d.id), 0, 0);
        const p = local(bab, w);
        if (Math.hypot(p.x - base.x, p.y - base.y) < 2 / zoom) break;
        let r = rotationFor(parentToArtboard(bab, d.id), { x: p.x - base.x, y: p.y - base.y }, loc.node.scaleX);
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        r = ((r % 360) + 540) % 360 - 180;
        store().setProps([d.id], { rotation: round(r, 1) }, 'bone-rotate');
        break;
      }
      case 'boneMove': {
        const bab = getArtboard(st.project, d.abId);
        if (!bab) break;
        const p = local(bab, w);
        const q = apply(d.inv, p.x - d.start.x, p.y - d.start.y);
        store().setProps([d.id], { x: round(d.x0 + q.x), y: round(d.y0 + q.y) }, 'bone-move');
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
        store().setPathPoints(d.node0.id, paths, { from: d.node0.paths, coalesce: 'path-edit' });
        break;
      }
    }
  };

  // ---------------------------------------------------------------- pointer up

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragCursorNow(null);
    if (d?.kind === 'bend' && !store().get().recording) {
      // the curve can reach past the layer's box: settle the box around the points (not for keyed shapes, whose keys hold the points as they are)
      const st = store().get();
      const ab = getArtboard(st.project, st.activeArtboardId);
      const loc = ab && locate(ab, d.id);
      if (ab && loc?.node.type === 'path' && !hasShapeKeys(ab.timelines, d.id)) {
        const n = normalizePath(loc.node);
        store().setProps([d.id], { x: round(n.x, 2), y: round(n.y, 2), width: round(n.width, 2), height: round(n.height, 2), paths: n.paths }, 'bend');
      }
    }
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
    if (d.kind === 'boneDraw') {
      const draft = boneDraftRef.current;
      setBoneDraft(null);
      const bab = getArtboard(st.project, d.abId);
      // A click without a drag draws nothing
      if (!draft || !bab || Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) * zoom < 6) return;
      store().addNodes([boneFromDrag(bab, d.parentId, draft.a, draft.b, { chain: d.chain })], { parentId: d.parentId, artboardId: bab.id });
      return;
    }
    if (d.kind === 'marquee') {
      setBox(null);
      return;
    }
    setToolHint(null);
    if (d.kind === 'move' && d.moved && !d.duplicated) {
      // Dropped over a different artboard: offer to move the layers there
      const target = abAt(toWorld(e.clientX, e.clientY));
      if (target && target.id !== d.abId) {
        const src = getArtboard(st.project, d.abId);
        const ids = d.items.map((i) => i.id);
        const what = ids.length === 1 ? `“${src && locate(src, ids[0])?.node.name}”` : `${ids.length} layers`;
        void confirmDialog({
          title: 'Move to artboard',
          message: `Move ${what} to the artboard “${target.name}”?\n\nIts keys in this artboard's timelines are removed, and interactions here that use it will need fixing.`,
          confirmLabel: 'Move',
        }).then((ok) => ok && store().moveToArtboard(ids, target.id));
      }
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
    if (st.editingPathId) {
      const h = editedSegmentAt(w);
      if (h) {
        store().insertPathPoint(st.editingPathId, h.si, h.i, h.t);
        setSelPoint({ si: h.si, pi: h.i + 1 });
        return;
      }
    }
    const ab = layerAt(w, e.ctrlKey || e.metaKey)?.ab ?? abAt(w);
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
    // Shape keys hold points in the layer's own coordinates, so a layer that has them keeps its box and points as they are
    if (hasShapeKeys(ab.timelines, id)) return;
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
    store().setPathPoints(n.id, paths, { from: n.paths });
  }

  function deletePathPoint(id: string, sel: { si: number; pi: number }) {
    setSelPoint(null);
    // shape keys of the point go with it and the later points' keys are renumbered
    if (!store().removePathPoint(id, sel.si, sel.pi)) {
      store().set({ editingPathId: null });
      store().deleteSelection();
    }
  }

  /** The layer as the canvas shows it while recording (its frame at the playhead); otherwise as it is. */
  function recordedNode(n: PathNode): PathNode {
    const st = store().get();
    if (!(st.recording && st.bottomTab === 'timeline' && st.activeTimelineId) || !active) return n;
    const shown = locate(active, n.id)?.node;
    return shown?.type === 'path' ? shown : n;
  }

  /** The segment of the path being edited under a world point, if there is one. */
  function editedSegmentAt(w: Pt): SegmentHit | null {
    const st = store().get();
    const ab = getArtboard(st.project, st.activeArtboardId);
    const id = st.editingPathId;
    const loc = ab && id ? locate(ab, id) : null;
    if (!ab || !loc || loc.node.type !== 'path') return null;
    const node = recordedNode(loc.node);
    return nearestSegment(node.paths, toNodeLocal(node, parentToArtboard(ab, node.id), local(ab, w)), 6 / zoom);
  }

  /**
   * Bend tool: press on an edge of a shape and drag. Path layers bend straight away; the box shapes first offer to
   * become paths (their outline needs points to bend).
   */
  /** The edge the Bend tool would grab at a world point (the cursor and the press both ask), and the layer under it for when there is none. */
  function bendTargetAt(w: Pt, deep: boolean) {
    const st = store().get();
    const bab = abAt(w) ?? getArtboard(st.project, st.activeArtboardId);
    if (!bab) return null;
    const base = getArtboard(st.project, bab.id) ?? bab;
    const p = local(base, w);
    const recording = st.recording && st.bottomTab === 'timeline' && !!st.activeTimelineId;
    const src = recording && active && active.id === base.id ? active : base;
    // The selected layer is tried first, so its edge wins over layers on top of it
    const cands: SceneNode[] = [];
    for (const id of st.selection) {
      const n = locate(src, id)?.node;
      if (n && n.visible && !n.locked) cands.push(n);
    }
    const under = layerAt(w, deep)?.hit;
    const underNode = under && locate(src, under.id)?.node;
    if (underNode && !cands.some((c) => c.id === underNode.id)) cands.push(underNode);
    for (const n of cands) {
      const paths = n.type === 'path' ? n.paths : shapeToPaths(n);
      if (!paths) continue;
      const pm = parentToArtboard(src, n.id);
      const h = nearestSegment(paths, toNodeLocal(n, pm, p), 8 / zoom);
      if (h) return { n, h, pm, p, under, selected: st.selection.includes(n.id) };
    }
    return { n: null, h: null, pm: null, p, under, selected: false };
  }

  function bendDown(e: React.PointerEvent, w: Pt) {
    const t = bendTargetAt(w, e.ctrlKey || e.metaKey);
    if (!t) return;
    const { n, h, pm, p, under } = t;
    if (n && h && pm) {
      if (n.type !== 'path') {
        void confirmDialog({
          title: 'Convert to path',
          message: `To bend “${n.name}” its outline needs points, so it has to become a path.\n\nIts place, fill, stroke and keys stay. Its ${n.type === 'rect' ? 'corner radius' : n.type === 'polygon' ? 'sides' : n.type === 'star' ? 'points and inner ratio' : 'shape'} settings are replaced by the points, and its width and height no longer stretch the outline.`,
          confirmLabel: 'Convert to path',
        }).then((ok) => {
          if (!ok || !store().convertToPath(n.id)) return;
          store().select([n.id]);
          store().toast('Now a path. Drag along an edge to bend it.');
        });
        return;
      }
      if (!t.selected) store().select([n.id]);
      drag.current = { kind: 'bend', id: n.id, si: h.si, i: h.i, t: h.t, start: p, node0: structuredClone(n), parentM: pm };
      return;
    }
    // Not on an edge: pick the layer under the pointer, as the select tool does
    if (under) store().select([under.id]);
  }

  // ---------------------------------------------------------------- drop files

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    // A component dragged from the Libraries panel
    const comp = e.dataTransfer.getData(COMPONENT_DRAG);
    if (comp) {
      try {
        const { libraryId, componentId } = JSON.parse(comp) as { libraryId: string; componentId: string };
        const w = toWorld(e.clientX, e.clientY);
        const ab = abAt(w) ?? active;
        if (ab) await dropComponent(libraryId, componentId, ab.id, local(ab, w));
      } catch {
        /* not ours */
      }
      return;
    }
    // the drop's file handles have to be asked for right now, before anything is awaited
    const files = captureDrop(e.dataTransfer);
    if (!files.length) return;
    const w = toWorld(e.clientX, e.clientY);
    const ab = abAt(w) ?? active;
    if (!ab) return;
    await insertFiles(files, ab.id, local(ab, w));
  };

  // ---------------------------------------------------------------- overlay

  const overlay: JSX.Element[] = [];
  // The overlay is drawn without the pan and moved by a CSS transform, so panning doesn't repaint it (which in a big
  // project makes the browser rebuild layers for every element on each frame)
  const oscreen = (ab: Artboard | { canvasX: number; canvasY: number } | null, p: Pt): Pt => ({
    x: ((ab?.canvasX ?? 0) + p.x) * zoom,
    y: ((ab?.canvasY ?? 0) + p.y) * zoom,
  });
  const toS = (ab: Artboard, p: Pt) => oscreen(ab, p);

  // Where learners clicked (Insights > Click heat): one square per grid cell, hotter the more clicks
  if (s.heat) {
    const hab = getArtboard(project, s.heat.artboardId);
    if (hab) {
      const size = s.heat.cell * zoom;
      overlay.push(
        <g key="click-heat" className="click-heat" pointerEvents="none">
          {s.heat.cells.map((c) => {
            const p = oscreen(hab, { x: c.x, y: c.y });
            const t = Math.sqrt(c.n / s.heat!.max);
            // cool blue through green and yellow to red, cells touching so a busy area reads as one patch
            return <rect key={`${c.x},${c.y}`} x={p.x} y={p.y} width={size + 0.5} height={size + 0.5} fill={`hsl(${Math.round(230 - 230 * t)} 95% 52%)`} opacity={0.2 + 0.55 * t}><title>{`${c.n} click${c.n === 1 ? '' : 's'}`}</title></rect>;
          })}
        </g>,
      );
    }
  }

  for (const ab of project.artboards) {
    const tl = oscreen(ab, { x: 0, y: 0 });
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
        {ab.library ? '  ◆ library' : ''}
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

    // Bones: octahedral glyphs, a joint at each base and a handle on each tip. Click or drag the body to select and turn,
    // drag the base to move. They show while the Bone tool is in use even when hidden.
    if (s.showBones || s.tool === 'bone') {
      for (const g of glyphs) {
        const a = toS(active, g.base);
        const t = toS(active, g.tip);
        const len = Math.hypot(t.x - a.x, t.y - a.y) || 1;
        const ux = (t.x - a.x) / len;
        const uy = (t.y - a.y) / len;
        const w = Math.min(9, Math.max(3, len * 0.16));
        const kx = a.x + ux * len * 0.18;
        const ky = a.y + uy * len * 0.18;
        const sel = s.selection.includes(g.id);
        overlay.push(
          <g key={`bone-${g.id}`} className={`bone-glyph${sel ? ' selected' : ''}`}>
            <polygon data-handle={`bone:${g.id}:body`} className="bone-body" style={{ cursor: rotateCursor(135) }} points={`${a.x},${a.y} ${kx - uy * w},${ky + ux * w} ${t.x},${t.y} ${kx + uy * w},${ky - ux * w}`} />
            <circle data-handle={`bone:${g.id}:base`} className="bone-joint" cx={a.x} cy={a.y} r={3.5} />
            <circle data-handle={`bone:${g.id}:tip`} className="bone-tip" style={{ cursor: s.tool === 'bone' ? BONE_CHAIN_CURSOR : rotateCursor(135) }} cx={t.x} cy={t.y} r={3} />
          </g>,
        );
      }
    }

    // (Bones draw their own glyphs: a bone has no box to resize)
    const ids = topmost(active, s.selection.filter((id) => locate(active, id))).filter((id) => locate(active, id)?.node.type !== 'bone');
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
      // The Bend tool works on the edges themselves, and a creation tool draws wherever you drag (the rotate zones outside a
      // selected layer's corners would otherwise swallow the start of a new shape), so no resize/rotate handles sit on top then
      if (!locked && s.tool !== 'bend' && s.tool !== 'bone' && !CREATION_TOOLS.has(s.tool)) {
        for (const h of ['nw', 'ne', 'se', 'sw'] as Handle[]) {
          const [fx, fy] = HANDLE_POS[h];
          const c = at(fx, fy);
          const dx = c.x - center.x;
          const dy = c.y - center.y;
          const len = Math.hypot(dx, dy) || 1;
          overlay.push(<circle key={`rot-${h}`} data-handle={`rotate:${h}`} className="rotate-zone" style={{ cursor: rotateCursorAt(h, quad as [Pt, Pt, Pt, Pt]) }} cx={c.x + (dx / len) * 14} cy={c.y + (dy / len) * 14} r={10} />);
        }
        for (const h of HANDLES) {
          const [fx, fy] = HANDLE_POS[h];
          const c = at(fx, fy);
          overlay.push(<rect key={`h-${h}`} data-handle={`resize:${h}`} className={`handle h-${h}`} style={{ cursor: resizeCursor(h, quad as [Pt, Pt, Pt, Pt]) }} x={c.x - 4} y={c.y - 4} width={8} height={8} />);
        }
      }
      // Gradients with points of their own: the points are handles, dragged in the layer's own px
      const sel1 = ids.length === 1 ? (locate(active, ids[0])!.node as unknown as { fill: Paint | null; stroke: Stroke | null; fills?: Paint[]; strokes?: Stroke[]; paintOrder?: never } & SceneNode) : null;
      if (sel1 && !locked && size.w > 0 && size.h > 0 && s.tool !== 'bend' && s.tool !== 'bone' && !CREATION_TOOLS.has(s.tool)) {
        const paints = [
          ...fillList(sel1).map((p, i) => ({ p, prefix: fillPath(i, sel1) })),
          ...strokeList(sel1).map((st, i) => ({ p: st.paint, prefix: `${strokePath(i, sel1)}.paint` })),
        ];
        const gh = (key: string, x: number, y: number, part: string, prefix: string, color: string, title: string) => {
          const c = at(x / size.w, y / size.h);
          overlay.push(
            <circle key={key} data-handle={`grad:${prefix}:${part}`} className="grad-handle" cx={c.x} cy={c.y} r={6} style={{ fill: color }}>
              <title>{title}</title>
            </circle>,
          );
          return c;
        };
        for (const { p, prefix } of paints) {
          if (p.type === 'linear' && (p.from || p.to) && p.visible !== false) {
            const l = linearLine(p, size.w, size.h);
            const a = at(l.x1 / size.w, l.y1 / size.h);
            const b = at(l.x2 / size.w, l.y2 / size.h);
            overlay.push(<line key={`gl-${prefix}`} className="grad-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
            gh(`gf-${prefix}`, l.x1, l.y1, 'from', prefix, p.stops[0]?.color ?? '#fff', 'Gradient start (drag)');
            gh(`gt-${prefix}`, l.x2, l.y2, 'to', prefix, p.stops[p.stops.length - 1]?.color ?? '#000', 'Gradient end (drag)');
          } else if (p.type === 'radial' && p.visible !== false && (p.center || (typeof p.radius === 'number' && p.radius > 0))) {
            const c = radialCircle(p, size.w, size.h);
            const mid = at(c.cx / size.w, c.cy / size.h);
            const edge = at((c.cx + c.r) / size.w, c.cy / size.h);
            overlay.push(<line key={`gl-${prefix}`} className="grad-line" x1={mid.x} y1={mid.y} x2={edge.x} y2={edge.y} />);
            gh(`gc-${prefix}`, c.cx, c.cy, 'center', prefix, p.stops[0]?.color ?? '#fff', 'Gradient centre (drag)');
            gh(`gr-${prefix}`, c.cx + c.r, c.cy, 'radius', prefix, p.stops[p.stops.length - 1]?.color ?? '#000', 'Gradient radius (drag)');
          }
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
        // A skinned path is drawn deformed, but its points are edited in their rest shape
        const rest = loc.node.skin && baseActive ? (locate(baseActive, loc.node.id)?.node as PathNode | undefined) : undefined;
        (rest?.type === 'path' ? rest : loc.node).paths.forEach((sp, si) =>
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
      const q = oscreen(pab, p);
      return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    });
    overlay.push(<path key="pencil" className="pencil-stroke" d={d.join('')} />);
  }

  // Marquee / creation preview
  if (box) {
    const bab = box.abId ? getArtboard(project, box.abId) ?? null : null;
    if (drag.current?.kind === 'create' && drag.current.tool === 'line') {
      const a = oscreen(bab, { x: box.rect.x, y: box.rect.y });
      const b = oscreen(bab, { x: box.rect.x + box.rect.width, y: box.rect.y + box.rect.height });
      overlay.push(<line key="box" className="create-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
    } else {
      const a = oscreen(bab, { x: box.rect.x, y: box.rect.y });
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

  // A bone being drawn
  if (boneDraft) {
    const bab = getArtboard(project, boneDraft.abId) ?? null;
    const a = oscreen(bab, boneDraft.a);
    const b = oscreen(bab, boneDraft.b);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const w = Math.min(9, Math.max(3, len * 0.16));
    const kx = a.x + ux * len * 0.18;
    const ky = a.y + uy * len * 0.18;
    overlay.push(<polygon key="bone-draft" className="bone-body bone-draft" points={`${a.x},${a.y} ${kx - uy * w},${ky + ux * w} ${b.x},${b.y} ${kx + uy * w},${ky - ux * w}`} />);
    overlay.push(
      <text key="bone-draft-len" className="size-label" x={(a.x + b.x) / 2} y={Math.max(a.y, b.y) + 18}>
        {Math.round(Math.hypot(boneDraft.b.x - boneDraft.a.x, boneDraft.b.y - boneDraft.a.y))} px
      </text>,
    );
  }

  // Snap guides
  if (guides) {
    const gab = getArtboard(project, guides.abId);
    if (gab) {
      for (const x of guides.x) {
        const a = oscreen(gab, { x, y: -10000 });
        overlay.push(<line key={`gx-${x}`} className="guide" x1={a.x} x2={a.x} y1={-100000} y2={100000} />);
      }
      for (const y of guides.y) {
        const a = oscreen(gab, { x: -10000, y });
        overlay.push(<line key={`gy-${y}`} className="guide" x1={-100000} x2={100000} y1={a.y} y2={a.y} />);
      }
    }
  }

  // Pen preview
  if (pen) {
    const pab = getArtboard(project, pen.abId);
    if (pab) {
      const sp = pen.points.map((p) => ({ ...p, ...oscreen(pab, p) }));
      let d = '';
      sp.forEach((p, i) => {
        if (i === 0) d += `M${p.x} ${p.y}`;
        else {
          const a = pen.points[i - 1];
          const b = pen.points[i];
          const c1 = oscreen(pab, { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) });
          const c2 = oscreen(pab, { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) });
          d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`;
        }
      });
      if (pen.cursor && !drag.current && sp.length) {
        const c = oscreen(pab, pen.cursor);
        d += `L${c.x} ${c.y}`;
      }
      overlay.push(<path key="pen" className="pen-preview" d={d} />);
      sp.forEach((p, i) => {
        overlay.push(
          <rect key={`pp-${i}`} data-handle={i === 0 && sp.length > 1 ? 'penstart' : undefined} className={`path-point${i === 0 ? ' first' : ''}`} style={i === 0 && sp.length > 1 ? { cursor: PEN_CLOSE_CURSOR } : undefined} x={p.x - 4} y={p.y - 4} width={8} height={8} />,
        );
        if (pen.points[i].out) {
          const o = oscreen(pab, { x: pen.points[i].x + pen.points[i].out!.x, y: pen.points[i].y + pen.points[i].out!.y });
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
        const pts = nodeCorners(pab, id).map((p) => oscreen(pab, p));
        overlay.push(<polygon key={`peer-${peer.clientId}-${id}`} className="peer-outline" stroke={peer.color} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />);
      }
    }
    if (peer.cursor) {
      const c = oscreen(null, peer.cursor);
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
      { type: 'draw', label: 'Script layer' },
      { type: 'shader', label: 'Shader layer' },
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

  // While the view moves, the whole world is one composited layer, so panning slides pixels instead of repainting
  // every shape; once it settles the layer goes, and the browser redraws sharply at the new zoom
  const scrollRef = useRef<HTMLDivElement>(null);
  // The store's pan is the source of truth; the scroll position follows it
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = PAN_ORIGIN - panX;
    const y = PAN_ORIGIN - panY;
    if (Math.abs(el.scrollLeft - x) > 0.5) el.scrollLeft = x;
    if (Math.abs(el.scrollTop - y) > 0.5) el.scrollTop = y;
  }, [panX, panY]);
  // Anything else that scrolls it (touch, the browser restoring a position) moves the pan to match
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const st = store().get();
    const px = PAN_ORIGIN - el.scrollLeft;
    const py = PAN_ORIGIN - el.scrollTop;
    if (Math.abs(px - st.panX) > 1 || Math.abs(py - st.panY) > 1) store().set({ panX: px, panY: py });
  };

  // Which artboards to draw at once and which to leave for the scheduler (see `viewPlan`)
  const views = viewPlan(project.artboards, s.activeArtboardId, zoom, panX, panY, vp.current?.clientWidth || window.innerWidth, vp.current?.clientHeight || window.innerHeight);

  const showRulers = usePrefs().rulers;
  // Space pans, a drag shows what it is doing, then what a press under the pointer would do, then the tool's own
  const cursor = dragCursorNow ?? (spaceHeld ? 'grab' : s.tool === 'select' || s.tool === 'bend' ? hoverCursor ?? toolCursor(s.tool) : toolCursor(s.tool));

  return (
    <div
      ref={vp}
      className="canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setToolHint(null)}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => {
        e.preventDefault();
        // Files and library components are copied in, not moved
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
      onContextMenu={openMenu}
    >
      {/* Panning scrolls this box instead of moving the world: the browser scrolls on the compositor, where a moving
          transform would make it rebuild layers for every element on every frame (slow in big projects) */}
      <div ref={scrollRef} className="canvas-scroll" onScroll={onScroll}>
        <div className="canvas-space" style={{ width: PAN_ORIGIN * 2, height: PAN_ORIGIN * 2 }}>
      <div className="world" style={{ left: PAN_ORIGIN, top: PAN_ORIGIN, transform: `scale(${zoom})` }}>
        {project.artboards.map((ab) => (
          <ArtboardView
            key={ab.id}
            deferred={views.get(ab.id)!.deferred}
            rank={views.get(ab.id)!.rank}
            artboard={ab}
            project={project}
            timeline={ab.id === s.activeArtboardId ? timeline : null}
            time={s.playhead}
            active={ab.id === s.activeArtboardId}
            assetVersion={assetVersion}
            dataVersion={dataVersion}
            live={ab.id === s.activeArtboardId}
          />
        ))}
      </div>
      <svg className="overlay" style={{ left: PAN_ORIGIN, top: PAN_ORIGIN }}>
        {overlay}
      </svg>
        </div>
      </div>
      {lockedHover &&
        s.tool === 'select' &&
        (() => {
          const lab = getArtboard(project, lockedHover.abId);
          const b = lab && selectionBounds(lab, [lockedHover.id]);
          const n = lab && locate(lab, lockedHover.id)?.node;
          if (!lab || !b || !n || (!n.locked && n.visible)) return null;
          const at = screen(lab, { x: b.x + b.width, y: b.y });
          const keep = {
            onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            onPointerEnter: () => (lockedSeen.current = Date.now() + 100000),
            onPointerLeave: () => (lockedSeen.current = Date.now()),
          };
          const done = () => {
            store().select([n.id], { artboardId: lab.id });
            setLockedHover(null);
          };
          return (
            <div className="quick-badges" style={{ left: at.x + 6, top: at.y }} {...keep}>
              {!n.visible && (
                <button
                  className="quick-unlock"
                  title={`“${n.name}” is hidden: click to show it`}
                  onClick={(e) => {
                    e.stopPropagation();
                    store().set({ activeArtboardId: lab.id });
                    store().setProps([n.id], { visible: true });
                    done();
                  }}
                >
                  <Icons.eyeOff width={13} />
                </button>
              )}
              {n.locked && (
                <button
                  className="quick-unlock"
                  title={`Unlock “${n.name}”`}
                  onClick={(e) => {
                    e.stopPropagation();
                    store().set({ activeArtboardId: lab.id });
                    store().setProps([n.id], { locked: false });
                    done();
                  }}
                >
                  <Icons.lock width={13} />
                </button>
              )}
            </div>
          );
        })()}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {showRulers && <Rulers ab={active} zoom={zoom} panX={panX} panY={panY} width={vp.current?.clientWidth ?? 2000} height={vp.current?.clientHeight ?? 1200} />}
      {s.editingTextId && active && <TextEditor ab={active} id={s.editingTextId} zoom={zoom} panX={panX} panY={panY} />}
      {toolHint && (
        <div className="tool-hint" role="status" style={{ left: toolHint.x + 18, top: toolHint.y + 20 }}>
          <Icons.info className="tool-hint-icon" />
          <span>{toolHint.text}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- in-place text editing

function TextEditor({ ab, id, zoom, panX, panY }: { ab: Artboard; id: string; zoom: number; panX: number; panY: number }) {
  const loc = locate(ab, id);
  if (!loc) return null;
  if (loc.node.type === 'text') return <RichTextEditor node={loc.node} ab={ab} zoom={zoom} panX={panX} panY={panY} />;
  return <PlainTextEditor ab={ab} id={id} zoom={zoom} panX={panX} panY={panY} />;
}

/** In-place editor for text layers: a contenteditable with one span per run, so ranges can be styled (Ctrl/Cmd+B, I, U, Shift+X; or the inspector). */
function RichTextEditor({ node: n, ab, zoom, panX, panY }: { node: Extract<SceneNode, { type: 'text' }>; ab: Artboard; zoom: number; panX: number; panY: number }) {
  const id = n.id;
  const ref = useRef<HTMLDivElement>(null);
  const painted = useRef<TextRun[]>([]);
  const ownSig = useRef('');
  const sigOf = (t: Extract<SceneNode, { type: 'text' }>) => JSON.stringify([t.text, t.runs ?? null, zoom]);
  const paint = () => {
    const el = ref.current;
    if (!el) return;
    const node = locate(store().artboard()!, id)?.node;
    if (!node || node.type !== 'text') return;
    painted.current = nodeRuns(node).map((r) => ({ ...r }));
    paintRuns(el, painted.current, node, zoom);
    ownSig.current = sigOf(node);
  };
  // First paint, focus and select everything
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    paint();
    el.focus();
    const len = el.textContent?.length ?? 0;
    setSelectionOffsets(el, 0, len);
    store().set({ textSelection: { id, start: 0, end: len } });
    return () => {
      if (store().get().textSelection?.id === id) store().set({ textSelection: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // The document changed some other way than typing here: repaint, keeping the selection
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sigOf(n) === ownSig.current) return;
    paint();
    const sel = store().get().textSelection;
    if (sel && sel.id === id && document.activeElement === el) setSelectionOffsets(el, sel.start, sel.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.text, n.runs, zoom]);
  useEffect(() => {
    const onSel = () => {
      const el = ref.current;
      const o = el && selectionOffsets(el);
      if (!o) return;
      const cur = store().get().textSelection;
      if (!cur || cur.id !== id || cur.start !== o.start || cur.end !== o.end) store().set({ textSelection: { id, ...o } });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [id]);

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
    textTransform: n.textTransform,
    color: n.color,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };
  const read = () => {
    const el = ref.current;
    if (!el) return;
    store().setTextRuns(id, readRuns(el, painted.current), `text-${id}`);
    const node = locate(store().artboard()!, id)?.node;
    if (node && node.type === 'text') ownSig.current = sigOf(node);
  };
  return (
    <div
      ref={ref}
      className="text-editor"
      style={style}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      onInput={read}
      onBlur={(e) => {
        // Focus moving into the inspector (to change colour or size of the selection) keeps editing
        const to = e.relatedTarget as HTMLElement | null;
        if (to?.closest?.('.inspector')) return;
        store().commit();
        store().set({ editingTextId: null, textSelection: null });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          (e.target as HTMLElement).blur();
          return;
        }
        const mod = e.metaKey || e.ctrlKey;
        const kind: ToggleKind | null = mod && !e.altKey ? (e.key.toLowerCase() === 'b' && !e.shiftKey ? 'bold' : e.key.toLowerCase() === 'i' && !e.shiftKey ? 'italic' : e.key.toLowerCase() === 'u' && !e.shiftKey ? 'underline' : e.key.toLowerCase() === 'x' && e.shiftKey ? 'strike' : null) : null;
        if (!kind) return;
        e.preventDefault();
        const el = ref.current;
        const o = el && selectionOffsets(el);
        if (!o || o.start === o.end) return;
        const node = locate(store().artboard()!, id)?.node;
        if (!node || node.type !== 'text') return;
        store().styleTextRange(id, o.start, o.end, toggleRunStyle(nodeRuns(node), o.start, o.end, kind, node));
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

function PlainTextEditor({ ab, id, zoom, panX, panY }: { ab: Artboard; id: string; zoom: number; panX: number; panY: number }) {
  const loc = locate(ab, id);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [id]);
  if (!loc) return null;
  const n = loc.node;
  if (n.type !== 'button' && n.type !== 'link' && n.type !== 'text') return null;
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
    case 'draw':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="#10131a" fillOpacity={0.9} />
          {h > 14 * zoom && label('Script layer', '#6f8cff', 14)}
        </>
      );
    case 'shader':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="#1a1030" fillOpacity={0.9} />
          {h > 14 * zoom && label('Shader layer', '#c58bff', 14)}
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
