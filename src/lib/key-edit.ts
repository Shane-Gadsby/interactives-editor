import { animatableProp, isContainer, pathPointProp, uid, type Artboard, type Easing, type Keyframe, type SceneNode, type Timeline } from 'interactives-player';
import { track as usage } from './analytics';
import { keyTime, store } from '../store/store';
import { locate } from '../store/doc';

//Keyframe editing that works on whole selections: copy and paste (keeping the keys' spacing), snapping a drag to the
//playhead and markers, and Stagger. The Timeline panel and the editor's shortcuts both call in here.

const MARKER = 'interactives/keys';

/** One copied track: which layer and property it came from, and its keys as offsets from the first copied key. */
export interface KeyClipTrack {
  nodeId: string;
  prop: string;
  keys: { dt: number; value: Keyframe['value']; ease: Easing }[];
}
export interface KeyClip {
  tracks: KeyClipTrack[];
}

/** Where a paste goes: back onto the tracks the keys came from, onto the same properties of other layers, or onto one given track. */
export type PasteTarget = { mode: 'source' } | { mode: 'layers'; nodeIds: string[] } | { mode: 'track'; trackId: string };

export interface PasteResult {
  /** The pasted keys, as "trackId:keyId" (what the selection holds). */
  refs: string[];
  added: number;
  replaced: number;
  /** Keys that would land past the end of the timeline. */
  dropped: number;
  /** Tracks left out because the target layer can't animate that property (or it is a kind of value the track can't take). */
  skipped: number;
  error?: string;
}

let memory: KeyClip | null = null;
/** Which of the two clipboards was filled last: a paste with nothing readable on the system clipboard uses it. */
let lastCopied: 'keys' | 'nodes' | null = null;
export const noteNodesCopied = (): void => void (lastCopied = 'nodes');
export const keysCopiedLast = (): boolean => lastCopied === 'keys';

/** The selected keys as a clip, or null when none of the references resolve. Times are relative to the earliest key. */
export function collectKeys(tl: Pick<Timeline, 'tracks'>, refs: string[]): KeyClip | null {
  const want = new Set(refs);
  const found: { tr: Timeline['tracks'][number]; k: Keyframe }[] = [];
  for (const tr of tl.tracks) for (const k of tr.keys) if (want.has(`${tr.id}:${k.id}`)) found.push({ tr, k });
  if (!found.length) return null;
  const t0 = Math.min(...found.map((f) => f.k.t));
  const byTrack = new Map<string, KeyClipTrack>();
  for (const { tr, k } of found) {
    let c = byTrack.get(tr.id);
    if (!c) byTrack.set(tr.id, (c = { nodeId: tr.nodeId, prop: tr.prop, keys: [] }));
    c.keys.push({ dt: k.t - t0, value: JSON.parse(JSON.stringify(k.value)), ease: JSON.parse(JSON.stringify(k.ease)) });
  }
  for (const c of byTrack.values()) c.keys.sort((a, b) => a.dt - b.dt);
  return { tracks: [...byTrack.values()] };
}

/** The kind of value a property holds (a number, a colour, ...), from the animatable list, else from the value itself. */
function kindOf(prop: string, node: SceneNode | undefined, sample: Keyframe['value'] | undefined): string {
  const k = animatableProp(prop, node)?.kind;
  if (k) return k;
  return Array.isArray(sample) ? 'list' : typeof sample;
}

/** Whether a property copied from one layer means anything on another. These ones name things inside the layer (its children, points, shader uniforms). */
function travels(prop: string): boolean {
  return !(prop === 'drawOrder' || prop === 'solo.active' || pathPointProp(prop) || /^(uniforms|shaderFilter)\./.test(prop));
}

/**
 * What a paste with the given selection should do. Layers selected on the canvas that aren't the keys' own layer take
 * the paste (when the keys came from one layer); keys selected on exactly one track take a one-track clip; otherwise
 * the keys go back onto the tracks they came from.
 */
export function chooseTarget(clip: KeyClip, tl: Pick<Timeline, 'tracks'>, selectedNodeIds: string[], selectedKeys: string[]): PasteTarget {
  const sources = new Set(clip.tracks.map((c) => c.nodeId));
  const sameLayers = selectedNodeIds.length === sources.size && selectedNodeIds.every((id) => sources.has(id));
  if (selectedNodeIds.length && !sameLayers && sources.size === 1) return { mode: 'layers', nodeIds: selectedNodeIds };
  if (clip.tracks.length === 1) {
    const ids = new Set(selectedKeys.map((r) => r.split(':')[0]).filter((id) => tl.tracks.some((t) => t.id === id)));
    if (ids.size === 1) return { mode: 'track', trackId: [...ids][0] };
  }
  return { mode: 'source' };
}

