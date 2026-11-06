import type { Project } from 'interactives-player';

/**
 * Picture proxies and optimised output. Every upload stays at full resolution. Two smaller copies can be made from it, in
 * the browser, and kept on the server beside the asset: the proxy the canvas shows while editing (so a 40 MB photo does
 * not slow the canvas), and the optimised copy a download or share link carries. This file is the rules and the maths,
 * with no network and no DOM. The canvas work is `encodeVariant` at the bottom, and the orchestration is asset-variants.ts.
 */

/** 1 is the smallest files, 5 the best quality. */
export type OptimiseLevel = 1 | 2 | 3 | 4 | 5;

export const DEFAULT_LEVEL: OptimiseLevel = 4;

/** What each notch of the slider means: the longest side a picture may keep, and the encoder's quality (0 to 1). */
export const LEVELS: Record<OptimiseLevel, { maxSide: number; quality: number; label: string }> = {
  1: { maxSide: 1280, quality: 0.6, label: 'Smallest files' },
  2: { maxSide: 1600, quality: 0.7, label: 'Smaller files' },
  3: { maxSide: 2048, quality: 0.78, label: 'Balanced' },
  4: { maxSide: 2560, quality: 0.85, label: 'Better quality' },
  5: { maxSide: 3840, quality: 0.92, label: 'Best quality' },
};

/** The canvas proxy: big enough to look right at the zoom people edit at, a fraction of a camera photo's weight. */
export const PROXY = { maxSide: 2560, quality: 0.82 };

/** A picture lighter than this is left as it is for the output (unless it is more pixels than the level keeps). */
export const SMALL_BYTES = 150 * 1024;

/** A picture lighter than this, and not wider than the proxy, needs no proxy. */
export const PROXY_BYTES = 2 * 1024 * 1024;

/** A copy has to be at most this fraction of the original to be worth keeping. */
export const WORTH = 0.9;

export const clampLevel = (n: unknown): OptimiseLevel => {
  const v = Math.round(Number(n));
  return (v >= 1 && v <= 5 ? v : DEFAULT_LEVEL) as OptimiseLevel;
};

/** The project's setting. Absent counts as on, at the default level, so projects made before it get it too. */
export function optimiseSettings(settings: Pick<Project['settings'], 'optimiseOutput' | 'optimiseLevel'>): { on: boolean; level: OptimiseLevel } {
  return { on: settings.optimiseOutput !== false, level: clampLevel(settings.optimiseLevel) };
}

export type RasterMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** The pictures this touches. SVG is already vector, GIF is nearly always animated, and anything else is not a picture we can redraw. */
export function rasterMime(mime: string): RasterMime | null {
  const m = mime.split(';')[0].trim().toLowerCase();
  if (m === 'image/jpg' || m === 'image/jpeg') return 'image/jpeg';
  if (m === 'image/png' || m === 'image/webp') return m;
  return null;
}

/** Fit inside a square of `max`, never bigger than it is. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max || long <= 0) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

const ascii = (b: Uint8Array, at: number, text: string) => text.split('').every((c, i) => b[at + i] === c.charCodeAt(0));

/** An animated PNG (an acTL chunk ahead of the picture data) or animated WebP (the flag in its VP8X header). Redrawing either would keep one frame. */
export function isAnimatedImage(head: Uint8Array, mime: string): boolean {
  const m = rasterMime(mime);
  if (m === 'image/png') {
    let at = 8;
    while (at + 8 <= head.length) {
      const len = ((head[at] << 24) | (head[at + 1] << 16) | (head[at + 2] << 8) | head[at + 3]) >>> 0;
      if (ascii(head, at + 4, 'acTL')) return true;
      if (ascii(head, at + 4, 'IDAT')) return false;
      at += 12 + len;
    }
    return false;
  }
  if (m === 'image/webp') {
    return ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP') && ascii(head, 12, 'VP8X') && (head[20] & 0x02) !== 0;
  }
  return false;
}

export interface ImageFacts {
  mime: string;
  bytes: number;
  width: number;
  height: number;
  animated: boolean;
}

/** The size a proxy would be, or null when the picture needs none (small enough, or not one we redraw). */
export function planProxy(f: ImageFacts): { width: number; height: number } | null {
  if (!rasterMime(f.mime) || f.animated) return null;
  const long = Math.max(f.width, f.height);
  if (long <= PROXY.maxSide && f.bytes <= PROXY_BYTES) return null;
  return fitWithin(f.width, f.height, PROXY.maxSide);
}

