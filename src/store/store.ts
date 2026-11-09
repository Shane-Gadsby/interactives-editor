import { produce, type Draft } from 'immer';
import { artboardNeedsFit, fitArtboardGroups } from './fit-groups';
import { useSyncExternalStore, useRef } from 'react';
import {
  animatableProp,
  pathPointPropName,
  relayoutTree,
  createArtboard,
  frameTime,
  sampleKeys,
  cloneWithNewIds,
  remapConnectorIds,
  getPath,
  isContainer,
  setPath,
  uid,
  walk,
  apply,
  invert,
  applyRunStyle,
  nodeRuns,
  retextRuns,
  sanitizeLayerInPlace,
  setBase,
  setMembers,
  masterOf,
  type Artboard,
  type Keyframe,
  type Project,
  type RunStyle,
  type SubPath,
  type SceneNode,
  type TextModifier,
  type TextRun,
  type Timeline,
} from 'interactives-player';
import { applyRuns, nodePropsToRunStyle } from '../lib/rich-text';
import { lockViolation, unlinkStyleRef } from '../lib/libraries';
import { clampBrandInstances, hasBrandArtboards } from '../lib/brand';
import { brandLookViolation, isBrandLocked, lockBrandChrome, snapToBrand } from '../lib/branded/lock';
import { applyTidy } from '../lib/artboard-tidy';
import { alignBoards, distributeBoards, freshGroupName, leaveGroups, makeGroup, pickedArtboardIds, pruneGroups, removeGroup, withSets, type AlignMode } from '../lib/artboard-groups';
import { applyAnimation, type AnimOptions, type AnimPresetId, type AnimResult } from '../lib/animate-presets';
import { addModifier, applyPreset, removeModifier, type TextPresetId } from '../lib/text-modifiers';
import { booleanPath, type BooleanOp } from '../lib/boolean';
import { insertPoint, keyTimes, pointParts, POINT_PARTS, pointTracks, posedPaths, remapPointTracks, shapeToPaths } from '../lib/path-edit';
import { apply as applyOps, type Op, type PathStep } from '../../shared/ops.mjs';
import type { Peer } from '../lib/live';
import { getArtboard, locate, parentToArtboard, selectionBounds, topmost, uniqueName, nodeNames } from './doc';
import { dropRefsToRemoved, retargetChildRefs } from './refs';
import { adoptQuestions, dropOrphanKitNodes } from '../lib/question-kit';
import { track } from '../lib/analytics';
import { noteNodeAdded, noteProps } from '../lib/usage';
import { variantPlan, type VariantSide } from '../lib/variants-edit';
import { detachMaster, dropMasterRefs, markMaster, setMaster } from '../lib/page-master';

/** Whether any frame in a tree has auto layout. */
function hasAutoLayout(list: SceneNode[]): boolean {
  for (const n of list) {
    if (n.type === 'frame' && n.layout) return true;
    if (isContainer(n) && hasAutoLayout(n.children)) return true;
  }
  return false;
}

// Per artboard object (immer shares the ones a change didn't touch, so this is only worked out again for what changed)
const layoutFlag = new WeakMap<object, boolean>();
const fitChecked = new WeakSet<object>();

/** Groups that size to their contents (fit-groups.ts), before auto layout so frames lay out the groups' real sizes. */
function settleGroups(project: Project): Project {
  const need = project.artboards.filter((ab) => !fitChecked.has(ab) && artboardNeedsFit(ab)).map((ab) => ab.id);
  for (const ab of project.artboards) fitChecked.add(ab);
  if (!need.length) return project;
  const next = produce(project, (d) => {
    for (const ab of d.artboards) if (need.includes(ab.id)) fitArtboardGroups(ab as Artboard);
  });
  for (const ab of next.artboards) fitChecked.add(ab);
  return next;
}

/**
 * Lay out the auto-layout frames of a document after a change. Only artboards that have any are walked: doing it inside
 * the change's own draft would wrap every layer of every artboard in a proxy just to find there was nothing to lay out.
 */
function settleLayout(project: Project, fitGroups = false): Project {
  // Groups are only fitted on this person's own edits (which are sent), never on load or on someone else's ops: refitting
  // there would change the document here without telling anyone, and the next op about those layers would land in the
  // wrong place. Fitting moves nothing on the canvas, so a group waiting for the next edit looks the same
  if (fitGroups) project = settleGroups(project);
  const withLayout = new Set<string>();
  for (const ab of project.artboards) {
    let has = layoutFlag.get(ab);
    if (has === undefined) layoutFlag.set(ab, (has = hasAutoLayout(ab.children)));
    if (has) withLayout.add(ab.id);
  }
  if (!withLayout.size) return project;
  return produce(project, (d) => {
    for (const ab of d.artboards) if (withLayout.has(ab.id)) relayoutTree(ab.children as SceneNode[]);
  });
}

/**
 * Layers a batch of ops wrote to: the innermost layer on each op's path, or the layer an insert added. Ops come from
 * other people and agents, so a layer they touched is checked for wrong-typed values (see the player's sanitizer)
 * before it is drawn.
 */
function sanitizeTouched(d: Project, ops: Op[]): void {
  const ids = new Set<string>();
  for (const op of ops) {
    const p = op.p as PathStep[];
    for (let i = 0; i + 1 < p.length; i++) {
      const next = p[i + 1];
      if (p[i] === 'children' && typeof next === 'object') ids.add(next.i);
    }
    if (op.t === 'ins' && p[p.length - 1] === 'children') ids.add(op.v.id);
  }
  if (!ids.size) return;
  for (const ab of d.artboards) {
    for (const id of ids) {
      const loc = locate(ab, id);
      if (!loc) continue;
      // The paint order is repaired against the paints the layer has right now, and ops of other people that add or remove
      // paints may still be on their way: what was written is kept (it is repaired whenever it is drawn), so this copy of the
      // layer stays the same as everyone else's
      const order = (loc.node as { paintOrder?: unknown }).paintOrder;
      if (!sanitizeLayerInPlace(loc.node)) loc.siblings.splice(loc.siblings.indexOf(loc.node), 1);
      else if (Array.isArray(order) && order.every((k) => k === 'fill' || k === 'stroke')) (loc.node as { paintOrder?: unknown }).paintOrder = order;
    }
  }
}

export type Tool =
  | 'select'
  | 'hand'
  | 'artboard'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'line'
  | 'pen'
  | 'pencil'
  | 'bend'
  | 'connector'
  | 'text'
  | 'frame'
  | 'image'
  | 'button'
  | 'input'
  | 'link'
  | 'embed'
  | 'video'
  | 'draw'
  | 'shader'
  | 'progress'
  | 'chart'
  | 'bone'
  | 'comment'
  | 'note';

/** Called whenever something sets bottomTab: the dock shows that panel (lib/dock.ts registers it). */
let panelRequestHandler: ((id: BottomTab | null) => void) | null = null;
export function onPanelRequest(fn: ((id: BottomTab | null) => void) | null): void {
  panelRequestHandler = fn;
}

export type BottomTab = 'timeline' | 'logic' | 'scripts' | 'variables' | 'data' | 'usage' | 'a11y' | 'insights' | 'interface' | 'checklist' | 'themes' | 'credits';

/** Where learners clicked on one artboard (from Insights), drawn over the canvas as a heat map. Never saved. */
export interface HeatOverlay {
  artboardId: string;
  cell: number;
  cells: { x: number; y: number; n: number }[];
  max: number;
}

export interface EditorState {
  project: Project;
  activeArtboardId: string;
  selection: string[];
  /** The active artboard itself is selected (its frame, not its layers). */
  artboardSelected: boolean;
  /**
   * Every artboard that is selected when more than one is (Ctrl+click or Shift+click on a name on the canvas or a row in the
   * Layers panel). Only counts while `artboardSelected` is on and `activeArtboardId` is in it; `pickedArtboardIds` has the rule.
   * Anything else that picks an artboard or a layer sets this back to empty (see `set`).
   */
  artboardPicked: string[];
  /** Container the user double-clicked into: clicks select its children. */
  focusId: string | null;
  tool: Tool;
  /** The sticky note picked on the canvas, and the one being typed into (interface state, never saved). */
  selectedNote: string | null;
  editingNote: string | null;
  zoom: number;
  panX: number;
  panY: number;
  editingPathId: string | null;
  editingTextId: string | null;
  /** The picture layer being cropped on the canvas (drag it inside its frame, scroll to zoom). Interface state, never saved. */
  croppingId: string | null;
  /** Draw bone glyphs on the canvas (they are never drawn in the player). */
  showBones: boolean;
  /** The selected range (UTF-16 offsets into the layer's text) while editing text on the canvas; style changes apply to it. */
  textSelection: { id: string; start: number; end: number } | null;
  /**
   * The tool panel last asked for (timeline, interactions, ...). Setting it shows that panel wherever it's docked (see
   * onPanelRequest and lib/dock.ts); null folds the bottom panel area away.
   */
  bottomTab: BottomTab | null;
  /** Whether the timeline panel is on screen (it can be docked anywhere, or floating). Timeline editing follows this. */
  timelineShown: boolean;
  bottomHeight: number;
  /** The theme (id) the canvas shows while editing; null is the project's default. Never saved. */
  canvasTheme: string | null;
  /** The click heat overlay Insights asked the canvas to draw, or null. */
  heat: HeatOverlay | null;
  activeTimelineId: string | null;
  playhead: number;
  previewPlaying: boolean;
  recording: boolean;
  selectedKeys: string[]; // "trackId:keyId"
  logicSelection: string | null;
  /**
   * Everything selected in the interaction graph (nodes and groups) when more than one thing is. `logicSelection` is the
   * one of them the settings column shows; it wins when it isn't in this list (something else selected a single node).
   */
  logicPicked: string[];
  /** The Interactions panel as the node graph, or as the sentences it says (read only, from the same graph). */
  logicView: 'graph' | 'sentences';
  saveState: 'saved' | 'saving' | 'dirty' | 'error';
  saveError: string | null;
  /** A power user (or brand group member) has switched the brand kit lock off for this session (F9). Nothing is saved with it. */
  brandOverride: boolean;
  toast: Toast | null;
  /** A list worth reading (import/export notes), shown in a dialog. */
  report: { title: string; lines: string[]; undo?: { steps: number; tick: number } } | null;
  /** Live editing connection, when there is one. */
  live: { status: 'live' | 'reconnecting' | 'deleted'; color?: string } | null;
  /** Other people in the project right now. */
  peers: Record<string, Peer>;
}

interface HistoryEntry {
  project: Project;
  selection: string[];
  activeArtboardId: string;
  /** How many remote batches (of `EditorStore.remoteTotal`) this snapshot has the changes of; the rest are put on when it is used. */
  seen: number;
}

