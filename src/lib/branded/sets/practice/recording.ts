//Record and replay, shared by the practice starters that offer it (Shadow the model, and the optional step in the two rehearsals). Nothing in here opens a
//device: it is the media bridge's own nodes (Start recording, Stop recording, Play recording) wired the way every one of them wants them, plus the words
//that go with them. Each starter keeps its own layout and just asks for the pieces.
import type { SceneNode } from 'interactives-player';
import type { Graph } from '../games/common';

/** True when the microphone can be asked for (declared in Project > Microphone and camera, and not off, denied or missing). The record layers show only then. */
export const MIC_READY = 'microphone == "ready"';

/** What a recording name says about itself: its state, whether there is a take, and how long it is. */
export const rec = (slot: string) => ({
  state: `recordings.${slot}.state`,
  has: `recordings.${slot}.hasRecording`,
  recording: `recordings.${slot}.state == "recording"`,
  playing: `recordings.${slot}.state == "playing"`,
});

/** The line under a record button: where it is, how long the take is, and the promise about where it stays. */
export function recordStatus(slot: string, idle = 'Not recorded yet.'): string {
  const r = rec(slot);
  return `${r.recording} ? "Recording, " + Math.round(recordingSeconds) + " s. Press Stop recording when you are done." : ${r.has} ? "Recorded, " + Math.round(recordings.${slot}.seconds) + " s. It stays on this device." : "${idle}"`;
}

/**
 * One button that records and stops: pressed while recording it stops the take, otherwise it starts one. A new take replaces the old only when it ends,
 * so a start that fails (not allowed, no device) loses nothing. The page around the project shows why a start failed, so there is nothing to say here.
 */
export function wireRecord(g: Graph, button: SceneNode, slot: string, note = 'Record or stop'): void {
  const on = g.click(button, note);
  const isRec = g.add('logic.if', { condition: rec(slot).recording }, on);
  const stop = g.add('action.recordStop', { slot }, isRec, 'true');
  g.add('action.announce', { text: '"Recorded. Play it back, or record again."', politeness: 'polite' }, stop, 'out');
  //Stop other sounds first, so the model never leaks into the microphone
  const quiet = g.add('action.stopSound', {}, isRec, 'false', { dy: 70 });
  const start = g.add('action.recordStart', { slot, source: 'microphone', maxSeconds: 0 }, quiet);
  g.add('action.announce', { text: '"Recording. Say it now. Press Stop recording when you are done."', politeness: 'polite' }, start, 'out');
  g.gap(80);
}

/** A button that plays the take back (or stops it, with `op: "stop"`). */
export function wirePlay(g: Graph, button: SceneNode, slot: string, note = 'Play my recording'): void {
  g.run(g.click(button, note), ['action.recordPlay', { op: 'play', slot, volume: 1, continue: 'start' }]);
}

/** When `condition` becomes true, throw the take away (a take is dropped when the learner moves on). The condition is read on every change of `watch`. */
export function dropTakeWhen(g: Graph, watch: { id: string }, slot: string, condition: string, note = 'Drop the take when moving on'): void {
  const changed = g.add('event.variable', { variable: watch.id }, null, 'out', { note });
  const test = g.add('logic.if', { condition: `${condition} && ${rec(slot).has}` }, changed);
  g.add('action.recordDiscard', { slot }, test, 'true');
}

/** When `condition` becomes true while the slot is recording, end the take (the clock ran out, or the learner moved on without pressing Stop). */
export function stopTakeWhen(g: Graph, watch: { id: string }, slot: string, condition: string, note = 'End the take when moving on'): void {
  const changed = g.add('event.variable', { variable: watch.id }, null, 'out', { note });
  const test = g.add('logic.if', { condition: `${condition} && ${rec(slot).recording}` }, changed);
  g.add('action.recordStop', { slot }, test, 'true');
}
