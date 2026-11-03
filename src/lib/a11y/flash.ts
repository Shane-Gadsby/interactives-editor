/**
 * Flashing: WCAG 2.3.1 says nothing may flash more than three times in any one second (a flash is a pair of opposite
 * brightness changes of 10% or more, on a big enough part of the screen). This reads a timeline's tracks for the layers
 * that get brighter and darker, and counts. It checks timelines only: a flash made by a script, a timer loop or a video
 * is not seen here, and the report says so.
 */
import { parseColor, sampleKeys, type Keyframe, type Timeline, type Track } from 'interactives-player';
import { luminance } from './colour';

export const FLASH_STEP_MS = 1000 / 60;
/** Relative luminance change that counts as a step of a flash. */
export const FLASH_DELTA = 0.1;
/** Longest stretch of a timeline that is simulated. */
const MAX_MS = 60000;

/** Properties whose changes make a layer brighter or darker. */
export const FLASH_PROPS = ['opacity', 'visible', 'fill.color', 'fills.0.color', 'color'];

export interface Signal {
  /** Time in ms. */
  t: number[];
  /** Relative luminance, 0 to 1. */
  v: number[];
}

/**
 * The most flashes in any one second of a brightness signal. A swing is the signal moving `delta` from its last turning
 * point the other way; two swings make a flash. Swings between two very bright levels (the darker one at 0.8 or more)
 * don't count, which is WCAG's own exception.
 */
export function maxFlashesPerSecond(sig: Signal, delta = FLASH_DELTA): number {
  const { t, v } = sig;
  if (v.length < 3) return 0;
  const swings: number[] = [];
  let dir = 0;
  let ext = v[0];
  for (let i = 1; i < v.length; i++) {
    const x = v[i];
    if (dir === 0) {
      if (Math.abs(x - ext) >= delta) {
        if (Math.min(ext, x) < 0.8) swings.push(t[i]);
        dir = x > ext ? 1 : -1;
        ext = x;
      }
    } else if (dir === 1) {
      if (x > ext) ext = x;
      else if (ext - x >= delta) {
        if (Math.min(ext, x) < 0.8) swings.push(t[i]);
        dir = -1;
        ext = x;
      }
    } else if (x < ext) ext = x;
    else if (x - ext >= delta) {
      if (Math.min(ext, x) < 0.8) swings.push(t[i]);
      dir = 1;
      ext = x;
    }
  }
  let best = 0;
  let j = 0;
  for (let i = 0; i < swings.length; i++) {
    while (swings[i] - swings[j] >= 1000) j++;
    best = Math.max(best, i - j + 1);
  }
  return Math.floor(best / 2);
}

/** Sample a function of time (ms) over a timeline's length, for as many laps as its loop mode needs to show the seam. */
export function sampleTimeline(tl: Pick<Timeline, 'duration' | 'loop'>, at: (ms: number) => number): Signal {
  const dur = Math.max(1, tl.duration);
  const laps = tl.loop === 'once' ? 1 : tl.loop === 'pingpong' ? 4 : Math.min(4, Math.max(2, Math.ceil(2000 / dur)));
  const total = Math.min(MAX_MS, dur * laps);
  const t: number[] = [];
  const v: number[] = [];
  for (let ms = 0; ms <= total; ms += FLASH_STEP_MS) {
    let local = ms;
    if (tl.loop === 'loop') local = ms % dur;
    else if (tl.loop === 'pingpong') {
      const k = ms % (2 * dur);
      local = k > dur ? 2 * dur - k : k;
    } else local = Math.min(ms, dur);
    t.push(ms);
    v.push(at(local));
  }
  return { t, v };
}

export interface FlashInputs {
  /** Luminance of the layer's own colour (a fill or its text), when known. */
  layerLum: number | null;
  /** Luminance of what is behind it, when known. */
  backLum: number | null;
}

/**
 * The brightness a track makes over time, for a layer: an opacity or visibility track fades the layer's colour in over
 * what is behind it; a colour track is the colour's own luminance. When the layer's colour or its backdrop isn't known
 * the worst case is assumed (white against black), and `assumed` says so.
 */
export function trackSignal(tl: Timeline, track: Track, inputs: FlashInputs): { signal: Signal; assumed: boolean } | null {
  const keys: Keyframe[] = [...track.keys].sort((a, b) => a.t - b.t);
  if (keys.length < 2) return null;
  if (track.prop === 'opacity' || track.prop === 'visible') {
    const assumed = inputs.layerLum === null || inputs.backLum === null;
    const lb = inputs.backLum ?? 0;
    // Not knowing the layer's colour, take the one furthest from what is behind it
    const ln = inputs.layerLum ?? (lb >= 0.5 ? 0 : 1);
    return {
      assumed,
      signal: sampleTimeline(tl, (ms) => {
        const raw = sampleKeys(keys, ms);
        const o = typeof raw === 'boolean' ? (raw ? 1 : 0) : Math.min(1, Math.max(0, Number(raw) || 0));
        return lb + (ln - lb) * o;
      }),
    };
  }
  if (track.prop.endsWith('color')) {
    const colours = keys.map((k) => (typeof k.value === 'string' ? parseColor(k.value) : null));
    if (colours.some((c) => !c)) return null;
    return {
      assumed: false,
      signal: sampleTimeline(tl, (ms) => {
        const raw = sampleKeys(keys, ms);
        const c = typeof raw === 'string' ? parseColor(raw) : null;
        return c ? luminance(c) : 0;
      }),
    };
  }
  return null;
}
