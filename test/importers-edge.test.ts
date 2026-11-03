//Every importer, fed the awkward inputs real people have: empty files, whitespace, huge dimensions, nonsense numbers,
//unicode and RTL names, very deep nesting, circular references. The contract is the same each time: either a
//document made only of finite numbers and unique ids, or an Error with a message a person can read (never a
//TypeError, RangeError or a hang from inside the parser).
import { describe, expect, it, vi } from 'vitest';
import type { Artboard, SceneNode } from 'interactives-player';
import { importSvg } from '../src/lib/svg-import';
import { importLottie } from '../src/lib/lottie-import';
import { importDxf } from '../src/lib/dxf-import';
import { importPsd } from '../src/lib/psd-import';
import { importAi } from '../src/lib/ai-import';
import { importRive } from '../src/lib/rive-import';
import { importVectorCraft } from '../src/lib/vectorcraft-import';
import { importPhotoCraft } from '../src/lib/photocraft-import';
import { importDwg } from '../src/lib/dwg-import';
import { readAnimationFile } from '../src/lib/importers';

//the exporter embeds the player's built bundle, which an import never needs
vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));

const enc = new TextEncoder();

/** jsdom's File has no arrayBuffer(), so give the importer what it reads. */
const fileOf = (data: Uint8Array | string, name: string) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as File;
};

/** Paths of every non-finite number in a value (JSON.stringify would hide them as null). */
function allFinite(root: unknown): string[] {
  const bad: string[] = [];
  const visit = (v: unknown, path: string) => {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path);
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, `${path}.${k}`);
  };
  visit(root, 'value');
  return bad.slice(0, 5);
}

/** Every number finite, every layer id unique within the artboard, names are strings. */
function sound(ab: Artboard, label: string) {
  const ids = new Set<string>();
  expect(allFinite(ab), `${label}: non-finite numbers`).toEqual([]);
  const walkNodes = (list: SceneNode[]) => {
    for (const n of list) {
      expect(typeof n.name, `${label}: name of ${n.id}`).toBe('string');
      expect(ids.has(n.id), `${label}: duplicate id ${n.id}`).toBe(false);
      ids.add(n.id);
      if ('children' in n && Array.isArray(n.children)) walkNodes(n.children as SceneNode[]);
    }
  };
  walkNodes(ab.children);
  expect(ab.width, `${label}: width`).toBeGreaterThan(0);
  expect(ab.height, `${label}: height`).toBeGreaterThan(0);
}

/** Runs an importer: a sound artboard, or a readable Error. Returns the artboard when there is one. */
async function tidy(label: string, run: () => unknown | Promise<unknown>): Promise<Artboard | null> {
  let out: any;
  try {
    out = await run();
  } catch (e) {
    expect(e, `${label}: threw something that is not an Error`).toBeInstanceOf(Error);
    expect(e, `${label}: leaked ${(e as Error).name}: ${(e as Error).message}`).not.toBeInstanceOf(TypeError);
    expect(e, `${label}: leaked ${(e as Error).name}: ${(e as Error).message}`).not.toBeInstanceOf(RangeError);
    expect((e as Error).message.length, `${label}: empty message`).toBeGreaterThan(3);
    return null;
  }
  const abs: Artboard[] = out?.artboards ?? (out?.artboard ? [out.artboard] : []);
  for (const ab of abs) sound(ab, label);
  return abs[0] ?? null;
}

