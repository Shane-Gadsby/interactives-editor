import { describe, expect, it } from 'vitest';
import { unzlibSync, zlibSync } from 'fflate';
import { encodePng, importPsd, isPsd, parsePsd, type PsdGroup, type PsdLayer } from '../src/lib/psd-import';

// ---------------------------------------------------------------- a tiny PSD writer (8 bit RGB)

const enc = new TextEncoder();
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};
const u16 = (n: number) => new Uint8Array([(n >> 8) & 255, n & 255]);
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const pad = (b: Uint8Array, to: number) => cat(b, new Uint8Array((to - (b.length % to)) % to));
const ascii = (s: string) => enc.encode(s);
const utf16 = (s: string) => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) (out[i * 2] = s.charCodeAt(i) >> 8), (out[i * 2 + 1] = s.charCodeAt(i) & 255);
  return out;
};

function packBitsRow(row: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && row[i + run] === row[i] && run < 128) run++;
    if (run >= 2) {
      out.push(257 - run, row[i]);
      i += run;
    } else {
      let lit = 1;
      while (i + lit < row.length && lit < 128 && !(row[i + lit] === row[i + lit + 1])) lit++;
      out.push(lit - 1, ...row.slice(i, i + lit));
      i += lit;
    }
  }
  return out;
}

type Comp = 'raw' | 'rle' | 'zip' | 'zipPredict';

/** A channel's 8 bit samples (w*h) as the bytes after the compression header. */
function channelBytes(samples: number[], w: number, h: number, comp: Comp): Uint8Array {
  if (comp === 'raw') return new Uint8Array(samples);
  if (comp === 'zip') return zlibSync(new Uint8Array(samples));
  if (comp === 'zipPredict') {
    const d = samples.slice();
    for (let y = 0; y < h; y++) for (let x = w - 1; x > 0; x--) d[y * w + x] = (samples[y * w + x] - samples[y * w + x - 1]) & 255;
    return zlibSync(new Uint8Array(d));
  }
  const rows: number[][] = [];
  for (let y = 0; y < h; y++) rows.push(packBitsRow(samples.slice(y * w, (y + 1) * w)));
  return cat(...rows.map((r) => u16(r.length)), ...rows.map((r) => new Uint8Array(r)));
}
const compCode: Record<Comp, number> = { raw: 0, rle: 1, zip: 2, zipPredict: 3 };

interface TestLayer {
  name: string;
  left?: number;
  top?: number;
  w?: number;
  h?: number;
  /** RGBA per pixel, row by row */
  rgba?: number[];
  comp?: Comp;
  blend?: string;
  opacity?: number;
  hidden?: boolean;
  clipped?: boolean;
  unicodeName?: string;
  section?: number;
  text?: string;
  fillOpacity?: number;
  mask?: { top: number; left: number; w: number; h: number; samples: number[]; def: number };
}

function block(key: string, data: Uint8Array): Uint8Array {
  return cat(ascii('8BIM'), ascii(key), u32(data.length), pad(data, 4));
}

