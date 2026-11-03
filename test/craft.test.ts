import 'fake-indexeddb/auto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import zlib from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { gzipSync, unzlibSync, zipSync } from 'fflate';
import { walk, type Artboard, type ImageNode, type PathNode, type SceneNode, type TextNode } from 'interactives-player';
import { importVectorCraft, isVectorCraft, parseVectorCraft, repeatTransforms, vcColor } from '../src/lib/vectorcraft-import';
import { importPhotoCraft, isPhotoCraft, pcColor, readPhotoCraft } from '../src/lib/photocraft-import';
import { DESIGN_EXTENSIONS, KIND_LABEL, designKind, isDesignFile } from '../src/lib/links';
import { ANIMATION_ACCEPT, readAnimationFile } from '../src/lib/importers';

// importers.ts pulls in the built player bundle for exports, which a test run doesn't need
vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));

const enc = new TextEncoder();
const all = (a: Artboard | Artboard[]): SceneNode[] => {
  const out: SceneNode[] = [];
  for (const b of Array.isArray(a) ? a : [a]) walk(b.children, (n) => out.push(n));
  return out;
};
const ofType = <T extends SceneNode['type']>(a: Artboard | Artboard[], t: T) => all(a).filter((n) => n.type === t) as Extract<SceneNode, { type: T }>[];

/** Where a node sits on its artboard: its own offset plus those of the groups around it. */
function absPos(ab: Artboard, node: SceneNode): { x: number; y: number } {
  const find = (list: SceneNode[], x: number, y: number): { x: number; y: number } | null => {
    for (const n of list) {
      if (n === node) return { x: x + n.x, y: y + n.y };
      if (n.type === 'group' || n.type === 'frame') {
        const r = find(n.children, x + n.x, y + n.y);
        if (r) return r;
      }
    }
    return null;
  };
  return find(ab.children, 0, 0) ?? { x: NaN, y: NaN };
}

function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
    }
    if (type === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of idat) (joined.set(c, at), (at += c.length));
  const raw = unzlibSync(joined);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  return { width, height, rgba };
}

/** A real PNG, made the way the importers make them. */
import { encodePng } from '../src/lib/psd-import';
const solidPng = (w: number, h: number, rgba: [number, number, number, number]) => encodePng(w, h, Uint8Array.from({ length: w * h * 4 }, (_, i) => rgba[i % 4]));

// ================================================================ VectorCraft

const sampleDir = `${process.cwd()}/../research/craft/samples/`;
const vcSamples = existsSync(sampleDir) ? readdirSync(sampleDir).filter((f) => f.endsWith('.vectorcraft')) : [];

