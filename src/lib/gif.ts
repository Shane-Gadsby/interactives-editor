/**
 * A small animated GIF writer: median-cut palette per frame, variable-width LZW, no dithering. Frames come in one at a time
 * as RGBA pixels (opaque; the caller paints a background first), so a long timeline never holds more than the encoded bytes.
 * A frame identical to the one before it is folded into it, so a still stretch of the timeline costs nothing.
 */

/** Browsers play GIF delays under 2 centiseconds as 10, so the fastest rate that keeps its timing is 50 fps. */
export const GIF_MAX_FPS = 50;

/** The delay of each frame in centiseconds, rounded against the running total so the clip's length doesn't drift. */
export function gifDelays(fps: number, count: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 1; i <= count; i++) {
    const at = Math.round((i * 100) / fps);
    out.push(Math.max(2, at - prev));
    prev = at;
  }
  return out;
}

interface Swatch {
  r: number;
  g: number;
  b: number;
  n: number;
}

/** Median cut over a sample of the frame's colours: up to 256 colours as [r, g, b, ...]. */
export function buildPalette(rgba: Uint8ClampedArray | Uint8Array, maxColours = 256): Uint8Array {
  const pixels = rgba.length >> 2;
  const stride = Math.max(1, Math.floor(pixels / 65536));
  const counts = new Map<number, number>();
  for (let p = 0; p < pixels; p += stride) {
    const i = p << 2;
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all: Swatch[] = [];
  for (const [k, n] of counts) all.push({ r: k >> 16, g: (k >> 8) & 255, b: k & 255, n });
  let boxes: Swatch[][] = [all];
  while (boxes.length < maxColours) {
    // The box with the widest spread in one channel (among those that can still be split) is cut next
    let pick = -1;
    let best = -1;
    let channel: 'r' | 'g' | 'b' = 'r';
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (const c of ['r', 'g', 'b'] as const) {
        let lo = 255;
        let hi = 0;
        for (const s of box) {
          if (s[c] < lo) lo = s[c];
          if (s[c] > hi) hi = s[c];
        }
        if (hi - lo > best) {
          best = hi - lo;
          pick = bi;
          channel = c;
        }
      }
    });
    if (pick < 0) break;
    const box = boxes[pick].slice().sort((a, b) => a[channel] - b[channel]);
    const total = box.reduce((t, s) => t + s.n, 0);
    let run = 0;
    let at = 1;
    for (let i = 0; i < box.length - 1; i++) {
      run += box[i].n;
      at = i + 1;
      if (run * 2 >= total) break;
    }
    boxes.splice(pick, 1, box.slice(0, at), box.slice(at));
  }
  boxes = boxes.filter((b) => b.length);
  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((box, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const s of box) {
      r += s.r * s.n;
      g += s.g * s.n;
      b += s.b * s.n;
      n += s.n;
    }
    palette[i * 3] = Math.round(r / n);
    palette[i * 3 + 1] = Math.round(g / n);
    palette[i * 3 + 2] = Math.round(b / n);
  });
  return palette;
}

/** Each pixel's index into the palette (nearest colour, remembered per 5-bit-per-channel colour so a big frame stays quick). */
export function mapToPalette(rgba: Uint8ClampedArray | Uint8Array, palette: Uint8Array): Uint8Array {
  const count = palette.length / 3;
  const out = new Uint8Array(rgba.length >> 2);
  const memo = new Int16Array(32768).fill(-1);
  const exact = new Map<number, number>();
  for (let c = 0; c < count; c++) {
    const k = (palette[c * 3] << 16) | (palette[c * 3 + 1] << 8) | palette[c * 3 + 2];
    if (!exact.has(k)) exact.set(k, c);
  }
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const hit = exact.get((r << 16) | (g << 8) | b);
    if (hit !== undefined) {
      out[p] = hit;
      continue;
    }
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let idx = memo[key];
    if (idx < 0) {
      let bestD = Infinity;
      for (let c = 0; c < count; c++) {
        const dr = palette[c * 3] - r;
        const dg = palette[c * 3 + 1] - g;
        const db = palette[c * 3 + 2] - b;
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bestD) {
          bestD = d;
          idx = c;
        }
      }
      memo[key] = idx;
    }
    out[p] = idx;
  }
  return out;
}