function buildPsd(layers: TestLayer[], opts: { width: number; height: number; compositeRgb?: number[]; skipLayers?: boolean; compositeComp?: 0 | 1 } = { width: 4, height: 4 }): Uint8Array {
  const records: Uint8Array[] = [];
  const data: Uint8Array[] = [];
  for (const l of layers) {
    const w = l.w ?? 0;
    const h = l.h ?? 0;
    const comp = l.comp ?? 'raw';
    const rgba = l.rgba ?? [];
    const chans: { id: number; samples: number[]; w: number; h: number }[] = [];
    if (w && h) {
      for (const [id, k] of [[-1, 3], [0, 0], [1, 1], [2, 2]] as const) chans.push({ id, samples: rgba.filter((_, i) => i % 4 === k), w, h });
      if (l.mask) chans.push({ id: -2, samples: l.mask.samples, w: l.mask.w, h: l.mask.h });
    }
    const chanData = chans.map((c) => cat(u16(compCode[comp]), channelBytes(c.samples, c.w, c.h, comp)));
    const blocks: Uint8Array[] = [];
    if (l.unicodeName) blocks.push(block('luni', cat(u32(l.unicodeName.length), utf16(l.unicodeName))));
    if (l.section !== undefined) blocks.push(block('lsct', cat(u32(l.section), ascii('8BIM'), ascii('norm'))));
    if (l.fillOpacity !== undefined) blocks.push(block('iOpa', new Uint8Array([l.fillOpacity, 0, 0, 0])));
    if (l.text !== undefined) {
      // not a real descriptor, but the key / type / length / UTF-16 run is what the reader looks for
      blocks.push(block('TySh', cat(u16(1), new Uint8Array(48), u32(0), ascii('Txt '), ascii('TEXT'), u32(l.text.length + 1), utf16(l.text + '\0'), u32(0))));
    }
    const name = pad(cat(new Uint8Array([l.name.length]), ascii(l.name)), 4);
    const maskBytes = l.mask
      ? cat(u32(l.mask.top), u32(l.mask.left), u32(l.mask.top + l.mask.h), u32(l.mask.left + l.mask.w), new Uint8Array([l.mask.def, 0, 0, 0]))
      : new Uint8Array(0);
    const extra = cat(u32(maskBytes.length), maskBytes, u32(0), name, ...blocks);
    const top = l.top ?? 0;
    const left = l.left ?? 0;
    records.push(
      cat(
        u32(top), u32(left), u32(top + h), u32(left + w),
        u16(chans.length),
        ...chans.map((c, i) => cat(new Uint8Array([(c.id >> 8) & 255, c.id & 255]), u32(chanData[i].length))),
        ascii('8BIM'), ascii(l.blend ?? 'norm'),
        new Uint8Array([l.opacity ?? 255, l.clipped ? 1 : 0, l.hidden ? 2 : 0, 0]),
        u32(extra.length), extra,
      ),
    );
    data.push(...chanData);
  }
  const info = pad(cat(u16(layers.length), ...records, ...data), 2);
  const layerArea = opts.skipLayers ? new Uint8Array(0) : cat(u32(info.length), info, u32(0));
  // the flattened picture
  const px = opts.width * opts.height;
  const rgb = opts.compositeRgb ?? new Array(px * 3).fill(128);
  const composite = cat(u16(0), new Uint8Array(rgb));
  return cat(
    ascii('8BPS'), u16(1), new Uint8Array(6), u16(3), u32(opts.height), u32(opts.width), u16(8), u16(3),
    u32(0), // colour mode data
    u32(0), // image resources
    u32(layerArea.length), layerArea,
    composite,
  );
}

// ---------------------------------------------------------------- PNG decoder for the round trip

function crcOf(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  const types: string[] = [];
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    const body = png.subarray(p + 8, p + 8 + len);
    expect(view.getUint32(p + 8 + len)).toBe(crcOf(png.subarray(p + 4, p + 8 + len)));
    types.push(type);
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      expect([body[8], body[9]]).toEqual([8, 6]);
    }
    if (type === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
  const raw = unzlibSync(cat(...idat));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 4 + 1)]).toBe(0);
    rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  }
  return { width, height, rgba };
}

// ---------------------------------------------------------------- tests

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
const solid = (n: number, c: number[]) => Array.from({ length: n }, () => c).flat();

/** Bottom to top: Base (raw), Inner inside "Folder" (RLE, hidden, unicode name). */
function sample(): Uint8Array {
  return buildPsd(
    [
      { name: 'Base', left: 0, top: 0, w: 4, h: 4, rgba: solid(16, px(200, 100, 50)), comp: 'raw', blend: 'mul ', opacity: 204 },
      { name: '</Layer group>', section: 3 },
      { name: 'Inner', unicodeName: 'Inner éè', left: 1, top: 1, w: 2, h: 2, rgba: [...px(1, 2, 3), ...px(1, 2, 3), ...px(9, 8, 7, 128), ...px(9, 8, 7, 0)], comp: 'rle', hidden: true },
      { name: 'Folder', section: 1, opacity: 128, blend: 'pass' },
    ],
    { width: 4, height: 4 },
  );
}

