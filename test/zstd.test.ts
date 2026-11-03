import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { isZstd, zstdDecompress } from '../src/lib/zstd';

const hasZstd = typeof (zlib as unknown as { zstdCompressSync?: unknown }).zstdCompressSync === 'function';
const compress = (data: Uint8Array, level = 3): Uint8Array =>
  new Uint8Array(
    (zlib as unknown as { zstdCompressSync: (b: Uint8Array, o?: unknown) => Buffer }).zstdCompressSync(data, {
      params: { [(zlib.constants as Record<string, number>).ZSTD_c_compressionLevel]: level },
    }),
  );

// a repeatable noise source so a failure can be reproduced
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function samples(): Record<string, Uint8Array> {
  const r = rng(7);
  const noise = Uint8Array.from({ length: 70000 }, () => Math.floor(r() * 256));
  const words = ['interactive', 'canvas', 'layer', 'photo', 'vector', 'craft', 'pixel', 'tile'];
  const text = new TextEncoder().encode(Array.from({ length: 6000 }, () => words[Math.floor(r() * words.length)]).join(' '));
  // an RGBA gradient with transparent corners, like a tile of a photo layer
  const tile = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) tile.set([x, y, (x + y) >> 1, x > 200 && y > 200 ? 0 : 255], (y * 256 + x) * 4);
  const big = new Uint8Array(1_500_000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 7 + (i >> 9) * 13 + Math.floor(r() * 4)) & 255;
  return { empty: new Uint8Array(0), one: Uint8Array.of(42), zeros: new Uint8Array(100000), noise, text, tile, big };
}

describe.skipIf(!hasZstd)('zstd decoder', () => {
  for (const [name, data] of Object.entries(samples())) {
    for (const level of [1, 3, 9, 19]) {
      it(`${name} at level ${level}`, () => {
        const packed = compress(data, level);
        expect(isZstd(packed)).toBe(true);
        const out = zstdDecompress(packed, data.length);
        expect(out.length).toBe(data.length);
        expect(Buffer.from(out).equals(Buffer.from(data))).toBe(true);
      });
    }
  }

  it('reads concatenated frames and skips skippable ones', () => {
    const a = new TextEncoder().encode('hello ');
    const b = new TextEncoder().encode('world');
    const skippable = Uint8Array.of(0x50, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, 1, 2, 3);
    const joined = new Uint8Array([...compress(a), ...skippable, ...compress(b)]);
    expect(new TextDecoder().decode(zstdDecompress(joined))).toBe('hello world');
  });

  it('refuses data that is not zstd or is cut short', () => {
    expect(() => zstdDecompress(Uint8Array.of(1, 2, 3, 4, 5))).toThrow(/zstd/);
    const packed = compress(samples().text);
    expect(() => zstdDecompress(packed.subarray(0, packed.length - 10))).toThrow(/zstd/);
  });
});