/** Paste a clip into a timeline with its first key at `at`. Meant to run inside one update, so a paste is one undo step. */
export function pasteKeysInto(tl: Timeline, ab: Artboard, clip: KeyClip, at: number, target: PasteTarget): PasteResult {
  const out: PasteResult = { refs: [], added: 0, replaced: 0, dropped: 0, skipped: 0 };
  // Each clip track, with the layer and track it lands on
  const jobs: { clip: KeyClipTrack; nodeId: string; prop: string }[] = [];
  if (target.mode === 'track') {
    const dest = tl.tracks.find((t) => t.id === target.trackId);
    const src = clip.tracks[0];
    if (!dest || clip.tracks.length !== 1) {
      out.error = 'Select the keys of one track to paste there';
      return out;
    }
    const node = locate(ab, dest.nodeId)?.node;
    const srcKind = kindOf(src.prop, locate(ab, src.nodeId)?.node, src.keys[0]?.value);
    const destKind = kindOf(dest.prop, node, dest.keys[0]?.value);
    if (dest.prop !== src.prop && (srcKind !== destKind || srcKind === 'list')) {
      out.error = `Can't paste ${animatableProp(src.prop)?.label ?? src.prop} keys onto ${animatableProp(dest.prop, node)?.label ?? dest.prop}: they hold different kinds of value`;
      return out;
    }
    jobs.push({ clip: src, nodeId: dest.nodeId, prop: dest.prop });
  } else if (target.mode === 'layers') {
    for (const id of target.nodeIds) {
      const node = locate(ab, id)?.node;
      for (const c of clip.tracks) {
        if (!node || (id !== c.nodeId && !travels(c.prop)) || !animatableProp(c.prop, node)) out.skipped++;
        else jobs.push({ clip: c, nodeId: id, prop: c.prop });
      }
    }
  } else {
    for (const c of clip.tracks) {
      if (locate(ab, c.nodeId)) jobs.push({ clip: c, nodeId: c.nodeId, prop: c.prop });
      else out.skipped++;
    }
  }
  if (!jobs.length) {
    out.error = 'Nothing to paste the keys onto';
    return out;
  }
  for (const j of jobs) {
    let tr = tl.tracks.find((t) => t.nodeId === j.nodeId && t.prop === j.prop);
    for (const k of j.clip.keys) {
      const raw = at + k.dt;
      if (raw > tl.duration + 0.5) {
        out.dropped++;
        continue;
      }
      if (!tr) {
        tr = { id: uid('tr'), nodeId: j.nodeId, prop: j.prop, keys: [] };
        tl.tracks.push(tr);
      }
      const t = keyTime(tl, raw);
      const value = JSON.parse(JSON.stringify(k.value));
      const ease = JSON.parse(JSON.stringify(k.ease));
      const existing = tr.keys.find((x) => Math.abs(x.t - t) < 1);
      if (existing) {
        existing.value = value;
        existing.ease = ease;
        out.replaced++;
        out.refs.push(`${tr.id}:${existing.id}`);
      } else {
        const key = { id: uid('k'), t, value, ease };
        tr.keys.push(key);
        out.added++;
        out.refs.push(`${tr.id}:${key.id}`);
      }
    }
    tr?.keys.sort((a, b) => a.t - b.t);
  }
  return out;
}

/** The layers in the order the Layers panel lists them: the top of the stack first, a group's children right after it. */
export function panelOrder(ab: Pick<Artboard, 'children'>): string[] {
  const out: string[] = [];
  const add = (list: SceneNode[]) => {
    for (let i = list.length - 1; i >= 0; i--) {
      out.push(list[i].id);
      if (isContainer(list[i])) add((list[i] as SceneNode & { children: SceneNode[] }).children);
    }
  };
  add(ab.children);
  return out;
}

/**
 * Push each animated layer's keys later than the layer before it by `step` ms: the first layer stays put, the next moves
 * `step`, the next `2 × step`, and so on, in `order`. Layers with no keys on the timeline don't take a place. A negative
 * step runs the other way. Moves nothing and says why when any key would leave the timeline.
 */
export function staggerKeys(tl: Timeline, order: string[], step: number): { layers: number; keys: number; error?: string } {
  const animated = order.filter((id) => tl.tracks.some((t) => t.nodeId === id && t.keys.length));
  let keys = 0;
  let lo = 0;
  let hi = tl.duration;
  animated.forEach((id, i) => {
    for (const tr of tl.tracks) {
      if (tr.nodeId !== id) continue;
      for (const k of tr.keys) {
        keys++;
        lo = Math.min(lo, k.t + i * step);
        hi = Math.max(hi, k.t + i * step);
      }
    }
  });
  if (animated.length < 2) return { layers: animated.length, keys: 0, error: 'Select two or more layers that have keys on this timeline' };
  if (lo < 0) return { layers: animated.length, keys: 0, error: `That would push keys before the start of the timeline (by ${Math.round(-lo)} ms)` };
  if (hi > tl.duration) return { layers: animated.length, keys: 0, error: `That would push keys past the end of the timeline: make it ${Math.ceil(hi)} ms long first` };
  animated.forEach((id, i) => {
    for (const tr of tl.tracks) {
      if (tr.nodeId !== id) continue;
      for (const k of tr.keys) k.t = keyTime(tl, k.t + i * step);
      tr.keys.sort((a, b) => a.t - b.t);
    }
  });
  return { layers: animated.length, keys };
}

