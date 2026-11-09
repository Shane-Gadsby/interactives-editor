//The Timeline's keys: play and pause, step a frame, jump between keys, and the property keys (P, S, R, T, A) that take you to a
//property of the selected layer. They only apply with the Timeline the last place pressed (lib/key-area.ts), so those letters
//stay tools on the canvas. Registered once by the editor, next to the rest (lib/editor-keys.ts).
import { store } from '../store/store';
import { activeTimeline } from './key-edit';
import { setRunner } from './keymap';
import { toggleTimelineList } from '../panels/TimelineList';
import { jumpToProperty, type JumpProp } from './prop-jump';

const FALLBACK_FPS = 30;
const stop = (e?: KeyboardEvent) => e?.preventDefault();

const setHead = (t: number) => {
  const cur = activeTimeline();
  if (!cur) return;
  store().set({ previewPlaying: false, playhead: Math.max(0, Math.min(cur.tl.duration, Math.round(t * 1000) / 1000)) });
};

/** One frame on from `t` (or back), on the timeline's own frame grid when it has one. */
export function stepFrame(tl: { fps?: number; duration: number }, t: number, dir: 1 | -1): number {
  const fps = tl.fps && tl.fps > 0 ? tl.fps : FALLBACK_FPS;
  const frame = 1000 / fps;
  const at = Math.floor((t * fps) / 1000 + 1e-6);
  //Between frames (a timeline with no frame grid), stepping back lands on the frame the head is in
  const onFrame = Math.abs(t - (at * 1000) / fps) < 1e-3;
  const next = dir > 0 ? at + 1 : onFrame ? at - 1 : at;
  return Math.max(0, Math.min(tl.duration, next * frame));
}

/** The time of the next key after `t` (or the previous one before it) among the keys of the selected layers, or of every layer when none is selected. */
export function keyNear(tracks: { nodeId: string; keys: { t: number }[] }[], selected: string[], t: number, dir: 1 | -1): number | null {
  const mine = selected.length ? tracks.filter((tr) => selected.includes(tr.nodeId)) : tracks;
  const times = [...new Set(mine.flatMap((tr) => tr.keys.map((k) => k.t)))].sort((a, b) => a - b);
  const eps = 0.5;
  return dir > 0 ? (times.find((x) => x > t + eps) ?? null) : ([...times].reverse().find((x) => x < t - eps) ?? null);
}

export function installTimelineKeys(): void {
  const play = (e: KeyboardEvent | undefined, on: boolean | 'toggle') => {
    const cur = activeTimeline();
    if (!cur) return false;
    stop(e);
    const st = store().get();
    const to = on === 'toggle' ? !st.previewPlaying : on;
    store().set({ previewPlaying: to, playhead: to && st.playhead >= cur.tl.duration ? 0 : st.playhead });
  };
  setRunner('timeline-play', (e) => play(e, 'toggle'));
  setRunner('timeline-forward', (e) => play(e, true));
  setRunner('timeline-start', (e) => {
    if (!activeTimeline()) return false;
    stop(e);
    setHead(0);
  });
  setRunner('timeline-end', (e) => {
    const cur = activeTimeline();
    if (!cur) return false;
    stop(e);
    setHead(cur.tl.duration);
  });
  for (const [id, dir] of [['frame-back', -1], ['frame-forward', 1]] as const)
    setRunner(id, (e) => {
      const cur = activeTimeline();
      if (!cur) return false;
      stop(e);
      setHead(stepFrame(cur.tl, store().get().playhead, dir));
    });
  for (const [id, dir] of [['key-prev', -1], ['key-next', 1]] as const)
    setRunner(id, (e) => {
      const cur = activeTimeline();
      if (!cur) return false;
      stop(e);
      const to = keyNear(cur.tl.tracks, store().get().selection, store().get().playhead, dir);
      if (to === null) store().toast(dir > 0 ? 'No more keys after this' : 'No more keys before this');
      else setHead(to);
    });
  setRunner('timeline-list', (e) => (stop(e), toggleTimelineList()));
  const jumps: [string, JumpProp][] = [
    ['prop-position', 'position'],
    ['prop-scale', 'scale'],
    ['prop-rotation', 'rotation'],
    ['prop-opacity', 'opacity'],
    ['prop-anchor', 'anchor'],
  ];
  for (const [id, prop] of jumps)
    setRunner(id, (e) => {
      stop(e);
      return jumpToProperty(prop);
    });
}
