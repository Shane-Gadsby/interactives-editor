import { produce, type Draft } from 'immer';
import { artboardNeedsFit, fitArtboardGroups } from './fit-groups';
import { useSyncExternalStore, useRef } from 'react';
import {
  animatableProp,
  pathPointPropName,
  relayoutTree,
  createArtboard,
  cloneWithNewIds,
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
import { addModifier, applyPreset, removeModifier, type TextPresetId } from '../lib/text-modifiers';
import { booleanPath, type BooleanOp } from '../lib/boolean';
import { insertPoint, keyTimes, pointParts, POINT_PARTS, pointTracks, posedPaths, remapPointTracks, shapeToPaths } from '../lib/path-edit';
import { apply as applyOps, type Op, type PathStep } from '../../shared/ops.mjs';
import type { Peer } from '../lib/live';
import { getArtboard, locate, parentToArtboard, selectionBounds, topmost, uniqueName, nodeNames } from './doc';
import { dropRefsToRemoved, retargetChildRefs } from './refs';
import { adoptQuestions, dropOrphanKitNodes } from '../lib/question-kit';
import { variantPlan, type VariantSide } from '../lib/variants-edit';

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
  | 'bone';

export type BottomTab = 'timeline' | 'logic' | 'scripts' | 'variables' | 'data' | 'usage' | 'a11y' | 'insights' | 'interface';

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
  /** Container the user double-clicked into: clicks select its children. */
  focusId: string | null;
  tool: Tool;
  zoom: number;
  panX: number;
  panY: number;
  editingPathId: string | null;
  editingTextId: string | null;
  /** Draw bone glyphs on the canvas (they are never drawn in the player). */
  showBones: boolean;
  /** The selected range (UTF-16 offsets into the layer's text) while editing text on the canvas; style changes apply to it. */
  textSelection: { id: string; start: number; end: number } | null;
  bottomTab: BottomTab | null;
  bottomHeight: number;
  /** The click heat overlay Insights asked the canvas to draw, or null. */
  heat: HeatOverlay | null;
  activeTimelineId: string | null;
  playhead: number;
  previewPlaying: boolean;
  recording: boolean;
  selectedKeys: string[]; // "trackId:keyId"
  logicSelection: string | null;
  saveState: 'saved' | 'saving' | 'dirty' | 'error';
  saveError: string | null;
  toast: { text: string; kind: 'info' | 'error' } | null;
  /** A list worth reading (import/export notes), shown in a dialog. */
  report: { title: string; lines: string[] } | null;
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
  /** Bumped on each document change, for autosave. */
  revision = 0;
  /** Live editing hook: called with the document before and after every local change. */
  onLocalChange: ((before: Project, after: Project) => void) | null = null;

  constructor(project: Project) {
    // Lay out auto-layout frames once on open, so the first edit (and its undo) starts from settled positions.
    // (an unchanged produce still freezes the document, so a stray in-place edit throws instead of corrupting history)
    this.state = EditorStore.initial(settleLayout(produce(project, () => undefined)));
  }

  static initial(project: Project): EditorState {
    const first = project.artboards[0];
    return {
      project,
      activeArtboardId: project.settings.startArtboardId ?? first?.id ?? '',
      selection: [],
      artboardSelected: false,
      focusId: null,
      tool: 'select',
      zoom: 1,
      panX: 80,
      panY: 80,
      editingPathId: null,
      editingTextId: null,
      showBones: true,
      textSelection: null,
      bottomTab: 'timeline',
      bottomHeight: 260,
      heat: null,
      activeTimelineId: null,
      playhead: 0,
      previewPlaying: false,
      recording: false,
      selectedKeys: [],
      logicSelection: null,
      saveState: 'saved',
      saveError: null,
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
    const p = typeof partial === 'function' ? partial(this.state) : partial;
    this.state = { ...this.state, ...p };
    this.emit();
  }

  /**
   * Change the document. Consecutive changes with the same `coalesce` key
   * within a second (e.g. a drag) become one undo step.
   */
  update(recipe: (draft: Draft<Project>) => void, opts: { coalesce?: string; library?: boolean } = {}): void {
    const before = this.state.project;
    // Artboards that came from a library are read-only: a change that touches one (other than moving or renaming it)
    // is refused. Library operations (insert, update, detach) say so with `library: true`.
    let edited: Project | null = null;
    if (!opts.library && before.artboards.some((a) => a.library)) {
      edited = produce(before, (d) => {
        recipe(d);
      });
      const locked = lockViolation(before, edited);
      if (locked) {
        const now = Date.now();
        if (now - this.lastLockToast > 1500) {
          this.lastLockToast = now;
          this.toast(`“${locked.name}” comes from a library and is read-only. Detach it to edit it here.`, 'error');
        }
        return;
      }
    }
    // Auto-layout frames re-position their children after every change, in the same undo step.
    const next = settleLayout(edited ?? produce(before, (d) => void recipe(d)), true);
    if (next === before) return;
    const t = Date.now();
    const merge = opts.coalesce && this.lastCoalesce && this.lastCoalesce.key === opts.coalesce && t - this.lastCoalesce.time < 1000;
    if (!merge) {
      this.past.push({ project: before, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId, seen: this.remoteTotal });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.lastCoalesce = opts.coalesce ? { key: opts.coalesce, time: t } : null;
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
    this.future.push({ project: this.state.project, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId, seen: this.remoteTotal });
    this.restore(this.caughtUp(prev));
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ project: this.state.project, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId, seen: this.remoteTotal });
    this.restore(this.caughtUp(next));
  }

  private restore(h: HistoryEntry): void {
    this.lastCoalesce = null;
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
    const logicSelection = ab?.logic.nodes.some((n) => n.id === s.logicSelection) ? s.logicSelection : null;
    if (
      activeArtboardId !== s.activeArtboardId ||
      selection.length !== s.selection.length ||
      activeTimelineId !== s.activeTimelineId ||
      focusId !== s.focusId ||
      editingPathId !== s.editingPathId ||
      logicSelection !== s.logicSelection
    ) {
      this.state = { ...s, activeArtboardId, selection, activeTimelineId, focusId, editingPathId, logicSelection };
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

  toast(text: string, kind: 'info' | 'error' = 'info'): void {
    this.set({ toast: { text, kind } });
    const current = this.state.toast;
    setTimeout(() => {
      if (this.state.toast === current) this.set({ toast: null });
    }, kind === 'error' ? 6000 : 2500);
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
    const record = s.recording && tl && s.bottomTab === 'timeline';
    this.update((d) => {
      const ab = getArtboard(d as Project, s.activeArtboardId) as Draft<Artboard> | undefined;
      if (!ab) return;
      for (const [id, props] of changes) {
        const loc = locate(ab as Artboard, id);
        if (!loc) continue;
        for (const [prop, value] of Object.entries(props)) {
          if (record && animatableProp(prop)) {
            const dtl = ab.timelines.find((t) => t.id === tl!.id)!;
            setKey(dtl as Timeline, id, prop, s.playhead, value as Keyframe['value']);
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
      this.deleteArtboard(ab.id);
      return;
    }
    const ids = new Set(this.state.selection);
    if (!ids.size) return;
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

  groupSelection(): void {
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
    const src = this.artboard();
    if (!src || src.id === targetId) return;
    const moved: string[] = [];
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
      this.toast(`Moved ${moved.length === 1 ? 'the layer' : `${moved.length} layers`} to “${tab?.name}”.`);
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

  addArtboard(partial: Partial<Artboard> = {}): string {
    const p = this.state.project;
    const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
    const ab = createArtboard({
      name: uniqueName(
        p.artboards.map((a) => a.name),
        'Artboard',
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
    if (this.state.project.artboards.length <= 1) {
      this.toast('A project needs at least one artboard', 'error');
      return;
    }
    this.update((d) => {
      // The base of a responsive set goes: its narrowest variant becomes the base of the rest
      const gone = d.artboards.find((a) => a.id === id);
      const heirs = d.artboards.filter((a) => a.variantOf === id);
      if (gone && heirs.length) {
        const heir = setMembers(d.artboards as Artboard[], gone as Artboard).find((a) => a.id !== id)!;
        delete heir.variantOf;
        for (const a of heirs) if (a !== heir) a.variantOf = heir.id;
        if (d.settings.startArtboardId === id) d.settings.startArtboardId = heir.id;
        if (d.settings.reporting?.completionArtboard === id) d.settings.reporting.completionArtboard = heir.id;
      }
      d.artboards = d.artboards.filter((a) => a.id !== id);
      if (d.settings.startArtboardId === id) d.settings.startArtboardId = d.artboards[0].id;
    });
    this.set({ artboardSelected: false, selection: [] });
  }

  /**
   * Add an artboard to a responsive set: a copy of the artboard (layers, timelines and interactions, all with fresh ids) that
   * is shown at another width. The set is the artboard's own, so adding a variant to a variant adds it to the same set.
   * Returns the new artboard's id.
   */
  addVariant(id: string, side: VariantSide = 'narrower'): string | null {
    const src = getArtboard(this.state.project, id);
    if (!src) return null;
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

  duplicateArtboard(id: string): void {
    const src = getArtboard(this.state.project, id);
    if (!src) return;
    const copy = this.copyArtboard(src);
    this.update((d) => {
      d.artboards.push(copy);
    });
    this.set({ activeArtboardId: copy.id, selection: [], artboardSelected: true });
  }

  /** A copy of an artboard with new ids all through (layers, timelines, joysticks, blends and the interactions that point at them), next to it on the canvas. Not added to the project. */
  private copyArtboard(src: Artboard): Artboard {
    const idMap = new Map<string, string>();
    const children = src.children.map((c) => cloneWithNewIds(JSON.parse(JSON.stringify(c)) as SceneNode, idMap));
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
    const ab = this.artboard();
    if (ab) this.update((d) => void addModifier(d as Project, ab.id, nodeId, patch));
  }

  removeTextModifier(nodeId: string, index: number): void {
    const ab = this.artboard();
    if (ab) this.update((d) => removeModifier(d as Project, ab.id, nodeId, index));
  }

  /** Typewriter or wave: a modifier and a timeline for it, in one undo step. The new timeline becomes the open one. */
  applyTextPreset(nodeId: string, preset: TextPresetId): void {
    const ab = this.artboard();
    if (!ab) return;
    let tlId: string | null = null;
    this.update((d) => {
      tlId = applyPreset(d as Project, ab.id, nodeId, preset);
    });
    if (tlId) this.set({ activeTimelineId: tlId, playhead: 0, bottomTab: 'timeline' });
  }

  // ---------------------------------------------------------------- timelines

  addTimeline(): string {
    const ab = this.artboard();
    if (!ab) return '';
    const tl: Timeline = {
      id: uid('tl'),
      name: uniqueName(
        ab.timelines.map((t) => t.name),
        'Timeline',
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

  /** Add/replace a keyframe for a node property at the playhead, using its current value. */
  keyCurrent(nodeId: string, prop: string): void {
    const ab = this.artboard();
    let tlId = this.state.activeTimelineId;
    if (!ab) return;
    if (!tlId) tlId = this.addTimeline();
    const loc = locate(ab, nodeId);
    if (!loc) return;
    let value = getPath(loc.node, prop) as Keyframe['value'] | undefined;
    if (value === undefined) {
      const kids = isContainer(loc.node) ? loc.node.children : [];
      // Draw order starts as the layers' own order; solo starts on the first child
      if (prop === 'drawOrder') value = kids.map((k) => k.id);
      else if (prop === 'solo.active') value = kids[0]?.id ?? '';
      else if (/^cornerRadii\.\d$/.test(prop)) value = Number(getPath(loc.node, 'cornerRadius')) || 0;
      else if (prop.startsWith('inputs.')) value = this.state.project.variables.find((v) => v.name === prop.slice(7))?.initial ?? 0;
      else value = prop.endsWith('color') ? '#000000' : 0;
    }
    const t = this.state.playhead;
    this.update((d) => {
      const tl = getArtboard(d as Project, ab.id)?.timelines.find((x) => x.id === tlId);
      if (tl) setKey(tl as Timeline, nodeId, prop, t, value!);
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
    const record = !!(s.recording && tl && s.bottomTab === 'timeline');
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
        setKey(dtl as Timeline, id, prop, t, c.value);
      }
    }, { coalesce: opts.coalesce });
  }

  /**
   * Key the whole shape of a path layer at the playhead: every point (and the handles it has) gets a key holding its
   * value in the frame shown there. Key the shape, move the playhead, edit points while recording, and the shape morphs.
   */
  keyShape(nodeId: string): void {
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
            setKey(dtl as Timeline, nodeId, prop, t, parts[part]);
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

/** Set a keyframe value at time t (within 1ms an existing key is replaced). */
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
