import { produce, type Draft } from 'immer';
import { useSyncExternalStore, useRef } from 'react';
import {
  ANIMATABLE_PROPS,
  createArtboard,
  cloneWithNewIds,
  getPath,
  isContainer,
  setPath,
  uid,
  type Artboard,
  type Keyframe,
  type Project,
  type SceneNode,
  type Timeline,
} from 'interactives-player';
import { getArtboard, locate, topmost, uniqueName, nodeNames } from './doc';

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
  | 'text'
  | 'frame'
  | 'image'
  | 'button'
  | 'input'
  | 'link'
  | 'embed'
  | 'video';

export type BottomTab = 'timeline' | 'logic' | 'scripts' | 'variables';

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
  bottomTab: BottomTab | null;
  bottomHeight: number;
  activeTimelineId: string | null;
  playhead: number;
  previewPlaying: boolean;
  recording: boolean;
  selectedKeys: string[]; // "trackId:keyId"
  logicSelection: string | null;
  saveState: 'saved' | 'saving' | 'dirty' | 'error';
  saveError: string | null;
  toast: { text: string; kind: 'info' | 'error' } | null;
}

interface HistoryEntry {
  project: Project;
  selection: string[];
  activeArtboardId: string;
}

type Listener = () => void;

const HISTORY_LIMIT = 200;

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private lastCoalesce: { key: string; time: number } | null = null;
  /** Bumped on each document change, for autosave. */
  revision = 0;

  constructor(project: Project) {
    this.state = EditorStore.initial(project);
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
      bottomTab: 'timeline',
      bottomHeight: 260,
      activeTimelineId: first?.timelines[0]?.id ?? null,
      playhead: 0,
      previewPlaying: false,
      recording: false,
      selectedKeys: [],
      logicSelection: null,
      saveState: 'saved',
      saveError: null,
      toast: null,
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
  update(recipe: (draft: Draft<Project>) => void, opts: { coalesce?: string } = {}): void {
    const before = this.state.project;
    const next = produce(before, recipe);
    if (next === before) return;
    const t = Date.now();
    const merge = opts.coalesce && this.lastCoalesce && this.lastCoalesce.key === opts.coalesce && t - this.lastCoalesce.time < 1000;
    if (!merge) {
      this.past.push({ project: before, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId });
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
    this.emit();
  }

  /** Change the document without an undo step (derived data such as measured text size). */
  patchSilently(recipe: (draft: Draft<Project>) => void): void {
    const next = produce(this.state.project, recipe);
    if (next === this.state.project) return;
    this.revision++;
    this.state = { ...this.state, project: next, saveState: 'dirty' };
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
    this.future.push({ project: this.state.project, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId });
    this.restore(prev);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ project: this.state.project, selection: this.state.selection, activeArtboardId: this.state.activeArtboardId });
    this.restore(next);
  }

  private restore(h: HistoryEntry): void {
    this.lastCoalesce = null;
    this.revision++;
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
    const activeTimelineId = ab?.timelines.some((t) => t.id === s.activeTimelineId) ? s.activeTimelineId : ab?.timelines[0]?.id ?? null;
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
    const tl = this.timeline();
    const record = s.recording && tl && s.bottomTab === 'timeline';
    this.update((d) => {
      const ab = getArtboard(d as Project, s.activeArtboardId) as Draft<Artboard> | undefined;
      if (!ab) return;
      for (const [id, props] of changes) {
        const loc = locate(ab as Artboard, id);
        if (!loc) continue;
        for (const [prop, value] of Object.entries(props)) {
          if (record && ANIMATABLE_PROPS.some((a) => a.prop === prop)) {
            const dtl = ab.timelines.find((t) => t.id === tl!.id)!;
            setKey(dtl as Timeline, id, prop, s.playhead, value as Keyframe['value']);
          } else {
            setPath(loc.node as unknown as Record<string, unknown>, prop, value);
          }
        }
      }
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
      const rec = (list: SceneNode[]): SceneNode[] =>
        list.filter((n) => !ids.has(n.id)).map((n) => (isContainer(n) ? { ...n, children: rec(n.children) } : n)) as SceneNode[];
      dab.children = rec(dab.children as SceneNode[]);
      for (const tl of dab.timelines) tl.tracks = tl.tracks.filter((t) => !ids.has(t.nodeId));
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
    });
    this.select([groupId]);
  }

  ungroupSelection(): void {
    const ab = this.artboard();
    if (!ab) return;
    const released: string[] = [];
    this.update((d) => {
      const dab = getArtboard(d as Project, ab.id)!;
      for (const id of this.state.selection) {
        const loc = locate(dab, id);
        if (!loc || !isContainer(loc.node)) continue;
        const g = loc.node;
        if (g.rotation || g.scaleX !== 1 || g.scaleY !== 1) continue; // keep transformed groups intact
        const kids = g.children.map((c) => ({ ...c, x: c.x + g.x, y: c.y + g.y, opacity: c.opacity * g.opacity }));
        loc.siblings.splice(loc.index, 1, ...(kids as SceneNode[]));
        released.push(...kids.map((k) => k.id));
      }
    });
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
      const newOffset = target ? [...target.ancestors, target.node].reduce((o, a) => ({ x: o.x + a.x, y: o.y + a.y }), { x: 0, y: 0 }) : { x: 0, y: 0 };
      n.x += oldOffset.x - newOffset.x;
      n.y += oldOffset.y - newOffset.y;
      let at = index;
      if (loc.siblings === list && loc.index < index) at--;
      list.splice(Math.max(0, Math.min(list.length, at)), 0, n);
    });
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
      d.artboards = d.artboards.filter((a) => a.id !== id);
      if (d.settings.startArtboardId === id) d.settings.startArtboardId = d.artboards[0].id;
    });
    this.set({ artboardSelected: false, selection: [] });
  }

  duplicateArtboard(id: string): void {
    const src = getArtboard(this.state.project, id);
    if (!src) return;
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
    for (const tl of copy.timelines) {
      tl.id = uid('tl');
      for (const tr of tl.tracks) {
        tr.id = uid('tr');
        tr.nodeId = idMap.get(tr.nodeId) ?? tr.nodeId;
      }
    }
    const remapParam = (v: unknown) => (typeof v === 'string' && idMap.has(v) ? idMap.get(v) : v);
    const tlMap = new Map(src.timelines.map((t, i) => [t.id, copy.timelines[i].id]));
    for (const n of copy.logic.nodes) {
      for (const k of Object.keys(n.params)) {
        n.params[k] = remapParam(n.params[k]);
        if (typeof n.params[k] === 'string' && tlMap.has(n.params[k] as string)) n.params[k] = tlMap.get(n.params[k] as string);
      }
    }
    this.update((d) => {
      d.artboards.push(copy);
    });
    this.set({ activeArtboardId: copy.id, selection: [], artboardSelected: true });
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
    if (value === undefined) value = prop.endsWith('color') ? '#000000' : 0;
    const t = this.state.playhead;
    this.update((d) => {
      const tl = getArtboard(d as Project, ab.id)?.timelines.find((x) => x.id === tlId);
      if (tl) setKey(tl as Timeline, nodeId, prop, t, value!);
    });
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
