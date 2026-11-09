import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { keyHints, runCommand } from '../lib/keymap';
import { windowCommand } from '../lib/key-area';
import {
  LIGHT_LOOK,
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
  setMembers,
  isContainer,
  nodeMatrix,
  pathBounds,
  polygonPoints,
  starPoints,
  subPathsToD,
  sampleArtboard,
  applyConstraints,
  nodeRuns,
  rotationFor,
  type Artboard,
  type ConnectorNode,
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
import { shortcutAction } from '../lib/text-toolbar';
import { TextToolbar, type ToolbarCommands } from './TextToolbar';
import { paintRuns, readRuns, selectionOffsets, setSelectionOffsets } from '../lib/rich-text-dom';
import { store, useEditor, type Tool } from '../store/store';
import { CommentLayer } from './CommentLayer';
import { NotesLayer } from './NotesLayer';
import { HitPulse } from './HitPulse';
import { PageLinkLayer } from './PageLinkLayer';
import { setShowRoutes, showRoutes } from '../lib/page-routes-pref';
import { addNote, leaveNote, noteScale } from '../lib/notes';
import { NOTE_DEFAULT_H, NOTE_DEFAULT_W } from 'interactives-player';
import { anchorAt } from '../lib/comment-anchor';
import { comments } from '../lib/comments';
import { drawnBox, drawnGeometryVersion, getArtboard, hitTest, locate, nodeCorners, nodeToArtboard, parentToArtboard, selectionBounds, subscribeDrawnGeometry, topmost, type Rect } from '../store/doc';
import { isBrandHeld } from '../lib/branded/lock';
import { tidyArtboardsCommand } from '../lib/tidy-command';
import { groupFrame, groupMembers, pickedArtboardIds } from '../lib/artboard-groups';
import { artboardMenuItems, fitPageCommand, fitPageSelectionItems } from '../lib/artboard-commands';
import { assetUrls } from '../lib/assets';
import { dataCache } from '../lib/data';
import { prefs, setPrefs, usePrefs } from '../lib/prefs';
import { GUIDE_REACH, guidesOn } from '../lib/guides';
import { PAGE_DRAG, componentChoices, wouldLoop, getDraggedPage, insertComponent, openInsertComponentPicker } from '../lib/components';
import { ALT_DRAG_HINT, ALT_DRAG_TIP, altHintDue, useAltHeld } from '../lib/alt-drag';
import { artboardGridMenu, gridMenu } from '../components/grid-menu';
import { gridFor, gridLabel, gridLook } from '../lib/grid';
import { SNAP_LABEL, buildTargets, pixelRound, snapAny, snapArtboardBox, snapFor, snapMoveBox, snapPointer, type Gap, type SnapSet, type SnapSettings, type Target } from '../lib/snapping';
import { fontStack } from '../lib/font-catalog';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { selectSameItems } from '../lib/layer-find';
import { copySelection, pasteNodes } from '../lib/clipboard';
import { inGhostExtent } from './ghost';
import { openContextHelp } from '../help/Help';
import { Rulers } from './Rulers';
import { CropOverlay } from './CropOverlay';
import { canCrop } from '../lib/crop';
import { Icons } from '../components/icons';
import { freehandToPath } from './freehand';
import { ArtboardView, holdView, whenViewDrawn } from './ArtboardView';
import { fontsReadyFor, fontsReadyNow } from '../lib/fonts';
import { hasCachedStill, stillHash } from '../lib/still-cache';
import { lookDefaults, lookFor, shownTheme } from '../lib/themes';
import { viewPlan } from './viewPlan';
import { HANDLE_POS, HANDLES, normalizePath, placeBox, resizeBox, scalePaths, type Handle } from './transform';
import { ADD_POINT_CURSOR, BEND_CURSOR, BONE_CHAIN_CURSOR, PEN_CLOSE_CURSOR, dragCursor, resizeCursor, rotateCursor, rotateCursorAt, toolCursor } from './cursors';
import { insertFiles } from '../lib/insert';
import { captureDrop } from '../lib/links';
import { liveSession } from '../lib/live';
import { bendPaths, hasShapeKeys, nearestSegment, shapeToPaths, type SegmentHit } from '../lib/path-edit';
import { confirmDialog } from '../components/dialogs';
import { openBehaviours } from '../components/BehaviourDialog';
import { addInteraction } from '../lib/interaction-add';
import { COMPONENT_DRAG, dropComponent } from '../lib/library-actions';
import { rangeLabel } from '../lib/variants-edit';
import { ANIM_PRESETS, animOptions } from '../lib/animate-presets';
import { boneEndAt, boneFromDrag, boneGlyphs } from '../lib/rig';
import { newConnector, pickEnd, pickedFromEnd, previewPath, sideMid, type Picked } from './connect';

/** Shift, Ctrl or Cmd held on a click: add to the selection (or take out of it) instead of replacing it. Ctrl and Cmd still pick the deepest layer too. */
const adds = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.shiftKey || e.ctrlKey || e.metaKey;

type Pt = { x: number; y: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'move'; abId: string; start: Pt; items: { id: string; x0: number; y0: number; inv: Matrix }[]; bounds0: Rect; alt: boolean; duplicated: boolean; moved: boolean }
  | { kind: 'resize'; handle: Handle; id: string; node0: SceneNode; parentM: Matrix }
  | { kind: 'gradPt'; id: string; prefix: string; part: 'from' | 'to' | 'center' | 'radius'; node0: SceneNode; parentM: Matrix }
  | { kind: 'resizeMulti'; handle: Handle; bounds0: Rect; items: { id: string; node0: SceneNode; off: Pt }[] }
  | { kind: 'rotate'; center: Pt; angle0: number; items: { id: string; r0: number }[] }
  | { kind: 'moveAb'; start: Pt; items: { id: string; x0: number; y0: number }[]; moved: boolean; collapse?: string; alt: boolean; duplicated: boolean }
  | { kind: 'resizeAb'; handle: Handle; id: string; ab0: Artboard }
  | { kind: 'create'; tool: Tool; abId: string | null; start: Pt; parentId: string | null }
  | { kind: 'marquee'; abId: string | null; start: Pt; additive: string[] }
  | { kind: 'penHandle'; index: number }
  | { kind: 'pencil'; abId: string; points: Pt[] }
  | { kind: 'bend'; id: string; si: number; i: number; t: number; start: Pt; node0: PathNode; parentM: Matrix }
  | { kind: 'pathPoint'; si: number; pi: number; start: Pt; node0: PathNode; parentM: Matrix }
  | { kind: 'pathHandle'; si: number; pi: number; which: 'in' | 'out'; node0: PathNode; parentM: Matrix; mirror: boolean }
  | { kind: 'connect'; abId: string; fixed: Picked; id: string | null; which: 'from' | 'to'; route: ConnectorNode['route']; started: Pt }
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
  progress: 'progress',
  chart: 'chart',
};

/** Tools that start a new layer where you press, so the selection's resize and rotate handles stay out of the way. */
const CREATION_TOOLS = new Set<Tool>(['artboard', 'line', 'connector', 'pen', 'pencil', 'image', ...(Object.keys(CREATE_TYPES) as Tool[])]);

/** Where world (0, 0) sits in the scrollable pan space; pan is measured from here. */
const PAN_ORIGIN = 4_000_000;
// The longest a big project's first fill is held back (see `opening`)
const OPENING_MAX = 2500;
// ... and when every artboard has a saved picture, which only has to decode: the heaviest few fade in on their own after this
const OPENING_MAX_SAVED = 700;

