// @vitest-environment node
//The help is shot in the light theme. A picture whose editor is dark was taken in the wrong theme, so this fails on it.
//Dark on purpose: name the file in ALLOW in scripts/check-help-images.mjs, with the reason.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script, no types
import { ALLOW, LIMITS, darkPictures, lumaOf } from '../scripts/check-help-images.mjs';

const HELP = resolve(__dirname, '../public/help');

describe('help pictures are shot in the light theme', () => {
  it('has no dark picture', () => {
    const bad = darkPictures(HELP) as { name: string; whole: number; corner: number }[];
    expect(bad.map((m) => `${m.name} (whole ${m.whole.toFixed(0)}, corner ${m.corner.toFixed(0)})`)).toEqual([]);
  });

  it('every allowed dark picture still exists', () => {
    const names = new Set(readdirSync(HELP));
    for (const n of Object.keys(ALLOW)) expect(names.has(n), `${n} is on the allow list but is not in public/help`).toBe(true);
  });

  it('reads a dark picture as dark', async () => {
    //a 2x2 black png
    const { deflateSync } = await import('node:zlib');
    const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
    const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(2 * (1 + 6)))), chunk('IEND', Buffer.alloc(0))]);
    const { luma } = lumaOf(png);
    expect(Math.max(...luma)).toBe(0);
    expect(LIMITS.whole).toBeGreaterThan(0);
  });
});
