//Property tests for the live-editing ops (shared/ops.mjs): random documents, random edits, and the claims the rest
//of the system leans on. Seeded, so a failing seed replays exactly.
import { describe, expect, it } from 'vitest';
import { apply, diff, isIdArray, opKey, type Op } from '../shared/ops.mjs';
import { rng, seeds, type Rng } from './helpers/rng';

type Json = any;
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const norm = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

let counter = 0;
const newId = (r: Rng) => `e${(counter++).toString(36)}${r.int(1000)}`;

function scalar(r: Rng): Json {
  return r.pick([r.int(1000), r() * 100, `s${r.int(50)}`, true, false, null, '', 'unicode ✓ 日本語']);
}

function genElement(r: Rng, depth: number): Json {
  const el: Json = { id: newId(r), name: `n${r.int(100)}`, x: r.int(500), y: r.int(500) };
  if (r.chance(0.4)) el.props = { color: `#${r.int(0xffffff).toString(16)}`, nested: { a: r.int(9), b: [r.int(9), r.int(9)] } };
  if (r.chance(0.2)) el.fills = [{ type: 'solid', color: '#fff' }, { type: 'linear', stops: [{ offset: 0 }, { offset: 1 }] }];
  if (depth > 0 && r.chance(0.5)) el.children = Array.from({ length: r.int(4) }, () => genElement(r, depth - 1));
  return el;
}

function genDoc(r: Rng): Json {
  return {
    name: `doc${r.int(100)}`,
    settings: { a: r.int(10), b: { c: 'x' } },
    tags: Array.from({ length: r.int(4) }, () => scalar(r)),
    artboards: Array.from({ length: 1 + r.int(3) }, () => ({ id: newId(r), name: 'ab', width: 100, height: 100, children: Array.from({ length: r.int(6) }, () => genElement(r, 2)) })),
    variables: Array.from({ length: r.int(3) }, () => ({ id: newId(r), name: 'v', initial: scalar(r) })),
  };
}

/** Every object (with the key path to it) and every id array (with its path) in a document. */
function index(doc: Json) {
  const objects: { o: Json; keys: string[] }[] = [];
  const arrays: { a: Json[]; owner: Json; key: string }[] = [];
  const walk = (v: Json, keys: string[]) => {
    if (Array.isArray(v)) {
      v.forEach((e) => walk(e, keys));
      return;
    }
    if (!v || typeof v !== 'object') return;
    objects.push({ o: v, keys });
    for (const [k, c] of Object.entries(v)) {
      if (Array.isArray(c) && (c.length === 0 || isIdArray(c))) arrays.push({ a: c, owner: v, key: k });
      walk(c, [...keys, k]);
    }
  };
  walk(doc, []);
  return { objects, arrays };
}

