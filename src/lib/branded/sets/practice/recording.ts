//Record and replay, shared by the practice starters that offer it (Shadow the model, and the optional step in the two rehearsals). Nothing in here opens a
//device: it is the media bridge's own nodes (Start recording, Play recording, Discard recording) wired the way every one of them wants them, plus the words
//that go with them. Each starter keeps its own layout and just asks for the pieces.
import type { Artboard, SceneNode } from 'interactives-player';
import { type Graph } from '../../graph-kit';

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

/** What a record button says: it stops while the take is going, and asks for another once there is one. */
export const recordLabel = (slot: string, idle: string, again = 'Record again', stop = 'Stop recording'): string => `${rec(slot).recording} ? "${stop}" : ${rec(slot).has} ? "${again}" : "${idle}"`;

/** What a button that plays a take back says: Stop while it is playing. */
export const playLabel = (slot: string, idle: string): string => `${rec(slot).playing} ? "Stop" : "${idle}"`;

/**
 * One button that records and stops: Start recording with "Start or stop", so pressed while recording it stops the take (and the Recorded output says so),
 * otherwise it starts one after quieting every sound, so the model never leaks into the microphone. A new take replaces the old only when it ends, so a start
 * that fails (not allowed, no device) loses nothing. The page around the project shows why a start failed, so there is nothing to say here.
 */
export function recordToggle(g: Graph, button: SceneNode, slot: string, note = 'Record or stop'): void {
  const start = g.add('action.recordStart', { op: 'toggle', quiet: true, slot, source: 'microphone', maxSeconds: 0 }, g.click(button, note));
  g.add('action.announce', { text: '"Recording. Say it now. Press Stop recording when you are done."', politeness: 'polite' }, start, 'out');
  g.add('action.announce', { text: '"Recorded. Play it back, or record again."', politeness: 'polite' }, start, 'recorded', { dy: 70 });
  g.gap(80);
}

/** A button that plays the take back, and stops it when it is pressed while the take is playing (label it with `playLabel`). */
export function playToggle(g: Graph, button: SceneNode, slot: string, note = 'Play my recording'): void {
  const going = g.add('logic.if', { condition: rec(slot).playing }, g.click(button, note));
  g.add('action.recordPlay', { op: 'stop', slot }, going, 'true');
  g.add('action.recordPlay', { op: 'play', slot, volume: 1, continue: 'start' }, going, 'false', { dy: 70 });
  g.gap(80);
}

/** When `condition` becomes true, throw the take away (a take is dropped when the learner moves on). The event's own Only if holds it back until there is a take. */
export function dropTakeWhen(g: Graph, watch: { id: string }, slot: string, condition: string, note = 'Drop the take when moving on'): void {
  const changed = g.add('event.variable', { variable: watch.id, onlyIf: `${condition} && ${rec(slot).has}` }, null, 'out', { note });
  g.add('action.recordDiscard', { slot }, changed);
}

/** When `condition` becomes true while the slot is recording, end the take (the clock ran out, or the learner moved on without pressing Stop). */
export function stopTakeWhen(g: Graph, watch: { id: string }, slot: string, condition: string, note = 'End the take when moving on'): void {
  const changed = g.add('event.variable', { variable: watch.id, onlyIf: `${condition} && ${rec(slot).recording}` }, null, 'out', { note });
  g.add('action.recordStop', { slot }, changed);
}

/** The first node on a page labelled like this (flows built by helpers are not handed back, so a note finds them by their label). */
export const labelled = (page: Artboard, label: RegExp) => {
  const n = page.logic.nodes.find((x) => label.test(x.note ?? ''));
  if (!n) throw new Error(`no node labelled ${label} on ${page.name}`);
  return n;
};