/**
 * How far to adjust a key drag so the dragged keys land on a snap point (the playhead, a marker): the smallest nudge that
 * brings any of the keys within `within` ms of one, or null when none is close enough. The whole group moves by the
 * same nudge, so the keys keep their spacing.
 */
export function magnetNudge(starts: number[], dt: number, points: number[], within: number): number | null {
  let best: number | null = null;
  for (const s of starts) {
    for (const p of points) {
      const d = p - (s + dt);
      if (Math.abs(d) <= within && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- the editor's side

function activeTimeline(): { tl: Timeline; ab: Artboard } | null {
  const st = store();
  const ab = st.artboard();
  const tl = ab?.timelines.find((t) => t.id === st.get().activeTimelineId);
  return ab && tl ? { tl, ab } : null;
}

/** Copy the selected keys (to the system clipboard too). Returns false when there are none to copy. */
export function copySelectedKeys(cut = false): boolean {
  const cur = activeTimeline();
  if (!cur) return false;
  const clip = collectKeys(cur.tl, store().get().selectedKeys);
  if (!clip) return false;
  memory = clip;
  lastCopied = 'keys';
  void navigator.clipboard?.writeText(JSON.stringify({ [MARKER]: clip })).catch(() => undefined);
  usage('feature', cut ? 'keyframes-cut' : 'keyframes-copy');
  const n = clip.tracks.reduce((a, c) => a + c.keys.length, 0);
  if (!cut) store().toast(`Copied ${n} key${n === 1 ? '' : 's'}`);
  return true;
}

/** Whether the system clipboard text is a copy of keys from this editor. */
export function isKeyClipText(text?: string): boolean {
  if (!text) return false;
  try {
    return !!JSON.parse(text)?.[MARKER];
  } catch {
    return false;
  }
}

/** Paste the copied keys at the playhead. `text` is the system clipboard's text, when there was any. Returns false when there was nothing to paste. */
export function pasteKeys(text?: string): boolean {
  let clip = memory;
  if (text) {
    try {
      const parsed = JSON.parse(text)?.[MARKER] as KeyClip | undefined;
      if (parsed && Array.isArray(parsed.tracks)) clip = parsed;
    } catch {
      /* not ours */
    }
  }
  const cur = activeTimeline();
  if (!clip || !cur) return false;
  const st = store();
  const target = chooseTarget(clip, cur.tl, st.get().selection, st.get().selectedKeys);
  const at = st.get().playhead;
  let res: PasteResult | null = null;
  st.updateTimeline((d) => {
    res = pasteKeysInto(d as Timeline, cur.ab, clip!, at, target);
  });
  const r = res as PasteResult | null;
  if (!r) return false;
  if (r.error) {
    st.toast(r.error, 'error');
    return true;
  }
  st.set({ selectedKeys: r.refs, previewPlaying: false });
  usage('feature', 'keyframes-paste', { thing: target.mode });
  const bits = [`Pasted ${r.added + r.replaced} key${r.added + r.replaced === 1 ? '' : 's'}`];
  if (r.replaced) bits.push(`${r.replaced} replaced a key already there`);
  if (r.dropped) bits.push(`${r.dropped} left out past the end of the timeline`);
  if (r.skipped) bits.push(`${r.skipped} track${r.skipped === 1 ? '' : 's'} left out (that layer can't animate it)`);
  st.toast(bits.join(', '), r.dropped || r.skipped ? 'error' : 'info');
  return true;
}

/** Stagger the layers selected on the canvas by `step` ms, in Layers panel order. */
export function staggerSelected(step: number): boolean {
  const cur = activeTimeline();
  if (!cur) return false;
  const st = store();
  const sel = new Set(st.get().selection);
  const order = panelOrder(cur.ab).filter((id) => sel.has(id));
  let res: ReturnType<typeof staggerKeys> | null = null;
  st.updateTimeline((d) => {
    res = staggerKeys(d as Timeline, order, step);
  });
  const r = res as ReturnType<typeof staggerKeys> | null;
  if (!r) return false;
  if (r.error) {
    st.toast(r.error, 'error');
    return false;
  }
  usage('feature', 'keyframes-stagger');
  st.toast(`Staggered ${r.layers} layers by ${step} ms`);
  return true;
}

// ---------------------------------------------------------------- which of keys and layers a shortcut means

let keysActive = false;

/**
 * Copy, cut and paste mean the selected keys while the last press was inside the timeline's lanes, and the selected layers
 * otherwise (keys stay selected after you click away from them). Returns the cleanup for an effect.
 */
export function watchKeyContext(): () => void {
  const f = (e: PointerEvent) => void (keysActive = e.target instanceof Element && !!e.target.closest('.timeline-lanes, .key-editor'));
  document.addEventListener('pointerdown', f, true);
  return () => document.removeEventListener('pointerdown', f, true);
}
export const keyContext = (): boolean => keysActive && store().get().selectedKeys.length > 0;
