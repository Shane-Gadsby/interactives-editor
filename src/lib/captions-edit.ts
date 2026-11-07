import { cuesFromTranscript, overlappingSpeech, parseCaptions, sortedCues, trackSpan, uid, type AudioRole, type AudioTrack, type CaptionCue, type CaptionTrack, type Project, type Timeline, type TimingMode } from 'interactives-player';
import { uniqueIdentifier } from '../store/doc';

/**
 * Editing narration and captions on a timeline: every function changes the timeline it is given (an immer draft inside
 * `store().update`, or a plain object in tests) and says what it did. No store or DOM in here.
 */

/** Where the first narration (else any sound) with a known length sits on the timeline, in ms. Null when there is none. */
export function narrationSpan(tl: Pick<Timeline, 'audio'>): { start: number; end: number } | null {
  const tracks = tl.audio ?? [];
  const pick = tracks.filter((t) => (t.role ?? 'narration') === 'narration' && !t.muted).concat(tracks);
  for (const t of pick) {
    const span = trackSpan(t);
    if (Number.isFinite(span)) return { start: t.offset, end: t.offset + span };
  }
  return null;
}

/** Add a sound to a timeline at `offset`. The timeline grows to hold it. Returns the new track. */
export function addAudioTrack(tl: Timeline, asset: { id: string; name: string }, durationMs: number, offset: number, role: AudioRole = 'narration'): AudioTrack {
  const name = asset.name.replace(/\.[^.]+$/, '') || 'Sound';
  const track: AudioTrack = { id: uid('au'), name, assetId: asset.id, offset: Math.max(0, Math.round(offset)), volume: 1, role };
  if (Number.isFinite(durationMs) && durationMs > 0) {
    track.duration = Math.round(durationMs);
    tl.duration = Math.max(tl.duration, track.offset + track.duration);
  }
  (tl.audio ??= []).push(track);
  return track;
}

/** The timeline's caption track in a language, made when there is none (the first one when no language is given). */
export function ensureCaptionTrack(tl: Timeline, lang?: string): CaptionTrack {
  const list = (tl.captions ??= []);
  const found = lang ? list.find((t) => (t.lang ?? '').toLowerCase() === lang.toLowerCase()) : list[0];
  if (found) return found;
  const track: CaptionTrack = { id: uid('ct'), name: lang ? lang : list.length ? `Captions ${list.length + 1}` : 'Captions', ...(lang ? { lang } : {}), cues: [] };
  list.push(track);
  return track;
}

/** The timeline's description track in a language (what is on screen, read aloud and listed in the transcript), made when there is none. */
export function ensureDescriptionTrack(tl: Timeline, lang?: string): CaptionTrack {
  const list = (tl.descriptions ??= []);
  const found = lang ? list.find((t) => (t.lang ?? '').toLowerCase() === lang.toLowerCase()) : list[0];
  if (found) return found;
  const track: CaptionTrack = { id: uid('dt'), name: lang ? `Descriptions (${lang})` : list.length ? `Descriptions ${list.length + 1}` : 'Descriptions', ...(lang ? { lang } : {}), cues: [] };
  list.push(track);
  return track;
}

/** Which list a track id is in: the caption tracks, the description tracks, or neither. Ids are unique across both. */
export function trackKind(tl: Pick<Timeline, 'captions' | 'descriptions'>, id: string): 'captions' | 'descriptions' | null {
  if (tl.captions?.some((t) => t.id === id)) return 'captions';
  if (tl.descriptions?.some((t) => t.id === id)) return 'descriptions';
  return null;
}

/** A caption or description track by id (the timeline may be an immer draft). */
export function findTrack(tl: Pick<Timeline, 'captions' | 'descriptions'>, id: string): CaptionTrack | undefined {
  return tl.captions?.find((t) => t.id === id) ?? tl.descriptions?.find((t) => t.id === id);
}

/** Take a description track out of the timeline, and the list with it when it was the last. */
export function removeTrack(tl: Pick<Timeline, 'captions' | 'descriptions'>, id: string): void {
  if (tl.captions?.some((t) => t.id === id)) {
    tl.captions = tl.captions.filter((t) => t.id !== id);
    if (!tl.captions.length) delete tl.captions;
  }
  if (tl.descriptions?.some((t) => t.id === id)) {
    tl.descriptions = tl.descriptions.filter((t) => t.id !== id);
    if (!tl.descriptions.length) delete tl.descriptions;
  }
}

