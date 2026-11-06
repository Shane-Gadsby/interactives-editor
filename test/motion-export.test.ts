import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { GifEncoder, GIF_MAX_FPS, buildPalette, gifDelays, lzwEncode, mapToPalette } from '../src/lib/gif';
import { FrameZip } from '../src/lib/frame-zip';
import { MOTION_MAX_FRAMES, avcCodec, frameCount, frameName, frameTime, maxFps, motionProblem, outputSize, videoBitrate } from '../src/lib/motion-frames';

describe('frame-time maths', () => {
  it('counts frames and stops one step short of the end', () => {
    expect(frameCount(3000, 30)).toBe(90);
    expect(frameCount(1000, 24)).toBe(24);
    expect(frameCount(10, 30)).toBe(1);
    expect(frameCount(0, 30)).toBe(0);
    expect(frameCount(1000, 0)).toBe(0);
  });

  it('places each frame at index / fps and never past the end', () => {
    expect(frameTime(0, 30, 3000)).toBe(0);
    expect(frameTime(15, 30, 3000)).toBe(500);
    expect(frameTime(89, 30, 3000)).toBeCloseTo(2966.667, 3);
    expect(frameTime(200, 30, 3000)).toBe(3000);
    // the same index always gives the same time, whatever happened before
    expect(frameTime(7, 24, 2000)).toBe(frameTime(7, 24, 2000));
  });

  it('sizes the picture from the width, with even sides for video', () => {
    expect(outputSize(800, 600, 400, false)).toEqual({ width: 400, height: 300 });
    expect(outputSize(800, 600, 401, true)).toEqual({ width: 400, height: 300 });
    expect(outputSize(100, 99, 99, true)).toEqual({ width: 98, height: 98 });
    expect(outputSize(100, 1000, 9999, false)).toEqual({ width: 410, height: 4096 });
    expect(outputSize(800, 600, 0, false).width).toBeGreaterThanOrEqual(2);
  });

  it('limits rates and frame counts', () => {
    expect(maxFps('gif')).toBe(GIF_MAX_FPS);
    expect(motionProblem({ durationMs: 2000, fps: 30, format: 'mp4' })).toBeNull();
    expect(motionProblem({ durationMs: 0, fps: 30, format: 'mp4' })).toMatch(/no length/);
    expect(motionProblem({ durationMs: 2000, fps: 60, format: 'gif' })).toMatch(/50 frames/);
    expect(motionProblem({ durationMs: (MOTION_MAX_FRAMES / 30 + 5) * 1000, fps: 30, format: 'webm' })).toMatch(/more than/);
  });

  it('names frames in order and picks codec strings', () => {
    expect(frameName(0, 90)).toBe('frame-0001.png');
    expect(frameName(11, 90)).toBe('frame-0012.png');
    expect(frameName(0, 123456)).toBe('frame-000001.png');
    expect(avcCodec(1280, 720)).toBe('avc1.64002a');
    expect(avcCodec(3840, 2160)).toBe('avc1.640033');
    expect(videoBitrate(1280, 720, 30)).toBeGreaterThan(1_000_000);
  });
});

describe('GIF delays', () => {
  it('rounds against the running total so the length does not drift', () => {
    const d = gifDelays(30, 30);
    expect(d.reduce((a, b) => a + b, 0)).toBe(100);
    expect(new Set(d)).toEqual(new Set([3, 4]));
    expect(gifDelays(50, 5)).toEqual([2, 2, 2, 2, 2]);
    expect(gifDelays(10, 3)).toEqual([10, 10, 10]);
  });
});

// A reader for what GifEncoder writes, so the test checks the pixels come back and not just that bytes came out
function readGif(bytes: Uint8Array) {
  const text = (a: number, n: number) => String.fromCharCode(...bytes.subarray(a, a + n));
  const w = bytes[6] | (bytes[7] << 8);
  const h = bytes[8] | (bytes[9] << 8);
  let at = 13;
  let loops = false;
  const frames: { delay: number; pixels: number[][] }[] = [];
  let delay = 0;
  while (bytes[at] !== 0x3b) {
    if (bytes[at] === 0x21) {
      if (bytes[at + 1] === 0xff) loops = text(at + 3, 11) === 'NETSCAPE2.0';
      if (bytes[at + 1] === 0xf9) delay = bytes[at + 4] | (bytes[at + 5] << 8);
      at += 2;
      while (bytes[at]) at += bytes[at] + 1;
      at++;
    } else if (bytes[at] === 0x2c) {
      const packed = bytes[at + 9];
      at += 10;
      const size = 2 << (packed & 7);
      const table = bytes.subarray(at, at + size * 3);
      at += size * 3;
      const min = bytes[at++];
      const data: number[] = [];
      while (bytes[at]) {
        data.push(...bytes.subarray(at + 1, at + 1 + bytes[at]));
        at += bytes[at] + 1;
      }
      at++;
      const idx = lzwDecode(data, min, w * h);
      frames.push({ delay, pixels: idx.map((i) => [table[i * 3], table[i * 3 + 1], table[i * 3 + 2]]) });
    } else throw new Error(`bad block ${bytes[at]} at ${at}`);
  }
  return { header: text(0, 6), w, h, loops, frames };
}

