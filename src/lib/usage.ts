/**
 * The editor's own use, noticed from the one place everything passes: the store. Tools and panel tabs (and the time in
 * each), layers added by kind, properties changed (by property name, once per drag or burst, never the values), live
 * editing, preview playback, save failures. Everything goes through `analytics.ts`, which adds it up and sends it.
 *
 * Only names the editor itself owns are used here (a tool, a property path's first part, a layer type). Nothing that is
 * the person's: not a layer's name, not a value, not a variable.
 */
import type { SceneNode } from 'interactives-player';
import { reportError, track, trackFirst } from './analytics';
import type { EditorStore, EditorState } from '../store/store';

/** A new layer: its type (and for the web controls, which control), and a first-use mark for the layer types. */
export function noteNodeAdded(n: SceneNode): void {
  const kind = (n as { type?: string }).type ?? 'other';
  track('node', 'add', { thing: kind });
  trackFirst('node', 'first-add', { thing: kind });
}

const lastEdit = new Map<string, number>();

/**
 * Properties changed on layers: the first part of each property path (`fill`, `x`, `text`, `shadow`), once per drag or burst of
 * changes that share an undo-coalescing key, with the layer's type. The values are never looked at.
 */
export function noteProps(changes: Map<string, Record<string, unknown>>, coalesce: string | undefined, typeOf: (id: string) => string | undefined, recording: boolean): void {
  const now = Date.now();
  const seen = new Set<string>();
  for (const [id, props] of changes) {
    const type = typeOf(id) ?? 'other';
    for (const prop of Object.keys(props)) {
      const root = prop.split('.')[0];
      const key = `${coalesce ?? ''}|${root}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A drag sends a change every frame under one coalescing key: that is one change, not sixty
      const before = coalesce ? lastEdit.get(key) : undefined;
      if (coalesce) {
        lastEdit.set(key, now);
        if (lastEdit.size > 50) for (const [k, t] of lastEdit) if (now - t > 1000) lastEdit.delete(k);
      }
      if (before !== undefined && now - before < 1000) continue;
      track('inspector', 'change', { thing: root, detail: { node: type } });
      if (recording) track('feature', 'keyframe-record', { thing: root });
    }
  }
}

type Watch<T> = { read: (s: EditorState) => T; on: (to: T, from: T) => void };

/**
 * Watches an editor store for the things that are not a call anyone makes: the tool and the panel tab changing (with the time
 * spent in the one left), live editing connecting and dropping, the preview playing, the timeline recording, a save failing.
 * Returns the function that stops watching (and counts the time in the tool and tab still open).
 */
export function observeStore(store: EditorStore): () => void {
  let tool = store.get().tool;
  let toolSince = Date.now();
  let tab = store.get().bottomTab;
  let tabSince = Date.now();
  const closeSpans = () => {
    const now = Date.now();
    track('tool', 'time', { thing: tool, ms: now - toolSince });
    if (tab) track('panel', 'time', { thing: tab, ms: now - tabSince });
  };
  const watches: Watch<unknown>[] = [
    {
      read: (s) => s.tool,
      on: (to, from) => {
        const now = Date.now();
        track('tool', 'time', { thing: String(from), ms: now - toolSince });
        toolSince = now;
        tool = to as typeof tool;
        track('tool', 'use', { thing: String(to) });
      },
    },
    {
      read: (s) => s.bottomTab,
      on: (to, from) => {
        const now = Date.now();
        if (from) track('panel', 'time', { thing: String(from), ms: now - tabSince });
        tabSince = now;
        tab = to as typeof tab;
        if (to) track('panel', 'open', { thing: String(to) });
        else track('panel', 'close', { thing: String(from) });
      },
    },
    { read: (s) => s.live?.status ?? 'off', on: (to) => track('live', 'status', { thing: String(to) }) },
    { read: (s) => s.previewPlaying, on: (to) => track('preview', to ? 'play' : 'pause', { thing: 'canvas' }) },
    { read: (s) => s.recording, on: (to) => to && track('feature', 'timeline-recording') },
    { read: (s) => s.activeArtboardId, on: () => track('doc', 'artboard-switch') },
    { read: (s) => Object.keys(s.peers).length, on: (to, from) => Number(to) > Number(from) && track('live', 'peer-joined') },
    {
      read: (s) => s.saveState,
      on: (to) => {
        if (to === 'error') reportError({ kind: 'save', error: store.get().saveError ?? 'save failed', where: 'autosave' });
      },
    },
  ];
  let last = watches.map((w) => w.read(store.get()));
  const unsub = store.subscribe(() => {
    const st = store.get();
    watches.forEach((w, i) => {
      const next = w.read(st);
      if (next !== last[i]) {
        const prev = last[i];
        last[i] = next;
        try {
          w.on(next, prev);
        } catch {
          // recording never gets in the way
        }
      }
    });
  });
  return () => {
    unsub();
    closeSpans();
  };
}
