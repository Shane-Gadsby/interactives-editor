import { assetUrls } from './assets';

/**
 * Waveforms for the timeline's sound lanes. A file is decoded once (in the browser's audio decoder) and boiled down to a
 * fixed number of peaks, so drawing a clip at any zoom is a lookup, not another decode.
 */

export interface Waveform {
  /** The loudest absolute sample in each of `peaks.length` equal slices of the whole file, 0 to 1. */
  peaks: Float32Array;
  /** Length of the file in ms. */
  duration: number;
}

/** Slices over the whole file. 4000 keeps an hour of narration under a second of detail per slice at the widest zoom people use. */
export const PEAK_SLICES = 4000;

/** The loudest absolute sample in each of `slices` equal parts of a channel, as recorded. */
function rawPeaks(data: Float32Array, slices: number): Float32Array {
  const n = Math.max(1, Math.min(slices, data.length));
  const out = new Float32Array(n);
  const per = data.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const from = Math.floor(i * per);
    const to = Math.min(data.length, Math.max(from + 1, Math.floor((i + 1) * per)));
    // Long slices are sampled, not read to the last sample
    const step = Math.max(1, Math.floor((to - from) / 256));
    for (let j = from; j < to; j += step) {
      const v = Math.abs(data[j]);
      if (v > m) m = v;
    }
    out[i] = m;
  }
  return out;
}

/** Scale peaks so the loudest is 1 (silence stays silence). */
function normalised(p: Float32Array): Float32Array {
  let max = 0;
  for (const v of p) if (v > max) max = v;
  if (max > 0) for (let i = 0; i < p.length; i++) p[i] /= max;
  return p;
}

/** The loudest sample in each of `slices` equal parts of a channel, scaled so the loudest in the file is 1. */
export function peaksOf(data: Float32Array, slices = PEAK_SLICES): Float32Array {
  return normalised(rawPeaks(data, slices));
}

/** The loudest of the channels in each slice, scaled together. */
export function peaksOfChannels(channels: Float32Array[], slices = PEAK_SLICES): Float32Array {
  const each = channels.map((c) => rawPeaks(c, slices));
  if (!each.length) return new Float32Array(0);
  const out = new Float32Array(each[0].length);
  for (const e of each) for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], e[i]);
  return normalised(out);
}

/**
 * The heights (0 to 1) of `columns` bars for the part of a clip from `fromMs` to `toMs` (clip time), read from the peaks.
 * A part outside the file is silent.
 */
export function barsFor(w: Waveform, fromMs: number, toMs: number, columns: number): Float32Array {
  const out = new Float32Array(Math.max(0, columns));
  if (!out.length || !(toMs > fromMs) || !w.peaks.length || !(w.duration > 0)) return out;
  const perMs = w.peaks.length / w.duration;
  for (let c = 0; c < out.length; c++) {
    const a = fromMs + ((toMs - fromMs) * c) / out.length;
    const b = fromMs + ((toMs - fromMs) * (c + 1)) / out.length;
    if (b <= 0 || a >= w.duration) continue;
    const i0 = Math.max(0, Math.floor(a * perMs));
    const i1 = Math.min(w.peaks.length, Math.max(i0 + 1, Math.ceil(b * perMs)));
    let m = 0;
    for (let i = i0; i < i1; i++) if (w.peaks[i] > m) m = w.peaks[i];
    out[c] = m;
  }
  return out;
}

const cache = new Map<string, Promise<Waveform | null>>();
let ctx: AudioContext | null = null;

/** Decode an asset's audio (or the soundtrack of a video) and boil it down. Null when the browser cannot decode it. Cached by asset. */
export function loadWaveform(assetId: string): Promise<Waveform | null> {
  let p = cache.get(assetId);
  if (!p) {
    p = (async () => {
      const url = assetUrls.resolve(assetId);
      if (!url) return null;
      try {
        const bytes = await (await fetch(url)).arrayBuffer();
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        ctx ??= new AC();
        const buf = await ctx.decodeAudioData(bytes);
        const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
        return { peaks: peaksOfChannels(channels), duration: buf.duration * 1000 };
      } catch {
        return null;
      }
    })();
    cache.set(assetId, p);
  }
  return p;
}

/** Forget a waveform (the asset's bytes changed or it was removed). */
export function forgetWaveform(assetId: string): void {
  cache.delete(assetId);
}

/** How long an audio asset is, in ms, from its metadata (the decode is the fallback). Zero when it cannot be told. */
export async function audioDuration(assetId: string): Promise<number> {
  const url = assetUrls.resolve(assetId);
  if (!url) return 0;
  const fromMeta = await new Promise<number>((resolve) => {
    const a = document.createElement('audio');
    const done = (ms: number) => {
      a.removeAttribute('src');
      resolve(ms);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    a.src = url;
  });
  if (fromMeta > 0) return fromMeta;
  const w = await loadWaveform(assetId);
  return w ? Math.round(w.duration) : 0;
}