describe('empty and tiny files', () => {
  const empties: [string, string][] = [
    ['empty.psd', ''],
    ['empty.ai', ''],
    ['empty.pdf', ''],
    ['empty.dxf', ''],
    ['empty.dwg', ''],
    ['empty.riv', ''],
    ['empty.json', ''],
    ['empty.lottie', ''],
    ['empty.vectorcraft', ''],
    ['empty.drawcraft', ''],
    ['empty.pcraft', ''],
    ['noextension', ''],
    ['spaces.json', '   \n\t '],
    ['null.json', 'null'],
    ['array.json', '[]'],
    ['object.json', '{}'],
    ['string.json', '"hi"'],
    ['one byte.psd', '8'],
    ['header only.psd', '8BPS'],
    ['header only.pdf', '%PDF-'],
    ['header only.riv', 'RIVE'],
  ];
  it.each(empties)('readAnimationFile(%s) fails readably or imports soundly', async (name, content) => {
    await tidy(name, () => readAnimationFile(fileOf(content, name)));
  });

  it('names the problem when a file is not one of the kinds it knows', async () => {
    await expect(readAnimationFile(fileOf('hello', 'notes.txt'))).rejects.toThrow(/./);
  });

  it('each importer, called directly with no bytes', async () => {
    const none = new Uint8Array(0);
    await tidy('psd', () => importPsd(none, 'x'));
    await tidy('ai', () => importAi(none, 'x'));
    await tidy('dxf', () => importDxf(none, 'x'));
    await tidy('dwg', () => importDwg(none, 'x'));
    await tidy('rive', () => importRive(none, 'x'));
    await tidy('vectorcraft', () => importVectorCraft(none, 'x'));
    await tidy('photocraft', () => importPhotoCraft(none, 'x'));
  });
});

