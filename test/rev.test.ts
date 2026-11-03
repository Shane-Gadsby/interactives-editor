import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SceneNode } from 'interactives-player';
import { importRive, classProps } from '../src/lib/rive-import';
import { importRev, readRevObjects, revToRiveObjects } from '../src/lib/rev-import';
import { RIVE_CLASSES } from '../src/lib/rive-defs';

// ---------------------------------------------------------------- a small .rev writer

type Ref = { client: number; id: number };
const ref = (client: number, id: number): Ref => ({ client, id });
type Val = number | string | boolean | Ref | Uint8Array | { frac: [number, number] };
interface Spec {
  type: string;
  client?: number;
  id: number;
  /** Runtime properties by name, editor properties by key number. */
  props: Record<string, Val>;
}

function writeRev(objects: Spec[], opts: { raw?: { type: number; id: number }[] } = {}): Uint8Array {
  const out: number[] = [];
  const varuint = (n: number, into: number[] = out) => {
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      into.push(b);
    } while (n);
  };
  const keyOf = (cls: string, prop: string): [number, string] => {
    for (const [k, d] of classProps(cls)) if (d.name === prop) return [k, d.type];
    throw new Error(`${cls}.${prop} is not defined`);
  };
  const records: number[][] = [];
  for (const o of objects) {
    const rec: number[] = [];
    varuint(RIVE_CLASSES[o.type][0], rec);
    varuint(o.client ?? 0, rec);
    varuint(o.id, rec);
    const entries = Object.entries(o.props);
    varuint(entries.length, rec);
    for (const [name, v] of entries) {
      const numeric = /^\d+$/.test(name);
      const [key, type] = numeric ? [Number(name), ''] : keyOf(o.type, name);
      const bytes: number[] = [];
      if (v instanceof Uint8Array) bytes.push(...v);
      else if (typeof v === 'object' && 'frac' in v) v.frac.forEach((n) => varuint(n, bytes));
      else if (typeof v === 'object') {
        varuint(v.client, bytes);
        varuint(v.id, bytes);
      } else if (typeof v === 'string') bytes.push(...new TextEncoder().encode(v));
      else if (typeof v === 'boolean') bytes.push(v ? 1 : 0);
      else if (type === 'f') bytes.push(...new Uint8Array(new Float32Array([v]).buffer));
      else varuint(v, bytes);
      varuint(key, rec);
      varuint(bytes.length, rec);
      rec.push(...bytes);
    }
    records.push(rec);
  }
  // Objects of a type this importer does not know, with one made-up property
  for (const r of opts.raw ?? []) {
    const rec: number[] = [];
    varuint(r.type, rec);
    varuint(0, rec);
    varuint(r.id, rec);
    varuint(1, rec);
    varuint(9999, rec);
    varuint(2, rec);
    rec.push(1, 2);
    records.push(rec);
  }
  varuint(7);
  varuint(1);
  varuint(12345);
  out.push(0x20, 0x41, 0x52, 0x54);
  varuint(records.length);
  for (const r of records) out.push(...r);
  return new Uint8Array(out);
}

const names = (list: SceneNode[]): string[] => list.map((n) => n.name);