export function Canvas() {
  const peers = useEditor((st) => st.peers);
  const s = useEditor((st) => ({
    project: st.project,
    activeArtboardId: st.activeArtboardId,
    selection: st.selection,
    artboardSelected: st.artboardSelected,
    artboardPicked: st.artboardPicked,
    tool: st.tool,
    zoom: st.zoom,
    panX: st.panX,
    panY: st.panY,
    editingPathId: st.editingPathId,
    editingTextId: st.editingTextId,
    croppingId: st.croppingId,
    focusId: st.focusId,
    showBones: st.showBones,
    timelineShown: st.timelineShown,
    heat: st.heat,
    activeTimelineId: st.activeTimelineId,
    playhead: st.playhead,
    previewPlaying: st.previewPlaying,
    canvasTheme: st.canvasTheme,
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
  const holdCode = useRef('');
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
  // Alt held: what can be dragged shows a copy cursor. A note about it comes up on the first few plain drags
  const altHeld = useAltHeld();
  // The page a page dragged from the Layers list would be placed in
  const [dropHost, setDropHost] = useState<string | null>(null);
  const [altHint, setAltHint] = useState<{ x: number; y: number } | null>(null);
  const showAltHint = (e: { clientX: number; clientY: number }) => {
    const r = vp.current?.getBoundingClientRect();
    if (r && altHintDue()) setAltHint({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
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
  //A connector being drawn or re-attached: the end that stays, and what the end under the pointer settled on. Also what the
  //Connector tool is hovering over before a press, so the layer and its sides show
  const [connDraft, setConnDraftState] = useState<{ abId: string; fixed: Picked | null; moving: Picked; route: ConnectorNode['route'] } | null>(null);
  const connDraftRef = useRef(connDraft);
  const setConnDraft = (c: typeof connDraft) => {
    connDraftRef.current = c;
    setConnDraftState(c);
  };
  //What snapped, to draw: lines by kind, and gaps for Spacing (artboard space, or canvas space when abId is null)
  const [guides, setGuides] = useState<{ abId: string | null; x: Target[]; y: Target[]; gaps: Gap[] } | null>(null);
  const showSnap = (abId: string | null, x: Target[], y: Target[], gaps: Gap[] = []) => setGuides(x.length || y.length || gaps.length ? { abId, x, y, gaps } : null);
  //The candidate lines of a drag, worked out once per drag (the layers being dragged are the only ones that change)
  const snapCache = useRef<{ key: string; proj: unknown; set: SnapSet } | null>(null);
  const snapSetFor = (ab: Artboard, sn: SnapSettings, exclude: string[], parent?: () => string | null): SnapSet => {
    const key = [ab.id, exclude.join(','), sn.on, sn.artboard, sn.layers, sn.layersAll, sn.guides, sn.spacing, sn.points].join('|');
    const proj = store().get().project;
    const c = snapCache.current;
    if (c && c.key === key && (drag.current || c.proj === proj)) return c.set;
    const set = buildTargets(ab, sn, new Set(exclude), parent?.() ?? null, proj.guides);
    snapCache.current = { key, proj, set };
    return set;
  };
  const [pen, setPen] = useState<{ abId: string; points: PathPoint[]; cursor: Pt | null } | null>(null);
  const [selPoint, setSelPoint] = useState<{ si: number; pi: number } | null>(null);
  const penRef = useRef(pen);
  penRef.current = pen;

  const { project, zoom, panX, panY } = s;
  // Library copies that only back instances stay off the canvas (see canvasHidden)
  const onCanvas = useMemo(() => project.artboards.filter((a) => !a.canvasHidden), [project.artboards]);
  const userPrefs = usePrefs();
  const showGrid = userPrefs.showGrid;
  const baseActive = getArtboard(project, s.activeArtboardId);
  const timeline = s.timelineShown ? baseActive?.timelines.find((t) => t.id === s.activeTimelineId) ?? null : null;
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
    const ab = [...onCanvas].reverse().find((a) => w.x >= a.canvasX && w.y >= a.canvasY && w.x <= a.canvasX + a.width && w.y <= a.canvasY + a.height);
    return ab && active && ab.id === active.id ? active : ab;
  };
  const local = (ab: Artboard, w: Pt): Pt => ({ x: w.x - ab.canvasX, y: w.y - ab.canvasY });
  /** A point on the bare canvas (the Artboard tool, resizing an artboard): the person's own grid, and the other artboards' edges. */
  const gridPoint = (w: Pt, e: { ctrlKey: boolean; metaKey: boolean }, exclude: string[] = []): Pt => {
    const sn = snapFor(e);
    if (!sn.on || (!sn.grid && !sn.artboard)) return w;
    const set: SnapSet = { xs: [], ys: [], rects: [], points: [] };
    if (sn.artboard)
      for (const a of onCanvas) {
        if (exclude.includes(a.id)) continue;
        for (const [at, k] of [[a.canvasX, 'x'], [a.canvasX + a.width / 2, 'x'], [a.canvasX + a.width, 'x'], [a.canvasY, 'y'], [a.canvasY + a.height / 2, 'y'], [a.canvasY + a.height, 'y']] as const) (k === 'x' ? set.xs : set.ys).push({ at, kind: 'artboard' });
      }
    const r = snapPointer(set, sn, w, zoom, sn.grid ? gridFor(null, prefs()).size : null);
    showSnap(null, r.x, r.y);
    return r.p;
  };
  /**
   * A canvas point put on whatever the snapping choices say for this artboard (grid, artboard edges, layers, guides, and
   * with `points` path points and bone joints), when Ctrl is not held. \`exclude\` is what is being dragged, which cannot
   * snap to itself. Shows what snapped.
   */
  const snapWorld = (ab: Artboard, w: Pt, e: { ctrlKey: boolean; metaKey: boolean }, exclude: string[] = [], points = false): Pt => {
    const sn = snapFor(e);
    const use = points ? sn : { ...sn, points: false };
    if (!snapAny(use)) {
      setGuides(null);
      return w;
    }
    const set = snapSetFor(ab, use, exclude, () => (exclude[0] ? locate(ab, exclude[0])?.parent?.id ?? null : null));
    const r = snapPointer(set, use, local(ab, w), zoom, use.grid ? gridFor(ab, prefs()).size : null);
    showSnap(ab.id, r.x, r.y);
    return { x: ab.canvasX + r.p.x, y: ab.canvasY + r.p.y };
  };
  /**
   * The layer under the pointer. The artboard under the pointer goes first; then layers hanging outside their
   * artboard (the open one, or any that doesn't clip), so things moved past the edge can still be picked. So can the faint
   * ghosts of layers hanging outside an artboard that clips (see ghost.ts), where they are drawn.
   */
  const layerAt = (w: Pt, pickDeepest: boolean): { ab: Artboard; hit: SceneNode } | null => {
    const under = abAt(w);
    const others = [...(active ? [active] : []), ...[...onCanvas].reverse().filter((a) => a.id !== active?.id && (a.clip === false || (!under && inGhostExtent(a.id, w.x - a.canvasX, w.y - a.canvasY))))].filter((a) => a.id !== under?.id);
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
      //Hold to pan: the key is the keymap's (Space unless the person moved it), and in the Timeline the same key plays instead
      if (!isTyping(e) && windowCommand(e)?.id === 'hand-hold') {
        holdCode.current = e.code;
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
      if (holdCode.current && e.code === holdCode.current) {
        holdCode.current = '';
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
  // Picking another layer (or nothing) ends crop mode
  useEffect(() => {
    if (s.croppingId && (s.selection.length !== 1 || s.selection[0] !== s.croppingId)) store().set({ croppingId: null });
  }, [s.croppingId, s.selection]);
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

  // ---------------------------------------------------------------- comments

  /** A click with the Comment tool: the spot (and the layer under it) a new review comment is pinned to. */
  const placeComment = (e: React.MouseEvent) => {
    if (store().get().tool !== 'comment' || e.button !== 0 || spaceDown.current) return;
    if ((e.target as HTMLElement).closest('.cm-card, [data-pin]')) return;
    const w = toWorld(e.clientX, e.clientY);
    const ab = abAt(w);
    if (!ab) return;
    const p = local(ab, w);
    const where = anchorAt(store().get().project, ab.id, p.x, p.y);
    if (!where) return;
    store().set({ activeArtboardId: ab.id });
    comments.startDraft(where);
  };

  // ---------------------------------------------------------------- pointer down

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    snapCache.current = null;
    pointerDown(e);
    // The pointer is captured for the drag, so the canvas has to show what it is doing. A handle says it itself (its own cursor)
    const d = drag.current;
    const own = target.closest?.('[data-handle]') ? getComputedStyle(target).cursor : '';
    setDragCursorNow(d ? dragCursor(d.kind, own) : null);
  };
  const pointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    // A press the notes didn't take puts a picked note away
    if (store().get().selectedNote && e.button === 0) {
      leaveNote();
      store().set({ selectedNote: null });
    }
    // The Comment tool places its pin on click (see placeComment), so there is no drag to start and no pointer to capture.
    // Panning (middle button, Space, the Hand tool) still goes through below
    if (store().get().tool === 'comment' && e.button === 0 && !spaceDown.current) return;
    const st = store().get();
    const target = e.target as HTMLElement;
    // A press on the right-click menu (it sits inside the canvas) is the menu's: capturing the pointer here would send the click to the canvas instead of the item
    if (target.closest?.('.ctx-menu')) return;
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
      if (kind === 'abvar') {
        store().set({ activeArtboardId: a, artboardSelected: true, selection: [], focusId: null, activeTimelineId: a === st.activeArtboardId ? st.activeTimelineId : null });
        return;
      }
      if (kind === 'ab' || kind === 'abgroup') {
        // A name on the canvas: click picks the artboard, Ctrl/Cmd+click adds it or takes it out, Shift+click adds it; a group's
        // title picks all its artboards. Dragging moves every selected artboard together
        const s2 = store();
        const adds = e.ctrlKey || e.metaKey;
        let collapse: string | undefined;
        if (kind === 'abgroup') s2.pickGroup(a, adds || e.shiftKey);
        else if (adds) s2.toggleArtboardPick(a);
        else if (e.shiftKey) {
          const now = pickedArtboardIds(st);
          if (!now.includes(a)) s2.pickArtboards([...now, a], a);
        } else {
          const now = pickedArtboardIds(st);
          if (now.length > 1 && now.includes(a)) {
            // pressing on one of several selected keeps them for the drag, and picks just this one if it turns out to be a click
            s2.pickArtboards(now, a);
            collapse = a;
          } else s2.pickArtboards([a]);
        }
        const now = pickedArtboardIds(s2.get());
        // taken out of the selection with Ctrl+click: nothing to drag
        if (kind === 'ab' && !now.includes(a)) return;
        const items = now.map((id) => getArtboard(s2.get().project, id)).filter(Boolean).map((x) => ({ id: x!.id, x0: x!.canvasX, y0: x!.canvasY }));
        drag.current = { kind: 'moveAb', start: w, items, moved: false, collapse, alt: e.altKey && !adds, duplicated: false };
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
        //Shift, Ctrl or Cmd adds to the selection (or takes this one out of it)
        const sel = adds(e) ? (st.selection.includes(a) ? st.selection.filter((x) => x !== a) : [...st.selection, a]) : st.selection.includes(a) && st.selection.length > 1 ? st.selection : [a];
        store().set({ selection: sel, artboardSelected: false, editingPathId: null });
        if (loc.node.locked) return;
        if (b === 'base') {
          const pm = parentToArtboard(ab, a);
          drag.current = { kind: 'boneMove', abId: ab.id, id: a, start: local(ab, w), x0: loc.node.x, y0: loc.node.y, inv: invert([pm[0], pm[1], pm[2], pm[3], 0, 0]) };
        } else drag.current = { kind: 'boneRotate', abId: ab.id, id: a };
        return;
      }
      if (kind === 'conn' && ab) {
        // One end of the selected connector: dragging it settles on whatever layer (or empty spot) it is dropped on
        const loc = locate(ab, b);
        if (!loc || loc.node.type !== 'connector' || loc.node.locked) return;
        const which = a as 'from' | 'to';
        const fixed = pickedFromEnd(ab, which === 'from' ? loc.node.to : loc.node.from);
        drag.current = { kind: 'connect', abId: ab.id, fixed, id: b, which, route: loc.node.route, started: local(ab, w) };
        setConnDraft({ abId: ab.id, fixed, moving: pickedFromEnd(ab, which === 'from' ? loc.node.from : loc.node.to), route: loc.node.route });
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
      const p = local(pab, snapWorld(pab, w, e, [], true));
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

    if (tool === 'connector') {
      const cab = hitAb ?? ab;
      if (!cab) return;
      if (cab.id !== st.activeArtboardId) store().set({ activeArtboardId: cab.id, selection: [], activeTimelineId: null });
      const start = local(cab, w);
      const fixed = pickEnd(cab, start, zoom, [], e.ctrlKey || e.metaKey);
      drag.current = { kind: 'connect', abId: cab.id, fixed, id: null, which: 'to', route: 'curved', started: start };
      setConnDraft({ abId: cab.id, fixed, moving: fixed, route: 'curved' });
      return;
    }

    if (tool === 'note') {
      // A note drawn on an artboard belongs to it (and moves with it); anywhere else on the canvas it belongs to the canvas
      const nab = hitAb;
      const at = nab ? local(nab, w) : w;
      drag.current = { kind: 'create', tool, abId: nab?.id ?? null, start: at, parentId: null };
      setBox({ abId: nab?.id ?? null, rect: { x: at.x, y: at.y, width: 0, height: 0 } });
      return;
    }

    if (tool === 'artboard') {
      const aw = gridPoint(w, e);
      drag.current = { kind: 'create', tool, abId: null, start: aw, parentId: null };
      setBox({ abId: null, rect: { x: aw.x, y: aw.y, width: 0, height: 0 } });
      return;
    }

    if (tool === 'line' || CREATE_TYPES[tool]) {
      const cab = hitAb ?? ab;
      if (!cab) return;
      const p = local(cab, w);
      // Draw into the frame under the pointer, if any.
      const path = hitTest(cab, p.x, p.y);
      const frame = [...path].reverse().find((n) => n.type === 'frame');
      const gp = local(cab, snapWorld(cab, w, e));
      drag.current = { kind: 'create', tool, abId: cab.id, start: gp, parentId: tool === 'frame' ? null : frame?.id ?? null };
      setBox({ abId: cab.id, rect: { x: gp.x, y: gp.y, width: 0, height: 0 } });
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
        if (adds(e)) sel = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
        else if (!sel.includes(hit.id)) sel = [hit.id];
        store().set({ selection: sel, artboardSelected: false });
        if (sel.includes(hit.id)) startMove(hitAb, p, e.altKey);
        return;
      }
      // Alt on an empty part of an artboard drags a copy of the artboard (a plain press there is the marquee, and a click with Alt still is)
      if (e.altKey && !adds(e) && !e.shiftKey && !hitAb.library?.brand) {
        const picked = pickedArtboardIds(st);
        const ids = st.artboardSelected && picked.includes(hitAb.id) ? picked : [hitAb.id];
        store().set({ selection: [], artboardSelected: false, focusId: null });
        const items = ids.map((id) => getArtboard(store().get().project, id)).filter(Boolean).map((x) => ({ id: x!.id, x0: x!.canvasX, y0: x!.canvasY }));
        drag.current = { kind: 'moveAb', start: w, items, moved: false, alt: true, duplicated: false };
        return;
      }
      // Empty part of an artboard: marquee.
      store().set({ selection: adds(e) ? st.selection : [], artboardSelected: false, focusId: adds(e) ? st.focusId : null });
      drag.current = { kind: 'marquee', abId: hitAb.id, start: p, additive: adds(e) ? st.selection : [] };
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
    // The Connector tool shows the layer it would join, with its sides, before anything is pressed
    if (st.tool === 'connector' && !drag.current) {
      const hab = abAt(w);
      const picked = hab ? pickEnd(hab, local(hab, w), zoom, [], deep) : null;
      setConnDraft(picked?.box && hab ? { abId: hab.id, fixed: null, moving: picked, route: 'curved' } : null);
      return;
    }
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
        if (pab) setPen({ ...penRef.current, cursor: local(pab, snapWorld(pab, w, e, [], true)) });
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
        if (!d.moved && !d.alt) showAltHint(e);
        d.moved = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const sn = snapFor(e);
        const ids = d.items.map((i) => i.id);
        const snap = snapMoveBox(snapSetFor(mab, sn, ids, () => locate(mab, ids[0])?.parent?.id ?? null), sn, d.bounds0, dx, dy, zoom, sn.grid ? gridFor(mab, prefs()).size : null);
        dx += snap.dx;
        dy += snap.dy;
        showSnap(mab.id, snap.x, snap.y, snap.gaps);
        const px = pixelRound(sn);
        const changes = new Map<string, Record<string, unknown>>();
        for (const it of d.items) {
          const q = apply(it.inv, dx, dy);
          changes.set(it.id, { x: px(it.x0 + q.x), y: px(it.y0 + q.y) });
        }
        store().setEach(changes, 'move');
        // Letting go over another artboard offers to move the layers there: say so while it's possible
        const over = abAt(w);
        hintAt(over && over.id !== d.abId && !d.duplicated ? `Let go to move to “${over.name}” (you'll be asked first)` : null, e.clientX, e.clientY);
        break;
      }
      case 'resize': {
        if (!ab) break;
        const gw = snapWorld(ab, w, e, [d.id]);
        const pp = apply(invert(d.parentM), gw.x - ab.canvasX, gw.y - ab.canvasY);
        const lp = apply(invert(nodeMatrix(d.node0)), pp.x, pp.y);
        // Shift keeps the ratio, and a layer whose W and H are linked keeps it unless Shift is held
        const keep = d.node0.lockRatio ? !e.shiftKey : e.shiftKey;
        const nb = resizeBox(d.node0.width, d.node0.height, d.handle, lp.x, lp.y, keep, e.altKey);
        const placed = placeBox(d.node0, nb.l, nb.t, nb.w, nb.h);
        const px = pixelRound(snapFor(e));
        const props: Record<string, unknown> = { x: px(placed.x), y: px(placed.y), width: px(nb.w), height: px(nb.h) };
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
        const p = local(ab, snapWorld(ab, w, e, d.items.map((it) => it.id)));
        // all of them linked: the selection keeps its ratio unless Shift is held
        const linked = d.items.length > 0 && d.items.every((it) => it.node0.lockRatio);
        const nb = resizeBox(b0.width, b0.height, d.handle, p.x - b0.x, p.y - b0.y, linked ? !e.shiftKey : e.shiftKey, e.altKey);
        const sx = nb.w / Math.max(1, b0.width);
        const sy = nb.h / Math.max(1, b0.height);
        const px = pixelRound(snapFor(e));
        const changes = new Map<string, Record<string, unknown>>();
        for (const it of d.items) {
          const n0 = it.node0;
          const ax = it.off.x + n0.x;
          const ay = it.off.y + n0.y;
          const props: Record<string, unknown> = {
            x: px(b0.x + nb.l + (ax - b0.x) * sx - it.off.x),
            y: px(b0.y + nb.t + (ay - b0.y) * sy - it.off.y),
            width: px(n0.width * sx),
            height: px(n0.height * sy),
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
        let dx = w.x - d.start.x;
        let dy = w.y - d.start.y;
        if (d.alt && !d.duplicated && Math.hypot(dx, dy) * zoom < 3) break;
        // Alt (Option on a Mac) was down when the press started: the pages under the pointer stay and a copy goes along
        if (d.alt && !d.duplicated) {
          const made = store().duplicateArtboards(d.items.map((it) => it.id), { inPlace: true });
          if (!made.size) {
            // nothing could be copied (a brand kit page): leave the originals where they are
            d.alt = false;
            drag.current = null;
            setDragCursorNow(null);
            break;
          }
          d.items = d.items.map((it) => ({ ...it, id: made.get(it.id) ?? it.id }));
          d.duplicated = true;
        }
        const sn = snapFor(e);
        if (sn.on && (sn.grid || sn.artboard)) {
          //the moved artboards go as one box against the ones that stay
          const moved = d.items.map((it) => ({ it, a: getArtboard(st.project, it.id) })).filter((m) => m.a);
          const x0 = Math.min(...moved.map((m) => m.it.x0));
          const y0 = Math.min(...moved.map((m) => m.it.y0));
          const box = { x: x0, y: y0, width: Math.max(...moved.map((m) => m.it.x0 + m.a!.width)) - x0, height: Math.max(...moved.map((m) => m.it.y0 + m.a!.height)) - y0 };
          const others = onCanvas.filter((a) => !d.items.some((it) => it.id === a.id)).map((a) => ({ x: a.canvasX, y: a.canvasY, width: a.width, height: a.height }));
          const r = snapArtboardBox(others, sn, box, dx, dy, zoom, sn.grid ? gridFor(null, prefs()).size : null);
          dx += r.dx;
          dy += r.dy;
          showSnap(null, r.x, r.y);
        } else setGuides(null);
        const px = pixelRound(sn);
        dx = px(dx);
        dy = px(dy);
        if ((dx || dy) && !d.moved && !d.alt) showAltHint(e);
        if (dx || dy) d.moved = true;
        const at = new Map(d.items.map((it) => [it.id, it]));
        store().update(
          (dr) => {
            for (const a of dr.artboards) {
              const it = at.get(a.id);
              if (!it) continue;
              a.canvasX = px(it.x0 + dx);
              a.canvasY = px(it.y0 + dy);
            }
          },
          { coalesce: 'moveAb' },
        );
        break;
      }
      case 'resizeAb': {
        const a0 = d.ab0;
        const gw = gridPoint(w, e, [d.id]);
        const nb = resizeBox(a0.width, a0.height, d.handle, gw.x - a0.canvasX, gw.y - a0.canvasY, e.shiftKey, e.altKey);
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
        const p = cab ? local(cab, snapWorld(cab, w, e)) : gridPoint(w, e);
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
        const p = local(pab, snapWorld(pab, w, e, [], true));
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
        const lp = toNodeLocal(d.node0, d.parentM, local(ab, snapWorld(ab, w, e, [d.node0.id], true)));
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
      case 'connect': {
        const cab = getArtboard(st.project, d.abId);
        if (!cab) break;
        const p = local(cab, w);
        const skip = [d.id ?? '', d.fixed.layerId ?? ''].filter(Boolean);
        let moving = pickEnd(cab, p, zoom, skip, e.ctrlKey || e.metaKey);
        // A loose end follows the grid and the other layers' edges like anything else dropped on the artboard
        if (!moving.box) {
          const q = local(cab, snapWorld(cab, w, e));
          moving = { ...moving, end: { layer: '', x: round(q.x), y: round(q.y) }, at: q };
        } else setGuides(null);
        setConnDraft({ abId: d.abId, fixed: d.fixed, moving, route: d.route });
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
    setAltHint(null);
    // a click (not a drag) on one of several selected artboards' names picks just that one
    if (d?.kind === 'moveAb' && !d.moved && d.collapse) store().pickArtboards([d.collapse]);
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
        fill: closed ? { type: 'solid', color: lookFor(store().get().project.themes).surfaceMuted } : null,
        ...lookDefaults(store().get().project, 'path'),
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
      if (d.tool === 'note') {
        // A click makes a note of the usual size; a drag makes it the size that was drawn (as it looks on screen at this zoom)
        const tiny = Math.abs(b.width) * zoom < 12 && Math.abs(b.height) * zoom < 12;
        const sc = noteScale(zoom);
        const id = addNote(d.abId, { x: b.x, y: b.y, w: tiny ? NOTE_DEFAULT_W : (b.width * zoom) / sc, h: tiny ? NOTE_DEFAULT_H : (b.height * zoom) / sc });
        if (id) store().set({ tool: 'select', selectedNote: id, editingNote: id });
        return;
      }
      const cab = d.abId ? getArtboard(st.project, d.abId) : undefined;
      if (!cab) return;
      createFromBox(cab, d.tool, b, d.parentId, e.shiftKey);
      return;
    }
    if (d.kind === 'connect') {
      const draft = connDraftRef.current;
      setConnDraft(null);
      const cab = getArtboard(st.project, d.abId);
      if (!draft || !cab) return;
      const to = draft.moving.end;
      if (d.id) {
        // Re-attached: only the end that was dragged changes (a click on the handle changes nothing)
        const loc = locate(cab, d.id);
        const was = loc?.node.type === 'connector' ? (d.which === 'from' ? loc.node.from : loc.node.to) : null;
        if (!was || JSON.stringify(was) === JSON.stringify(to)) return;
        store().setProps([d.id], d.which === 'from' ? { from: to } : { to }, 'connector-end');
        store().commit();
        return;
      }
      // A press that goes nowhere draws nothing
      const moved = Math.hypot(draft.moving.at.x - d.fixed.at.x, draft.moving.at.y - d.fixed.at.y) * zoom;
      if (moved < 6 || (draft.moving.layerId && draft.moving.layerId === d.fixed.layerId)) return;
      const node = newConnector(d.fixed.end, to, lookDefaults(store().get().project, 'connector') as Partial<ConnectorNode>);
      store().addNodes([node], { artboardId: cab.id });
      if (!e.shiftKey) store().set({ tool: 'select' });
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
          title: 'Move to page',
          message: `Move ${what} to the page “${target.name}”?\n\nIts keys in this page's timelines are removed, and interactions here that use it will need fixing.`,
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
    if (picked.type === 'image' && canCrop(picked)) {
      store().set({ croppingId: picked.id, selection: [picked.id] });
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
        ...lookDefaults(store().get().project, 'path'),
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
      node = createNode(type, { x: round(x - parentOffset.x), y: round(y - parentOffset.y), width: round(width), height: round(height), ...extra, ...fontDefaults(type), ...lookDefaults(store().get().project, type) } as never);
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
      fill: close ? { type: 'solid', color: lookFor(store().get().project.themes).surfaceMuted } : null,
      ...lookDefaults(store().get().project, 'path'),
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
    if (!(st.recording && st.timelineShown && st.activeTimelineId) || !active) return n;
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
    const recording = st.recording && st.timelineShown && !!st.activeTimelineId;
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
    // A page dragged out of the Layers list: placed in the page it is dropped on, as a component
    setDropHost(null);
    const page = e.dataTransfer.getData(PAGE_DRAG);
    if (page) {
      const w = toWorld(e.clientX, e.clientY);
      const ab = abAt(w);
      if (ab) insertComponent(page, ab.id, local(ab, w));
      return;
    }
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

  // The grid, under everything else in the overlay. Each artboard has its own cell size (the person's, or its override);
  // far out the cells fade, then the stronger lines do. Editor only: Preview and every export are built without it
  if (showGrid && !s.previewPlaying) {
    for (const ab of onCanvas) {
      const g = gridFor(ab, userPrefs);
      const look = gridLook(g, zoom);
      if (look.minor <= 0 && look.major <= 0) continue;
      const tl = oscreen(ab, { x: 0, y: 0 });
      const cell = g.size * zoom;
      const major = cell * g.subdivisions;
      const lines = (size: number) => `M ${size} 0 H 0 V ${size}`;
      overlay.push(
        <g key={`grid-${ab.id}`} className="canvas-grid" pointerEvents="none">
          <defs>
            <pattern id={`gm-${ab.id}`} patternUnits="userSpaceOnUse" x={tl.x} y={tl.y} width={cell} height={cell}>
              <path d={lines(cell)} className="grid-minor" opacity={g.subdivisions > 1 ? look.minor : 0} />
            </pattern>
            <pattern id={`gM-${ab.id}`} patternUnits="userSpaceOnUse" x={tl.x} y={tl.y} width={major} height={major}>
              <path d={lines(major)} className="grid-major" opacity={look.major} />
            </pattern>
            <pattern id={`g1-${ab.id}`} patternUnits="userSpaceOnUse" x={tl.x} y={tl.y} width={cell} height={cell}>
              <path d={lines(cell)} className="grid-major" opacity={look.minor} />
            </pattern>
          </defs>
          {g.subdivisions > 1 ? (
            <>
              {look.minor > 0 && <rect x={tl.x} y={tl.y} width={ab.width * zoom} height={ab.height * zoom} fill={`url(#gm-${ab.id})`} />}
              <rect x={tl.x} y={tl.y} width={ab.width * zoom} height={ab.height * zoom} fill={`url(#gM-${ab.id})`} />
            </>
          ) : (
            <rect x={tl.x} y={tl.y} width={ab.width * zoom} height={ab.height * zoom} fill={`url(#g1-${ab.id})`} />
          )}
        </g>,
      );
    }
  }

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

  // Artboard groups: a dashed frame round their artboards with the group's name on a chip above its top left corner. The frame lets the pointer through; the
  // name is the handle (click picks the group's artboards, drag moves them together)
  const pickedNow = pickedArtboardIds(s);
  for (const g of project.artboardGroups ?? []) {
    const fr = groupFrame(project, g.id);
    if (!fr) continue;
    const members = groupMembers(project, g.id);
    const all = members.every((m) => pickedNow.includes(m.id));
    const x = fr.x * zoom;
    const y = fr.y * zoom;
    const title = `${g.name}  ·  ${members.length}`;
    const tw = Math.round(title.length * 7 + 20);
    overlay.push(
      <g key={`abg-${g.id}`} className={`ab-group${all ? ' picked' : ''}`}>
        <rect className="ab-group-frame" x={x} y={y} width={fr.width * zoom} height={fr.height * zoom} rx={10} />
        <rect data-handle={`abgroup:${g.id}`} className="ab-group-chip" x={x} y={y - 28} width={tw} height={24} rx={6}>
          <title>{`${g.name}: a group of ${members.length} artboards. Click to select them all, drag to move them together, ${ALT_DRAG_TIP.replace('to drag a copy', 'to drag a copy of the group')}, right-click for more`}</title>
        </rect>
        <text className="ab-group-title" x={x + 10} y={y - 11.5} pointerEvents="none">
          {title}
        </text>
      </g>,
    );
  }

  for (const ab of onCanvas) {
    const tl = oscreen(ab, { x: 0, y: 0 });
    const isActive = ab.id === s.activeArtboardId;
    const isPicked = pickedNow.includes(ab.id);
    const labelText = `${ab.name}${project.settings.startArtboardId === ab.id ? '  ▸ start' : ''}${ab.library ? (ab.library.brand ? '  ◆ brand kit' : '  ◆ library') : ''}`;
    // a chosen artboard's name sits on a gold chip (the outline round it stays blue)
    if (isPicked)
      overlay.push(
        <rect key={`labelbg-${ab.id}`} data-handle={`ab:${ab.id}`} className="ab-label-chip" x={tl.x - 4} y={tl.y - 24} width={Math.round(labelText.length * 6.3 + 10)} height={19} rx={5} />,
      );
    overlay.push(
      <g key={`label-${ab.id}`}>
        <title>{`Click to select the page. Drag to move it. ${ALT_DRAG_TIP}`}</title>
        <text data-handle={`ab:${ab.id}`} className={`ab-label${isActive ? ' active' : ''}${isPicked ? ' picked' : ''}`} x={tl.x} y={tl.y - 8}>
          {labelText}
        </text>
      </g>,
    );
    // The guides of a page that is not the open one: the open page's are the Rulers' (they can be grabbed), these only show, so
    // a guide doesn't vanish when another page takes the focus. Every page shows the project's guides that fall on it.
    if (userPrefs.rulers && !s.previewPlaying && ab.id !== s.activeArtboardId) {
      for (const g of guidesOn(project, ab)) {
        const at = (g.axis === 'x' ? tl.x : tl.y) + g.at * zoom;
        const [a1, a2] = g.axis === 'x' ? [tl.y, tl.y + ab.height * zoom] : [tl.x, tl.x + ab.width * zoom];
        overlay.push(
          <line
            key={`gmark-${ab.id}-${g.scope}-${g.axis}${g.index}`}
            className={`guide-mark ${g.scope}`}
            x1={g.axis === 'x' ? at : a1 - GUIDE_REACH}
            x2={g.axis === 'x' ? at : a2 + GUIDE_REACH}
            y1={g.axis === 'x' ? a1 - GUIDE_REACH : at}
            y2={g.axis === 'x' ? a2 + GUIDE_REACH : at}
          />,
        );
      }
    }
    // a page being dragged in from the Layers list: this one is where it would be placed
    if (ab.id === dropHost) overlay.push(<rect key={`drop-host-${ab.id}`} className="drop-host" x={tl.x} y={tl.y} width={ab.width * zoom} height={ab.height * zoom} />);
    // Artboards of a responsive set: one pill per member on the label line, to jump between them
    const members = setMembers(project.artboards, ab);
    const pillText = (m: Artboard) => `${m.name} ${rangeLabel(project.artboards, m)}`;
    const pillW = (m: Artboard) => Math.round(pillText(m).length * 5.6 + 14);
    // (only when they fit above the artboard)
    if (members.length > 1 && ab.width * zoom > members.reduce((n, m) => n + pillW(m) + 4, 0) + 60) {
      let right = tl.x + ab.width * zoom;
      for (const m of [...members].reverse()) {
        const text = pillText(m);
        const w = pillW(m);
        right -= w;
        overlay.push(
          <g key={`var-${ab.id}-${m.id}`} data-handle={`abvar:${m.id}`} className={`var-pill${m.id === ab.id ? ' on' : ''}`} transform={`translate(${right},${tl.y - 22})`}>
            <title>{`${m.name}: shown when the page is ${rangeLabel(project.artboards, m)} wide. Click to edit it`}</title>
            <rect width={w} height={16} rx={8} />
            <text x={w / 2} y={11.5} textAnchor="middle">
              {text}
            </text>
          </g>,
        );
        right -= 4;
      }
    }
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
      overlay.push(<rect key="ab-sel-edge" className="sel-outline-edge" x={a.x} y={a.y} width={bw} height={bh} />);
      overlay.push(<rect key="ab-sel" className="sel-outline" x={a.x} y={a.y} width={bw} height={bh} />);
      // the other selected artboards get the same outline (and no handles: they are moved, grouped and tidied together)
      for (const id of pickedNow) {
        const other = id === active.id ? null : getArtboard(project, id);
        if (!other || other.canvasHidden) continue;
        const o = toS(other, { x: 0, y: 0 });
        overlay.push(<rect key={`ab-sel-${id}`} className="sel-outline" x={o.x} y={o.y} width={other.width * zoom} height={other.height * zoom} />);
      }
      if (pickedNow.length > 1) {
        overlay.push(
          <text key="ab-size" className="size-label" x={a.x + bw / 2} y={a.y + bh + 18}>
            {pickedNow.length} artboards selected
          </text>,
        );
      } else for (const h of HANDLES) {
        const [fx, fy] = HANDLE_POS[h];
        overlay.push(<rect key={`abh-${h}`} data-handle={`abresize:${h}`} className={`handle h-${h}`} x={a.x + fx * bw - 4} y={a.y + fy * bh - 4} width={8} height={8} />);
      }
      if (pickedNow.length < 2)
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
      //the dark line under the gold one, so the outline still shows on a gold or white layer
      overlay.push(<polygon key="sel-edge" className="sel-outline-edge" points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />);
      overlay.push(<polygon key="sel" className="sel-outline" points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />);
      const at = (fx: number, fy: number): Pt => {
        const top = { x: quad[0].x + (quad[1].x - quad[0].x) * fx, y: quad[0].y + (quad[1].y - quad[0].y) * fx };
        const bot = { x: quad[3].x + (quad[2].x - quad[3].x) * fx, y: quad[3].y + (quad[2].y - quad[3].y) * fx };
        return { x: top.x + (bot.x - top.x) * fy, y: top.y + (bot.y - top.y) * fy };
      };
      const center = at(0.5, 0.5);
      const locked = ids.some((id) => locate(active, id)!.node.locked);
      //A connector has no box to resize or turn: it has two ends, and they are the handles
      const conn = ids.length === 1 ? locate(active, ids[0])!.node : null;
      const connector = conn?.type === 'connector' ? conn : null;
      if (connector && !locked && s.tool === 'select') {
        const drawn = nodeToArtboard(active, connector.id);
        const g = drawnBox(active, connector).computed;
        if (g) {
          for (const which of ['from', 'to'] as const) {
            const p = toS(active, apply(drawn, which === 'from' ? g.start.x : g.end.x, which === 'from' ? g.start.y : g.end.y));
            overlay.push(
              <circle key={`conn-${which}`} data-handle={`conn:${which}:${connector.id}`} className="conn-handle" cx={p.x} cy={p.y} r={6} style={{ cursor: 'grab' }}>
                <title>{which === 'from' ? 'Start of the connector (drag onto a layer to attach it)' : 'End of the connector (drag onto a layer to attach it)'}</title>
              </circle>,
            );
          }
        }
      }
      // The Bend tool works on the edges themselves, and a creation tool draws wherever you drag (the rotate zones outside a
      // selected layer's corners would otherwise swallow the start of a new shape), so no resize/rotate handles sit on top then
      if (!locked && !connector && s.tool !== 'bend' && s.tool !== 'bone' && !CREATION_TOOLS.has(s.tool)) {
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
      if (sel1 && !locked && !connector && size.w > 0 && size.h > 0 && s.tool !== 'bend' && s.tool !== 'bone' && !CREATION_TOOLS.has(s.tool)) {
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
      if (!connector)
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

  // A connector being drawn, or an end being dragged: the layer it would land on with its sides, and the line so far
  if (connDraft) {
    const cab = getArtboard(project, connDraft.abId) ?? null;
    const P = (p: Pt) => oscreen(cab, p);
    const m = connDraft.moving;
    if (m.box) {
      const b = m.box;
      const corners = [P({ x: b.x, y: b.y }), P({ x: b.x + b.w, y: b.y }), P({ x: b.x + b.w, y: b.y + b.h }), P({ x: b.x, y: b.y + b.h })];
      overlay.push(<polygon key="conn-target" className="conn-target" points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />);
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const c = P(sideMid(b, side));
        overlay.push(<circle key={`conn-side-${side}`} className={`conn-side${m.end.side === side ? ' on' : ''}`} cx={c.x} cy={c.y} r={m.end.side === side ? 6 : 4} />);
      }
    }
    if (connDraft.fixed?.box && drag.current?.kind === 'connect' && !drag.current.id) {
      const b = connDraft.fixed.box;
      const corners = [P({ x: b.x, y: b.y }), P({ x: b.x + b.w, y: b.y }), P({ x: b.x + b.w, y: b.y + b.h }), P({ x: b.x, y: b.y + b.h })];
      overlay.push(<polygon key="conn-from" className="conn-target conn-from" points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />);
    }
    if (connDraft.fixed && drag.current?.kind === 'connect') {
      const which = drag.current.which;
      const [a, b] = which === 'to' ? [connDraft.fixed, m] : [m, connDraft.fixed];
      const raw = previewPath(a, b, connDraft.route);
      // (the preview's coordinates are the artboard's: shift them onto the screen with the same transform the points use)
      const o = P({ x: 0, y: 0 });
      overlay.push(<path key="conn-draft" className="conn-draft" transform={`translate(${o.x} ${o.y}) scale(${zoom})`} d={raw} vectorEffect="non-scaling-stroke" />);
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

  // Snap guides: a line for each thing that took the drag, in its kind's colour, equal gaps with their distance, and a ring on a point
  if (guides) {
    const gab = guides.abId ? getArtboard(project, guides.abId) : null;
    if (gab || guides.abId === null) {
      const at = gab ?? null;
      for (const t of guides.x) {
        const a = oscreen(at, { x: t.at, y: -10000 });
        overlay.push(<line key={`gx-${t.kind}-${t.at}`} className={`guide guide-${t.kind}`} x1={a.x} x2={a.x} y1={-100000} y2={100000} />);
      }
      for (const t of guides.y) {
        const a = oscreen(at, { x: -10000, y: t.at });
        overlay.push(<line key={`gy-${t.kind}-${t.at}`} className={`guide guide-${t.kind}`} x1={-100000} x2={100000} y1={a.y} y2={a.y} />);
      }
      const pt = guides.x.find((t) => t.kind === 'points') && guides.y.find((t) => t.kind === 'points');
      if (pt) {
        const c = oscreen(at, { x: guides.x[0].at, y: guides.y[0].at });
        overlay.push(<circle key="snap-point" className="guide-point" cx={c.x} cy={c.y} r={7} />);
      }
      guides.gaps.forEach((g, i) => {
        const a = g.axis === 'x' ? oscreen(at, { x: g.from, y: g.at }) : oscreen(at, { x: g.at, y: g.from });
        const b = g.axis === 'x' ? oscreen(at, { x: g.to, y: g.at }) : oscreen(at, { x: g.at, y: g.to });
        overlay.push(
          <g key={`gap-${i}`} className="guide-gap">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <line x1={g.axis === 'x' ? a.x : a.x - 4} x2={g.axis === 'x' ? a.x : a.x + 4} y1={g.axis === 'x' ? a.y - 4 : a.y} y2={g.axis === 'x' ? a.y + 4 : a.y} />
            <line x1={g.axis === 'x' ? b.x : b.x - 4} x2={g.axis === 'x' ? b.x : b.x + 4} y1={g.axis === 'x' ? b.y - 4 : b.y} y2={g.axis === 'x' ? b.y + 4 : b.y} />
            <text className="guide-gap-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">
              {g.label}
            </text>
          </g>,
        );
      });
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
      { type: 'progress', label: 'Progress bar' },
      { type: 'chart', label: 'Chart' },
    ];
    const newHere = (ab: Artboard): MenuItem => ({
      label: 'New',
      items: NEW.map((t) => ({
        label: t.label,
        onClick: () => {
          const p = local(ab, w);
          const proto = createNode(t.type);
          const node = createNode(t.type, { x: round(p.x - (t.type === 'text' ? 0 : proto.width / 2)), y: round(p.y - (t.type === 'text' ? 0 : proto.height / 2)), ...fontDefaults(t.type), ...lookDefaults(store().get().project, t.type) } as never);
          s2.set({ activeArtboardId: ab.id });
          s2.addNodes([node], { artboardId: ab.id });
          if (node.type === 'text') s2.set({ editingTextId: node.id });
        },
      })),
    });
    //Right-click inside a page: put another page here as a component (a library copy is read-only, so not there)
    const insertHere = (ab: Artboard): MenuItem => ({
      label: 'Insert component here…',
      title: 'Place another page inside this one, here, as a component',
      disabled: !!ab.library || componentChoices(st.project, ab.id).length === 0,
      onClick: () => void openInsertComponentPicker({ hostId: ab.id, at: local(ab, w) }),
    });
    const paste: MenuItem = {
      label: 'Paste',
      hint: keyHints('paste'),
      onClick: () => {
        void (navigator.clipboard?.readText?.() ?? Promise.resolve('')).then((t) => pasteNodes(t), () => pasteNodes());
      },
    };
    let items: MenuItem[];
    // The name of an artboard, or of a group, on the canvas: the artboard menu for what is selected (picking it first when it isn't)
    const [hk, ha] = ((e.target as Element).closest?.('[data-handle]')?.getAttribute('data-handle') ?? '').split(':');
    if ((hk === 'ab' && getArtboard(st.project, ha)) || (hk === 'abgroup' && st.project.artboardGroups?.some((g) => g.id === ha))) {
      if (hk === 'abgroup') {
        if (!groupMembers(st.project, ha).every((m) => pickedArtboardIds(st).includes(m.id))) s2.pickGroup(ha);
        items = artboardMenuItems(groupMembers(st.project, ha).map((m) => m.id), ha);
      } else {
        if (!pickedArtboardIds(st).includes(ha)) s2.pickArtboards([ha]);
        items = artboardMenuItems(pickedArtboardIds(s2.get()));
      }
      setMenu({ x: e.clientX, y: e.clientY, items });
      return;
    }
    const hit = hab ? pickFromHit(hitTest(hab, local(hab, w).x, local(hab, w).y), e.ctrlKey || e.metaKey) : null;
    if (hab && hit) {
      // A layer: select it (keeping a multi-selection it belongs to), then act on the selection
      if (!(st.activeArtboardId === hab.id && st.selection.includes(hit.id))) s2.select([hit.id], { artboardId: hab.id });
      const sel = s2.selectedNodes();
      const one = sel.length === 1 ? sel[0] : null;
      items = [
        { heading: one ? one.name : `${sel.length} layers` },
        { label: 'Cut', hint: keyHints('cut'), onClick: () => copySelection(true) },
        { label: 'Copy', hint: keyHints('copy'), onClick: () => copySelection() },
        paste,
        { label: 'Duplicate', hint: keyHints('duplicate'), onClick: () => s2.duplicateSelection() },
        { label: 'Delete', hint: keyHints('delete'), danger: true, onClick: () => s2.deleteSelection() },
        { separator: true },
        {
          label: 'Order',
          items: [
            { label: 'Bring to front', hint: keyHints('front'), onClick: () => s2.reorder(Infinity) },
            { label: 'Bring forward', hint: keyHints('forward'), onClick: () => s2.reorder(1) },
            { label: 'Send backward', hint: keyHints('backward'), onClick: () => s2.reorder(-1) },
            { label: 'Send to back', hint: keyHints('back'), onClick: () => s2.reorder(-Infinity) },
          ],
        },
        { label: 'Group', hint: keyHints('group'), onClick: () => s2.groupSelection() },
        ...fitPageSelectionItems(),
        ...(one && (one.type === 'group' || one.type === 'frame') ? [{ label: 'Ungroup', hint: keyHints('ungroup'), onClick: () => s2.ungroupSelection() } as MenuItem] : []),
        ...(sel.length > 1
          ? [
              {
                label: 'Combine shapes',
                items: (['union', 'subtract', 'intersect', 'exclude'] as const).map((op) => ({ label: op[0].toUpperCase() + op.slice(1), onClick: () => s2.booleanSelection(op) })),
              } as MenuItem,
            ]
          : []),
        { separator: true },
        { label: one?.visible === false ? 'Show' : 'Hide', hint: keyHints('hide-layers'), onClick: () => s2.setProps(sel.map((n) => n.id), { visible: one?.visible === false }) },
        { label: 'Lock', hint: keyHints('lock-layers'), onClick: () => s2.setProps(sel.map((n) => n.id), { locked: true }) },
        ...(sel.every((n) => n.type !== 'bone')
          ? [
              {
                label: 'Animate',
                items: ANIM_PRESETS.map((pr) => ({
                  label: pr.label,
                  title: `${pr.tip}. Uses the When and Delay in the Animate section`,
                  onClick: () => s2.applyAnimation(sel.map((n) => n.id), pr.id, animOptions()),
                })),
              } as MenuItem,
            ]
          : []),
        ...(one ? [{ separator: true } as MenuItem, ...selectSameItems(hab, one)] : []),
        ...(one
          ? [
              {
                label: 'Add interaction',
                items: [
                  { label: 'When clicked…', onClick: () => openBehaviours({ abId: hab.id, layerId: one.id, trigger: 'click' }) },
                  { label: 'When hovered…', onClick: () => openBehaviours({ abId: hab.id, layerId: one.id, trigger: 'pointerenter' }) },
                  { separator: true },
                  { label: 'Empty On click event', title: 'Just the On pointer event, with nothing joined to it', onClick: () => addInteraction(hab, one.id, 'click') },
                  { label: 'Empty On hover event', title: 'Just the On pointer event, with nothing joined to it', onClick: () => addInteraction(hab, one.id, 'pointerenter') },
                ],
              } as MenuItem,
              ...(one.type === 'text' || one.type === 'button' || one.type === 'link' ? [{ label: 'Edit text', hint: keyHints('enter'), onClick: () => s2.set({ editingTextId: one.id }) } as MenuItem] : []),
              ...(one.type === 'image' && canCrop(one) ? [{ label: 'Crop picture', hint: keyHints('enter'), onClick: () => s2.set({ croppingId: one.id }) } as MenuItem] : []),
            ]
          : []),
        { separator: true },
        newHere(hab),
        insertHere(hab),
      ];
    } else if (hab) {
      // An artboard's empty area: the artboard (or the artboards, when this one is among several selected)
      if (!pickedArtboardIds(st).includes(hab.id)) s2.pickArtboards([hab.id]);
      const ids = pickedArtboardIds(s2.get());
      items = [
        { heading: ids.length > 1 ? `${ids.length} pages` : hab.name },
        newHere(hab),
        insertHere(hab),
        paste,
        { separator: true },
        ...(ids.length === 1
          ? [
              { label: 'Make start page', disabled: st.project.settings.startArtboardId === hab.id, onClick: () => s2.update((d) => void (d.settings.startArtboardId = hab.id)) } as MenuItem,
              { label: 'Zoom to page', hint: keyHints('zoom-page'), onClick: () => zoomToBox({ x: hab.canvasX, y: hab.canvasY, width: hab.width, height: hab.height }) } as MenuItem,
              { label: 'Fit page to its layers', hint: keyHints('fit-page-layers'), title: 'Resize the page to just the layers on it, keeping them where they are', disabled: !hab.children.length, onClick: () => (s2.set({ activeArtboardId: hab.id }), void fitPageCommand({ layers: true })) } as MenuItem,
              artboardGridMenu(hab),
              { separator: true } as MenuItem,
            ]
          : []),
        ...artboardMenuItems(ids).slice(1),
      ];
    } else {
      items = [
        { label: 'New page here', onClick: () => s2.addArtboard({ canvasX: round(w.x), canvasY: round(w.y) }) },
        paste,
        { separator: true },
        { label: showRoutes() ? 'Hide page arrows' : 'Show page arrows', title: 'The faint arrows between pages that show where Go to page, Next and Previous lead (editor only)', onClick: () => setShowRoutes(!showRoutes()) },
        { label: 'Tidy up pages', disabled: st.project.artboards.filter((a) => !a.canvasHidden).length < 2, onClick: tidyArtboardsCommand },
        { label: 'Zoom to fit everything', hint: keyHints('zoom-fit'), onClick: () => void runCommand('zoom-fit') },
        { label: prefs().rulers ? 'Hide rulers' : 'Show rulers', hint: keyHints('toggle-rulers'), onClick: () => setPrefs({ rulers: !prefs().rulers }) },
        ...gridMenu(),
        { label: 'Help', hint: keyHints('help-context'), onClick: openContextHelp },
      ];
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
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
  const views = viewPlan(onCanvas, s.activeArtboardId, zoom, panX, panY, vp.current?.clientWidth || window.innerWidth, vp.current?.clientHeight || window.innerHeight);

  // Opening a big project: the artboards would pop in one by one, as the scheduler draws them or their saved pictures decode. Hold
  // them back (invisible, but drawn in fuller frames) until the ones in view are done, then fade them in together. Once, at open,
  // and never for longer than OPENING_MAX. (Whether they are in view isn't known yet: the workspace fits the zoom after this first
  // render. A project of a few artboards isn't worth it.)
  // Also held (briefly) when the artboard being opened draws with a web font that hasn't loaded: the text would first show in a fallback face and jump.
  const openingFirst = onCanvas.find((ab) => ab.id === s.activeArtboardId) ?? onCanvas[0];
  const [opening, setOpening] = useState(() => onCanvas.length > 3 || (!!openingFirst && !fontsReadyNow(project, [openingFirst])));
  const [allSaved] = useState(() => onCanvas.every((ab) => ab.id === s.activeArtboardId || hasCachedStill(project.id, ab.id, stillHash(project, ab, shownTheme(project, s.canvasTheme)?.id ?? null))));
  useEffect(() => {
    if (!opening) return;
    let off = false;
    holdView(true);
    void Promise.all([whenViewDrawn(allSaved ? OPENING_MAX_SAVED : OPENING_MAX), openingFirst ? fontsReadyFor(project, [openingFirst]) : null]).then(() => {
      if (off) return;
      holdView(false);
      setOpening(false);
    });
    return () => {
      off = true;
      holdView(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showRulers = userPrefs.rulers;
  // Space pans, a drag shows what it is doing, then what a press under the pointer would do, then the tool's own
  const dragging = drag.current;
  const copying = !!dragging && (dragging.kind === 'move' ? dragging.duplicated : dragging.kind === 'moveAb' ? dragging.duplicated : false);
  const baseCursor = dragCursorNow ?? (spaceHeld ? 'grab' : s.tool === 'select' || s.tool === 'bend' ? hoverCursor ?? toolCursor(s.tool) : toolCursor(s.tool));
  // the move cursor turns into the copy one while Alt is down (over something a drag would move), and for the whole of a copy drag
  const cursor = copying || (altHeld && baseCursor === 'move') ? 'copy' : baseCursor;

  return (
    <div
      ref={vp}
      className={`canvas${altHeld && s.tool === 'select' ? ' alt-held' : ''}`}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setToolHint(null)}
      onDoubleClick={onDoubleClick}
      onClick={placeComment}
      onDragOver={(e) => {
        e.preventDefault();
        // Files and library components are copied in, not moved
        e.dataTransfer.dropEffect = 'copy';
        // A page from the Layers list: outline the page it would land in
        if (e.dataTransfer.types.includes(PAGE_DRAG)) {
          const over = abAt(toWorld(e.clientX, e.clientY));
          const from = getDraggedPage();
          const ok = !!over && !over.library && !(from && wouldLoop(store().get().project, over.id, from));
          e.dataTransfer.dropEffect = ok ? 'copy' : 'none';
          setDropHost((cur) => (ok ? (cur === over!.id ? cur : over!.id) : cur ? null : cur));
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHost(null);
      }}
      onDrop={onDrop}
      onContextMenu={openMenu}
    >
      {/* Panning scrolls this box instead of moving the world: the browser scrolls on the compositor, where a moving
          transform would make it rebuild layers for every element on every frame (slow in big projects) */}
      <div ref={scrollRef} className="canvas-scroll" onScroll={onScroll}>
        <div className="canvas-space" style={{ width: PAN_ORIGIN * 2, height: PAN_ORIGIN * 2 }}>
      <div className={`world${opening ? ' opening' : ''}`} style={{ left: PAN_ORIGIN, top: PAN_ORIGIN, transform: `scale(${zoom})` }}>
        {onCanvas.map((ab) => (
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
            canvasTheme={s.canvasTheme}
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
          //a brand layer has no quick unlock: it is part of the brand, only the F9 override lifts it (from the Layers panel)
          if (isBrandHeld(project, n, store().get().brandOverride)) return null;
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
      {userPrefs.snapOn && userPrefs.snapGrid && active && (
        <button
          type="button"
          className="canvas-status"
          title={`Snap to grid is on. Click for the snapping choices and the grid size (Ctrl while dragging skips snapping${keyHints('snap-grid') ? `, ${keyHints('snap-grid')} turns the grid off` : ''})`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.top - 8, items: gridMenu() });
          }}
        >
          <Icons.grid width={13} /> Snap {gridLabel(gridFor(active, userPrefs))}
        </button>
      )}
      {guides && (guides.x.length > 0 || guides.y.length > 0 || guides.gaps.length > 0) && (
        <div className="snap-now" role="status" aria-live="off">
          Snapped to {[...new Set([...guides.x, ...guides.y].map((t) => t.kind).concat(guides.gaps.length ? ['spacing' as const] : []))].map((k) => SNAP_LABEL[k]).join(', ')}
        </div>
      )}
      <CommentLayer project={project} zoom={zoom} panX={panX} panY={panY} hidden={s.previewPlaying} />
      <NotesLayer project={project} zoom={zoom} panX={panX} panY={panY} hidden={s.previewPlaying} passive={s.tool === 'hand' || spaceHeld} />
      <PageLinkLayer project={project} zoom={zoom} panX={panX} panY={panY} active={active} selection={s.selection} tool={s.tool} hidden={s.previewPlaying} />
      <HitPulse project={project} zoom={zoom} panX={panX} panY={panY} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {showRulers && <Rulers ab={active} zoom={zoom} panX={panX} panY={panY} width={vp.current?.clientWidth ?? 2000} height={vp.current?.clientHeight ?? 1200} />}
      {s.croppingId && active && <CropOverlay ab={active} id={s.croppingId} zoom={zoom} panX={panX} panY={panY} />}
      {s.editingTextId && active && <TextEditor ab={active} id={s.editingTextId} zoom={zoom} panX={panX} panY={panY} bounds={{ width: vp.current?.clientWidth ?? 2000, height: vp.current?.clientHeight ?? 1200 }} />}
      {altHint && (
        <div className="tool-hint" role="status" style={{ left: altHint.x + 18, top: altHint.y + 20 }}>
          <Icons.info className="tool-hint-icon" />
          <span>{ALT_DRAG_HINT}</span>
        </div>
      )}
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

function TextEditor({ ab, id, zoom, panX, panY, bounds }: { ab: Artboard; id: string; zoom: number; panX: number; panY: number; bounds: { width: number; height: number } }) {
  const loc = locate(ab, id);
  if (!loc) return null;
  if (loc.node.type === 'text') return <RichTextEditor node={loc.node} ab={ab} zoom={zoom} panX={panX} panY={panY} bounds={bounds} />;
  return <PlainTextEditor ab={ab} id={id} zoom={zoom} panX={panX} panY={panY} />;
}

/** In-place editor for text layers: a contenteditable with one span per run, so ranges can be styled (the floating toolbar, Ctrl/Cmd+B, I, U, K, Shift+X; or the inspector). */
export function RichTextEditor({ node: n, ab, zoom, panX, panY, bounds }: { node: Extract<SceneNode, { type: 'text' }>; ab: Artboard; zoom: number; panX: number; panY: number; bounds: { width: number; height: number } }) {
  const id = n.id;
  const ref = useRef<HTMLDivElement>(null);
  const painted = useRef<TextRun[]>([]);
  const ownSig = useRef('');
  const commands = useRef<ToolbarCommands | null>(null);
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
    //only when the text has the focus: with it in the toolbar, setting the selection would pull the focus back into the text (the toolbar draws the remembered selection itself)
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
    <>
      <div
        ref={ref}
        className="text-editor"
        style={style}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck={false}
        onInput={read}
        onBlur={(e) => {
          // Focus moving into the toolbar or the inspector (to change colour or size of the selection) keeps editing
          const to = e.relatedTarget as HTMLElement | null;
          if (to?.closest?.('.inspector, .text-toolbar, .palette-pop')) return;
          store().commit();
          store().set({ editingTextId: null, textSelection: null });
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            (e.target as HTMLElement).blur();
            return;
          }
          if (e.key === 'F10' && e.altKey) {
            e.preventDefault();
            commands.current?.enter();
            return;
          }
          const action = shortcutAction(e);
          if (!action) return;
          e.preventDefault();
          const el = ref.current;
          commands.current?.apply(action, (el && selectionOffsets(el)) || undefined);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <TextToolbar node={n} editor={ref} commands={commands} bounds={bounds} box={{ left: style.left as number, top: style.top as number, width: style.width as number, height: b.height * zoom }} />
    </>
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

/** What a shape will look like while it is being drawn, in screen pixels (the defaults the new layer gets). */
function shapePreview(tool: Tool, x: number, y: number, w: number, h: number, zoom: number) {
  if (w < 1 || h < 1) return null;
  const grey = { fill: LIGHT_LOOK.surfaceMuted, fillOpacity: 0.85 };
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
      return <rect x={x} y={y} width={w} height={h} fill={LIGHT_LOOK.background} fillOpacity={0.92} />;
    case 'button':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={6 * zoom} fill={LIGHT_LOOK.button} fillOpacity={0.9} />
          {h > 12 * zoom && label('Button', LIGHT_LOOK.onButton, 16, { fontWeight: 700 })}
        </>
      );
    case 'input':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={6 * zoom} fill={LIGHT_LOOK.background} stroke={LIGHT_LOOK.border} />
          {h > 12 * zoom && (
            <text x={x + 10 * zoom} y={y + h / 2} fill="#999" fontSize={16 * zoom} fontFamily="Inter, system-ui, sans-serif" dominantBaseline="central">
              Type here
            </text>
          )}
        </>
      );
    case 'link':
      return label('Link', LIGHT_LOOK.primary, 16, { textDecoration: 'underline' });
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
    case 'progress':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(h / 2, 6 * zoom)} fill={LIGHT_LOOK.surfaceMuted} fillOpacity={0.9} />
          <rect x={x} y={y} width={w * 0.4} height={h} rx={Math.min(h / 2, 6 * zoom)} fill={LIGHT_LOOK.button} fillOpacity={0.9} />
        </>
      );
    case 'chart':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill={LIGHT_LOOK.surface} fillOpacity={0.6} />
          {[0.2, 0.45, 0.3, 0.6].map((v, i) => (
            <rect key={i} x={x + w * (0.1 + i * 0.22)} y={y + h * (0.9 - v)} width={w * 0.14} height={h * v} fill={LIGHT_LOOK.button} fillOpacity={0.9} />
          ))}
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
  return f ? { fontFamily: fontStack(f) } : {};
}