describe('SVG', () => {
  const svg = (attrs: string, body = '<rect width="10" height="10"/>') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

  it.each(['', '   ', 'not xml at all', '<svg', '<html><body>hi</body></html>', '<?xml version="1.0"?>'])('refuses %j as not an SVG', (text) => {
    expect(() => importSvg(text)).toThrow('That file is not a readable SVG.');
  });

  it('imports an SVG with nothing in it as no layers', () => {
    expect(importSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>').nodes).toEqual([]);
  });

  it('keeps finite sizes whatever the width, height and viewBox say', () => {
    for (const attrs of ['width="1e308" height="1e308"', 'width="-5" height="-5"', 'width="NaN" height="Infinity"', 'viewBox="0 0 0 0"', 'viewBox="0 0 -10 -10"', 'viewBox="a b c d"', 'viewBox="0 0 1e9 1e9" width="100%" height="100%"', 'width="0" height="0"']) {
      const r = importSvg(svg(attrs));
      expect(Number.isFinite(r.width), attrs).toBe(true);
      expect(Number.isFinite(r.height), attrs).toBe(true);
      expect(allFinite(r.nodes), attrs).toEqual([]);
    }
  });

  it('survives path data that is broken, empty, or has absurd numbers', () => {
    for (const d of ['', 'M', 'M 10', 'M 10 10 L', 'L 10 10', 'M 0 0 A 0 0 0 0 0 10 10', 'M 0 0 A 1e308 1e308 0 1 1 1e308 1e308', 'M 1e999 1e999 L 5 5', 'M 0 0 C 1 1 2 2', 'M 0 0 z z z', 'M0,0L10,10,20,20,30', 'X 1 2', 'M 0 0 h', 'M NaN NaN']) {
      expect(() => importSvg(svg('width="100" height="100"', `<path d="${d}"/>`)), d).not.toThrow();
      const r = importSvg(svg('width="100" height="100"', `<path d="${d}"/>`));
      expect(allFinite(r.nodes), d).toEqual([]);
    }
  });

  it('keeps unicode, right-to-left and emoji names and text exactly', () => {
    const names = ['日本語レイヤー', 'مرحبا بالعالم', '🎨 Layer 🚀', 'Zoë "quoted" & <angled>', 'a'.repeat(500)];
    const body = names.map((n, i) => `<g id="${n.replace(/[<>"&]/g, '_')}"><text x="${i}" y="20">${n.replace(/[<>&]/g, '_')}</text></g>`).join('');
    const r = importSvg(svg('width="200" height="200"', body));
    const text = JSON.stringify(r.nodes);
    expect(text).toContain('日本語レイヤー');
    expect(text).toContain('مرحبا بالعالم');
    expect(text).toContain('🎨 Layer 🚀');
  });

  it('copes with deep nesting and a very large number of shapes', () => {
    const depth = 300;
    const deep = '<g>'.repeat(depth) + '<rect width="5" height="5"/>' + '</g>'.repeat(depth);
    expect(() => importSvg(svg('width="10" height="10"', deep))).not.toThrow();
    const many = '<rect width="1" height="1"/>'.repeat(3000);
    const r = importSvg(svg('width="100" height="100"', many));
    expect(r.nodes.length).toBeGreaterThan(0);
  });

  it('does not loop on a gradient or <use> that refers to itself', () => {
    const body = '<defs><linearGradient id="a" xlink:href="#a"><stop offset="0" stop-color="red"/></linearGradient><g id="g"><use xlink:href="#g"/></g></defs><rect width="5" height="5" fill="url(#a)"/><use xlink:href="#g"/>';
    expect(() => importSvg(svg('xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"', body))).not.toThrow();
  });
});

describe('Lottie', () => {
  const base = (over: Record<string, unknown> = {}) => ({ v: '5.7.4', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 'T', ddd: 0, assets: [], layers: [], ...over });
  const shapeLayer = (over: Record<string, unknown> = {}) => ({ ty: 4, ind: 1, nm: 'L', ip: 0, op: 60, st: 0, ks: { p: { a: 0, k: [10, 10] } }, shapes: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [10, 10] }, r: { a: 0, k: 0 } }, { ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } }], ...over });

  it.each([null, undefined, 5, 'x', [], {}, { layers: 'no' }, { layers: [], fr: '30', w: 1 }])('refuses %j as "not a Lottie"', (v) => {
    expect(() => importLottie(v as never)).toThrow(/Not a Lottie/);
  });

  it('imports a file with no layers as an empty artboard of the right size', () => {
    const { artboard } = importLottie(base({ w: 320, h: 240 }));
    expect([artboard.width, artboard.height, artboard.children.length]).toEqual([320, 240, 0]);
  });

  it.each([
    ['huge canvas', { w: 1e9, h: 1e9 }],
    ['zero rate', { fr: 0 }],
    ['negative rate', { fr: -30 }],
    ['out before in', { ip: 100, op: 10 }],
    ['fractional size', { w: 100.6, h: 33.3 }],
    ['nan-ish numbers', { ip: 'abc', op: null }],
    ['unicode name', { nm: '日本語 🎬 مرحبا' }],
    ['no name', { nm: undefined }],
  ])('%s: a sound artboard or a readable error', async (label, over) => {
    await tidy(label, () => importLottie(base({ ...over, layers: [shapeLayer()] })));
  });

  it('keeps a unicode composition name', () => {
    const { artboard } = importLottie(base({ nm: '日本語 🎬 مرحبا' }));
    expect(artboard.name).toBe('日本語 🎬 مرحبا');
  });

  it('does not loop on a precomp that contains itself, or refers to one that is not there', async () => {
    const comp = { id: 'c1', layers: [{ ty: 0, ind: 1, nm: 'self', refId: 'c1', w: 10, h: 10, ip: 0, op: 60, st: 0, ks: {} }] };
    await tidy('self-referencing precomp', () => importLottie(base({ assets: [comp], layers: [{ ty: 0, ind: 1, nm: 'use', refId: 'c1', w: 10, h: 10, ip: 0, op: 60, st: 0, ks: {} }] })));
    await tidy('missing precomp', () => importLottie(base({ layers: [{ ty: 0, ind: 1, nm: 'use', refId: 'ghost', w: 10, h: 10, ip: 0, op: 60, st: 0, ks: {} }] })));
  });

  it('survives keyframes that are not numbers, are out of order, or are empty', async () => {
    const kf = (k: unknown) => shapeLayer({ ks: { p: { a: 1, k }, o: { a: 1, k }, r: { a: 1, k }, s: { a: 1, k } } });
    for (const k of [[], [{}], [{ t: 'x', s: ['y'] }], [{ t: 30, s: [1, 2] }, { t: 0, s: [3, 4] }], [{ t: 0, s: [1e308, -1e308] }, { t: 1e9, s: [0, 0] }], null, 'oops']) {
      await tidy(`keyframes ${JSON.stringify(k)}`, () => importLottie(base({ layers: [kf(k)] })));
    }
  });

  it('copes with a thousand layers', async () => {
    const layers = Array.from({ length: 1000 }, (_, i) => shapeLayer({ ind: i + 1, nm: `layer ${i}` }));
    const ab = await tidy('1000 layers', () => importLottie(base({ layers })));
    expect(ab!.children.length).toBeGreaterThan(900);
  });
});