function lzwDecode(data: number[], min: number, count: number): number[] {
  const clear = 1 << min;
  const eoi = clear + 1;
  let size = min + 1;
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < clear; i++) table.push([i]);
    table.push([], []);
    size = min + 1;
  };
  reset();
  const out: number[] = [];
  let bits = 0;
  let cur = 0;
  let pos = 0;
  let prev: number[] | null = null;
  while (out.length < count + 1) {
    while (bits < size) {
      cur |= (data[pos++] ?? 0) << bits;
      bits += 8;
    }
    const code = cur & ((1 << size) - 1);
    cur >>>= size;
    bits -= size;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < table.length) entry = table[code];
    else entry = [...prev!, prev![0]];
    out.push(...entry);
    if (prev) table.push([...prev, entry[0]]);
    prev = entry;
    if (table.length === 1 << size && size < 12) size++;
  }
  return out.slice(0, count);
}

function frame(w: number, h: number, colour: (x: number, y: number) => [number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colour(x, y);
      px.set([r, g, b, 255], (y * w + x) * 4);
    }
  return px;
}

describe('GIF encoder', () => {
  it('writes the header, loop block, delays and a trailer', () => {
    const enc = new GifEncoder(4, 2);
    enc.addFrame(frame(4, 2, () => [255, 0, 0]), 5);
    enc.addFrame(frame(4, 2, (x) => (x < 2 ? [0, 0, 255] : [255, 255, 255])), 7);
    const bytes = enc.finish();
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    const gif = readGif(bytes);
    expect([gif.w, gif.h, gif.loops]).toEqual([4, 2, true]);
    expect(gif.frames.map((f) => f.delay)).toEqual([5, 7]);
    expect(gif.frames[0].pixels.every((p) => p.join() === '255,0,0')).toBe(true);
    expect(gif.frames[1].pixels.map((p) => p.join())).toEqual(['0,0,255', '0,0,255', '255,255,255', '255,255,255', '0,0,255', '0,0,255', '255,255,255', '255,255,255']);
  });

  it('leaves out the loop block when asked, and folds a repeated frame into the one before', () => {
    const enc = new GifEncoder(3, 3, { loop: false });
    const same = frame(3, 3, () => [10, 200, 30]);
    enc.addFrame(same, 3);
    enc.addFrame(same, 4);
    enc.addFrame(frame(3, 3, () => [1, 2, 3]), 3);
    const gif = readGif(enc.finish());
    expect(gif.loops).toBe(false);
    expect(gif.frames.map((f) => f.delay)).toEqual([7, 3]);
  });

  it('round-trips a busy picture through LZW, past the point where the table fills', () => {
    const w = 120;
    const h = 90;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) % 256;
    const px = frame(w, h, (x, y) => (rnd() < 40 ? [x * 2, y * 2, (x + y) % 256] : [rnd(), rnd(), rnd()]));
    const palette = buildPalette(px);
    const idx = mapToPalette(px, palette);
    const bitsPer = Math.max(2, Math.ceil(Math.log2(palette.length / 3)));
    const coded = lzwEncode(idx, bitsPer);
    const enc = new GifEncoder(w, h);
    enc.addFrame(px, 4);
    const gif = readGif(enc.finish());
    expect(gif.frames[0].pixels.length).toBe(w * h);
    // each pixel decodes to its palette colour
    const expected = Array.from(idx, (i) => [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]]);
    expect(gif.frames[0].pixels).toEqual(expected);
    expect(coded.length).toBeGreaterThan(0);
  });

  it('keeps flat colours exact and picks at most 256 colours', () => {
    const px = frame(16, 16, (x, y) => [(x * 16) & 255, (y * 16) & 255, 7]);
    const palette = buildPalette(px);
    expect(palette.length / 3).toBeLessThanOrEqual(256);
    const flat = frame(8, 8, () => [18, 115, 232]);
    expect(Array.from(buildPalette(flat))).toEqual([18, 115, 232]);
  });

  it('refuses a frame of the wrong size and a frame after finishing', () => {
    const enc = new GifEncoder(2, 2);
    expect(() => enc.addFrame(new Uint8Array(4), 3)).toThrow(/size/);
    enc.finish();
    expect(() => enc.addFrame(new Uint8Array(16), 3)).toThrow(/finished/);
  });
});

const readBlob = (b: Blob) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(b);
  });

describe('PNG frame ZIP', () => {
  it('lists the frames in order with their bytes intact', async () => {
    const zip = new FrameZip(12);
    const names: string[] = [];
    const frames = Array.from({ length: 12 }, (_, i) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, i, i * 2]));
    for (const f of frames) names.push(zip.add(f));
    const blob = await zip.finish();
    expect(blob.type).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await readBlob(blob)));
    const listed = Object.keys(files);
    expect(listed).toEqual(names);
    expect(listed[0]).toBe('frame-0001.png');
    expect(listed[11]).toBe('frame-0012.png');
    expect(Array.from(files['frame-0004.png'])).toEqual(Array.from(frames[3]));
  });
});