/** The button on a message: undo (or redo) the `steps` changes it is about, as long as nothing else has changed since. */
export interface ToastAction {
  kind: 'undo' | 'redo';
  steps: number;
  /** Set once another change has been made, so the button can no longer mean "exactly that change". */
  stale?: boolean;
}
export interface Toast {
  text: string;
  kind: 'info' | 'error';
  action?: ToastAction;
}

type Listener = () => void;

const HISTORY_LIMIT = 200;
/** Remote batches kept for undo steps that have not caught up with them yet; past this they are all caught up at once. */
const REMOTE_LOG_LIMIT = 1000;

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  /**
   * Other people's changes since the oldest undo step still lacking them. Their ops are put on a step when it is undone or
   * redone, not on all (up to 200) of them every time something arrives. `remoteBase` is the number of the first one kept.
   */
  private remoteLog: Op[][] = [];
  private remoteBase = 0;
  private remoteTotal = 0;
  private lastCoalesce: { key: string; time: number } | null = null;
  private lastLockToast = 0;
  /** Counts undo steps ever made, so a message can tell which change it is about. */
  private pushes = 0;
  /** Counts every change to the history (a step added, an undo, a redo), so a button can tell nothing else happened since. */
  private ticks = 0;
  /** Bumped on each document change, for autosave. */
  revision = 0;
  /** Live editing hook: called with the document before and after every local change. */
  onLocalChange: ((before: Project, after: Project) => void) | null = null;

  constructor(project: Project) {
    // Lay out auto-layout frames once on open, so the first edit (and its undo) starts from settled positions.
    // (an unchanged produce still freezes the document, so a stray in-place edit throws instead of corrupting history)
    this.state = EditorStore.initial(settleLayout(lockBrandChrome(produce(project, () => undefined))));
  }

  static initial(project: Project): EditorState {
    const first = project.artboards[0];
    return {
      project,
      activeArtboardId: project.settings.startArtboardId ?? first?.id ?? '',
      selection: [],
      artboardSelected: false,
      artboardPicked: [],
      focusId: null,
      tool: 'select',
      selectedNote: null,
      editingNote: null,
      zoom: 1,
      panX: 80,
      panY: 80,
      editingPathId: null,
      editingTextId: null,
      croppingId: null,
      showBones: true,
      textSelection: null,
      bottomTab: 'timeline',
      timelineShown: true,
      bottomHeight: 260,
      canvasTheme: null,
      heat: null,
      activeTimelineId: null,
      playhead: 0,
      previewPlaying: false,
      recording: false,
      selectedKeys: [],
      logicSelection: null,
      logicPicked: [],
      logicView: 'graph',
      saveState: 'saved',
      saveError: null,
      brandOverride: false,
      toast: null,
      report: null,
      live: null,
      peers: {},
    };
  }

  get = (): EditorState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** UI state change (not undoable). */
  set(partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)): void {
    let p = typeof partial === 'function' ? partial(this.state) : partial;
    // Choosing an artboard (or going back to layers) on its own means just that one: a multi-selection only survives a change
    // that carries its own list
    if (('activeArtboardId' in p || 'artboardSelected' in p) && !('artboardPicked' in p) && this.state.artboardPicked.length) p = { ...p, artboardPicked: [] };
    this.state = { ...this.state, ...p };
    this.emit();
    //Asking for a panel shows it even when it's the one already asked for (it may be docked out of sight since)
    if ('bottomTab' in p) panelRequestHandler?.(p.bottomTab ?? null);
  }

  /**
   * Change the document. Consecutive changes with the same `coalesce` key
   * within a second (e.g. a drag) become one undo step. `library` is for library operations and `brand` for the editor's own
   * changes to a branded project's chrome (the learner colourway switcher); both skip the lock that guards them.
   */
  update(recipe: (draft: Draft<Project>) => void, opts: { coalesce?: string; library?: boolean; brand?: boolean } = {}): void {
    const before = this.state.project;
    // Artboards that came from a library are read-only: a change that touches one (other than moving or renaming it)
    // is refused. Library operations (insert, update, detach) say so with `library: true`. A brand kit's copies are
    // stricter still (brand.ts), and the only ones the override lets through
    let edited: Project | null = null;
    if (!opts.library && before.artboards.some((a) => a.library)) {
      edited = produce(before, (d) => {
        recipe(d);
      });
      const override = this.state.brandOverride;
      const locked = lockViolation(before, edited, override);
      if (locked) {
        const now = Date.now();
        if (now - this.lastLockToast > 1500) {
          this.lastLockToast = now;
          this.toast(locked.library?.brand ? `“${locked.name}” is part of a brand kit and is locked.` : `“${locked.name}” comes from a library and is read-only. Detach it to edit it here.`, 'error');
        }
        return;
      }
      // Instances of brand kit artboards keep the kit's proportions and size range
      if (!override && hasBrandArtboards(edited)) edited = clampBrandInstances(before, edited);
    }
    // A project made from a branded starter pack keeps its brand layers, theme colours and font (branded/lock.ts), until the override
    if (!opts.library && !opts.brand && !this.state.brandOverride && isBrandLocked(before)) {
      edited ??= produce(before, (d) => {
        recipe(d);
      });
      const why = brandLookViolation(before, edited);
      if (why) {
        const now = Date.now();
        if (now - this.lastLockToast > 1500) {
          this.lastLockToast = now;
          this.toast(why, 'error');
        }
        return;
      }
      edited = snapToBrand(before, edited);
    }
    // Auto-layout frames re-position their children after every change, in the same undo step.
    const next = settleLayout(edited ?? produce(before, (d) => void recipe(d)), true);
    if (next === before) return;
    const t = Date.now();
    const merge = opts.coalesce && this.lastCoalesce && this.lastCoalesce.key === opts.coalesce && t - this.lastCoalesce.time < 1000;
    if (!merge) {
      this.past.push({ project: before, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId, seen: this.remoteTotal });
      this.pushes++;
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.staleToastAction();
    this.lastCoalesce = opts.coalesce ? { key: opts.coalesce, time: t } : null;
    if (!merge) track('doc', 'edit');
    this.future = [];
    this.revision++;
    const updated = produce(next, (d) => {
      d.updated = new Date().toISOString();
    });
    this.state = { ...this.state, project: updated, saveState: 'dirty' };
    this.sanitize();
    this.onLocalChange?.(before, updated);
    this.emit();
  }

  /** Change the document without an undo step (derived data such as measured text size). */
  patchSilently(recipe: (draft: Draft<Project>) => void): void {
    const next = settleLayout(produce(this.state.project, (d) => void recipe(d)), true);
    if (next === this.state.project) return;
    this.revision++;
    const before = this.state.project;
    this.state = { ...this.state, project: next, saveState: 'dirty' };
    this.onLocalChange?.(before, next);
    this.emit();
  }

  /**
   * Someone else's ops. Applied to the document and, when it is next used, to every undo/redo step, so undo only takes back
   * your own changes. Not a local change: nothing is sent back.
   */
  applyRemote(ops: Op[]): void {
    this.state = { ...this.state, project: this.patchRemote(this.state.project, ops) };
    this.remoteLog.push(ops);
    this.remoteTotal++;
    if (this.remoteLog.length > 64) this.trimRemoteLog();
    this.sanitize();
    this.emit();
  }

  private patchRemote(p: Project, ops: Op[]): Project {
    return settleLayout(
      produce(p, (d) => {
        applyOps(d, ops);
        sanitizeTouched(d as Project, ops);
      }),
    );
  }

  /**
   * The step with every remote batch since it was made put on it, in one go: the ops are all addressed by id and set absolute
   * values, so they come out the same as batch by batch, and the layout is settled once.
   */
  private caughtUp(h: HistoryEntry): HistoryEntry {
    if (h.seen >= this.remoteTotal) return h;
    const ops = this.remoteLog.slice(h.seen - this.remoteBase).flat();
    return { ...h, project: this.patchRemote(h.project, ops), seen: this.remoteTotal };
  }

  /** Forget the batches every step has caught up with; when too many are held for a few old steps, catch all of them up. */
  private trimRemoteLog(): void {
    let oldest = this.remoteTotal;
    for (const h of this.past) oldest = Math.min(oldest, h.seen);
    for (const h of this.future) oldest = Math.min(oldest, h.seen);
    if (this.remoteLog.length - (oldest - this.remoteBase) > REMOTE_LOG_LIMIT) {
      this.past = this.past.map((h) => this.caughtUp(h));
      this.future = this.future.map((h) => this.caughtUp(h));
      oldest = this.remoteTotal;
    }
    this.remoteLog.splice(0, oldest - this.remoteBase);
    this.remoteBase = oldest;
  }

  /** Swap in a whole new copy of the document (it was replaced elsewhere); history starts over. */
  replaceProject(p: Project): void {
    this.past = [];
    this.future = [];
    this.remoteLog = [];
    this.remoteBase = this.remoteTotal;
    this.lastCoalesce = null;
    this.state = { ...this.state, project: p, saveState: 'saved' };
    this.sanitize();
    this.emit();
  }

  /** Break coalescing (call on pointer up). */
  commit(): void {
    this.lastCoalesce = null;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    track('history', 'undo');
    this.future.push({ project: this.state.project, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId, seen: this.remoteTotal });
    this.restore(this.caughtUp(prev));
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    track('history', 'redo');
    this.past.push({ project: this.state.project, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId, seen: this.remoteTotal });
    this.restore(this.caughtUp(next));
  }

  private restore(h: HistoryEntry): void {
    this.lastCoalesce = null;
    this.staleToastAction();
    this.revision++;
    const before = this.state.project;
    queueMicrotask(() => this.onLocalChange?.(before, h.project));
    this.state = { ...this.state, project: h.project, selection: h.selection, activeArtboardId: h.activeArtboardId, saveState: 'dirty' };
    this.sanitize();
    this.emit();
  }

  /** Drop references to things that no longer exist. */
  private sanitize(): void {
    const s = this.state;
    let ab = getArtboard(s.project, s.activeArtboardId);
    let activeArtboardId = s.activeArtboardId;
    if (!ab) {
      ab = s.project.artboards[0];
      activeArtboardId = ab?.id ?? '';
    }
    const selection = ab ? s.selection.filter((id) => locate(ab!, id)) : [];
    // No timeline is the design view (the canvas shows layers as they are, not a frame of an animation)
    const activeTimelineId = ab?.timelines.some((t) => t.id === s.activeTimelineId) ? s.activeTimelineId : null;
    const focusId = ab && s.focusId && locate(ab, s.focusId) ? s.focusId : null;
    const editingPathId = ab && s.editingPathId && locate(ab, s.editingPathId) ? s.editingPathId : null;
    const croppingId = ab && s.croppingId && locate(ab, s.croppingId)?.node.type === 'image' ? s.croppingId : null;
    // a group can be selected too, not only a node, and so can a note on the graph
    const inGraph = (id: string) => !!ab && (ab.logic.nodes.some((n) => n.id === id) || !!ab.logic.groups?.some((g) => g.id === id) || !!ab.logic.notes?.some((n) => n.id === id));
    const logicSelection = s.logicSelection && inGraph(s.logicSelection) ? s.logicSelection : null;
    const logicPicked = s.logicPicked.every(inGraph) ? s.logicPicked : s.logicPicked.filter(inGraph);
    const artboardPicked = s.artboardPicked.every((id) => !!getArtboard(s.project, id)) ? s.artboardPicked : s.artboardPicked.filter((id) => !!getArtboard(s.project, id));
    if (
      artboardPicked !== s.artboardPicked ||
      activeArtboardId !== s.activeArtboardId ||
      selection.length !== s.selection.length ||
      activeTimelineId !== s.activeTimelineId ||
      focusId !== s.focusId ||
      editingPathId !== s.editingPathId ||
      croppingId !== s.croppingId ||
      logicSelection !== s.logicSelection ||
      logicPicked !== s.logicPicked
    ) {
      this.state = { ...s, activeArtboardId, selection, activeTimelineId, focusId, editingPathId, croppingId, logicSelection, logicPicked, artboardPicked };
    }
  }

  // ---------------------------------------------------------------- helpers

  artboard(): Artboard | undefined {
    return getArtboard(this.state.project, this.state.activeArtboardId);
  }

  timeline(): Timeline | undefined {
    return this.artboard()?.timelines.find((t) => t.id === this.state.activeTimelineId);
  }

  selectedNodes(): SceneNode[] {
    const ab = this.artboard();
    if (!ab) return [];
    return this.state.selection.map((id) => locate(ab, id)?.node).filter(Boolean) as SceneNode[];
  }

  select(ids: string[], opts: { artboardId?: string } = {}): void {
    this.set({
      selection: ids,
      artboardSelected: false,
      activeArtboardId: opts.artboardId ?? this.state.activeArtboardId,
      editingPathId: null,
    });
  }

  toast(text: string, kind: 'info' | 'error' = 'info', action?: ToastAction): void {
    this.set({ toast: { text, kind, action } });
    const current = this.state.toast;
    setTimeout(() => {
      if (this.state.toast === current) this.set({ toast: null });
    }, kind === 'error' ? 6000 : action ? 9000 : 2500);
  }

  /** Where the undo history is now: take it before a command that ends in `toastUndo`. */
  historyMark(): number {
    return this.pushes;
  }

  /**
   * A message with an Undo button that takes back exactly what a command just did (every undo step it made since `mark`).
   * The button turns itself off the moment anything else changes the document, so it can never undo something else.
   * Nothing changed since `mark` is a plain message.
   */
  toastUndo(text: string, mark: number): void {
    const steps = this.pushes - mark;
    this.toast(text, 'info', steps > 0 ? { kind: 'undo', steps } : undefined);
  }

  /** What the button on a message does. Returns false when it was already stale (the message is left to run out). */
  runToastAction(): boolean {
    const a = this.state.toast?.action;
    if (!a || a.stale) return false;
    const back = a.kind === 'undo';
    for (let i = 0; i < a.steps; i++) back ? this.undo() : this.redo();
    // the opposite button, for as many steps as were just taken
    this.toast(back ? 'Undone' : 'Redone', 'info', { kind: back ? 'redo' : 'undo', steps: a.steps });
    return true;
  }

  /**
   * A report (the dialog after an import that left things out) with an Undo button for the command that made it, or a plain
   * message when the command changed nothing.
   */
  setReportUndo(title: string, lines: string[], mark: number): void {
    const steps = this.pushes - mark;
    this.set({ report: { title, lines, undo: steps > 0 ? { steps, tick: this.ticks } : undefined } });
  }

  /** The Undo button in a report: takes back that command, unless something else has changed since. */
  undoReport(): boolean {
    const u = this.state.report?.undo;
    if (!u) return false;
    this.set({ report: null });
    if (u.tick !== this.ticks) {
      this.toast('Something else has changed since, so Undo here would take back that instead. Ctrl+Z still undoes the latest change.');
      return false;
    }
    for (let i = 0; i < u.steps; i++) this.undo();
    this.toast('Undone', 'info', { kind: 'redo', steps: u.steps });
    return true;
  }

  private staleToastAction(): void {
    this.ticks++;
    const t = this.state.toast;
    if (!t?.action || t.action.stale) return;
    this.state = { ...this.state, toast: { ...t, action: { ...t.action, stale: true } } };
  }

  // ---------------------------------------------------------------- node editing

  /** Apply the same changes to several nodes. When recording, animatable props become keyframes at the playhead. */
  setProps(ids: string[], props: Record<string, unknown>, coalesce?: string): void {
    this.setEach(new Map(ids.map((id) => [id, props])), coalesce);
  }

  /** Apply per-node changes (id -> props). */
  setEach(changes: Map<string, Record<string, unknown>>, coalesce?: string): void {
    const s = this.state;
    // While editing text with a range selected, style changes (colour, size, weight, ...) go to that range as runs
    const sel = s.editingTextId && s.textSelection && s.textSelection.id === s.editingTextId && s.textSelection.start !== s.textSelection.end ? s.textSelection : null;
    const selNode = sel && changes.has(sel.id) ? this.nodeById(sel.id) : undefined;
    // (everything selected in a layer with no runs is just "the layer": that sets its own style, as before)
    if (sel && selNode?.type === 'text' && !(sel.start === 0 && sel.end >= selNode.text.length && !selNode.runs?.length)) {
      const { style, rest } = nodePropsToRunStyle(changes.get(sel.id)!);
      if (Object.keys(style).length) {
        this.styleTextRange(sel.id, sel.start, sel.end, style, coalesce);
        changes = new Map(changes);
        if (Object.keys(rest).length) changes.set(sel.id, rest);
        else changes.delete(sel.id);
        if (!changes.size) return;
      }
    }
    const tl = this.timeline();
    const onTimeline = !!tl && s.timelineShown;
    const record = s.recording && onTimeline;
    // On the timeline, a property the open timeline already animates shows its value at the playhead (the inspector and
    // the canvas both), so changing it changes that value: a key at the playhead, with Record on or not. Writing the
    // layer's own value instead would change nothing on screen and come back later as a surprise.
    const animated = (id: string, prop: string) => onTimeline && tl!.tracks.some((t) => t.nodeId === id && t.prop === prop && t.keys.length > 0);
    noteProps(changes, coalesce, (id) => this.nodeById(id)?.type, !!record);
    this.update((d) => {
      const ab = getArtboard(d as Project, s.activeArtboardId) as Draft<Artboard> | undefined;
      if (!ab) return;
      for (const [id, props] of changes) {
        const loc = locate(ab as Artboard, id);
        if (!loc) continue;
        for (const [prop, value] of Object.entries(props)) {
          if (animatableProp(prop, loc.node) && (record || animated(id, prop))) {
            const dtl = ab.timelines.find((t) => t.id === tl!.id)!;
            setKey(dtl as Timeline, id, prop, keyTime(dtl as Timeline, s.playhead), value as Keyframe['value']);
          } else if (prop === 'text' && loc.node.type === 'text' && loc.node.runs?.length) {
            // Editing the plain text of a rich text layer keeps the styling around the edit
            applyRuns(loc.node, retextRuns(loc.node.runs, String(value ?? '')));
          } else {
            setPath(loc.node as unknown as Record<string, unknown>, prop, value);
            unlinkStyleRef(loc.node, prop);
          }
        }
      }
    }, { coalesce });
  }

  private nodeById(id: string): SceneNode | undefined {
    const ab = this.artboard();
    return ab ? locate(ab, id)?.node : undefined;
  }

  /** Style part of a text layer (rich text): splits runs at the edges, merges equal neighbours, keeps `text` in sync. */
  styleTextRange(id: string, start: number, end: number, patch: Partial<RunStyle>, coalesce?: string): void {
    this.update((d) => {
      const ab = getArtboard(d as Project, this.state.activeArtboardId);
      const n = ab && locate(ab as Artboard, id)?.node;
      if (!n || n.type !== 'text') return;
      applyRuns(n, applyRunStyle(nodeRuns(n), start, end, patch));
    }, { coalesce });
  }

  /** Replace a text layer's runs (and so its text). Plain runs turn the layer back to ordinary text. */
  setTextRuns(id: string, runs: TextRun[], coalesce?: string): void {
    this.update((d) => {
      const ab = getArtboard(d as Project, this.state.activeArtboardId);
      const n = ab && locate(ab as Artboard, id)?.node;
      if (!n || n.type !== 'text') return;
      applyRuns(n, runs);
    }, { coalesce });
  }

  addNodes(nodes: SceneNode[], opts: { parentId?: string | null; select?: boolean; artboardId?: string } = {}): void {
    const abId = opts.artboardId ?? this.state.activeArtboardId;
    for (const n of nodes) noteNodeAdded(n);
    this.update((d) => {
      const ab = getArtboard(d as Project, abId);
      if (!ab) return;
      const names = nodeNames(ab);
      for (const n of nodes) {
        n.name = uniqueName(names, n.name);
        names.push(n.name);
      }
      const parent = opts.parentId ? locate(ab, opts.parentId)?.node : null;
      if (parent && isContainer(parent)) parent.children.push(...nodes);
      else ab.children.push(...nodes);
      adoptQuestions(d as Project, abId, nodes.map((n) => n.id));
    });
    if (opts.select !== false) this.select(nodes.map((n) => n.id), { artboardId: abId });
  }

  deleteSelection(): void {
    const ab = this.artboard();
    if (!ab) return;
    if (this.state.artboardSelected) {
      this.deleteArtboards(this.pickedArtboards());
      return;
    }
    const ids = new Set(this.state.selection);
    if (!ids.size) return;
    track('doc', 'delete', { sum: { layers: ids.size } });
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      // Everything that goes with the deleted layers: a deleted group or frame takes its descendants with it, and
      // their animation tracks would otherwise be left pointing at nothing
      const gone = new Set<string>();
      const collect = (list: SceneNode[], inside: boolean) => {
        for (const n of list) {
          const doomed = inside || ids.has(n.id);
          if (doomed) gone.add(n.id);
          if (isContainer(n)) collect(n.children, doomed);
        }
      };
      collect(dab.children as SceneNode[], false);
      const rec = (list: SceneNode[]): SceneNode[] =>
        list.filter((n) => !ids.has(n.id)).map((n) => (isContainer(n) ? { ...n, children: rec(n.children) } : n)) as SceneNode[];
      dab.children = rec(dab.children as SceneNode[]);
      for (const tl of dab.timelines) tl.tracks = tl.tracks.filter((t) => !gone.has(t.nodeId));
      dropOrphanKitNodes(dab);
    });
    this.set({ selection: [] });
  }

  duplicateSelection(offset = 10): void {
    // With artboards selected (not layers), Ctrl+D duplicates the artboards
    if (this.state.artboardSelected) {
      this.duplicateArtboards(this.pickedArtboards());
      return;
    }
    track('doc', 'duplicate');
    const ab = this.artboard();
    if (!ab) return;
    const ids = topmost(ab, this.state.selection);
    if (!ids.length) return;
    const newIds: string[] = [];
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const names = nodeNames(dab);
      for (const id of ids) {
        const loc = locate(dab, id);
        if (!loc) continue;
        const copy = cloneWithNewIds(JSON.parse(JSON.stringify(loc.node)) as SceneNode);
        copy.x += offset;
        copy.y += offset;
        copy.name = uniqueName(names, loc.node.name);
        names.push(copy.name);
        loc.siblings.splice(loc.index + 1, 0, copy);
        newIds.push(copy.id);
      }
      adoptQuestions(d as Project, ab.id, newIds);
    });
    this.select(newIds);
  }

  /**
   * Resize the artboard to the bounds of the selected layers, keeping everything where it is on the canvas: the artboard moves
   * to the selection's corner, its top-level layers (and their x/y keyframes) shift by the same amount the other way. Only for
   * a selection on one artboard (a layer selection always is; with several artboards picked it does nothing).
   */
  fitArtboardToSelection(): boolean {
    const ab = this.artboard();
    if (!ab || !this.state.selection.length || pickedArtboardIds(this.state).length > 1) return false;
    const b = selectionBounds(ab, topmost(ab, this.state.selection));
    if (!b || b.width < 1 || b.height < 1) return false;
    const x0 = Math.floor(b.x);
    const y0 = Math.floor(b.y);
    const w = Math.ceil(b.x + b.width) - x0;
    const h = Math.ceil(b.y + b.height) - y0;
    if (!x0 && !y0 && w === ab.width && h === ab.height) return false;
    track('doc', 'fit-artboard');
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const top = new Set(dab.children.map((n) => n.id));
      for (const n of dab.children) {
        n.x -= x0;
        n.y -= y0;
      }
      for (const tl of dab.timelines)
        for (const tr of tl.tracks) {
          if (!top.has(tr.nodeId) || (tr.prop !== 'x' && tr.prop !== 'y')) continue;
          const by = tr.prop === 'x' ? x0 : y0;
          for (const k of tr.keys) if (typeof k.value === 'number') k.value -= by;
        }
      dab.canvasX += x0;
      dab.canvasY += y0;
      dab.width = w;
      dab.height = h;
    });
    return true;
  }

  groupSelection(): void {
    track('doc', 'group');
    const ab = this.artboard();
    if (!ab) return;
    const ids = topmost(ab, this.state.selection);
    if (!ids.length) return;
    const first = locate(ab, ids[0]);
    if (!first) return;
    // Only group siblings of the first node.
    const sibs = ids.filter((id) => locate(ab, id)?.parent?.id === first.parent?.id);
    const groupId = uid('n');
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const loc = locate(dab, sibs[0])!;
      const list = loc.siblings;
      const members = list.filter((n) => sibs.includes(n.id));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const m of members) {
        minX = Math.min(minX, m.x);
        minY = Math.min(minY, m.y);
        maxX = Math.max(maxX, m.x + m.width);
        maxY = Math.max(maxY, m.y + m.height);
      }
      const index = Math.max(...members.map((m) => list.indexOf(m)));
      const group = {
        id: groupId,
        type: 'group' as const,
        name: uniqueName(nodeNames(dab), 'Group'),
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        originX: 0.5,
        originY: 0.5,
        opacity: 1,
        visible: true,
        children: members.map((m) => ({ ...m, x: m.x - minX, y: m.y - minY })) as SceneNode[],
      };
      const remaining = list.filter((n) => !sibs.includes(n.id));
      const insertAt = Math.min(remaining.length, index - members.length + 1);
      remaining.splice(insertAt, 0, group as SceneNode);
      list.splice(0, list.length, ...remaining);
      // The layers are not the parent's children any more, the group is: its draw order and solo (and their keys) name the group
      retargetChildRefs(dab, loc.parent, new Map(members.map((m) => [m.id, [groupId]])));
    });
    this.select([groupId]);
  }

  ungroupSelection(): void {
    track('doc', 'ungroup');
    const ab = this.artboard();
    if (!ab) return;
    const released: string[] = [];
    const dropped: string[] = [];
    const gone = new Set<string>();
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      for (const id of this.state.selection) {
        const loc = locate(dab, id);
        if (!loc || !isContainer(loc.node)) continue;
        const g = loc.node;
        if (g.rotation || g.scaleX !== 1 || g.scaleY !== 1) continue; // keep transformed groups intact
        // What the group did to everything inside it has to go onto the layers themselves: hidden, locked, blend mode,
        // blur and shadow. A child that already has its own of those keeps it (and we say so), and a mask can't move
        const lost = new Set<string>();
        const kids = g.children.map((c) => {
          const k = { ...c, x: c.x + g.x, y: c.y + g.y, opacity: c.opacity * g.opacity } as SceneNode;
          if (g.visible === false) k.visible = false;
          if (g.locked) k.locked = true;
          if (g.blendMode && g.blendMode !== 'normal') {
            if (!k.blendMode || k.blendMode === 'normal') k.blendMode = g.blendMode;
            else lost.add('blend mode');
          }
          if (g.blur) {
            if (!k.blur) k.blur = g.blur;
            else lost.add('blur');
          }
          if (g.shadow) {
            if (!k.shadow) k.shadow = { ...g.shadow };
            else lost.add('shadow');
          }
          return k;
        });
        if (g.mask) lost.add('mask');
        if (lost.size) dropped.push(`“${g.name}”: ${[...lost].join(', ')}`);
        // Where the parent listed the group (its draw order, its solo) it lists the layers released from it, in order; a solo
        // that showed the group shows the first of them (the layers can't all be shown by a solo, and it had one on show)
        retargetChildRefs(dab, loc.parent, new Map([[g.id, kids.map((k) => k.id)]]));
        loc.siblings.splice(loc.index, 1, ...kids);
        released.push(...kids.map((k) => k.id));
        gone.add(g.id);
      }
      // The group is gone, and so is whatever animated it (as when a layer is deleted), whatever followed it (constraints)
      // and whatever it was a bone of (skins)
      if (gone.size) for (const tl of dab.timelines) tl.tracks = tl.tracks.filter((t) => !gone.has(t.nodeId));
      dropRefsToRemoved(dab, gone);
    });
    if (dropped.length) this.toast(`Ungrouped, but some settings could not be kept on the layers: ${dropped.join('; ')}.`);
    if (released.length) this.select(released);
  }

  /** Move selection in z-order: +1 forward, -1 back, Infinity front, -Infinity back. */
  reorder(delta: number): void {
    track('doc', 'reorder', { thing: delta > 0 ? 'forward' : 'back' });
    const ab = this.artboard();
    if (!ab) return;
    const ids = this.state.selection;
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      for (const id of ids) {
        const loc = locate(dab, id);
        if (!loc) continue;
        const [n] = loc.siblings.splice(loc.index, 1);
        const to = delta === Infinity ? loc.siblings.length : delta === -Infinity ? 0 : Math.max(0, Math.min(loc.siblings.length, loc.index + delta));
        loc.siblings.splice(to, 0, n);
      }
    });
  }

  /** Move a node into a container (or the artboard root) at an index, keeping its on-screen position for untransformed parents. */
  /**
   * Move layers to another artboard, keeping where they sit on the canvas. Their keys in this artboard's timelines go
   * (timelines belong to an artboard); interactions that pointed at them are left for the person to fix (the Usage tab
   * lists them).
   */
  moveToArtboard(ids: string[], targetId: string): void {
    track('doc', 'move-to-artboard');
    const src = this.artboard();
    if (!src || src.id === targetId) return;
    const moved: string[] = [];
    const mark = this.historyMark();
    this.update((d) => {
      const sab = getArtboard(d as Project, src.id)!;
      const tab = getArtboard(d as Project, targetId);
      if (!tab) return;
      for (const id of topmost(sab as Artboard, ids)) {
        const loc = locate(sab, id);
        if (!loc) continue;
        const off = loc.ancestors.reduce((o, a) => ({ x: o.x + a.x, y: o.y + a.y }), { x: 0, y: 0 });
        const [n] = loc.siblings.splice(loc.index, 1);
        retargetChildRefs(sab, loc.parent, new Map([[id, []]]));
        n.x = Math.round((n.x + off.x + sab.canvasX - tab.canvasX) * 100) / 100;
        n.y = Math.round((n.y + off.y + sab.canvasY - tab.canvasY) * 100) / 100;
        n.name = uniqueName(nodeNames(tab as Artboard), n.name);
        tab.children.push(n);
        moved.push(id);
      }
      const gone = new Set<string>();
      for (const id of moved) {
        const tloc = locate(tab, id);
        if (tloc) walk([tloc.node as SceneNode], (x) => gone.add(x.id));
      }
      for (const t of sab.timelines) t.tracks = t.tracks.filter((tr) => !gone.has(tr.nodeId));
    });
    if (moved.length) {
      this.set({ activeArtboardId: targetId, selection: moved, activeTimelineId: null });
      const tab = getArtboard(this.state.project, targetId);
      this.toastUndo(`Moved ${moved.length === 1 ? 'the layer' : `${moved.length} layers`} to “${tab?.name}”.`, mark);
    }
  }

  moveNode(id: string, parentId: string | null, index: number): void {
    const ab = this.artboard();
    if (!ab) return;
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const loc = locate(dab, id);
      if (!loc) return;
      if (parentId && (parentId === id || locate(dab, parentId)?.ancestors.some((a) => a.id === id))) return; // no cycles
      const oldOffset = loc.ancestors.reduce((o, a) => ({ x: o.x + a.x, y: o.y + a.y }), { x: 0, y: 0 });
      const [n] = loc.siblings.splice(loc.index, 1);
      const target = parentId ? locate(dab, parentId) : null;
      const list = target && isContainer(target.node) ? target.node.children : dab.children;
      // Leaving its parent: what the parent listed of it (draw order, solo) goes with it
      if (loc.siblings !== list) retargetChildRefs(dab, loc.parent, new Map([[id, []]]));
      const newOffset = target ? [...target.ancestors, target.node].reduce((o, a) => ({ x: o.x + a.x, y: o.y + a.y }), { x: 0, y: 0 }) : { x: 0, y: 0 };
      n.x += oldOffset.x - newOffset.x;
      n.y += oldOffset.y - newOffset.y;
      let at = index;
      if (loc.siblings === list && loc.index < index) at--;
      list.splice(Math.max(0, Math.min(list.length, at)), 0, n);
    });
  }

  /**
   * Align the selection's top-level layers: to each other when several are selected, to their
   * container (or the artboard) when one is.
   */
  align(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    track('doc', 'align', { thing: edge });
    const ab = this.artboard();
    if (!ab) return;
    const ids = topmost(ab, this.state.selection).filter((id) => !locate(ab, id)?.node.locked);
    if (!ids.length) return;
    let target: { x: number; y: number; width: number; height: number } | null;
    if (ids.length === 1) {
      const loc = locate(ab, ids[0])!;
      target = loc.parent ? selectionBounds(ab, [loc.parent.id]) : { x: 0, y: 0, width: ab.width, height: ab.height };
    } else target = selectionBounds(ab, ids);
    if (!target) return;
    const changes = new Map<string, Record<string, unknown>>();
    for (const id of ids) {
      const b = selectionBounds(ab, [id])!;
      let dx = 0;
      let dy = 0;
      if (edge === 'left') dx = target.x - b.x;
      if (edge === 'right') dx = target.x + target.width - (b.x + b.width);
      if (edge === 'hcenter') dx = target.x + target.width / 2 - (b.x + b.width / 2);
      if (edge === 'top') dy = target.y - b.y;
      if (edge === 'bottom') dy = target.y + target.height - (b.y + b.height);
      if (edge === 'vcenter') dy = target.y + target.height / 2 - (b.y + b.height / 2);
      changes.set(id, this.moveBy(ab, id, dx, dy));
    }
    this.setEach(changes);
  }

  /** Space the selection evenly between its outermost layers (3 or more). */
  distribute(axis: 'horizontal' | 'vertical'): void {
    track('doc', 'distribute', { thing: axis });
    const ab = this.artboard();
    if (!ab) return;
    const ids = topmost(ab, this.state.selection).filter((id) => !locate(ab, id)?.node.locked);
    if (ids.length < 3) return;
    const h = axis === 'horizontal';
    const items = ids.map((id) => ({ id, b: selectionBounds(ab, [id])! })).sort((a, b) => (h ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = items[0].b;
    const last = items[items.length - 1].b;
    const span = h ? last.x + last.width - first.x : last.y + last.height - first.y;
    const sizes = items.reduce((t, i) => t + (h ? i.b.width : i.b.height), 0);
    const gap = (span - sizes) / (items.length - 1);
    let pos = h ? first.x : first.y;
    const changes = new Map<string, Record<string, unknown>>();
    for (const it of items) {
      const delta = pos - (h ? it.b.x : it.b.y);
      changes.set(it.id, this.moveBy(ab, it.id, h ? delta : 0, h ? 0 : delta));
      pos += (h ? it.b.width : it.b.height) + gap;
    }
    this.setEach(changes);
  }

  /** Replace the selected shapes with their boolean combination (a path). */
  booleanSelection(op: BooleanOp): void {
    track('doc', 'boolean', { thing: String(op) });
    const ab = this.artboard();
    if (!ab) return;
    const ids = topmost(ab, this.state.selection);
    const res = booleanPath(ab, ids, op);
    if (!res) {
      this.toast(ids.length < 2 ? 'Select two or more shapes' : 'Shapes must share a parent, and the result was empty or they did not overlap', 'error');
      return;
    }
    const remove = new Set(ids);
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const list = res.parentId ? (locate(dab, res.parentId)!.node as { children: SceneNode[] }).children : dab.children;
      const kept = list.filter((n) => !remove.has(n.id));
      kept.splice(Math.max(0, Math.min(kept.length, res.index)), 0, res.node);
      list.splice(0, list.length, ...kept);
      for (const tl of dab.timelines) tl.tracks = tl.tracks.filter((t) => !remove.has(t.nodeId));
    });
    this.select([res.node.id]);
  }

  /** New x/y for moving a node by (dx, dy) in artboard space, through its parent's transform. */
  private moveBy(ab: Artboard, id: string, dx: number, dy: number): Record<string, unknown> {
    const loc = locate(ab, id)!;
    const pm = parentToArtboard(ab, id);
    const inv = invert([pm[0], pm[1], pm[2], pm[3], 0, 0]);
    const q = apply(inv, dx, dy);
    return { x: Math.round((loc.node.x + q.x) * 100) / 100, y: Math.round((loc.node.y + q.y) * 100) / 100 };
  }

  // ---------------------------------------------------------------- artboards

  /**
   * Tidy up artboards: lay them out in a grid in the Artboards list order (lib/artboard-tidy.ts), each artboard group together
   * as a block of its own. With `ids`, only those (and the rest of their responsive sets) are laid out, among themselves, where
   * their top left corner is now. One undo step, and since it goes through update() it reaches live rooms like any edit.
   * Returns how many artboards moved.
   */
  tidyArtboards(ids?: string[]): number {
    track('feature', 'artboards-tidy');
    let moved = 0;
    const only = ids ? new Set(withSets(this.state.project, ids)) : undefined;
    this.update((d) => {
      const before = d.artboards.map((a) => `${a.canvasX},${a.canvasY}`);
      applyTidy(d as Project, undefined, only);
      moved = d.artboards.filter((a, i) => `${a.canvasX},${a.canvasY}` !== before[i]).length;
    });
    return moved;
  }

  // ---------------------------------------------------------------- artboard selection and groups

  /** The selected artboards (see `pickedArtboardIds`). */
  pickedArtboards(): string[] {
    return pickedArtboardIds(this.state);
  }

  /**
   * Select artboards: these, with `main` (the last one by default) the active one the inspector shows. Layers and the timeline
   * are left (a layer selection and an artboard selection don't mix); the timeline stays when the active artboard does.
   */
  pickArtboards(ids: string[], main?: string): void {
    const list = ids.filter((id) => !!getArtboard(this.state.project, id));
    const active = main && list.includes(main) ? main : (list[list.length - 1] ?? this.state.activeArtboardId);
    this.set({
      activeArtboardId: active,
      artboardSelected: list.length > 0,
      artboardPicked: list.length > 1 ? list : [],
      selection: [],
      focusId: null,
      activeTimelineId: active === this.state.activeArtboardId ? this.state.activeTimelineId : null,
    });
  }

  /** Ctrl+click on an artboard: add it to the selected ones, or take it out when it is one already. */
  toggleArtboardPick(id: string): void {
    const now = this.pickedArtboards();
    if (!now.includes(id)) this.pickArtboards([...now, id], id);
    else {
      const rest = now.filter((x) => x !== id);
      this.pickArtboards(rest, rest.includes(this.state.activeArtboardId) ? this.state.activeArtboardId : rest[rest.length - 1]);
    }
  }

  /** The artboards in a group (all of them selected). */
  pickGroup(gid: string, add = false): void {
    const ids = this.state.project.artboards.filter((a) => a.group === gid).map((a) => a.id);
    if (!ids.length) return;
    this.pickArtboards(add ? [...new Set([...this.pickedArtboards(), ...ids])] : ids, ids[0]);
  }

  /**
   * Put these artboards (and the rest of their responsive sets) in a new group, and select them. They leave any group they were
   * in. Returns the group's id, or null when there is nothing to group.
   */
  groupArtboards(ids: string[], name?: string): string | null {
    const all = withSets(this.state.project, ids);
    if (!all.length) return null;
    track('feature', 'artboards-group');
    let gid: string | null = null;
    this.update((d) => {
      gid = makeGroup(d as Project, all, name);
    });
    if (gid) this.pickArtboards(all);
    return gid;
  }

  /** Break a group up: its artboards stay where they are and stay selected. */
  ungroupArtboards(gid: string): void {
    track('feature', 'artboards-ungroup');
    this.update((d) => removeGroup(d as Project, gid));
  }

  /** Take artboards out of their groups. */
  leaveArtboardGroups(ids: string[]): void {
    this.update((d) => leaveGroups(d as Project, ids));
  }

  renameArtboardGroup(gid: string, name: string): void {
    const clean = name.trim().slice(0, 200);
    if (!clean) return;
    this.update(
      (d) => {
        const g = d.artboardGroups?.find((x) => x.id === gid);
        if (g) g.name = clean;
      },
      { coalesce: `abgroup-name-${gid}` },
    );
  }

  /** Line artboards up on an edge or centre (one undo step). */
  alignArtboards(ids: string[], mode: AlignMode): void {
    track('feature', 'artboards-align', { thing: mode });
    this.update((d) => alignBoards(d as Project, ids, mode));
  }

  /** Space artboards evenly across or down their span (one undo step). */
  distributeArtboards(ids: string[], axis: 'x' | 'y'): void {
    track('feature', 'artboards-distribute', { thing: axis });
    this.update((d) => distributeBoards(d as Project, ids, axis));
  }

  addArtboard(partial: Partial<Artboard> = {}): string {
    track('doc', 'artboard-add');
    const p = this.state.project;
    const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
    const ab = createArtboard({
      name: uniqueName(
        p.artboards.map((a) => a.name),
        'Page',
      ),
      canvasX: p.artboards.length ? right + 100 : 0,
      canvasY: 0,
      ...partial,
    });
    this.update((d) => {
      d.artboards.push(ab);
    });
    this.set({ activeArtboardId: ab.id, selection: [], artboardSelected: true, activeTimelineId: null });
    return ab.id;
  }

  deleteArtboard(id: string): void {
    this.deleteArtboards([id]);
  }

  /** Delete several artboards in one undo step (a project always keeps at least one). A group left with none is taken away too. */
  deleteArtboards(ids: string[]): void {
    const gone = new Set(ids.filter((id) => !!getArtboard(this.state.project, id)));
    if (!gone.size) return;
    track('doc', 'artboard-delete', { sum: { artboards: gone.size } });
    if (this.state.project.artboards.length - gone.size < 1) {
      this.toast('A project needs at least one page', 'error');
      return;
    }
    const mark = this.historyMark();
    this.update((d) => {
      for (const id of gone) {
        // The base of a responsive set goes: its narrowest variant becomes the base of the rest
        const dead = d.artboards.find((a) => a.id === id);
        const heirs = d.artboards.filter((a) => a.variantOf === id);
        if (dead && heirs.length) {
          const heir = setMembers(d.artboards as Artboard[], dead as Artboard).find((a) => a.id !== id)!;
          delete heir.variantOf;
          for (const a of heirs) if (a !== heir) a.variantOf = heir.id;
          if (d.settings.startArtboardId === id) d.settings.startArtboardId = heir.id;
          if (d.settings.reporting?.completionArtboard === id) d.settings.reporting.completionArtboard = heir.id;
        }
        d.artboards = d.artboards.filter((a) => a.id !== id);
        if (d.settings.startArtboardId === id) d.settings.startArtboardId = d.artboards[0].id;
      }
      // Pages whose master went stand on their own (undo brings it back)
      dropMasterRefs(d as Project, gone);
      pruneGroups(d as Project);
    });
    this.set({ artboardSelected: false, selection: [] });
    this.toastUndo(gone.size === 1 ? 'Deleted the page.' : `Deleted ${gone.size} pages.`, mark);
  }

  /**
   * Add an artboard to a responsive set: a copy of the artboard (layers, timelines and interactions, all with fresh ids) that
   * is shown at another width. The set is the artboard's own, so adding a variant to a variant adds it to the same set.
   * Returns the new artboard's id.
   */
  addVariant(id: string, side: VariantSide = 'narrower'): string | null {
    track('feature', 'variant-add', { thing: side });
    const src = getArtboard(this.state.project, id);
    if (!src || this.brandCopyRefused(src)) return null;
    const all = this.state.project.artboards;
    const base = setBase(all, src);
    const members = setMembers(all, src);
    const plan = variantPlan(members, side);
    const copy = this.copyArtboard(src);
    copy.name = uniqueName(
      all.map((a) => a.name),
      `${base.name} ${side === 'narrower' ? 'narrow' : 'wide'}`,
    );
    copy.width = plan.width;
    copy.height = plan.height;
    copy.minWidth = plan.minWidth;
    copy.variantOf = base.id;
    const right = members.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
    copy.canvasX = right + 100;
    copy.canvasY = src.canvasY;
    this.update((d) => {
      if (plan.edgeMinWidth !== undefined) {
        const edge = d.artboards.find((a) => a.id === members[0].id);
        if (edge) edge.minWidth = plan.edgeMinWidth;
      }
      d.artboards.push(copy);
    });
    this.set({ activeArtboardId: copy.id, selection: [], artboardSelected: true, activeTimelineId: null });
    return copy.id;
  }

  /** Make an artboard a variant of another one's set (`baseId` null: it stands on its own again). */
  setVariantOf(id: string, baseId: string | null): void {
    track('feature', 'variant-pair', { thing: baseId ? 'pair' : 'unpair' });
    const p = this.state.project;
    const ab = getArtboard(p, id);
    if (!ab) return;
    const base = baseId ? getArtboard(p, baseId) : null;
    const target = base ? setBase(p.artboards, base) : null;
    // Not itself, and not an artboard that has variants of its own
    if (target && (target.id === id || p.artboards.some((a) => a.variantOf === id))) return;
    this.update((d) => {
      const a = getArtboard(d as Project, id);
      if (!a) return;
      if (target) a.variantOf = target.id;
      else delete a.variantOf;
    });
  }

  /** The width, in px, from which an artboard of a set is shown. */
  setBreakpoint(id: string, minWidth: number): void {
    track('feature', 'variant-breakpoint');
    const v = Math.max(0, Math.min(100000, Math.round(Number(minWidth) || 0)));
    this.update(
      (d) => {
        const a = getArtboard(d as Project, id);
        if (!a) return;
        if (v) a.minWidth = v;
        else delete a.minWidth;
      },
      { coalesce: `ab-bp-${id}` },
    );
  }

  /** Use an artboard as the page master of these pages (null: take them off their master). */
  setMasterOf(pageIds: string[], masterId: string | null): void {
    track('feature', 'master-set', { thing: masterId ? 'use' : 'clear' });
    this.update((d) => {
      for (const id of pageIds) setMaster(d as Project, id, masterId);
    });
  }

  /** Keep an artboard as a page master (listed apart, with its layers drawn on the pages that use it). */
  markAsMaster(id: string, on: boolean): void {
    track('feature', 'master-mark', { thing: on ? 'on' : 'off' });
    this.update((d) => markMaster(d as Project, id, on));
  }

  /** Put the master's layers into the page as ordinary layers and stop using the master. */
  detachMasterOf(pageId: string): void {
    track('feature', 'master-detach');
    this.update((d) => void detachMaster(d as Project, pageId));
  }

  /** Select a page's master to edit it (it is shown on the canvas if it was hidden). */
  editMasterOf(pageId: string): void {
    const p = this.state.project;
    const page = getArtboard(p, pageId);
    const m = page ? masterOf(p.artboards, page) : null;
    if (!m) return;
    track('feature', 'master-edit');
    if (m.canvasHidden) {
      this.update((d) => {
        const a = getArtboard(d as Project, m.id);
        if (a) delete a.canvasHidden;
      });
    }
    this.set({ activeArtboardId: m.id, artboardSelected: true, selection: [], activeTimelineId: null });
  }

  /** Leave one of the master's layers (by name) off a page, or put it back. */
  setMasterHidden(pageId: string, name: string, hidden: boolean): void {
    this.update((d) => {
      const a = getArtboard(d as Project, pageId);
      if (!a) return;
      const list = (a.masterHide ?? []).filter((x) => x !== name);
      if (hidden) list.push(name);
      if (list.length) a.masterHide = list;
      else delete a.masterHide;
    });
  }

  /** Fill one text slot of the master on a page (empty: back to the master's own text). */
  setMasterSlot(pageId: string, slot: string, value: string): void {
    this.update(
      (d) => {
        const a = getArtboard(d as Project, pageId);
        if (!a) return;
        const slots = { ...(a.masterSlots ?? {}) };
        if (value) slots[slot] = value;
        else delete slots[slot];
        if (Object.keys(slots).length) a.masterSlots = slots;
        else delete a.masterSlots;
      },
      { coalesce: `master-slot-${pageId}-${slot}` },
    );
  }

  /** On a master: draw one of its top-level layers over the pages instead of under them. */
  setMasterOver(masterId: string, layerId: string, over: boolean): void {
    this.update((d) => {
      const a = getArtboard(d as Project, masterId);
      if (!a) return;
      const list = (a.masterOver ?? []).filter((x) => x !== layerId);
      if (over) list.push(layerId);
      if (list.length) a.masterOver = list;
      else delete a.masterOver;
    });
  }

  /** A copy of a brand kit artboard would be an unlocked one, which is the detach the kit doesn't allow. */
  private brandCopyRefused(src: Artboard): boolean {
    if (!src.library?.brand || this.state.brandOverride) return false;
    this.toast(`“${src.name}” is part of a brand kit, so it can't be copied. Place an instance of it instead.`, 'error');
    return true;
  }

  duplicateArtboard(id: string): void {
    this.duplicateArtboards([id]);
  }

  /**
   * Duplicate several artboards in one undo step. The copies keep their layout among themselves and sit to the right of the
   * originals; they are selected afterwards. A copy joins the group of its original, except when a whole group is duplicated:
   * then the copies are a new group of their own ("Quiz copy").
   */
  duplicateArtboards(ids: string[]): void {
    const p = this.state.project;
    const srcs = p.artboards.filter((a) => ids.includes(a.id));
    if (!srcs.length || srcs.some((a) => this.brandCopyRefused(a))) return;
    track('doc', 'artboard-duplicate', { sum: { artboards: srcs.length } });
    const copies = srcs.map((a) => ({ src: a, copy: this.copyArtboard(a) }));
    if (srcs.length > 1) {
      //keep the layout: slide the whole set along to clear the originals (one copy sits next to its original as before)
      const left = Math.min(...srcs.map((a) => a.canvasX));
      const right = Math.max(...srcs.map((a) => a.canvasX + a.width));
      for (const c of copies) {
        c.copy.canvasX = c.src.canvasX + (right - left) + 100;
        c.copy.canvasY = c.src.canvasY;
      }
      //names stay unique across the copies too
      const taken = new Set(p.artboards.map((a) => a.name));
      for (const c of copies) {
        c.copy.name = uniqueName([...taken], c.src.name);
        taken.add(c.copy.name);
      }
    }
    //a group copied whole becomes a group of copies
    const wholeGroups = (p.artboardGroups ?? []).filter((g) => p.artboards.filter((a) => a.group === g.id).every((a) => ids.includes(a.id)) && srcs.some((a) => a.group === g.id));
    const fresh = new Map(wholeGroups.map((g) => [g.id, { id: uid('abg'), name: freshGroupName(p, `${g.name} copy`) }]));
    this.update((d) => {
      for (const { copy } of copies) {
        const g = copy.group ? fresh.get(copy.group) : undefined;
        if (g) {
          if (!d.artboardGroups?.some((x) => x.id === g.id)) (d.artboardGroups ??= []).push({ ...g });
          copy.group = g.id;
        }
        d.artboards.push(copy);
      }
    });
    this.pickArtboards(copies.map((c) => c.copy.id));
  }

  /** A copy of an artboard with new ids all through (layers, timelines, joysticks, blends and the interactions that point at them), next to it on the canvas. Not added to the project. */
  private copyArtboard(src: Artboard): Artboard {
    const idMap = new Map<string, string>();
    const children = src.children.map((c) => cloneWithNewIds(JSON.parse(JSON.stringify(c)) as SceneNode, idMap));
    // (a connector copied before the layers it joins found no copy of them yet: they all have one now)
    for (const c of children) walk([c], (n) => remapConnectorIds(n, idMap));
    const copy: Artboard = {
      ...JSON.parse(JSON.stringify(src)),
      id: uid('ab'),
      name: uniqueName(
        this.state.project.artboards.map((a) => a.name),
        src.name,
      ),
      canvasX: src.canvasX + src.width + 100,
      children,
    };
    // a copy isn't linked to the file: its layers have new ids, so it couldn't be matched to the file's anyway
    delete copy.source;
    // and it stands on its own: a copy of a set's base is not the base of the same variants
    delete copy.variantOf;
    delete copy.minWidth;
    // and a copy of a library artboard is your own to edit
    delete copy.library;
    // a copy of a master draws the same layers over the pages, which now have new ids
    if (copy.masterOver) copy.masterOver = copy.masterOver.map((x) => idMap.get(x) ?? x);
    delete copy.publish;
    for (const tl of copy.timelines) {
      tl.id = uid('tl');
      for (const tr of tl.tracks) {
        tr.id = uid('tr');
        tr.nodeId = idMap.get(tr.nodeId) ?? tr.nodeId;
      }
    }
    const remapParam = (v: unknown) => (typeof v === 'string' && idMap.has(v) ? idMap.get(v) : v);
    const tlMap = new Map(src.timelines.map((t, i) => [t.id, copy.timelines[i].id]));
    // Keys that hold layer ids (a solo's active child, a draw order) follow the layers to their copies
    for (const tl of copy.timelines)
      for (const tr of tl.tracks)
        for (const k of tr.keys) {
          if (tr.prop === 'solo.active') k.value = remapParam(k.value) as typeof k.value;
          else if (tr.prop === 'drawOrder' && Array.isArray(k.value)) k.value = k.value.map(remapParam) as typeof k.value;
        }
    // Joysticks drive the copy's own timelines
    for (const j of copy.joysticks ?? []) {
      j.id = uid('j');
      if (j.xTimeline && tlMap.has(j.xTimeline)) j.xTimeline = tlMap.get(j.xTimeline)!;
      if (j.yTimeline && tlMap.has(j.yTimeline)) j.yTimeline = tlMap.get(j.yTimeline)!;
      if (j.handle && idMap.has(j.handle)) j.handle = idMap.get(j.handle)!;
    }
    // Blends are copied with new ids, pointing at the copied timelines
    const blendMap = new Map<string, string>();
    for (const b of copy.blends ?? []) {
      const fresh = uid('bl');
      blendMap.set(b.id, fresh);
      b.id = fresh;
      for (const e of b.entries) if (e.timeline && tlMap.has(e.timeline)) e.timeline = tlMap.get(e.timeline)!;
    }
    for (const n of copy.logic.nodes) {
      for (const k of Object.keys(n.params)) {
        n.params[k] = remapParam(n.params[k]);
        if (typeof n.params[k] === 'string' && blendMap.has(n.params[k] as string)) n.params[k] = blendMap.get(n.params[k] as string);
        if (typeof n.params[k] === 'string' && tlMap.has(n.params[k] as string)) n.params[k] = tlMap.get(n.params[k] as string);
      }
    }
    return copy;
  }

  // ---------------------------------------------------------------- text modifiers

  addTextModifier(nodeId: string, patch: Partial<TextModifier> = {}): void {
    track('feature', 'text-modifier-add');
    const ab = this.artboard();
    if (ab) this.update((d) => void addModifier(d as Project, ab.id, nodeId, patch));
  }

  removeTextModifier(nodeId: string, index: number): void {
    const ab = this.artboard();
    if (ab) this.update((d) => removeModifier(d as Project, ab.id, nodeId, index));
  }

  /** Typewriter or wave: a modifier and a timeline for it, in one undo step. The new timeline becomes the open one. */
  applyTextPreset(nodeId: string, preset: TextPresetId): void {
    track('feature', 'text-preset', { thing: String(preset) });
    const ab = this.artboard();
    if (!ab) return;
    let tlId: string | null = null;
    this.update((d) => {
      tlId = applyPreset(d as Project, ab.id, nodeId, preset);
    });
    if (tlId) this.set({ activeTimelineId: tlId, playhead: 0, bottomTab: 'timeline' });
  }

  /**
   * An animation preset (Fade in, Pop...) on each layer: a timeline named for the layer and the event that starts it, in one undo
   * step. The last layer's timeline becomes the open one. Returns what it wrote, one entry per layer it could animate.
   */
  applyAnimation(nodeIds: string[], preset: AnimPresetId, opts: AnimOptions = {}): AnimResult[] {
    track('feature', 'animation-preset', { thing: preset });
    const ab = this.artboard();
    if (!ab) return [];
    const made: AnimResult[] = [];
    this.update((d) => {
      for (const id of nodeIds) {
        const r = applyAnimation(d as Project, ab.id, id, preset, opts);
        if (r) made.push(r);
      }
    });
    const last = made[made.length - 1];
    if (last) this.set({ activeTimelineId: last.timelineId, playhead: 0 });
    return made;
  }

  // ---------------------------------------------------------------- timelines

  addTimeline(name = 'Timeline'): string {
    track('feature', 'timeline-add');
    const ab = this.artboard();
    if (!ab) return '';
    const tl: Timeline = {
      id: uid('tl'),
      name: uniqueName(
        ab.timelines.map((t) => t.name),
        name,
      ),
      duration: 1000,
      loop: 'once',
      autoplay: false,
      speed: 1,
      tracks: [],
    };
    this.update((d) => {
      getArtboard(d as Project, ab.id)!.timelines.push(tl);
    });
    this.set({ activeTimelineId: tl.id, playhead: 0, bottomTab: 'timeline' });
    return tl.id;
  }

  /** Rename a timeline of the open artboard. Empty names and names another timeline has are refused (returns false). */
  renameTimeline(id: string, name: string): boolean {
    const ab = this.artboard();
    const clean = name.trim();
    if (!ab || !clean) return false;
    if (ab.timelines.some((t) => t.id !== id && t.name === clean)) return false;
    const tl = ab.timelines.find((t) => t.id === id);
    if (!tl) return false;
    if (tl.name === clean) return true;
    track('feature', 'timeline-rename');
    this.update((d) => {
      const t = getArtboard(d as Project, ab.id)?.timelines.find((x) => x.id === id);
      if (t) t.name = clean;
    });
    return true;
  }

  /** Move a timeline to a place in the open artboard's list (the order is what "after the timelines that play before it" means for held poses). */
  moveTimeline(id: string, to: number): void {
    const ab = this.artboard();
    const from = ab?.timelines.findIndex((t) => t.id === id) ?? -1;
    if (!ab || from < 0) return;
    const at = Math.max(0, Math.min(ab.timelines.length - 1, to));
    if (at === from) return;
    track('feature', 'timeline-reorder');
    this.update((d) => {
      const list = getArtboard(d as Project, ab.id)!.timelines;
      const [t] = list.splice(from, 1);
      list.splice(at, 0, t);
    });
  }

  /** A copy of a timeline right after it, with new ids, named "<name> copy", not set to autoplay (so the two don't both start). Returns the copy's id. */
  duplicateTimeline(id: string): string {
    const ab = this.artboard();
    const src = ab?.timelines.find((t) => t.id === id);
    if (!ab || !src) return '';
    track('feature', 'timeline-duplicate');
    const copy = JSON.parse(JSON.stringify(src)) as Timeline;
    copy.id = uid('tl');
    copy.name = uniqueName(
      ab.timelines.map((t) => t.name),
      `${src.name} copy`,
    );
    copy.autoplay = false;
    for (const tr of copy.tracks) tr.id = uid('tr');
    for (const m of copy.markers ?? []) m.id = uid('mk');
    this.update((d) => {
      const list = getArtboard(d as Project, ab.id)!.timelines;
      list.splice(list.findIndex((t) => t.id === id) + 1, 0, copy);
    });
    this.set({ activeTimelineId: copy.id, playhead: 0, selectedKeys: [] });
    return copy.id;
  }

  /** Delete a timeline of the open artboard. Things that played it by name or id are left to the Usage tab to flag. */
  deleteTimeline(id: string): void {
    const ab = this.artboard();
    if (!ab?.timelines.some((t) => t.id === id)) return;
    track('feature', 'timeline-delete');
    this.update((d) => {
      const a = getArtboard(d as Project, ab.id);
      if (a) a.timelines = a.timelines.filter((t) => t.id !== id);
    });
  }

  updateTimeline(fn: (tl: Draft<Timeline>) => void, coalesce?: string): void {
    const ab = this.artboard();
    const id = this.state.activeTimelineId;
    if (!ab || !id) return;
    this.update(
      (d) => {
        const tl = getArtboard(d as Project, ab.id)?.timelines.find((t) => t.id === id);
        if (tl) fn(tl);
      },
      { coalesce },
    );
  }

  /**
   * Add/replace a keyframe for a property of one or more layers at the playhead, holding the value each one shows
   * there: the timeline's value when it already animates the property (between two keys that's the in-between value),
   * otherwise the layer's own. All in one undo step.
   */
  keyCurrent(nodeIds: string | string[], prop: string): void {
    track('feature', 'keyframe-add', { thing: String(prop).split('.')[0] });
    const ab = this.artboard();
    let tlId = this.state.activeTimelineId;
    if (!ab) return;
    if (!tlId) tlId = this.addTimeline();
    const tl = this.artboard()?.timelines.find((x) => x.id === tlId);
    const t = this.state.playhead;
    const keys: [string, Keyframe['value']][] = [];
    for (const nodeId of Array.isArray(nodeIds) ? nodeIds : [nodeIds]) {
      const loc = locate(ab, nodeId);
      if (!loc) continue;
      let value = valueAt(tl, loc.node, prop, t) as Keyframe['value'] | undefined;
      if (value === undefined) {
        const kids = isContainer(loc.node) ? loc.node.children : [];
        // Draw order starts as the layers' own order; solo starts on the first child
        if (prop === 'drawOrder') value = kids.map((k) => k.id);
        else if (prop === 'solo.active') value = kids[0]?.id ?? '';
        else if (/^cornerRadii\.\d$/.test(prop)) value = Number(valueAt(tl, loc.node, 'cornerRadius', t)) || 0;
        else if (prop.startsWith('inputs.')) value = this.state.project.variables.find((v) => v.name === prop.slice(7))?.initial ?? 0;
        else value = prop.endsWith('color') ? '#000000' : 0;
      }
      keys.push([nodeId, value]);
    }
    if (!keys.length) return;
    this.update((d) => {
      const dtl = getArtboard(d as Project, ab.id)?.timelines.find((x) => x.id === tlId);
      if (dtl) for (const [nodeId, value] of keys) setKey(dtl as Timeline, nodeId, prop, keyTime(dtl as Timeline, t), value);
    });
  }

  // ---------------------------------------------------------------- path points and shape keys

  /**
   * Replace a path layer's points. While recording, only the numbers that differ from `from` (the points as the
   * canvas showed them when the edit began, so including the timeline's frame at the playhead) are keyed at the
   * playhead: a moved point keys its x and y, a moved handle both numbers of that handle. A handle that didn't exist
   * before is also keyed (as zero) at the keys the layer's points already have, so earlier poses stay straight.
   * Otherwise the layer's own points are replaced.
   */
  setPathPoints(id: string, paths: SubPath[], opts: { from?: SubPath[]; coalesce?: string } = {}): void {
    const s = this.state;
    const tl = this.timeline();
    const record = !!(s.recording && tl && s.timelineShown);
    const from = opts.from;
    const sameShape = !!from && from.length === paths.length && from.every((sp, i) => sp.points.length === paths[i].points.length);
    if (!record || !from || !sameShape) {
      this.setProps([id], { paths }, opts.coalesce);
      return;
    }
    const changes: { sub: number; index: number; part: (typeof POINT_PARTS)[number]; value: number }[] = [];
    paths.forEach((sp, sub) =>
      sp.points.forEach((pt, index) => {
        const a = pointParts(from[sub].points[index]);
        const b = pointParts(pt);
        for (const part of POINT_PARTS) {
          const handle = part.includes('.');
          const pair = handle ? (part.startsWith('in') ? ['in.x', 'in.y'] : ['out.x', 'out.y']) : ['x', 'y'];
          // both numbers of a point or handle go together
          if (pair.some((q) => a[q as typeof part] !== b[q as typeof part])) changes.push({ sub, index, part, value: b[part] });
        }
      }),
    );
    if (!changes.length) return;
    const t = s.playhead;
    this.update((d) => {
      const ab = getArtboard(d as Project, s.activeArtboardId);
      const dtl = ab?.timelines.find((x) => x.id === tl!.id);
      const loc = ab && locate(ab as Artboard, id);
      if (!ab || !dtl || !loc || loc.node.type !== 'path') return;
      const times = [...new Set(pointTracks(dtl as Timeline, id).flatMap((tr) => tr.keys.map((k) => k.t)))];
      for (const c of changes) {
        const prop = pathPointPropName(c.sub, c.index, c.part);
        const isNew = !dtl.tracks.some((tr) => tr.nodeId === id && tr.prop === prop);
        if (isNew && c.part.includes('.')) {
          const base = loc.node.paths[c.sub]?.points[c.index];
          const baseValue = base ? pointParts(base as never)[c.part] : 0;
          for (const kt of times) setKey(dtl as Timeline, id, prop, kt, baseValue);
        }
        setKey(dtl as Timeline, id, prop, keyTime(dtl as Timeline, t), c.value);
      }
    }, { coalesce: opts.coalesce });
  }

  /**
   * Key the whole shape of a path layer at the playhead: every point (and the handles it has) gets a key holding its
   * value in the frame shown there. Key the shape, move the playhead, edit points while recording, and the shape morphs.
   */
  keyShape(nodeId: string): void {
    track('feature', 'shape-keyframe');
    const ab = this.artboard();
    if (!ab) return;
    const node = locate(ab, nodeId)?.node;
    if (!node || node.type !== 'path') return;
    const tlId = this.state.activeTimelineId ?? this.addTimeline();
    const t = this.state.playhead;
    const now = this.artboard()!;
    const tl0 = now.timelines.find((x) => x.id === tlId);
    if (!tl0) return;
    const pose = posedPaths(tl0, node, t);
    this.update((d) => {
      const dtl = getArtboard(d as Project, now.id)?.timelines.find((x) => x.id === tlId);
      if (!dtl) return;
      pose.forEach((sp, sub) =>
        sp.points.forEach((pt, index) => {
          const parts = pointParts(pt);
          for (const part of POINT_PARTS) {
            const prop = pathPointPropName(sub, index, part);
            const tracked = dtl.tracks.some((tr) => tr.nodeId === nodeId && tr.prop === prop);
            // handles only when the point has them (or they are keyed already)
            if (part.includes('.') && !tracked && !pt[part.startsWith('in') ? 'in' : 'out']) continue;
            setKey(dtl as Timeline, nodeId, prop, keyTime(dtl as Timeline, t), parts[part]);
          }
        }),
      );
    });
  }

  /** Remove every shape key (point track) of a path layer from the open timeline. */
  clearShapeKeys(nodeId: string): void {
    this.updateTimeline((tl) => {
      const gone = new Set(pointTracks(tl as Timeline, nodeId).map((tr) => tr.id));
      tl.tracks = tl.tracks.filter((tr) => !gone.has(tr.id));
    });
  }

  /**
   * Turn a rect, ellipse, polygon or star into a path with the same outline, so its points can be edited and bent.
   * The layer keeps its id, place, fill and stroke; keys on its corner radius or inner ratio go, since those no longer exist.
   */
  convertToPath(id: string): boolean {
    track('doc', 'convert-to-path');
    const ab = this.artboard();
    const node = ab && locate(ab, id)?.node;
    const paths = node && shapeToPaths(node);
    if (!ab || !node || !paths) return false;
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const loc = locate(dab as Artboard, id);
      if (!loc) return;
      const old = loc.node as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...old, type: 'path', paths };
      for (const k of ['cornerRadius', 'cornerRadii', 'sides', 'points', 'innerRatio']) delete next[k];
      loc.siblings.splice(loc.index, 1, next as unknown as SceneNode);
      for (const tl of dab.timelines) tl.tracks = tl.tracks.filter((tr) => !(tr.nodeId === id && (tr.prop === 'cornerRadius' || tr.prop.startsWith('cornerRadii.') || tr.prop === 'innerRatio')));
    });
    return true;
  }

  /**
   * Add a point on a segment of a path layer, at parameter t of the segment (the shape doesn't change). Keys stay
   * valid: the layer's shape keys are renumbered, and in every timeline the new point gets keys at each key time of
   * its sub-path, placed on the curve of that frame (`si`/`i`/`t` are read from the frame shown at the playhead), with
   * the two neighbours' handles adjusted to keep each frame's outline.
   */
  insertPathPoint(id: string, si: number, i: number, t: number): void {
    const ab = this.artboard();
    const node = ab && locate(ab, id)?.node;
    if (!ab || !node || node.type !== 'path') return;
    const sp0 = node.paths[si];
    if (!sp0 || i < 0 || i >= sp0.points.length) return;
    const n = sp0.points.length;
    // The frames to rewrite, worked out from the document before the change
    const plan = ab.timelines
      .filter((tl) => keyTimes(tl, id, si).length)
      .map((tl) => {
        const times = keyTimes(tl, id, si);
        const poses = times.map((kt) => {
          const before = posedPaths(tl, node, kt);
          return { t: kt, before: before[si].points, after: insertPoint(before, si, i, t)[si].points };
        });
        return { id: tl.id, poses };
      });
    const inserted = insertPoint(node.paths, si, i, t);
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const dn = locate(dab as Artboard, id)?.node;
      if (!dn || dn.type !== 'path') return;
      dn.paths = inserted as never;
      for (const p of plan) {
        const dtl = dab.timelines.find((x) => x.id === p.id) as Timeline | undefined;
        if (!dtl) continue;
        remapPointTracks(dtl, id, (sub, index) => ({ sub, index: sub === si && index > i ? index + 1 : index }));
        const mid = i + 1;
        const nb = (i + 2) % (n + 1);
        // a curve in any frame means handles are keyed in every frame
        const curved = p.poses.some((q) => q.after[mid].in || q.after[mid].out);
        for (const q of p.poses) {
          const write = (index: number, parts: (typeof POINT_PARTS)[number][]) => {
            const v = pointParts(q.after[index]);
            for (const part of parts) setKey(dtl, id, pathPointPropName(si, index, part), q.t, v[part]);
          };
          write(mid, curved ? POINT_PARTS : ['x', 'y']);
          if (curved) {
            write(i, ['out.x', 'out.y']);
            write(nb, ['in.x', 'in.y']);
          }
        }
      }
    });
  }

  /**
   * Remove a point of a path layer (a sub-path left with fewer than two points goes too). The layer's shape keys for
   * that point go with it and the later points' keys are renumbered, in every timeline, so the other frames stay valid
   * (their outlines lose that corner: the neighbours are joined directly). Returns false when nothing is left of the layer.
   */
  removePathPoint(id: string, si: number, pi: number): boolean {
    const ab = this.artboard();
    const node = ab && locate(ab, id)?.node;
    if (!ab || !node || node.type !== 'path' || !node.paths[si]?.points[pi]) return true;
    const paths = structuredClone(node.paths) as SubPath[];
    paths[si].points.splice(pi, 1);
    const dropSub = paths[si].points.length < 2;
    const next = paths.filter((_, k) => !(k === si && dropSub));
    if (!next.length) return false;
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      const dn = locate(dab as Artboard, id)?.node;
      if (!dn || dn.type !== 'path') return;
      dn.paths = next as never;
      for (const tl of dab.timelines)
        remapPointTracks(tl as Timeline, id, (sub, index) => {
          if (sub !== si) return { sub: dropSub && sub > si ? sub - 1 : sub, index };
          if (dropSub) return null;
          if (index === pi) return null;
          return { sub, index: index > pi ? index - 1 : index };
        });
    });
    return true;
  }
}