describe('DXF', () => {
  const dxf = (entities: string, header = '') => `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1027\n${header}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
  const line = (x1: unknown, y1: unknown, x2: unknown, y2: unknown, layer = '0') => `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}\n`;

  it.each([
    ['not numbers', line('abc', 'def', 'ghi', 'jkl')],
    ['huge coordinates', line(0, 0, 1e300, 1e300)],
    ['negative huge', line(-1e300, -1e300, 1e300, 1e300)],
    ['all at one point', line(5, 5, 5, 5)],
    ['empty entity list', ''],
    ['unicode layer', line(0, 0, 10, 10, '图层 ✓ مرحبا')],
    ['very long layer name', line(0, 0, 10, 10, 'L'.repeat(5000))],
    ['circle with no radius', '0\nCIRCLE\n8\n0\n10\n0\n20\n0\n'],
    ['circle with a huge radius', '0\nCIRCLE\n8\n0\n10\n0\n20\n0\n40\n1e300\n'],
    ['truncated entity', '0\nLINE\n8\n0\n10\n'],
    ['unknown entities', '0\nWIBBLE\n8\n0\n0\nTHING\n'],
  ])('%s: sound or readable', async (label, entities) => {
    await tidy(`dxf ${label}`, () => importDxf(enc.encode(dxf(entities)), 'plan'));
  });

  it('keeps a unicode layer name', () => {
    const imp = importDxf(enc.encode(dxf(line(0, 0, 10, 10, '图层 ✓'))), 'plan');
    expect(JSON.stringify(imp.artboard)).toContain('图层 ✓');
  });

  it('copes with a drawing of ten thousand lines', async () => {
    const entities = Array.from({ length: 10000 }, (_, i) => line(i, 0, i, 100, `L${i % 20}`)).join('');
    const ab = await tidy('10k lines', () => importDxf(enc.encode(dxf(entities)), 'plan'));
    expect(ab).not.toBeNull();
  });

  it('handles a file with Windows line endings, a BOM and trailing blanks', async () => {
    const text = '\ufeff' + dxf(line(0, 0, 10, 10)).replace(/\n/g, '\r\n') + '\r\n\r\n';
    await tidy('crlf bom', () => importDxf(enc.encode(text), 'plan'));
  });
});

describe('VectorCraft and PhotoCraft', () => {
  it.each(['{}', '[]', 'null', '{"version":1}', '{"artboards":[]}', '{"artboards":"x"}', '{"layers":null}', '{"nodes":[{}]}', '\u{1F4A5}'])('VectorCraft %j', async (text) => {
    await tidy(`vectorcraft ${text}`, () => importVectorCraft(enc.encode(text), 'x'));
  });

  it('PhotoCraft: a zip that is not a PhotoCraft file, and a truncated zip header', async () => {
    await tidy('truncated zip', () => importPhotoCraft(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'x'));
    await tidy('empty zip', () => importPhotoCraft(new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]), 'x'));
  });
});

describe('binary formats with a valid-looking start and nothing after it', () => {
  const pad = (head: number[], n = 64) => new Uint8Array([...head, ...new Array(n).fill(0)]);
  it('PSD header with zero sizes', async () => {
    await tidy('psd zeros', () => importPsd(pad([0x38, 0x42, 0x50, 0x53, 0, 1]), 'x'));
  });
  it('PSD header with a canvas of billions of pixels', async () => {
    //signature, version 1, 6 reserved, channels 3, height and width 0x7fffffff, depth 8, colour mode RGB
    const h = new Uint8Array(26);
    h.set([0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0x7f, 0xff, 0xff, 0xff, 0x7f, 0xff, 0xff, 0xff, 0, 8, 0, 3]);
    await tidy('psd huge', () => importPsd(new Uint8Array([...h, ...new Array(40).fill(0)]), 'x'));
  });
  it('PDF with a header and no body', async () => {
    await tidy('pdf header', () => importAi(enc.encode('%PDF-1.4\n%%EOF\n'), 'x'));
    await tidy('pdf junk', () => importAi(enc.encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 9 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'), 'x'));
  });
  it('Rive file with the right magic and nothing else', async () => {
    await tidy('riv magic', () => importRive(new Uint8Array([0x52, 0x49, 0x56, 0x45, 7, 0, 0, 0, 0]), 'x'));
  });
});
