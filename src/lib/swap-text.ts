import { animatableProp, getPath, holdsText, type SceneNode, type Timeline } from 'interactives-player';
import { setKey, valueAt } from '../store/store';

/** What goes down around a text change: the layer fades out and back in, blurs out and back, or both. */
export type DipStyle = 'fade' | 'blur' | 'both';

export const DIP_STYLES: { value: DipStyle; label: string }[] = [
  { value: 'fade', label: 'Fade out and in' },
  { value: 'blur', label: 'Blur out and in' },
  { value: 'both', label: 'Fade and blur' },
];

/** How long either side of the change, the quick, normal and slow choices (ms). */
export const DIP_LENGTHS = [
  { label: 'Quick (150 ms)', ms: 150 },
  { label: 'Normal (300 ms)', ms: 300 },
  { label: 'Slow (600 ms)', ms: 600 },
];

export const DIP_BLUR_PX = 8;

const PROPS: Record<DipStyle, { prop: string; low: number; fallback: number }[]> = {
  fade: [{ prop: 'opacity', low: 0, fallback: 1 }],
  blur: [{ prop: 'blur', low: DIP_BLUR_PX, fallback: 0 }],
  both: [
    { prop: 'opacity', low: 0, fallback: 1 },
    { prop: 'blur', low: DIP_BLUR_PX, fallback: 0 },
  ],
};

/** Whether a track's value does not ease (text, true/false, a list): its keys hold until the next one, so the Timeline draws them as squares. */
export function isHoldTrack(prop: string, node?: SceneNode): boolean {
  const kind = animatableProp(prop, node)?.kind;
  return kind === 'string' || kind === 'boolean' || kind === 'list';
}

/** Whether a track is a text change (a hold track: the words, a button's label ...) that can take a dip. */
export function isTextTrack(prop: string, node?: SceneNode): boolean {
  return holdsText(prop, node);
}

/**
 * Around the text key at `keyId`, key an opacity and/or blur dip: back to normal `ms` before the change, at the dip value
 * on it, and back to normal `ms` after, so the old words fade out, the text swaps while it is hidden, and the new words fade
 * in. Each side is cut short to half the gap to the neighbouring text key (so two changes close together do not fight), and to
 * the timeline. Plain keys on the layer's own tracks (a track that is new is marked `dip`, so reduced motion leaves it out).
 * Run it again and it replaces what it keyed before. Returns false when there is nothing to do: no earlier text for this key to
 * change from, or no room.
 */
export function addTextDip(tl: Timeline, node: SceneNode, trackId: string, keyId: string, style: DipStyle, ms: number): boolean {
  const track = tl.tracks.find((t) => t.id === trackId);
  if (!track || !isTextTrack(track.prop, node)) return false;
  const i = track.keys.findIndex((k) => k.id === keyId);
  if (i < 1) return false;
  const t = track.keys[i].t;
  const prevGap = t - track.keys[i - 1].t;
  const nextGap = i + 1 < track.keys.length ? track.keys[i + 1].t - t : tl.duration - t;
  const half = (gap: number, neighbour: boolean) => (neighbour ? gap / 2 : gap);
  const before = Math.floor(Math.min(ms, half(prevGap, true), t));
  const after = Math.floor(Math.min(ms, half(nextGap, i + 1 < track.keys.length), tl.duration - t));
  if (before < 1 && after < 1) return false;
  for (const { prop, low, fallback } of PROPS[style]) {
    const mine = getPath(node, prop);
    const rest = typeof mine === 'number' && Number.isFinite(mine) ? mine : fallback;
    const at = (time: number) => {
      const v = Number(valueAt(tl, node, prop, time));
      return Number.isFinite(v) ? v : rest;
    };
    const was = at(t - before);
    const will = at(t + after);
    const existing = tl.tracks.find((x) => x.nodeId === node.id && x.prop === prop);
    // The window is the dip's own: keys inside it go, the ones at its ends are replaced
    if (existing) existing.keys = existing.keys.filter((k) => k.t <= t - before || k.t >= t + after);
    if (before >= 1) setKey(tl, node.id, prop, t - before, was);
    setKey(tl, node.id, prop, t, low);
    if (after >= 1) setKey(tl, node.id, prop, t + after, will);
    if (!existing) tl.tracks.find((x) => x.nodeId === node.id && x.prop === prop)!.dip = true;
  }
  return true;
}