/** Captions that run while this description does: the voice would talk over them, so a description belongs in the gap. */
export function descriptionClashes(tl: Pick<Timeline, 'captions'>, cue: Pick<CaptionCue, 'start' | 'end'>): CaptionCue[] {
  return (tl.captions ?? []).flatMap((t) => overlappingSpeech(cue, t.cues));
}

/** Keep a track's cues in time order (the player does not need it, the lanes and exports read better). */
export function orderCues(track: CaptionTrack): void {
  track.cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** A new cue at `start`, `length` ms long. */
export function addCue(track: CaptionTrack, start: number, length = 2500, text = 'New caption'): CaptionCue {
  const cue: CaptionCue = { id: uid('cu'), start: Math.max(0, Math.round(start)), end: Math.max(0, Math.round(start)) + Math.max(100, Math.round(length)), text };
  track.cues.push(cue);
  orderCues(track);
  return cue;
}

/** Cut a cue in two at a time inside it, splitting the words in proportion to the time (at a space). Returns the id of the second half. */
export function splitCue(track: CaptionTrack, cueId: string, at: number): string | null {
  const cue = track.cues.find((c) => c.id === cueId);
  if (!cue || !(at > cue.start + 50 && at < cue.end - 50)) return null;
  const words = cue.text.split(/(\s+)/);
  const share = (at - cue.start) / (cue.end - cue.start);
  const target = cue.text.length * share;
  // Cut after the word whose end is nearest the share of the text the time implies
  let cut = 0;
  let best = Infinity;
  let acc = 0;
  for (let i = 0; i < words.length - 1; i += 2) {
    acc += words[i].length;
    const dist = Math.abs(acc - target);
    if (dist < best) {
      best = dist;
      cut = i;
    }
    acc += words[i + 1]?.length ?? 0;
  }
  const first = words.slice(0, cut + 1).join('').trim();
  const rest = words.slice(cut + 1).join('').trim();
  if (!first || !rest) return null;
  const next: CaptionCue = { id: uid('cu'), start: Math.round(at), end: cue.end, text: rest, ...(cue.speaker ? { speaker: cue.speaker } : {}) };
  cue.text = first;
  cue.end = Math.round(at);
  track.cues.push(next);
  orderCues(track);
  return next.id;
}

/** Join a cue and the one after it (by time) into one that runs from the first's start to the last's end. Returns the surviving cue's id. */
export function mergeWithNext(track: CaptionTrack, cueId: string): string | null {
  const order = sortedCues(track.cues);
  const i = order.findIndex((c) => c.id === cueId);
  if (i < 0 || i + 1 >= order.length) return null;
  const a = track.cues.find((c) => c.id === order[i].id)!;
  const b = order[i + 1];
  a.text = `${a.text.trim()} ${b.text.trim()}`.trim();
  a.end = Math.max(a.end, b.end);
  track.cues = track.cues.filter((c) => c.id !== b.id);
  return a.id;
}

/** Slide every cue by `ms` (negative earlier), never before 0. */
export function shiftCues(track: CaptionTrack, ms: number): void {
  const first = track.cues.reduce((m, c) => Math.min(m, c.start), Infinity);
  const by = Number.isFinite(first) ? Math.max(ms, -first) : 0;
  for (const c of track.cues) {
    c.start = Math.round(c.start + by);
    c.end = Math.round(c.end + by);
  }
}

export type PasteTiming = 'narration' | 'timeline' | 'markers' | 'rate';

export interface PasteOptions {
  timing: PasteTiming;
  by: 'sentence' | 'line' | 'paragraph';
  /** Put the cues after the ones already there instead of replacing them. */
  append: boolean;
  maxChars?: number;
}

/** What each timing choice means for this timeline, as a timing mode (or why it cannot be). */
export function pasteTimingMode(tl: Pick<Timeline, 'audio' | 'duration' | 'markers'>, timing: PasteTiming, after = 0): { mode: TimingMode } | { error: string } {
  if (timing === 'markers') {
    const times = (tl.markers ?? []).map((m) => m.time);
    if (!times.length) return { error: 'This timeline has no markers. Add one at each point where a new caption should start.' };
    return { mode: { mode: 'markers', markers: times, end: tl.duration } };
  }
  if (timing === 'narration') {
    const span = narrationSpan(tl);
    if (!span) return { error: 'This timeline has no sound with a known length. Add the narration first, or time the captions across the whole timeline.' };
    return { mode: { mode: 'even', start: span.start, end: Math.min(span.end, Math.max(span.start + 500, tl.duration)) } };
  }
  if (timing === 'rate') return { mode: { mode: 'rate', start: after, cps: 15 } };
  return { mode: { mode: 'even', start: after, end: Math.max(after + 500, tl.duration) } };
}

/** Turn pasted text into cues on a track. Returns how many were made and whether the text carried its own times, or the reason it could not. */
export function pasteTranscript(tl: Timeline, track: CaptionTrack, text: string, opts: PasteOptions): { made: number; stamped: boolean } | { error: string } {
  if (!text.trim()) return { error: 'Paste the transcript first.' };
  const after = opts.append && track.cues.length ? Math.max(...track.cues.map((c) => c.end)) : 0;
  const t = pasteTimingMode(tl, opts.timing, after);
  if ('error' in t) {
    // A transcript with its own times does not need a way to time it
    const stampedOnly = cuesFromTranscript(text, { mode: 'even', start: 0, end: tl.duration }, { by: opts.by, maxChars: opts.maxChars });
    if (!stampedOnly.stamped) return t;
    return place(track, stampedOnly.cues, opts.append, true);
  }
  const { cues, stamped } = cuesFromTranscript(text, t.mode, { by: opts.by, maxChars: opts.maxChars });
  if (!cues.length) return { error: 'No sentences found in that text.' };
  return place(track, cues, opts.append, stamped);
}

function place(track: CaptionTrack, cues: CaptionCue[], append: boolean, stamped: boolean): { made: number; stamped: boolean } {
  track.cues = append ? [...track.cues, ...cues] : cues;
  orderCues(track);
  return { made: cues.length, stamped };
}

/** Read a WebVTT or SRT file into a track. Returns the count and the parser's warnings. */
export function importCaptionFile(track: CaptionTrack, text: string, append: boolean): { made: number; warnings: string[] } {
  const parsed = parseCaptions(text);
  if (parsed.cues.length) {
    track.cues = append ? [...track.cues, ...parsed.cues] : parsed.cues;
    orderCues(track);
  }
  return { made: parsed.cues.length, warnings: parsed.warnings };
}

/** A name for an exported file: the project, the timeline, the language, and "descriptions" for a description track. */
export function captionFileName(project: Pick<Project, 'name'>, tl: Pick<Timeline, 'name'>, track: Pick<CaptionTrack, 'lang'>, ext: 'vtt' | 'srt', kind: 'captions' | 'descriptions' = 'captions'): string {
  const safe = (s: string) => s.replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-');
  return [safe(project.name) || 'project', safe(tl.name), safe(track.lang ?? ''), kind === 'descriptions' ? 'descriptions' : ''].filter(Boolean).join('-') + `.${ext}`;
}

/** The caption text variable a caption layer reads, made when the project has none. Returns its id and name. */
export function ensureCaptionVariable(project: Project): { id: string; name: string } {
  const have = project.variables.find((v) => v.id === project.settings.captions?.textVar);
  if (have) return { id: have.id, name: have.name };
  const name = uniqueIdentifier(
    project.variables.map((v) => v.name),
    'captionText',
  );
  const v = { id: uid('v'), name, type: 'string' as const, initial: '' };
  project.variables.push(v);
  project.settings.captions = { ...project.settings.captions, textVar: v.id };
  return { id: v.id, name };
}

/** Narration and music a timeline plays that no caption track speaks for (used by the accessibility check and the timeline's hint). */
export function uncaptioned(tl: Pick<Timeline, 'audio' | 'captions'>): AudioTrack[] {
  const covered = (tl.captions ?? []).some((c) => c.cues.length > 0);
  return covered ? [] : (tl.audio ?? []).filter((a) => (a.role ?? 'narration') === 'narration' && !a.muted);
}