/** GIF's LZW: codes grow from minCodeSize + 1 bits to 12, and the table is cleared when it fills. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  const dict = new Map<number, number>();
  const out: number[] = [];
  let cur = 0;
  let bits = 0;
  const emit = (code: number) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(cur & 255);
      cur >>>= 8;
      bits -= 8;
    }
  };
  // The decoder is one entry behind the encoder, so the width grows once the next free code no longer fits
  const widen = () => {
    if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    widen();
    if (next < 4096) {
      dict.set(key, next++);
    } else {
      emit(clear);
      dict.clear();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  widen();
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return Uint8Array.from(out);
}

const le16 = (n: number) => [n & 255, (n >> 8) & 255];

export class GifEncoder {
  private chunks: Uint8Array[] = [];
  private last: { rgba: Uint8Array; gce: Uint8Array; delay: number } | null = null;
  private closed = false;

  constructor(
    readonly width: number,
    readonly height: number,
    opts: { loop?: boolean } = {},
  ) {
    const head = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...le16(width), ...le16(height), 0x70, 0, 0];
    this.chunks.push(Uint8Array.from(head));
    // Without the Netscape block a GIF plays once; with a count of 0 it repeats for ever
    if (opts.loop !== false) this.chunks.push(Uint8Array.from([0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 0x03, 0x01, 0, 0, 0]));
  }

  /** Adds a frame shown for `delayCs` hundredths of a second. `rgba` is width * height * 4 bytes. */
  addFrame(rgba: Uint8ClampedArray | Uint8Array, delayCs: number): void {
    if (this.closed) throw new Error('The GIF is already finished.');
    if (rgba.length !== this.width * this.height * 4) throw new Error('A frame is not the size of the GIF.');
    const prev = this.last;
    if (prev && prev.rgba.length === rgba.length && prev.rgba.every((v, i) => v === rgba[i])) {
      prev.delay += delayCs;
      this.setDelay(prev.gce, prev.delay);
      return;
    }
    const palette = buildPalette(rgba);
    const colours = palette.length / 3;
    let bitsPer = 1;
    while (1 << bitsPer < colours) bitsPer++;
    const table = new Uint8Array(3 << bitsPer);
    table.set(palette);
    const indices = mapToPalette(rgba, palette);
    const minCode = Math.max(2, bitsPer);
    const gce = Uint8Array.from([0x21, 0xf9, 0x04, 0x04, 0, 0, 0, 0]);
    this.setDelay(gce, delayCs);
    this.chunks.push(gce);
    this.chunks.push(Uint8Array.from([0x2c, 0, 0, 0, 0, ...le16(this.width), ...le16(this.height), 0x80 | (bitsPer - 1)]));
    this.chunks.push(table);
    this.chunks.push(Uint8Array.from([minCode]));
    const data = lzwEncode(indices, minCode);
    for (let at = 0; at < data.length; at += 255) {
      const part = data.subarray(at, at + 255);
      this.chunks.push(Uint8Array.from([part.length]), part);
    }
    this.chunks.push(Uint8Array.from([0]));
    this.last = { rgba: Uint8Array.from(rgba), gce, delay: delayCs };
  }

  private setDelay(gce: Uint8Array, cs: number) {
    const d = Math.min(cs, 65535);
    gce[4] = d & 255;
    gce[5] = d >> 8;
  }

  finish(): Uint8Array {
    this.closed = true;
    const parts = [...this.chunks, Uint8Array.from([0x3b])];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}