describe.skipIf(!vcSamples.length)('VectorCraft import (sample files in research/craft/samples)', () => {
  const load = (f: string) => new Uint8Array(readFileSync(sampleDir + f));

  it('reads every sample file', () => {
    for (const f of vcSamples) {
      const bytes = load(f);
      expect(isVectorCraft(bytes)).toBe(true);
      const res = importVectorCraft(bytes, f.replace('.vectorcraft', ''));
      expect(res.artboards.length).toBeGreaterThan(0);
      expect(all(res.artboards).length).toBeGreaterThan(5);
      for (const a of res.artboards) {
        expect(a.width).toBeGreaterThan(0);
        expect(a.height).toBeGreaterThan(0);
      }
    }
  });

  it.skipIf(!vcSamples.includes('dusk-poster.vectorcraft'))('dusk-poster: an artboard named after the file, gradients, text and a glow', () => {
    const res = importVectorCraft(load('dusk-poster.vectorcraft'), 'dusk');
    expect(res.artboards).toHaveLength(1);
    expect(res.artboard.name).toBe('dusk');
    expect([res.artboard.width, res.artboard.height]).toEqual([600, 800]);
    const paths = ofType(res.artboard, 'path');
    expect(paths.some((p) => p.fill?.type === 'linear')).toBe(true);
    expect(paths.some((p) => p.fill?.type === 'radial')).toBe(true);
    const texts = ofType(res.artboard, 'text');
    expect(texts.map((t) => t.text)).toContain('DUSK');
    expect(res.fonts.some((f) => f.family === 'Source Sans 3')).toBe(true);
    expect(all(res.artboard).some((n) => n.shadow)).toBe(true);
    // everything stays inside a sensible area of the artboard
    for (const n of res.artboard.children) {
      expect(n.x).toBeGreaterThan(-100);
      expect(n.y).toBeGreaterThan(-100);
    }
  });

  it.skipIf(!vcSamples.includes('neon-drive.vectorcraft'))('neon-drive: clip groups become masks', () => {
    const res = importVectorCraft(load('neon-drive.vectorcraft'), 'neon');
    const nodes = all(res.artboard);
    expect(nodes.some((n) => n.mask)).toBe(true);
    // a mask comes first in its parent
    walk(res.artboard.children, (n) => {
      if (n.type === 'group' && n.children.some((c) => c.mask)) expect(n.children[0].mask).toBe(true);
    });
  });

  it.skipIf(!vcSamples.includes('ribbons.vectorcraft'))('ribbons: a blend gets its steps', () => {
    const res = importVectorCraft(load('ribbons.vectorcraft'), 'ribbons');
    expect(ofType(res.artboard, 'path').length).toBeGreaterThan(150);
  });

  it.skipIf(!vcSamples.includes('feature-sheet.vectorcraft'))('feature-sheet: one artboard each, repeat copies, meshes, and notes for what was left', () => {
    const res = importVectorCraft(load('feature-sheet.vectorcraft'), 'sheet');
    expect(res.artboards.map((a) => a.name)).toEqual(['sheet - Pathfinder', 'sheet - Gradient Mesh', 'sheet - Repeat', 'sheet - Envelope']);
    expect(res.warnings.join('\n')).toMatch(/Gradient meshes/);
    expect(res.warnings.join('\n')).toMatch(/Envelope/);
    const repeatBoard = res.artboards[2];
    expect(all(repeatBoard).filter((n) => /^Repeat \d+$/.test(n.name)).length).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------- hand-made documents (from the format spec)

const P = (x: number, y: number) => ({ p: [x, y] });
const solid = (r: number, g: number, b: number) => ({ type: 'solid', color: { model: 'rgb', r, g, b } });
const rectPath = (x0: number, y0: number, x1: number, y1: number) => ({ subpaths: [{ anchors: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], closed: true }] });
const app = (fill: unknown = solid(1, 0, 0), stroke: unknown = { type: 'none' }, width = 1) => ({ items: [{ kind: 'fill', paint: fill }, { kind: 'stroke', paint: stroke, width }] });
let nid = 1;
const pathNode = (path: unknown, appearance: unknown = app(), extra: Record<string, unknown> = {}) => ({ id: nid++, appearance, kind: { type: 'path', path }, ...extra });
const group = (children: unknown[], extra: Record<string, unknown> = {}, kind: Record<string, unknown> = {}) => ({ id: nid++, kind: { type: 'group', children, clip: false, ...kind }, ...extra });
const layer = (children: unknown[], name = 'Layer 1', extra: Record<string, unknown> = {}) => ({ id: nid++, name, kind: { type: 'layer', color: { Preset: 0 }, template: false, printable: true, children }, ...extra });
const style = (extra: Record<string, unknown> = {}) => ({ font_family: 'Source Sans 3', font_style: 'Regular', size: 20, tracking: 0, baseline_shift: 0, h_scale: 100, v_scale: 100, rotation: 0, fill: solid(0, 0, 0), stroke: { type: 'none' }, stroke_width: 0, underline: false, strikethrough: false, all_caps: false, ...extra });
const textNode = (runs: unknown[], xf = [1, 0, 0, 1, 100, 100], where: unknown = { kind: 'point' }, para: unknown = { justify: 'Left' }) => ({ id: nid++, kind: { type: 'text', kind: where, xf, runs, para } });
const board = (x1 = 400, y1 = 300, name = 'Artboard 1', x0 = 0, y0 = 0) => ({ id: nid++, name, rect: { x0, y0, x1, y1 } });

function vcFile(layers: unknown[], extra: { artboards?: unknown[]; symbols?: unknown[]; images?: Record<string, unknown>; version?: number; format?: string; doc?: Record<string, unknown> } = {}) {
  return {
    format: extra.format ?? 'vectorcraft',
    version: extra.version ?? 4,
    generator: 'VectorCraft 0.0.0',
    document: { version: 1, title: 'T', units: 'Points', color_mode: 'Rgb', artboards: extra.artboards ?? [board()], layers, symbols: extra.symbols ?? [], images: {}, ...extra.doc },
    images: extra.images ?? {},
  };
}
const json = (o: unknown) => enc.encode(JSON.stringify(o, null, 2));
const vc = (layers: unknown[], extra: Parameters<typeof vcFile>[1] = {}, name = 'doc') => importVectorCraft(json(vcFile(layers, extra)), name);

describe('VectorCraft import (documents built from the format spec)', () => {
  it('turns layers into groups and paths with fills and strokes', () => {
    const res = vc([layer([pathNode(rectPath(10, 20, 110, 70), app(solid(1, 0, 0), solid(0, 0, 1), 4))], 'Shapes')]);
    expect(res.artboard.name).toBe('doc');
    expect([res.artboard.width, res.artboard.height]).toEqual([400, 300]);
    const g = res.artboard.children[0];
    expect(g.type).toBe('group');
    expect(g.name).toBe('Shapes');
    const p = ofType(res.artboard, 'path')[0] as PathNode;
    expect(p.fill).toEqual({ type: 'solid', color: '#ff0000' });
    expect(p.stroke?.width).toBe(4);
    expect(p.stroke?.paint).toEqual({ type: 'solid', color: '#0000ff' });
    expect(g.x + p.x).toBe(10);
    expect(g.y + p.y).toBe(20);
    expect([p.width, p.height]).toEqual([100, 50]);
    expect(p.paths[0].closed).toBe(true);
    expect(p.paths[0].points).toHaveLength(4);
  });

  it('keeps bezier handles (absolute in the file, relative here) and finds the exact bounds', () => {
    const path = { subpaths: [{ anchors: [{ p: [0, 0], out: [0, -50] }, { p: [100, 0], in: [100, -50], kind: 'Smooth' }], closed: false }] };
    const res = vc([layer([pathNode(path, app({ type: 'none' }, solid(0, 0, 0), 2))])]);
    const p = ofType(res.artboard, 'path')[0];
    expect(p.paths[0].points[0].out).toEqual({ x: 0, y: -50 });
    expect(p.paths[0].points[1].in).toEqual({ x: 0, y: -50 });
    // the curve peaks at 3/4 of the handle height, not at the control points
    expect(p.height).toBeCloseTo(37.5, 1);
  });

  it('reads the version 1 anchor form ({x, y} objects) and the DrawCraft name', () => {
    const path = { subpaths: [{ anchors: [{ p: { x: 0, y: 0 } }, { p: { x: 50, y: 0 } }, { p: { x: 50, y: 50 }, in: { x: 40, y: 50 } }], closed: true }] };
    const res = importVectorCraft(json(vcFile([layer([pathNode(path)])], { format: 'drawcraft', version: 1 })), 'old');
    expect(ofType(res.artboard, 'path')[0].paths[0].points).toHaveLength(3);
    expect(res.warnings.join(' ')).toMatch(/DrawCraft/);
  });

  it('reads gzip files and the pictures that follow the JSON after the marker (version 4)', () => {
    const png = solidPng(2, 2, [10, 20, 30, 255]);
    const body = json(vcFile([layer([{ id: 9, kind: { type: 'image', key: 'img1', width: 2, height: 2, xf: [10, 0, 0, 10, 50, 60] } }])], { images: { img1: { mime: 'image/png', blob: [3, png.length] } } }));
    const marker = enc.encode('\n\0VCBLOBS\0');
    const file = new Uint8Array([...body, ...marker, 9, 9, 9, ...png]);
    for (const bytes of [file, gzipSync(file)]) {
      expect(isVectorCraft(bytes)).toBe(true);
      const res = importVectorCraft(bytes, 'pic');
      const img = ofType(res.artboard, 'image')[0] as ImageNode;
      expect(res.assets).toHaveLength(1);
      expect(res.assets[0].bytes).toEqual(png);
      expect(img.assetId).toBe(res.assets[0].id);
      expect([img.width, img.height]).toEqual([20, 20]);
      const g = res.artboard.children[0];
      expect([g.x + img.x, g.y + img.y]).toEqual([50, 60]);
    }
  });

  it('reads pictures given as base64 (versions 1 to 3, and small ones in version 4) and leaves out linked ones that are not saved', () => {
    const png = solidPng(1, 1, [255, 0, 0, 255]);
    const b64 = Buffer.from(png).toString('base64');
    const res = vc([layer([
      { id: 1, kind: { type: 'image', key: 'a', width: 1, height: 1, xf: [4, 0, 0, 4, 0, 0] } },
      { id: 2, kind: { type: 'image', key: 'gone', width: 1, height: 1, xf: [4, 0, 0, 4, 10, 10] } },
    ])], { images: { a: { mime: 'image/png', data: b64 } } });
    expect(ofType(res.artboard, 'image')).toHaveLength(1);
    expect(res.assets[0].bytes).toEqual(png);
    expect(res.warnings.join(' ')).toMatch(/Linked pictures/);
  });

  it('rotated and mirrored pictures keep their transform', () => {
    const b64 = Buffer.from(solidPng(1, 1, [0, 0, 0, 255])).toString('base64');
    const res = vc([layer([{ id: 1, kind: { type: 'image', key: 'a', width: 10, height: 10, xf: [0, 2, -2, 0, 100, 100] } }])], { images: { a: { mime: 'image/png', data: b64 } } });
    const img = ofType(res.artboard, 'image')[0];
    expect(img.rotation).toBe(90);
    expect([img.width, img.height]).toEqual([20, 20]);
    expect(img.originX).toBe(0);
    const flipped = vc([layer([{ id: 1, kind: { type: 'image', key: 'a', width: 10, height: 10, xf: [1, 0, 0, -1, 0, 50] } }])], { images: { a: { mime: 'image/png', data: b64 } } });
    expect(ofType(flipped.artboard, 'image')[0].scaleY).toBe(-1);
  });

  it('turns a clip group into a mask in front of what it clips', () => {
    const clipped = group([pathNode(rectPath(0, 0, 50, 50), app()), pathNode(rectPath(-100, -100, 500, 500), app(solid(0, 1, 0))), pathNode(rectPath(20, 20, 80, 80), app(solid(0, 0, 1)))], {}, { clip: true });
    const res = vc([layer([clipped])]);
    const g = ofType(res.artboard, 'group').find((n) => n.name === 'Clip group')!;
    expect(g.children).toHaveLength(3);
    expect(g.children[0].mask).toBe(true);
    expect(g.children[0].visible).toBe(true);
    expect(g.children[1].mask).toBeFalsy();
  });

  it('merges a compound path into one path layer with the compound’s appearance and fill rule', () => {
    const node = { id: 5, appearance: app(solid(1, 1, 0)), kind: { type: 'compound', rule: 'EvenOdd', children: [pathNode(rectPath(0, 0, 100, 100), app()), pathNode(rectPath(25, 25, 75, 75), app())] } };
    const res = vc([layer([node])]);
    const paths = ofType(res.artboard, 'path');
    expect(paths).toHaveLength(1);
    expect(paths[0].paths).toHaveLength(2);
    expect(paths[0].fillRule).toBe('evenodd');
    expect(paths[0].fill).toEqual({ type: 'solid', color: '#ffff00' });
  });

  it('keeps visibility, opacity, blend mode and names, and reports blend modes it lacks', () => {
    const res = vc([layer([pathNode(rectPath(0, 0, 10, 10), app(), { name: 'Hidden', visible: false }), pathNode(rectPath(0, 0, 10, 10), app(), { name: 'Soft', opacity: 0.5, blend: 'Multiply' }), pathNode(rectPath(0, 0, 10, 10), app(), { blend: 'SoftLight' })])]);
    const p = ofType(res.artboard, 'path');
    expect(p[0].visible).toBe(false);
    expect(p[0].name).toBe('Hidden');
    expect(p[1].opacity).toBe(0.5);
    expect(p[1].blendMode).toBe('multiply');
    expect(p[2].blendMode).toBeUndefined();
    expect(res.warnings.join(' ')).toMatch(/SoftLight/);
  });

  it('an object with several fills and strokes becomes a group with a path layer for each', () => {
    const appearance = { items: [{ kind: 'fill', paint: solid(1, 0, 0) }, { kind: 'fill', paint: solid(0, 1, 0), opacity: 0.5 }, { kind: 'stroke', paint: solid(0, 0, 0), width: 3 }] };
    const res = vc([layer([pathNode(rectPath(0, 0, 40, 40), appearance, { name: 'Multi' })])]);
    const g = ofType(res.artboard, 'group').find((n) => n.name === 'Multi')!;
    expect(g.children).toHaveLength(3);
    expect((g.children[1] as PathNode).fill).toEqual({ type: 'solid', color: 'rgba(0, 255, 0, 0.5)' });
  });

  it('dashes, caps and joins carry over', () => {
    const appearance = { items: [{ kind: 'stroke', paint: solid(0, 0, 0), width: 2, cap: 'Round', join: 'Bevel', dash: { pattern: [6, 3], offset: 1 } }] };
    const res = vc([layer([pathNode(rectPath(0, 0, 40, 40), appearance)])]);
    const p = ofType(res.artboard, 'path')[0];
    expect(p.fill).toBeNull();
    expect(p.stroke?.dash).toEqual([6, 3]);
    expect(p.stroke?.dashOffset).toBe(1);
    expect(p.lineCap).toBe('round');
    expect(p.lineJoin).toBe('bevel');
  });

  it('converts gray, CMYK and Lab colours', () => {
    const close = (a: { r: number; g: number; b: number }, r: number, g: number, b: number) => [a.r, a.g, a.b].every((v, i) => Math.abs(v - [r, g, b][i]) < 2);
    expect(close(vcColor({ model: 'gray', k: 0.25 }), 191.25, 191.25, 191.25)).toBe(true);
    expect(close(vcColor({ model: 'cmyk', c: 1, m: 0, y: 0, k: 0 }), 0, 255, 255)).toBe(true);
    expect(close(vcColor({ model: 'cmyk', c: 0, m: 0, y: 0, k: 1 }), 0, 0, 0)).toBe(true);
    expect(close(vcColor({ model: 'lab', l: 100, a: 0, b: 0 }), 255, 255, 255)).toBe(true);
    expect(close(vcColor({ model: 'lab', l: 0, a: 0, b: 0 }), 0, 0, 0)).toBe(true);
    const mid = vcColor({ model: 'lab', l: 53.2, a: 80.1, b: 67.2 });
    expect(mid.r).toBeGreaterThan(220);
    expect(mid.g).toBeLessThan(60);
  });

  it('linear gradients: fitted to the shape at an angle, and placed by their own geometry', () => {
    const stops = [{ offset: 0, color: { model: 'rgb', r: 1, g: 0, b: 0 }, opacity: 1, midpoint: 0.5 }, { offset: 1, color: { model: 'rgb', r: 0, g: 0, b: 1 }, opacity: 1, midpoint: 0.5 }];
    // angle -90 (counter-clockwise from the x axis) runs from the top to the bottom
    const down = vc([layer([pathNode(rectPath(0, 0, 100, 100), app({ type: 'gradient', gradient: { kind: 'Linear', stops }, angle: -90 }))])]);
    const f = ofType(down.artboard, 'path')[0].fill;
    expect(f?.type).toBe('linear');
    if (f?.type === 'linear') {
      expect(f.angle).toBeCloseTo(180, 1);
      expect(f.stops[0]).toEqual({ offset: 0, color: '#ff0000' });
      expect(f.stops[f.stops.length - 1]).toEqual({ offset: 1, color: '#0000ff' });
    }
    // an explicit left-to-right gradient over the middle half of a square: the ends are held outside it
    const geom = { start: { x: 25, y: 50 }, end: { x: 75, y: 50 }, aspect: 1 };
    const own = vc([layer([pathNode(rectPath(0, 0, 100, 100), app({ type: 'gradient', gradient: { kind: 'Linear', stops }, angle: 0, geom }))])]);
    const g = ofType(own.artboard, 'path')[0].fill;
    expect(g?.type === 'linear' && g.angle).toBeCloseTo(90, 1);
    if (g?.type === 'linear') {
      expect(g.stops[0].color).toBe('#ff0000');
      expect(g.stops.find((s) => Math.abs(s.offset - 0.25) < 1e-3)?.color).toBe('#ff0000');
      expect(g.stops.find((s) => Math.abs(s.offset - 0.75) < 1e-3)?.color).toBe('#0000ff');
    }
  });

  it('radial gradients become radial paints, and a midpoint becomes a stop of its own', () => {
    const stops = [{ offset: 0, color: { model: 'rgb', r: 1, g: 1, b: 1 }, opacity: 1, midpoint: 0.25 }, { offset: 1, color: { model: 'rgb', r: 0, g: 0, b: 0 }, opacity: 0.5, midpoint: 0.5 }];
    const res = vc([layer([pathNode(rectPath(0, 0, 100, 100), app({ type: 'gradient', gradient: { kind: 'Radial', stops }, angle: 0 }))])]);
    const f = ofType(res.artboard, 'path')[0].fill;
    expect(f?.type).toBe('radial');
    if (f?.type === 'radial') {
      expect(f.stops).toHaveLength(3);
      expect(f.stops[1].offset).toBeCloseTo(0.25, 3);
      expect(f.stops[2].color).toBe('rgba(0, 0, 0, 0.5)');
    }
  });

  it('turns drop shadows and outer glows into shadows, Gaussian blur into blur, and reports other effects', () => {
    const fx = (id: string, params: unknown) => ({ ...app(), effects: [{ id, params, visible: true }] });
    const res = vc([layer([
      pathNode(rectPath(0, 0, 10, 10), fx('stylize.dropShadow', { x: 4, y: 6, blur: 8, color: '#102030', opacity: 50 })),
      pathNode(rectPath(0, 0, 10, 10), fx('stylize.outerGlow', { blur: 12, color: '#ffff00', opacity: 100 })),
      pathNode(rectPath(0, 0, 10, 10), fx('blur.gaussian', { radius: 3 })),
      pathNode(rectPath(0, 0, 10, 10), fx('distort.twist', {})),
    ])]);
    const p = ofType(res.artboard, 'path');
    expect(p[0].shadow).toEqual({ x: 4, y: 6, blur: 8, spread: 0, color: 'rgba(16, 32, 48, 0.5)' });
    expect(p[1].shadow).toEqual({ x: 0, y: 0, blur: 12, spread: 0, color: '#ffff00' });
    expect(p[2].blur).toBe(3);
    expect(res.warnings.join(' ')).toMatch(/distort\.twist/);
  });

  it('point text: font, size, colour, tracking, alignment and the position of the baseline', () => {
    const runs = [{ text: 'Hello ', style: style({ size: 30, tracking: 100, fill: solid(1, 0, 0), font_style: 'Bold' }) }, { text: 'world', style: style({ size: 30, tracking: 100, fill: solid(0, 0, 1), font_style: 'Regular' }) }];
    const res = vc([layer([textNode(runs, [1, 0, 0, 1, 200, 150], { kind: 'point' }, { justify: 'Center' })])]);
    const t = ofType(res.artboard, 'text')[0] as TextNode;
    expect(t.text).toBe('Hello world');
    expect(t.fontFamily).toBe('Source Sans 3');
    expect(t.fontSize).toBe(30);
    expect(t.fontWeight).toBe(700);
    expect(t.color).toBe('#ff0000');
    expect(t.letterSpacing).toBe(3);
    expect(t.align).toBe('center');
    expect(t.runs).toHaveLength(2);
    expect(t.runs?.[1]).toMatchObject({ text: 'world', fontWeight: 400, color: '#0000ff' });
    const g = res.artboard.children[0];
    // centred about the anchor, first baseline a little below the middle of the first line
    expect(g.x + t.x + t.width / 2).toBeCloseTo(200, 0);
    expect(g.y + t.y).toBeLessThan(150);
    expect(g.y + t.y + t.height).toBeGreaterThan(150);
    expect(res.fonts).toEqual([{ family: 'Source Sans 3', source: 'google', weights: [400, 700] }]);
  });

  it('area text: a box from the frame; scaling and rotation of the text transform apply', () => {
    const frame = rectPath(10, 20, 210, 120);
    const runs = [{ text: 'Paragraph text that wraps', style: style({ size: 10, leading: 20 }) }];
    const res = vc([layer([textNode(runs, [2, 0, 0, 2, 50, 60], { kind: 'area', frame })])]);
    const t = ofType(res.artboard, 'text')[0];
    expect(t.autoSize).toBe('none');
    expect(t.fontSize).toBe(20);
    expect(t.lineHeight).toBe(2);
    const g = res.artboard.children[0];
    expect([g.x + t.x, g.y + t.y, t.width, t.height]).toEqual([70, 100, 400, 200]);
    const turned = vc([layer([textNode([{ text: 'Turn', style: style() }], [0, 1, -1, 0, 100, 100])])]);
    expect(ofType(turned.artboard, 'text')[0].rotation).toBe(90);
  });

  it('symbols are placed as copies, and a missing symbol is reported', () => {
    const symbols = [{ name: 'Dot', art: pathNode(rectPath(0, 0, 10, 10), app(solid(0, 0, 0))) }];
    const inst = (name: string, e: number, f: number) => ({ id: nid++, kind: { type: 'symbolinstance', symbol: name, xf: [2, 0, 0, 2, e, f] } });
    const res = vc([layer([inst('Dot', 100, 100), inst('Dot', 200, 100), inst('Nope', 0, 0)])], { symbols });
    const paths = ofType(res.artboard, 'path');
    expect(paths).toHaveLength(2);
    expect([paths[0].width, paths[0].height]).toEqual([20, 20]);
    expect(res.warnings.join(' ')).toMatch(/symbol is missing/);
  });

  it('Repeat objects: radial, grid and mirror copies', () => {
    const source = [pathNode(rectPath(190, 20, 210, 40), app(solid(0, 0, 0)))];
    const rep = (kind: unknown) => ({ id: nid++, kind: { type: 'repeat', kind, source } });
    const radial = vc([layer([rep({ type: 'radial', instances: 6, radius: 100, center: { x: 200, y: 150 }, reverseOverlap: false, startAngle: 0, endAngle: 360 })])]);
    const copies = ofType(radial.artboard, 'path');
    expect(copies).toHaveLength(6);
    // every copy is the same distance from the centre
    const centres = copies.map((c) => {
      const o = absPos(radial.artboard, c);
      return Math.hypot(o.x + c.width / 2 - 200, o.y + c.height / 2 - 150);
    });
    for (const d of centres) expect(d).toBeCloseTo(100, 0);
    const grid = vc([layer([rep({ type: 'grid', hSpacing: 5, vSpacing: 5, rows: 2, cols: 3, gridType: { type: 'grid' }, flipRows: false, flipCols: false })])]);
    expect(ofType(grid.artboard, 'path')).toHaveLength(6);
    const mirror = vc([layer([rep({ type: 'mirror', angle: 90, center: { x: 200, y: 0 } })])]);
    expect(ofType(mirror.artboard, 'path')).toHaveLength(2);
    repeatTransforms({ type: 'mirror', angle: 90, center: { x: 100, y: 0 } }, { x: 0, y: 0, width: 10, height: 10 })[1].forEach((v, i) => expect(v).toBeCloseTo([-1, 0, 0, 1, 200, 0][i], 6));
  });

  it('a blend between two paths with the same points gets its steps, with colours in between', () => {
    const a = pathNode(rectPath(0, 0, 100, 10), app(solid(1, 0, 0)));
    const b = pathNode(rectPath(0, 100, 100, 110), app(solid(0, 0, 1)));
    const node = { id: 77, kind: { type: 'blend', children: [a, b], spec: { spacing: { steps: 3 }, orientation: 'alignToPage' } } };
    const res = vc([layer([node])]);
    const paths = ofType(res.artboard, 'path');
    expect(paths).toHaveLength(5);
    expect((paths[2].fill as { color: string }).color).toBe('#800080');
    expect(paths.map((p) => Math.round(absPos(res.artboard, p).y))).toEqual([0, 25, 50, 75, 100]);
    // different points: only the key objects, and a note
    const c = pathNode({ subpaths: [{ anchors: [P(0, 0), P(10, 0), P(5, 9)], closed: true }] });
    const odd = vc([layer([{ id: 78, kind: { type: 'blend', children: [a, c], spec: { spacing: { steps: 3 } } } }])]);
    expect(ofType(odd.artboard, 'path')).toHaveLength(2);
    expect(odd.warnings.join(' ')).toMatch(/different points/);
  });

  it('meshes become flat patches, envelopes keep their art, placed documents are left out', () => {
    const points = Array.from({ length: 9 }, (_, i) => ({ p: { x: (i % 3) * 50, y: Math.floor(i / 3) * 50 }, color: { model: 'rgb', r: i / 8, g: 0, b: 0 }, opacity: 1, handles: [] }));
    const res = vc([layer([
      { id: 1, kind: { type: 'mesh', rows: 2, cols: 2, points } },
      { id: 2, kind: { type: 'envelope', content: [pathNode(rectPath(0, 0, 10, 10))], kind: { type: 'warp', style: 'flag' }, fidelity: 50, editing: false } },
      { id: 3, kind: { type: 'placeddocument' } },
    ])]);
    expect(ofType(res.artboard, 'path')).toHaveLength(5);
    const w = res.warnings.join('\n');
    expect(w).toMatch(/Gradient meshes/);
    expect(w).toMatch(/Envelope/);
    expect(w).toMatch(/Placed documents/);
  });

  it('several artboards: each gets its own artboard with the artwork that touches it, in its own coordinates', () => {
    const left = pathNode(rectPath(10, 10, 60, 60), app(solid(1, 0, 0)), { name: 'left' });
    const right = pathNode(rectPath(1010, 10, 1060, 60), app(solid(0, 0, 1)), { name: 'right' });
    const res = vc([layer([left, right])], { artboards: [board(400, 300, 'A'), board(1400, 300, 'B', 1000, 0)] }, 'two');
    expect(res.artboards.map((a) => a.name)).toEqual(['two - A', 'two - B']);
    expect(all(res.artboards[0]).filter((n) => n.type === 'path').map((n) => n.name)).toEqual(['left']);
    const r = ofType(res.artboards[1], 'path');
    expect(r.map((n) => n.name)).toEqual(['right']);
    const g = res.artboards[1].children[0];
    expect(g.x + r[0].x).toBe(10);
  });

  it('template layers are imported hidden', () => {
    const l = layer([pathNode(rectPath(0, 0, 10, 10))], 'Trace');
    (l.kind as Record<string, unknown>).template = true;
    const res = vc([l]);
    expect(res.artboard.children[0].visible).toBe(false);
  });

  it('refuses other formats, newer versions and empty documents with a clear message', () => {
    expect(() => importVectorCraft(enc.encode('{"format":"something","version":1,"document":{}}'), 'x')).toThrow(/not a VectorCraft file/);
    expect(() => importVectorCraft(enc.encode('not json'), 'x')).toThrow(/not a VectorCraft file/);
    expect(() => importVectorCraft(json(vcFile([layer([])], { version: 9 })), 'x')).toThrow(/version 9, newer/);
    expect(() => importVectorCraft(json(vcFile([])), 'x')).toThrow(/no artwork/);
    expect(() => importVectorCraft(json(vcFile([layer([])])), 'x')).toThrow(/no artwork/);
    expect(isVectorCraft(enc.encode('{"format":"lottie"}'))).toBe(false);
    expect(isVectorCraft(enc.encode('{"v":"5.7.0","layers":[]}'))).toBe(false);
  });

  it('parses the envelope: version, generator and pictures', () => {
    const png = solidPng(1, 1, [1, 2, 3, 255]);
    const f = parseVectorCraft(json(vcFile([], { images: { k: { mime: 'image/png', data: Buffer.from(png).toString('base64'), proxy: true } } })));
    expect(f.version).toBe(4);
    expect(f.generator).toBe('VectorCraft 0.0.0');
    expect(f.images.get('k')).toMatchObject({ mime: 'image/png', proxy: true });
  });

  it('survives hostile data without throwing past its own messages', () => {
    const weird = [{ id: 1, kind: { type: 'path', path: { subpaths: [{ anchors: [{ p: [NaN, 'x'] }, { p: null }], closed: 3 }] } } }, { id: 2, kind: null }, 5, { id: 3, kind: { type: 'text', runs: 'nope', xf: 'bad' } }, { id: 4, kind: { type: 'repeat', kind: { type: 'radial', instances: 1e9 }, source: [pathNode(rectPath(0, 0, 5, 5))] } }];
    expect(() => vc([layer(weird as unknown[]), layer([pathNode(rectPath(0, 0, 5, 5))])])).not.toThrow();
  });
});

// ================================================================ PhotoCraft

const hasZstd = typeof (zlib as unknown as { zstdCompressSync?: unknown }).zstdCompressSync === 'function';

/** A zstd frame made of raw blocks: valid zstd that needs no compressor. */
function zstdStored(data: Uint8Array): Uint8Array {
  const out: number[] = [0x28, 0xb5, 0x2f, 0xfd, 0xa0, data.length & 255, (data.length >> 8) & 255, (data.length >> 16) & 255, (data.length >>> 24) & 255];
  const MAX = 128 * 1024 - 1;
  for (let at = 0; at < Math.max(1, data.length); at += MAX) {
    const n = Math.min(MAX, data.length - at);
    const last = at + MAX >= data.length ? 1 : 0;
    const h = last | (0 << 1) | (n << 3);
    out.push(h & 255, (h >> 8) & 255, (h >> 16) & 255);
    for (let i = 0; i < n; i++) out.push(data[at + i]);
  }
  return Uint8Array.from(out);
}
const zstdReal = (data: Uint8Array) => new Uint8Array((zlib as unknown as { zstdCompressSync: (b: Uint8Array) => Buffer }).zstdCompressSync(data));

type Pix = (x: number, y: number) => number[];

class Bundle {
  files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  private n = 0;
  constructor(private readonly compress: (d: Uint8Array) => Uint8Array) {}
  private hash(): string {
    return (++this.n).toString(16).padStart(64, '0');
  }
  /** A surface of 8-bit tiles. `ch` is the channels per pixel; `pix(x, y)` gives them in document coordinates. */
  surface(tiles: [number, number][], pix: Pix, opts: { mode?: string; alpha?: boolean; ch?: number; dflt?: string } = {}) {
    const mode = opts.mode ?? 'Rgb';
    const alpha = opts.alpha ?? true;
    const ch = opts.ch ?? (mode === 'Grayscale' ? 1 : mode === 'Cmyk' ? 4 : 3) + (alpha ? 1 : 0);
    const refs = tiles.map(([tx, ty]) => {
      const data = new Uint8Array(256 * 256 * ch);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) data.set(pix(tx * 256 + x, ty * 256 + y), (y * 256 + x) * ch);
      const hash = this.hash();
      this.files[`tiles/${hash}.zst`] = [this.compress(data), { level: 0 }];
      return { tx, ty, hash };
    });
    return { format: { mode, sample: 'U8', alpha }, default: opts.dflt ?? '0'.repeat(ch * 2), tiles: refs };
  }
  blob(data: Uint8Array): string {
    const hash = this.hash();
    this.files[`blobs/${hash}.zst`] = [this.compress(data), { level: 0 }];
    return hash;
  }
  zip(manifest: unknown, prefix = ''): Uint8Array {
    const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { [`${prefix}manifest.json`]: [enc.encode(JSON.stringify(manifest)), { level: 0 }] };
    for (const [k, v] of Object.entries(this.files)) files[prefix + k] = v;
    return zipSync(files as never);
  }
}

const rgbaColor = (r: number, g: number, b: number, alpha = 1) => ({ mode: 'Rgb', c: [r, g, b, 0], alpha });
const knot = (x: number, y: number, extra: Record<string, unknown> = {}) => ({ anchor: { x, y }, in_ctrl: { x, y }, out_ctrl: { x, y }, smooth: false, ...extra });
const polygon = (pts: [number, number][]) => ({ subpaths: [{ closed: true, knots: pts.map(([x, y]) => knot(x, y)), op: 'Combine' }], fill_rule: 'NonZero', inverted: false });
const fx = (items: unknown[] = []) => ({ enabled: true, items, psd_raw: null });
let lid = 1;
function layerM(content: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id: lid++, name: 'Layer', visible: true, locks: {}, blend: 'Normal', opacity: 1, fill_opacity: 1, clipped: false, mask: null, vector_mask: null, effects: fx(), label: 'None', content, psd_blocks: [], psd_id: null, fill_cache: null, ...extra };
}
const pcDoc = (layers: unknown[], extra: Record<string, unknown> = {}) => ({ format_version: 1, generator: 'photocraft-format 0.1.0', thumbnail: null, composite: null, document: { id: 1, name: 'Doc', size: { width: 300, height: 200 }, resolution_dpi: 72, mode: 'Rgb', depth: 'U8', layers, channels: [], ...extra } });

function buildSample(compress: (d: Uint8Array) => Uint8Array) {
  const b = new Bundle(compress);
  // background: opaque gradient over the whole canvas (two tiles wide)
  const background = layerM({ kind: 'raster', surface: b.surface([[0, 0], [1, 0]], (x, y) => [x % 256, y % 256, 128, 255]) }, { name: 'Background' });
  // a photo layer with a layer mask that hides its left half, inside a group with 50% opacity and multiply
  const photo = layerM({ kind: 'raster', surface: b.surface([[0, 0]], (x, y) => (x >= 20 && x < 120 && y >= 30 && y < 80 ? [200, 40, 40, 255] : [0, 0, 0, 0])) }, { name: 'Photo', mask: { surface: b.surface([[0, 0]], (x) => [x < 70 ? 0 : 255], { mode: 'Grayscale', alpha: false, dflt: 'ff' }), enabled: true, linked: true, density: 1, feather: 0 } });
  const folder = layerM({ kind: 'group', children: [photo], expanded: true }, { name: 'Photos', opacity: 0.5, blend: 'Multiply' });
  const runs = [{ len: 6, style: { font_family: 'Source Sans 3', font_style: 'Bold', weight: 700, italic: false, size_pt: 24, color: rgbaColor(1, 0, 0), tracking: 50, leading_pt: null, underline: false, strikethrough: false, caps: 'Normal', baseline: 'Normal', baseline_shift_pt: 0 } }, { len: 5, style: { font_family: 'Source Sans 3', font_style: 'Regular', weight: 400, italic: false, size_pt: 24, color: rgbaColor(0, 0, 1), tracking: 50, leading_pt: null, underline: true, strikethrough: false, caps: 'Normal', baseline: 'Normal', baseline_shift_pt: 0 } }];
  const text = layerM({ kind: 'text', text: 'Héllo World', font_family: 'Source Sans 3', size_pt: 24, color: rgbaColor(0, 0, 0), transform: { m: [1, 0, 0, 1, 150, 120] }, cache: null, psd_raw: null, runs, paragraphs: [{ len: 12, style: { align: 'Center', auto_leading: 1.2 } }], shape: 'Point', orientation: 'Horizontal', antialias: 'Smooth', warp: null }, { name: 'Title' });
  const gradient = { Gradient: { stops: [[0, rgbaColor(1, 0, 0)], [1, rgbaColor(0, 0, 1)]], angle: 0, scale: 1, style: 'Linear', reverse: false, opacity_stops: [], midpoints: [], offset: [0, 0], dither: false, align: true } };
  const shadow = { DropShadow: { common: { enabled: true, blend: 'Multiply', opacity: 0.5 }, color: rgbaColor(0, 0, 0), angle: 90, use_global_light: false, distance: 10, spread: 0, size: 6, contour: 'Linear', anti_alias: false, noise: 0, knocks_out: false } };
  const shape = layerM({ kind: 'shape', fill: gradient, cache: null, psd_raw: null, path: polygon([[200, 20], [280, 20], [280, 100], [200, 100]]), stroke: { width: 4, paint: { Solid: rgbaColor(0, 1, 0) }, opacity: 1, align: 'Center', cap: 'Round', join: 'Round', miter_limit: 4, dashes: [2, 1], dash_offset: 0 }, live: null, density: 1, feather: 0 }, { name: 'Badge', effects: fx([shadow]) });
  const adjust = layerM({ kind: 'adjustment', adjustment: {} }, { name: 'Curves' });
  const clippedLayer = layerM({ kind: 'raster', surface: b.surface([[0, 0]], (x, y) => (x >= 210 && x < 260 && y >= 30 && y < 60 ? [255, 255, 0, 255] : [0, 0, 0, 0])) }, { name: 'Sticker', clipped: true });
  const fill = layerM({ kind: 'fill', fill: { Solid: rgbaColor(1, 1, 1, 0.5) } }, { name: 'Wash', visible: false });
  const manifest = pcDoc([background, folder, text, adjust, shape, clippedLayer, fill]);
  return { zip: b.zip(manifest), manifest };
}

const codecs: [string, (d: Uint8Array) => Uint8Array][] = [['stored zstd blocks', zstdStored], ...(hasZstd ? [['real zstd (node)', zstdReal] as [string, (d: Uint8Array) => Uint8Array]] : [])];

describe.each(codecs)('PhotoCraft import (%s)', (_label, compress) => {
  const sample = () => buildSample(compress).zip;

  it('recognises a .pcraft bundle, and not other zip files', () => {
    expect(isPhotoCraft(sample())).toBe(true);
    expect(isPhotoCraft(zipSync({ 'manifest.json': enc.encode('{"animations":[]}') }))).toBe(false);
    expect(isPhotoCraft(enc.encode('{"format_version":1}'))).toBe(false);
    expect(readPhotoCraft(sample()).manifest.format_version).toBe(1);
  });

  it('imports layers as images, groups, text and paths in the right order', () => {
    const res = importPhotoCraft(sample(), 'poster');
    expect(res.artboards).toHaveLength(1);
    const ab = res.artboard;
    expect(ab.name).toBe('poster');
    expect([ab.width, ab.height]).toEqual([300, 200]);
    expect(ab.children.map((c) => c.name)).toEqual(['Background', 'Photos', 'Title', 'Badge (clipped)', 'Wash']);
    const bg = ab.children[0] as ImageNode;
    expect(bg.type).toBe('image');
    expect([bg.x, bg.y, bg.width, bg.height]).toEqual([0, 0, 512, 256]);
    const asset = res.assets.find((a) => a.id === bg.assetId)!;
    const png = decodePng(asset.bytes);
    expect([png.width, png.height]).toEqual([512, 256]);
    // pixel (260, 10): tile (1,0) at x=4, y=10 -> [4, 10, 128, 255]
    expect([...png.rgba.subarray((10 * 512 + 260) * 4, (10 * 512 + 260) * 4 + 4)]).toEqual([4, 10, 128, 255]);
  });

  it('bakes a layer mask into the pixels, and carries opacity and blend mode on the group', () => {
    const res = importPhotoCraft(sample(), 'poster');
    const folder = res.artboard.children[1];
    expect(folder.type).toBe('group');
    expect(folder.opacity).toBe(0.5);
    expect(folder.blendMode).toBe('multiply');
    const photo = (folder as Extract<SceneNode, { type: 'group' }>).children[0] as ImageNode;
    // the layer's pixels cover x 20..120; the mask hides x < 70, so what is left is x 70..120
    expect(photo.x + folder.x).toBe(70);
    const png = decodePng(res.assets.find((a) => a.id === photo.assetId)!.bytes);
    expect([png.width, png.height]).toEqual([50, 50]);
    expect(png.rgba[(10 * 50 + 10) * 4 + 3]).toBe(255); // document x 80 shows
    expect([...png.rgba.subarray(0, 4)]).toEqual([200, 40, 40, 255]);
  });

  it('text layers keep their runs, fonts and position', () => {
    const res = importPhotoCraft(sample(), 'poster');
    const t = ofType(res.artboard, 'text')[0] as TextNode;
    expect(t.text).toBe('Héllo World');
    expect(t.fontFamily).toBe('Source Sans 3');
    expect(t.fontSize).toBe(24);
    expect(t.fontWeight).toBe(700);
    expect(t.color).toBe('#ff0000');
    expect(t.letterSpacing).toBeCloseTo(1.2, 5);
    expect(t.align).toBe('center');
    expect(t.runs).toHaveLength(2);
    expect(t.runs?.[0].text).toBe('Héllo');
    expect(t.runs?.[1]).toMatchObject({ text: ' World', fontWeight: 400, color: '#0000ff', underline: true });
    expect(t.x + t.width / 2).toBeCloseTo(150, 0);
    expect(t.y).toBeLessThan(120);
    expect(res.fonts).toEqual([{ family: 'Source Sans 3', source: 'google', weights: [400, 700] }]);
  });

  it('shape layers: a gradient fill, a dashed stroke and the drop shadow; clipped layers become a clipping group', () => {
    const res = importPhotoCraft(sample(), 'poster');
    const clipped = res.artboard.children[3] as Extract<SceneNode, { type: 'group' }>;
    expect(clipped.name).toBe('Badge (clipped)');
    expect(clipped.children.map((c) => c.name)).toEqual(['Badge', 'Badge (mask)', 'Sticker']);
    const badge = clipped.children[0] as PathNode;
    expect(badge.fill?.type).toBe('linear');
    if (badge.fill?.type === 'linear') {
      expect(badge.fill.angle).toBeCloseTo(90, 1);
      expect(badge.fill.stops[0].color).toBe('#ff0000');
      expect(badge.fill.stops[badge.fill.stops.length - 1].color).toBe('#0000ff');
    }
    expect(badge.stroke).toMatchObject({ width: 4, dash: [8, 4] });
    expect(badge.lineCap).toBe('round');
    expect([clipped.x + badge.x, clipped.y + badge.y, badge.width, badge.height]).toEqual([200, 20, 80, 80]);
    // the layer style: a drop shadow 10 px straight down (light from above)
    // (the style belongs to the base layer, so the group that stands for it carries it)
    expect(clipped.shadow).toEqual({ x: 0, y: 10, blur: 6, spread: 0, color: 'rgba(0, 0, 0, 0.5)' });
    expect(clipped.children[1].mask).toBe(true);
  });

  it('keeps visibility, converts fill layers and reports adjustment layers', () => {
    const res = importPhotoCraft(sample(), 'poster');
    const wash = res.artboard.children[4];
    expect(wash.type).toBe('rect');
    expect(wash.visible).toBe(false);
    expect([wash.width, wash.height]).toEqual([300, 200]);
    expect(res.warnings.join('\n')).toMatch(/Adjustment layers/);
  });

  it('artboards: a top-level group with a rectangle becomes an artboard, layers placed relative to it', () => {
    const b = new Bundle(compress);
    const inner = layerM({ kind: 'raster', surface: b.surface([[1, 0]], (x, y) => (x >= 300 && x < 340 && y >= 10 && y < 30 ? [9, 9, 9, 255] : [0, 0, 0, 0])) }, { name: 'Logo' });
    const ab = (name: string, x0: number, bg: unknown) => layerM({ kind: 'group', children: name === 'A' ? [inner] : [], expanded: true, artboard: { rect: { x0, y0: 0, x1: x0 + 200, y1: 100 }, background: bg, preset: '' } }, { name });
    const manifest = pcDoc([ab('A', 256, 'white'), ab('B', 600, { custom: rgbaColor(0, 0, 1) })], { size: { width: 1000, height: 100 } });
    const res = importPhotoCraft(b.zip(manifest), 'sheet');
    // artboard B is empty, so only A comes across
    expect(res.artboards.map((a) => a.name)).toEqual(['sheet - A']);
    expect(res.artboard.background).toEqual({ type: 'solid', color: '#ffffff' });
    expect([res.artboard.width, res.artboard.height]).toEqual([200, 100]);
    const img = ofType(res.artboard, 'image')[0];
    expect([img.x, img.y]).toEqual([300 - 256, 10]);
  });

  it('other colour modes: grayscale and CMYK pixels are converted to RGB', () => {
    const b = new Bundle(compress);
    const gray = layerM({ kind: 'raster', surface: b.surface([[0, 0]], () => [100, 255], { mode: 'Grayscale', alpha: true }) }, { name: 'Gray' });
    const cmyk = layerM({ kind: 'raster', surface: b.surface([[0, 0]], () => [255, 0, 0, 0, 255], { mode: 'Cmyk', alpha: true }) }, { name: 'Cyan' });
    const res = importPhotoCraft(b.zip(pcDoc([gray, cmyk])), 'modes');
    const px = (name: string) => {
      const n = res.artboard.children.find((c) => c.name === name) as ImageNode;
      return [...decodePng(res.assets.find((a) => a.id === n.assetId)!.bytes).rgba.subarray(0, 4)];
    };
    expect(px('Gray')).toEqual([100, 100, 100, 255]);
    expect(px('Cyan')).toEqual([0, 255, 255, 255]);
  });

  it('damaged or missing tiles are reported instead of throwing', () => {
    const b = new Bundle(compress);
    const l = layerM({ kind: 'raster', surface: b.surface([[0, 0], [1, 0]], () => [9, 9, 9, 255]) }, { name: 'Broken' });
    const keys = Object.keys(b.files);
    b.files[keys[0]] = [Uint8Array.of(0x28, 0xb5, 0x2f, 0xfd, 0x20, 5, 1, 2, 3), { level: 0 }];
    delete b.files[keys[1]];
    const good = layerM({ kind: 'raster', surface: b.surface([[0, 0]], () => [1, 1, 1, 255]) }, { name: 'Fine' });
    const res = importPhotoCraft(b.zip(pcDoc([l, good])), 'x');
    expect(res.artboard.children.map((c) => c.name)).toContain('Fine');
    expect(res.warnings.join(' ')).toMatch(/pixel tiles are missing|could not be decoded/);
  });

  it('a bundle zipped with a folder around it still reads', () => {
    const b = new Bundle(compress);
    const l = layerM({ kind: 'raster', surface: b.surface([[0, 0]], () => [1, 2, 3, 255]) });
    const res = importPhotoCraft(b.zip(pcDoc([l]), 'My Photo.pcraft/'), 'x');
    expect(ofType(res.artboard, 'image')).toHaveLength(1);
  });

  it('refuses a newer format and files with nothing to import, falling back to the flattened picture when there is one', () => {
    const b = new Bundle(compress);
    const newer = { ...pcDoc([]), format_version: 7 };
    expect(() => importPhotoCraft(b.zip(newer), 'x')).toThrow(/format 7, newer/);
    expect(() => importPhotoCraft(b.zip(pcDoc([])), 'x')).toThrow(/no layers/);
    const flat = solidPng(300, 200, [5, 6, 7, 255]);
    b.files['composite/full.png'] = [flat, { level: 0 }];
    const adjust = layerM({ kind: 'adjustment', adjustment: {} });
    const res = importPhotoCraft(b.zip({ ...pcDoc([adjust]), full_composite: 'composite/full.png' }), 'flat');
    expect(res.assets[0].bytes).toEqual(flat);
    expect(res.warnings.join(' ')).toMatch(/flattened picture/);
    expect(() => readPhotoCraft(enc.encode('nope'))).toThrow(/not a ZIP/);
  });
});

describe('PhotoCraft colours', () => {
  it('reads colours in each mode', () => {
    expect(pcColor(rgbaColor(1, 0.5, 0, 0.5))).toEqual({ r: 255, g: 127.5, b: 0, a: 0.5 });
    expect(pcColor({ mode: 'Grayscale', c: [0.5, 0, 0, 0], alpha: 1 })).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(pcColor({ mode: 'Cmyk', c: [0, 0, 0, 1], alpha: 1 })).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});

// ================================================================ wiring

/** jsdom's File has no arrayBuffer(). */
const fileOf = (bytes: Uint8Array | string, name: string): File => {
  const data = typeof bytes === 'string' ? enc.encode(bytes) : bytes;
  return { name, size: data.length, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) } as unknown as File;
};

describe('file type wiring', () => {
  it('can be linked and labelled', () => {
    for (const e of ['vectorcraft', 'drawcraft', 'pcraft']) expect(DESIGN_EXTENSIONS).toContain(e);
    expect(isDesignFile({ name: 'Logo.VectorCraft' })).toBe(true);
    expect(isDesignFile({ name: 'Photo.pcraft' })).toBe(true);
    expect(designKind('a.vectorcraft')).toBe('vectorcraft');
    expect(KIND_LABEL.vectorcraft).toBe('VectorCraft');
    expect(KIND_LABEL.drawcraft).toBe('VectorCraft');
    expect(KIND_LABEL.pcraft).toBe('PhotoCraft');
    expect(ANIMATION_ACCEPT).toMatch(/\.vectorcraft/);
    expect(ANIMATION_ACCEPT).toMatch(/\.pcraft/);
  });

  it('readAnimationFile picks the importer by extension and by content', async () => {
    const vcBytes = json(vcFile([layer([pathNode(rectPath(0, 0, 10, 10))])]));
    const a = await readAnimationFile(fileOf(vcBytes, 'Logo.vectorcraft'));
    expect(a.source).toBe('VectorCraft');
    expect(a.artboard.name).toBe('Logo');
    // no extension: sniffed from the content, plain and gzip
    expect((await readAnimationFile(fileOf(vcBytes, 'download'))).source).toBe('VectorCraft');
    expect((await readAnimationFile(fileOf(gzipSync(vcBytes), 'download'))).source).toBe('VectorCraft');
    const pc = await readAnimationFile(fileOf(buildSample(zstdStored).zip, 'Poster.pcraft'));
    expect(pc.source).toBe('PhotoCraft');
    expect((await readAnimationFile(fileOf(buildSample(zstdStored).zip, 'download'))).source).toBe('PhotoCraft');
    // a Lottie JSON still goes to the Lottie importer
    await expect(readAnimationFile(fileOf('{"v":"5.7.0","fr":30,"ip":0,"op":30,"w":100,"h":100,"layers":[]}', 'x.json'))).resolves.toMatchObject({ source: 'Lottie' });
  });
});