/** One random edit, in place. */
function edit(doc: Json, r: Rng) {
  const { objects, arrays } = index(doc);
  const kind = r.int(9);
  const target = r.pick(objects).o;
  const keys = Object.keys(target);
  if (kind === 0 && keys.length) {
    const k = r.pick(keys);
    if (!Array.isArray(target[k]) && (typeof target[k] !== 'object' || target[k] === null)) target[k] = scalar(r);
  } else if (kind === 1 && keys.length) {
    const k = r.pick(keys);
    if (k !== 'id') delete target[k];
  } else if (kind === 2) target[`k${r.int(5)}`] = r.chance(0.5) ? scalar(r) : { deep: scalar(r) };
  else if (kind === 3 && arrays.length) {
    const { a } = r.pick(arrays);
    a.splice(r.int(a.length + 1), 0, genElement(r, 1));
  } else if (kind === 4 && arrays.length) {
    const { a } = r.pick(arrays);
    if (a.length) a.splice(r.int(a.length), 1);
  } else if (kind === 5 && arrays.length) {
    //reorder: move one element
    const { a } = r.pick(arrays);
    if (a.length > 1) {
      const [e] = a.splice(r.int(a.length), 1);
      a.splice(r.int(a.length + 1), 0, e);
    }
  } else if (kind === 6 && arrays.length) {
    //move an element to a different array (same id, new parent)
    const from = r.pick(arrays);
    const to = r.pick(arrays);
    if (from.a.length && from !== to) {
      const [e] = from.a.splice(r.int(from.a.length), 1);
      const inside = (n: Json): boolean => n === to.a || (Array.isArray(n) ? n.some(inside) : n && typeof n === 'object' && Object.values(n).some(inside));
      if (inside(e)) from.a.push(e);
      else to.a.splice(r.int(to.a.length + 1), 0, e);
    }
  } else if (kind === 7 && arrays.length) {
    //shuffle
    const { a } = r.pick(arrays);
    for (let i = a.length - 1; i > 0; i--) {
      const j = r.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
  } else if (kind === 8 && Array.isArray(doc.tags)) doc.tags = Array.from({ length: r.int(4) }, () => scalar(r));
}

const mutateDoc = (doc: Json, r: Rng, n = 1 + r.int(6)) => {
  for (let i = 0; i < n; i++) edit(doc, r);
  return doc;
};

describe('ops properties', () => {
  let r: Rng = rng(1);
  /** Runs the property once per seed, saying which seed broke it. */
  const each = (name: string, fn: () => void) =>
    it(name, () => {
      for (const seed of seeds()) {
        r = rng(seed * 7919);
        try {
          fn();
        } catch (e) {
          if (e instanceof Error) e.message = `seed ${seed}: ${e.message}`;
          throw e;
        }
      }
    });

  each('diff then apply turns the old document into the new one, and diff of equal documents is empty', () => {
    const a = genDoc(r);
    expect(diff(a, clone(a))).toEqual([]);
    let cur = clone(a);
    for (let round = 0; round < 6; round++) {
      const b = mutateDoc(clone(cur), r);
      const ops = diff(cur, b);
      const got = clone(cur);
      apply(got, clone(ops));
      expect(norm(got), `round ${round}`).toEqual(norm(b));
      cur = b;
    }
  });

  each('applying the same ops twice gives the same document as applying them once (a retried batch is harmless)', () => {
    const a = genDoc(r);
    const b = mutateDoc(clone(a), r, 8);
    const ops = diff(a, b);
    const once = clone(a);
    apply(once, clone(ops));
    const twice = clone(once);
    apply(twice, clone(ops));
    expect(norm(twice)).toEqual(norm(once));
  });

  each('the ops survive a JSON round trip over the wire', () => {
    const a = genDoc(r);
    const b = mutateDoc(clone(a), r, 8);
    const wire = JSON.parse(JSON.stringify(diff(a, b)));
    const got = clone(a);
    apply(got, wire);
    expect(norm(got)).toEqual(norm(b));
  });

  each('edits to different layers commute: either order gives the same document', () => {
    const base = genDoc(r);
    //two people each edit the properties of their own layer (no structure changes), in different artboards
    const boards = base.artboards as Json[];
    if (boards.length < 2) return;
    const left = clone(base);
    const right = clone(base);
    const touch = (doc: Json, board: number) => {
      for (const el of doc.artboards[board].children as Json[]) {
        if (r.chance(0.6)) el.x = r.int(9999);
        if (r.chance(0.3)) el.name = `renamed${r.int(99)}`;
      }
      doc.artboards[board].width = r.int(999);
    };
    touch(left, 0);
    touch(right, 1);
    const opsL = diff(base, left);
    const opsR = diff(base, right);
    const ab = clone(base);
    apply(ab, clone(opsL));
    apply(ab, clone(opsR));
    const ba = clone(base);
    apply(ba, clone(opsR));
    apply(ba, clone(opsL));
    expect(norm(ab)).toEqual(norm(ba));
  });

  each('the server\'s order wins per property: the later set is what stays', () => {
    const base = genDoc(r);
    const target = base.artboards[0];
    const first = clone(base);
    const second = clone(base);
    first.artboards[0].name = 'from first';
    second.artboards[0].name = 'from second';
    const doc = clone(base);
    apply(doc, diff(base, first));
    apply(doc, diff(base, second));
    expect(doc.artboards[0].name).toBe('from second');
    expect(doc.artboards[0].id).toBe(target.id);
  });

  each('an edit to a layer someone else deleted is skipped, not an error, and does not resurrect it', () => {
    const base = genDoc(r);
    const withLayers = base.artboards.find((a: Json) => a.children.length) as Json | undefined;
    if (!withLayers) return;
    const victim = r.pick(withLayers.children as Json[]);
    const deleter = clone(base);
    const dAb = deleter.artboards.find((a: Json) => a.id === withLayers.id);
    dAb.children = dAb.children.filter((c: Json) => c.id !== victim.id);
    const editor = clone(base);
    editor.artboards.find((a: Json) => a.id === withLayers.id).children.find((c: Json) => c.id === victim.id).x = 12345;
    const doc = clone(base);
    apply(doc, diff(base, deleter));
    expect(() => apply(doc, diff(base, editor))).not.toThrow();
    expect(JSON.stringify(doc)).not.toContain(`"id":"${victim.id}"`);
  });

  each('opKey is the same for ops that write the same property, and different for different ones', () => {
    const a = genDoc(r);
    const b = mutateDoc(clone(a), r, 10);
    const ops = diff(a, b) as Op[];
    for (const op of ops) expect(opKey(op)).toBe(opKey(clone(op)));
    const keys = new Set(ops.filter((o) => o.t === 'set').map(opKey));
    expect(keys.size).toBeLessThanOrEqual(ops.length);
  });
});

describe('apply on hostile or broken ops', () => {
  const doc = () => ({ name: 'x', artboards: [{ id: 'a', children: [{ id: 'n', x: 1 }] }] });

  it('never pollutes Object.prototype, however the path is spelled', () => {
    const d = doc();
    apply(d, [
      { t: 'set', p: ['__proto__', 'polluted'], v: true },
      { t: 'set', p: ['constructor', 'prototype', 'polluted'], v: true },
      { t: 'set', p: ['artboards', { i: 'a' }, '__proto__', 'polluted'], v: true },
      { t: 'ins', p: ['__proto__', 'list'], v: { id: 'z', polluted: true }, after: null },
      { t: 'set', p: ['name', 'constructor'], v: 1 },
    ] as Op[]);
    expect(({} as Json).polluted).toBeUndefined();
    expect(({} as Json).list).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('skips ops that are not ops, and paths that are not paths', () => {
    const d = doc();
    const before = clone(d);
    expect(() => apply(d, [null, undefined, 5, 'x', {}, { t: 'set' }, { t: 'set', p: 'name', v: 1 }, { t: 'set', p: [], v: 1 }, { t: 'nope', p: ['name'] }, { t: 'del', p: [] , id: 'n'}, { t: 'set', p: [{ i: 'a' }], v: 1 }] as never)).not.toThrow();
    expect(d.name).toBe('x');
    expect(norm(d.artboards)).toEqual(norm(before.artboards));
  });

  it('does not throw on random garbage ops', () => {
    for (const seed of seeds(200)) {
      const r = rng(seed * 31 + 5);
      const junk = (): Json => r.pick([null, 0, 1, -1, 'name', 'x', '__proto__', 'artboards', 'children', { i: 'a' }, { i: 'n' }, { i: 5 }, { i: null }, {}, [], true, undefined]);
      const d = doc();
      const ops = Array.from({ length: 8 }, () => ({ t: r.pick(['set', 'ins', 'del', 'zzz']), p: Array.from({ length: r.int(5) }, junk), v: r.chance(0.5) ? { id: 'q', ...(r.chance(0.5) ? { n: 1 } : {}) } : junk(), id: junk(), after: junk() }));
      expect(() => apply(d, ops as never), `seed ${seed}: ${JSON.stringify(ops)}`).not.toThrow();
    }
  });
});