describe('PSD import', () => {
  it('recognises the signature', () => {
    expect(isPsd(sample())).toBe(true);
    expect(isPsd(new Uint8Array(40))).toBe(false);
    expect(() => parsePsd(new Uint8Array(40))).toThrow(/not a Photoshop/);
  });

  it('reads the layer tree', () => {
    const doc = parsePsd(sample());
    expect([doc.width, doc.height, doc.depth, doc.mode]).toEqual([4, 4, 8, 3]);
    expect(doc.nodes).toHaveLength(2);
    const [base, folder] = doc.nodes as [PsdLayer, PsdGroup];
    expect(base.kind).toBe('layer');
    expect(base.name).toBe('Base');
    expect(base.blendMode).toBe('multiply');
    expect(base.opacity).toBeCloseTo(0.8, 2);
    expect(base.visible).toBe(true);
    expect(folder.kind).toBe('group');
    expect(folder.name).toBe('Folder');
    expect(folder.open).toBe(true);
    expect(folder.opacity).toBeCloseTo(0.502, 2);
    expect(folder.blendMode).toBe('normal');
    expect(folder.blendUnsupported).toBe(false);
    expect(folder.children).toHaveLength(1);
    const inner = folder.children[0] as PsdLayer;
    expect(inner.name).toBe('Inner éè');
    expect(inner.visible).toBe(false);
    expect([inner.left, inner.top, inner.width, inner.height]).toEqual([1, 1, 2, 2]);
    expect(doc.composite).toBeNull();
  });

  it('decodes raw and RLE pixels', () => {
    const doc = parsePsd(sample());
    const [base, folder] = doc.nodes as [PsdLayer, PsdGroup];
    expect([...base.getPixels().subarray(0, 8)]).toEqual([200, 100, 50, 255, 200, 100, 50, 255]);
    expect(base.getPixels()).toHaveLength(64);
    const inner = folder.children[0] as PsdLayer;
    expect([...inner.getPixels()]).toEqual([1, 2, 3, 255, 1, 2, 3, 255, 9, 8, 7, 128, 9, 8, 7, 0]);
  });

  it('decodes ZIP channels, with and without prediction', () => {
    const rgba = [...px(10, 20, 30), ...px(40, 50, 60), ...px(70, 80, 90), ...px(100, 110, 120), ...px(130, 140, 150), ...px(160, 170, 180)];
    for (const comp of ['zip', 'zipPredict'] as const) {
      const doc = parsePsd(buildPsd([{ name: 'Z', w: 3, h: 2, rgba, comp }], { width: 3, height: 2 }));
      expect([...(doc.nodes[0] as PsdLayer).getPixels()]).toEqual(rgba);
    }
  });

  it('applies a layer mask', () => {
    const doc = parsePsd(
      buildPsd([{ name: 'M', w: 2, h: 1, rgba: [...px(5, 5, 5), ...px(5, 5, 5)], mask: { top: 0, left: 1, w: 1, h: 1, samples: [51], def: 255 } }], { width: 2, height: 1 }),
    );
    expect([...(doc.nodes[0] as PsdLayer).getPixels()]).toEqual([5, 5, 5, 255, 5, 5, 5, 51]);
  });

  it('reads text, fill opacity, clipping and unsupported blend modes', () => {
    const doc = parsePsd(
      buildPsd(
        [
          { name: 'T', w: 1, h: 1, rgba: px(0, 0, 0), text: 'Hello\rworld', fillOpacity: 128, blend: 'sLit', clipped: true },
        ],
        { width: 1, height: 1 },
      ),
    );
    const t = doc.nodes[0] as PsdLayer;
    expect(t.text).toBe('Hello\rworld');
    expect(t.opacity).toBeCloseTo(0.502, 2);
    expect(t.blendMode).toBe('normal');
    expect(t.blendUnsupported).toBe(true);
    expect(t.clipped).toBe(true);
    expect(doc.warnings.join(' ')).toMatch(/Clipping/);
  });

  it('uses planar composite data and the picture saved in the file', () => {
    // planar: all R, then all G, then all B
    const planar = [255, 0, 0, 10, /* G */ 0, 255, 0, 20, /* B */ 0, 0, 255, 30];
    const doc = parsePsd(buildPsd([], { width: 2, height: 2, compositeRgb: planar }));
    expect(doc.composite).not.toBeNull();
    expect([...doc.composite!]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255]);
    expect(doc.nodes).toHaveLength(1);
    expect((doc.nodes[0] as PsdLayer).name).toBe('Background');
  });

  it('falls back to the composite for CMYK with a warning', () => {
    const base = buildPsd([], { width: 1, height: 1, compositeRgb: [100, 150, 200, 255] });
    const cmyk = base.slice();
    // colour mode lives at header offset 24
    cmyk[24] = 0;
    cmyk[25] = 4;
    // channels 3 -> 4
    cmyk[13] = 4;
    const doc = parsePsd(cmyk);
    expect(doc.warnings.join(' ')).toMatch(/CMYK/);
    expect([...doc.composite!]).toEqual([Math.round((100 * 255) / 255), Math.round((150 * 255) / 255), Math.round((200 * 255) / 255), 255]);
  });

  it('rejects damaged files with a readable error', () => {
    const bytes = sample();
    expect(() => parsePsd(bytes.subarray(0, 120))).toThrow(/damaged|cut short/);
  });

  it('encodes a PNG that decodes back to the same pixels', () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253, 0, 0, 0, 0, 255, 255, 255, 255, 9, 9, 9, 9, 8, 8, 8, 8]);
    const png = encodePng(3, 2, rgba);
    const back = decodePng(png);
    expect([back.width, back.height]).toEqual([3, 2]);
    expect([...back.rgba]).toEqual([...rgba]);
  });

  it('builds an artboard with image layers, groups and PNG assets', () => {
    const imp = importPsd(sample(), 'poster');
    const ab = imp.artboard;
    expect(ab.name).toBe('poster');
    expect([ab.width, ab.height]).toEqual([4, 4]);
    expect(ab.children).toHaveLength(2);
    const [base, folder] = ab.children;
    expect(base.type).toBe('image');
    expect(base.name).toBe('Base');
    expect(base.blendMode).toBe('multiply');
    expect(base.opacity).toBeCloseTo(0.8, 2);
    expect(folder.type).toBe('group');
    if (folder.type !== 'group') throw new Error('group expected');
    expect(folder.opacity).toBeCloseTo(0.502, 2);
    expect(folder.children).toHaveLength(1);
    const inner = folder.children[0];
    expect(inner.type).toBe('image');
    expect(inner.visible).toBe(false);
    // the group wraps its child, which is placed relative to it
    expect([folder.x, folder.y, folder.width, folder.height]).toEqual([1, 1, 2, 2]);
    expect([inner.x, inner.y]).toEqual([0, 0]);
    expect(imp.assets).toHaveLength(2);
    for (const a of imp.assets) expect(a.mime).toBe('image/png');
    const innerAsset = imp.assets.find((a) => a.id === (inner as { assetId: string }).assetId)!;
    const png = decodePng(innerAsset.bytes);
    expect([png.width, png.height]).toEqual([2, 2]);
    expect([...png.rgba]).toEqual([1, 2, 3, 255, 1, 2, 3, 255, 9, 8, 7, 128, 9, 8, 7, 0]);
  });

  it('names text layers after their text and reports what is lost', () => {
    const imp = importPsd(
      buildPsd(
        [
          { name: '', w: 1, h: 1, rgba: px(1, 1, 1), text: 'Big title' },
          { name: 'Soft', w: 1, h: 1, rgba: px(1, 1, 1), blend: 'sLit' },
          { name: 'Empty' },
        ],
        { width: 2, height: 2 },
      ),
      'x',
    );
    expect(imp.artboard.children.map((c) => c.name)).toEqual(['Big title', 'Soft']);
    expect((imp.artboard.children[0] as { ariaLabel?: string }).ariaLabel).toBe('Big title');
    expect(imp.warnings.join(' ')).toMatch(/soft light/);
    expect(imp.warnings.join(' ')).toMatch(/empty layer/);
  });

  it('handles nested groups and empty groups', () => {
    const imp = importPsd(
      buildPsd(
        [
          { name: '</Layer group>', section: 3 },
          { name: '</Layer group>', section: 3 },
          { name: 'Deep', left: 2, top: 2, w: 1, h: 1, rgba: px(1, 1, 1) },
          { name: 'Inner folder', section: 2 },
          { name: 'Outer folder', section: 1 },
          { name: '</Layer group>', section: 3 },
          { name: 'Empty folder', section: 2 },
          { name: 'Top', left: 0, top: 0, w: 1, h: 1, rgba: px(2, 2, 2) },
        ],
        { width: 4, height: 4 },
      ),
      'nest',
    );
    const [outer, top] = imp.artboard.children;
    expect(imp.artboard.children).toHaveLength(2);
    expect(top.name).toBe('Top');
    if (outer.type !== 'group') throw new Error('group expected');
    expect(outer.name).toBe('Outer folder');
    const inner = outer.children[0];
    if (inner.type !== 'group') throw new Error('group expected');
    expect(inner.name).toBe('Inner folder');
    expect([outer.x, outer.y, inner.x, inner.y, inner.children[0].x]).toEqual([2, 2, 0, 0, 0]);
  });
});
