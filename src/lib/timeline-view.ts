import { trackSpan, type Timeline } from 'interactives-player';
import type { Prefs } from './prefs';

/** The three media lanes under a timeline's ruler. */
export type LaneKind = 'audio' | 'captions' | 'descriptions';
export const LANE_KINDS: LaneKind[] = ['audio', 'captions', 'descriptions'];
export const LANE_NAME: Record<LaneKind, string> = { audio: 'Sound', captions: 'Captions', descriptions: 'Descriptions' };

export type LaneShow = Record<LaneKind, boolean>;

/** Which lanes the person has not hidden (the Timeline's View menu), from their preferences. */
export function laneShow(p: Pick<Prefs, 'timelineHideSound' | 'timelineHideCaptions' | 'timelineHideDescriptions'>): LaneShow {
  return { audio: !p.timelineHideSound, captions: !p.timelineHideCaptions, descriptions: !p.timelineHideDescriptions };
}

/** The preference that hides a lane. */
export const HIDE_PREF = { audio: 'timelineHideSound', captions: 'timelineHideCaptions', descriptions: 'timelineHideDescriptions' } as const;

/** How many rows a lane has: sound clips, or caption and description tracks (a track with no cues yet still has its row). */
export function laneRows(tl: Timeline, kind: LaneKind): number {
  return (tl[kind] ?? []).length;
}

/** How many clips (sound) or cues (captions, descriptions) a timeline has in a lane. */
export function laneCount(tl: Timeline, kind: LaneKind): number {
  if (kind === 'audio') return (tl.audio ?? []).length;
  return (tl[kind] ?? []).reduce((n, t) => n + t.cues.length, 0);
}

/** A lane with a row in it, among the lanes that show. */
export function hasMedia(tl: Timeline, show: LaneShow): boolean {
  return LANE_KINDS.some((k) => show[k] && laneRows(tl, k) > 0);
}

/**
 * Whether the Sound and captions group is open on a timeline: what the person chose for it, else open when it has something to
 * show, or always open when they turned "fold when empty" off.
 */
export function groupOpen(tl: Timeline, show: LaneShow, foldEmpty: boolean, chosen: boolean | undefined): boolean {
  if (chosen !== undefined) return chosen;
  return foldEmpty ? hasMedia(tl, show) : true;
}

/** "2 sounds, 14 captions" for the folded row, or "nothing yet". */
export function mediaSummary(tl: Timeline, show: LaneShow): string {
  const bits: string[] = [];
  const n = (k: LaneKind, one: string, many: string) => {
    const c = laneCount(tl, k);
    if (show[k] && c) bits.push(`${c} ${c === 1 ? one : many}`);
    else if (show[k] && laneRows(tl, k)) bits.push(`no ${many} yet`);
  };
  n('audio', 'sound', 'sounds');
  n('captions', 'caption', 'captions');
  n('descriptions', 'description', 'descriptions');
  return bits.length ? bits.join(', ') : 'nothing yet';
}

/** The few characters the folded row has room for: "empty", or how many clips and cues there are. */
export function mediaBrief(tl: Timeline, show: LaneShow): string {
  const n = LANE_KINDS.reduce((sum, k) => sum + (show[k] ? laneCount(tl, k) : 0), 0);
  return n ? `${n} item${n === 1 ? '' : 's'}` : 'empty';
}

export interface MediaMark {
  kind: LaneKind;
  from: number;
  to: number;
}

/** What the folded row draws along the time axis: a bar per sound clip and a tick per caption or description. Times in ms. */
export function mediaMarks(tl: Timeline, show: LaneShow): MediaMark[] {
  const out: MediaMark[] = [];
  if (show.audio)
    for (const a of tl.audio ?? []) {
      const span = trackSpan(a);
      out.push({ kind: 'audio', from: a.offset, to: Number.isFinite(span) ? a.offset + span : tl.duration });
    }
  for (const k of ['captions', 'descriptions'] as const)
    if (show[k]) for (const t of tl[k] ?? []) for (const c of t.cues) out.push({ kind: k, from: c.start, to: c.end });
  return out;
}