/**
 * Where a key set with the playhead at t lands: a whole ms inside the timeline. On a timeline read on whole frames it's
 * the start of the frame t is in (rounded down), since the keys are read there: a key a few ms into the frame wouldn't
 * be reached until the next one, and the frame on screen would keep showing the old value.
 */
export function keyTime(tl: Pick<Timeline, 'duration' | 'fps' | 'snap'>, t: number): number {
  const at = tl.snap && tl.fps! > 0 ? Math.floor(frameTime(tl, t) + 1e-6) : Math.round(t);
  return Math.max(0, Math.min(Math.floor(tl.duration), at));
}

/** A layer property's value at time t of a timeline: its track's value there when the timeline animates it, otherwise the layer's own. */
export function valueAt(tl: Timeline | undefined, node: SceneNode, prop: string, t: number): unknown {
  const track = tl?.tracks.find((x) => x.nodeId === node.id && x.prop === prop);
  return track?.keys.length ? sampleKeys(track.keys, frameTime(tl!, t)) : getPath(node, prop);
}

/** Set a keyframe value at time t (within 1ms an existing key is replaced). Keys made at the playhead pass keyTime(tl, playhead). */
export function setKey(tl: Timeline, nodeId: string, prop: string, t: number, value: Keyframe['value']): void {
  let track = tl.tracks.find((x) => x.nodeId === nodeId && x.prop === prop);
  if (!track) {
    track = { id: uid('tr'), nodeId, prop, keys: [] };
    tl.tracks.push(track);
  }
  const time = Math.round(Math.max(0, Math.min(tl.duration, t)));
  const existing = track.keys.find((k) => Math.abs(k.t - time) < 1);
  if (existing) existing.value = value;
  else {
    track.keys.push({ id: uid('k'), t: time, value, ease: 'easeInOut' });
    track.keys.sort((a, b) => a.t - b.t);
  }
}

// ---------------------------------------------------------------- React binding

let current: EditorStore | null = null;

export function setCurrentStore(s: EditorStore | null): void {
  current = s;
}

/** The open project's store, or null outside an editor (a component that only sometimes has a project behind it). */
export function maybeStore(): EditorStore | null {
  return current;
}

export function store(): EditorStore {
  if (!current) throw new Error('No project open');
  return current;
}

/** Subscribe to a slice of editor state. The selector's result is compared shallowly. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const s = store();
  const last = useRef<{ value: T } | null>(null);
  const get = () => {
    const next = selector(s.get());
    if (last.current && shallowEqual(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  };
  return useSyncExternalStore(s.subscribe, get, get);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