describe('Rive editor file (.rev) import', () => {
  const spec = (): Spec[] => [
    { type: 'Backboard', id: 1, props: { 43: ref(0, 20) } },
    { type: 'Artboard', id: 10, props: { name: 'Main', width: 400, height: 300 } },
    { type: 'Artboard', id: 20, props: { name: 'Second', width: 200, height: 100 } },
    // Created in one order, laid out in another (child order is a fraction)
    { type: 'Shape', id: 11, props: { name: 'Dot', parentId: ref(0, 10), 6: { frac: [1, 2] }, x: 50, y: 60 } },
    { type: 'Ellipse', client: 5, id: 12, props: { parentId: ref(0, 11), 6: { frac: [1, 2] }, width: 40, height: 40 } },
    { type: 'Fill', client: 2, id: 13, props: { parentId: ref(0, 11), 6: { frac: [1, 2] } } },
    { type: 'SolidColor', id: 14, props: { parentId: ref(2, 13), 6: { frac: [1, 2] }, colorValue: 0xff00ff00 } },
    { type: 'Node', id: 15, props: { name: 'Behind', parentId: ref(0, 10), 6: { frac: [1, 3] } } },
    { type: 'Node', id: 16, props: { name: 'Second artboard layer', parentId: ref(0, 20), 6: { frac: [1, 2] } } },
    // An animation, its keys written out of order
    { type: 'LinearAnimation', id: 30, props: { name: 'Slide', 54: ref(0, 10), 73: { frac: [1, 2] }, duration: 30 } },
    { type: 'KeyedObject', id: 31, props: { 52: ref(0, 30), objectId: ref(0, 11) } },
    { type: 'KeyedProperty', id: 32, props: { 71: ref(0, 31), propertyKey: 13 } },
    { type: 'KeyFrameDouble', id: 33, props: { 72: ref(0, 32), frame: 30, interpolationType: 1, value: 200 } },
    { type: 'KeyFrameDouble', id: 34, props: { 72: ref(0, 32), frame: 0, interpolationType: 1, value: 50 } },
  ];

  it('rewrites the object tree into the order and indexes a .riv holds', () => {
    const { objects } = revToRiveObjects(writeRev(spec()));
    const types = objects.map((o) => o.type);
    expect(types.slice(0, 3)).toEqual(['Artboard', 'Node', 'Artboard']);
    // The default artboard (the backboard's) comes first, then the other
    expect(objects[0].props.name).toBe('Second');
    const second = types.indexOf('Artboard', 1);
    expect(objects[second].props.name).toBe('Main');
    // 'Behind' (child order 1/3) sits ahead of 'Dot' (1/2), and the paint hangs under the shape
    const slots = objects.slice(second, second + 8).map((o) => `${o.type}:${o.props.name ?? ''}:${o.props.parentId ?? ''}`);
    expect(slots).toEqual(['Artboard:Main:', 'Node:Behind:0', 'Shape:Dot:0', 'Ellipse::2', 'Fill::2', 'SolidColor::4', 'LinearAnimation:Slide:', 'KeyedObject::']);
    // The keyed object points at the shape's slot
    expect(objects.find((o) => o.type === 'KeyedObject')?.props.objectId).toBe(2);
    // Keys come out in frame order
    const frames = objects.filter((o) => o.type === 'KeyFrameDouble').map((o) => o.props.frame ?? 0);
    expect(frames).toEqual([0, 30]);
  });

  it('imports it like a .riv: layer names, the animation and its keys', async () => {
    const res = await importRev(writeRev(spec()), 'test');
    expect(res.artboards.map((a) => a.name)).toEqual(['Second', 'Main']);
    expect(res.artboard.name).toBe('Second');
    const main = res.artboards[1];
    // Top layer first, as everywhere else: 'Behind' has the lower child order, so it is underneath
    expect(names(main.children)).toEqual(['Dot', 'Behind']);
    expect(main.timelines.map((t) => t.name)).toEqual(['Slide']);
    const track = main.timelines[0].tracks[0];
    expect(track.prop).toBe('x');
    expect(track.keys.map((k) => k.t).sort((a, b) => a - b)[0]).toBe(0);
    expect(track.keys.length).toBe(2);
  });

  it('skips editor-only objects quietly, ignores keys it does not know and says so about types it does not', async () => {
    const quiet = await importRev(writeRev(spec(), { raw: [{ type: 595, id: 90 }] }), 'test');
    expect(quiet.warnings.some((w) => /not understood/.test(w))).toBe(false);
    const loud = await importRev(writeRev(spec(), { raw: [{ type: 9999, id: 91 }] }), 'test');
    expect(loud.warnings.some((w) => /not understood.*type 9999/.test(w))).toBe(true);
  });

  it('turns a file that is not a .rev into a clear error', () => {
    expect(() => readRevObjects(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]))).toThrow(/Rive editor file/);
    expect(() => readRevObjects(new Uint8Array([7, 1, 1, 0x20, 0x41, 0x52, 0x54, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(/laid out differently/);
  });
});

// ---------------------------------------------------------------- the matched pair

const dir = `${process.cwd()}/../research/rive/`;
const pair = existsSync(`${dir}262426_-_breathing_for_calm.rev`) && existsSync(`${dir}262426_-_breathing_for_calm.riv`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;
const ID = /[a-z]{1,3}[0-9][0-9a-z]{9,}/g;

/**
 * An artboard with its ids swapped for what they point at (a layer's place in the tree, a timeline's name, a variable's name)
 * and its names dropped, so two imports of the same thing compare equal whatever order they handed the ids out in.
 */
function normalise(ab: Doc, variables: Doc[], all: Doc[]): Doc {
  const sig = new Map<string, string>();
  for (const x of all) sig.set(x.id, `AB[${x.name}]`);
  const walkNodes = (list: Doc[], path: string) =>
    list.forEach((n, i) => {
      sig.set(n.id, `N[${path}${i}:${n.type}]`);
      if (n.children) walkNodes(n.children, `${path}${i}/`);
    });
  walkNodes(ab.children, '');
  (ab.timelines as Doc[]).forEach((t, i) => sig.set(t.id, `T[${i}:${t.name}]`));
  for (const v of variables) sig.set(v.id, `V[${v.name}]`);
  const rep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rep);
    if (v instanceof Uint8Array) return `bytes${v.length}`;
    if (v && typeof v === 'object') {
      const o: Doc = {};
      for (const k of Object.keys(v).sort()) if (k !== 'name' && k !== 'id') o[k] = rep((v as Doc)[k]);
      return o;
    }
    return typeof v === 'string' ? v.replace(ID, (m) => sig.get(m) ?? '?') : v;
  };
  // A logic node is known by what it holds
  for (const n of ab.logic.nodes as Doc[]) sig.set(n.id, `L[${JSON.stringify(rep({ kind: n.kind, params: n.params }))}]`);
  const timelines = (ab.timelines as Doc[]).map((t) => {
    const r = rep(t) as Doc;
    if (Array.isArray(r.tracks)) r.tracks = r.tracks.map((x: unknown) => JSON.stringify(x)).sort();
    return r;
  });
  return {
    rest: rep({ ...ab, children: undefined, timelines: undefined, logic: undefined }),
    children: rep(ab.children),
    timelines,
    nodes: (ab.logic.nodes as Doc[]).map((n) => sig.get(n.id)).sort(),
    edges: (ab.logic.edges as Doc[]).map((e) => JSON.stringify(rep({ from: e.from, to: e.to, fromPort: e.fromPort, toPort: e.toPort }))).sort(),
  };
}

describe.skipIf(!pair)('.rev against the .riv exported from it (research/rive)', () => {
  const read = (f: string) => new Uint8Array(readFileSync(`${dir}262426_-_breathing_for_calm.${f}`));

  it('has an object for everything the file says it has', () => {
    const objs = readRevObjects(read('rev'));
    expect(objs.length).toBe(3980);
    expect(objs.filter((o) => o.type === 'Artboard').length).toBe(18);
  });

  it('imports every artboard of the .riv as the same artboard', async () => {
    const riv = await importRive(read('riv'), 'riv');
    const rev = await importRev(read('rev'), 'rev');
    // The .riv puts the default artboard first, and so does the .rev import
    expect(rev.artboard.name).toBe(riv.artboard.name);
    expect(rev.artboards[0].name).toBe(riv.artboards[0].name);
    for (const a of riv.artboards) {
      const b = rev.artboards.find((x) => x.name === a.name);
      expect(b, a.name).toBeTruthy();
      const left = normalise(a as Doc, riv.variables as Doc[], riv.artboards as Doc[]);
      const right = normalise(b as Doc, rev.variables as Doc[], rev.artboards as Doc[]);
      expect(right, a.name).toEqual(left);
    }
    // Same fonts, same files, same warnings
    expect(rev.fonts.map((f) => f.family)).toEqual(riv.fonts.map((f) => f.family));
    expect(rev.assets.map((a) => [a.name, a.bytes.length])).toEqual(riv.assets.map((a) => [a.name, a.bytes.length]));
    expect(rev.warnings).toEqual(riv.warnings);
  });

  it('keeps what the export left out: the artboard it dropped and the layer names it stripped', async () => {
    const riv = await importRive(read('riv'), 'riv');
    const rev = await importRev(read('rev'), 'rev');
    expect(rev.artboards.length).toBe(riv.artboards.length + 1);
    const extra = rev.artboards.filter((a) => !riv.artboards.some((x) => x.name === a.name));
    expect(extra.map((a) => a.name)).toEqual(['MAIN ARTBOARD']);
    // The variables of the extra artboard's state machine come with it, and nothing else differs
    const known = new Set(riv.variables.map((v) => v.name));
    expect(rev.variables.filter((v) => !known.has(v.name)).length).toBe(rev.variables.length - riv.variables.length);
    const named = (list: SceneNode[]): number => list.reduce((n, x) => n + (/^(Node|Shape|Group|Rectangle|Ellipse|Text|Path)( \d+)?$/.test(x.name) ? 0 : 1) + (x.type === 'group' || x.type === 'frame' ? named(x.children) : 0), 0);
    const count = (r: typeof riv) => r.artboards.reduce((n, a) => n + named(a.children), 0);
    expect(count(rev)).toBeGreaterThan(count(riv));
    const info = rev.artboards.find((a) => a.name === 'Info Button')!;
    expect(JSON.stringify(info.children)).toContain('"name":"Hover"');
  });
});