/** The size the optimised copy would be at this level, or null when the picture is left alone (small, animated, or not a picture we redraw). */
export function planOutput(f: ImageFacts, level: OptimiseLevel): { width: number; height: number } | null {
  if (!rasterMime(f.mime) || f.animated) return null;
  const { maxSide } = LEVELS[level];
  if (Math.max(f.width, f.height) <= maxSide && f.bytes < SMALL_BYTES) return null;
  return fitWithin(f.width, f.height, maxSide);
}

/** A copy that is not clearly smaller is not worth swapping in. */
export const worthKeeping = (original: number, copy: number): boolean => copy > 0 && copy <= original * WORTH;

/**
 * The names a variant is stored under. They carry the numbers that made it, so changing the table above makes a new key
 * and the old copies simply stop being asked for (the server keeps only the newest few per asset).
 */
export const proxyKey = (): string => `edit-${PROXY.maxSide}-${Math.round(PROXY.quality * 100)}`;
export const outputKey = (level: OptimiseLevel): string => `o${level}-${LEVELS[level].maxSide}-${Math.round(LEVELS[level].quality * 100)}`;

export type VariantSizes = Record<string, number> | undefined;

/**
 * Which file an export takes for an asset: its own bytes (`original`), a copy already stored (`variant`), or a copy it
 * has to make first (`make`). A stored size of 0 is the answer "the original is as good", which is kept so it is not worked out again.
 */
export function outputSource(mime: string, known: VariantSizes, level: OptimiseLevel): 'original' | 'variant' | 'make' {
  if (!rasterMime(mime)) return 'original';
  const size = known?.[outputKey(level)];
  if (size === undefined) return 'make';
  return size > 0 ? 'variant' : 'original';
}

/** What the Assets panel says about an asset's copies, from the sizes the server listed. */
export interface Savings {
  /** The proxy's size, when the canvas shows one. */
  proxy?: number;
  /** The optimised copy for the level: its size and what it saves, or `same` when the picture is already as small as it gets. */
  output?: { size: number; saved: number } | 'same';
}

export function savingsOf(originalSize: number, known: VariantSizes, level: OptimiseLevel): Savings {
  const out: Savings = {};
  const proxy = known?.[proxyKey()];
  if (proxy) out.proxy = proxy;
  const o = known?.[outputKey(level)];
  if (o === 0) out.output = 'same';
  else if (o) out.output = { size: o, saved: Math.max(0, originalSize - o) };
  return out;
}

/** Alpha means WebP (JPEG has none), a picture without it goes out as JPEG, which every browser draws. */
export const outputMime = (hasAlpha: boolean): 'image/webp' | 'image/jpeg' => (hasAlpha ? 'image/webp' : 'image/jpeg');

/** Does any pixel of this RGBA data (a canvas's getImageData) have transparency. */
export function hasAlphaPixels(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

// ---------------------------------------------------------------- the canvas part

export interface EncodeTarget {
  quality: number;
  /** Decides from what was found whether to go ahead, and at what size: planProxy or planOutput bound to a level. */
  plan: (f: ImageFacts) => { width: number; height: number } | null;
}

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Redraw a picture smaller on a canvas and encode it. Resolves null whenever the answer is "leave it": a picture
 * we don't redraw, one that needs nothing, a browser that can't decode it or can't encode what is needed (Safari has no WebP encoder).
 * The browser draws it upright (EXIF turns are applied) and drops colour profiles, which is what the help says.
 */
export async function encodeVariant(blob: Blob, mime: string, target: EncodeTarget): Promise<Encoded | null> {
  const raster = rasterMime(mime);
  if (!raster || typeof createImageBitmap !== 'function') return null;
  const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  if (isAnimatedImage(head, raster)) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const size = target.plan({ mime: raster, bytes: blob.size, width: bitmap.width, height: bitmap.height, animated: false });
    if (!size) return null;
    const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(size.width, size.height) : Object.assign(document.createElement('canvas'), { width: size.width, height: size.height });
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const alpha = raster !== 'image/jpeg' && hasAlphaPixels(ctx.getImageData(0, 0, size.width, size.height).data);
    const type = outputMime(alpha);
    const out = await toBlob(canvas, type, target.quality);
    if (!out || out.type !== type) return null;
    return { blob: out, width: size.width, height: size.height };
  } finally {
    bitmap.close?.();
  }
}

function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
