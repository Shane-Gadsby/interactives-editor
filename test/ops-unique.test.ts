//Random inserts, deletes and moves of layers, nested and with children of their own, applied the way the server applies them:
//a layer id must live once per artboard after every single op, and ops the document can't take are skipped, not thrown.
import { describe, expect, it } from 'vitest';
import { apply, diff, opKey, orderFixes, type Op } from '../shared/ops.mjs';
import { replayAfter } from '../src/lib/live';
import { rng, seeds, type Rng } from './helpers/rng';

type Layer = { id: string; children?: Layer[]; x?: number };
const POOL = Array.from({ length: 9 }, (_, i) => `n${i}`);
const AB = 'ab1';

const ids = (list: Layer[], out: string[] = []): string[] => {
  for (const l of list) {
    out.push(l.id);
    if (l.children) ids(l.children, out);
  }
  return out;
};

/** A layer as a client would send it: its own id and its children's all different (a layer is never inside itself). */
function layer(r: Rng, used = new Set<string>(), depth = 0): Layer {
  const free = POOL.filter((id) => !used.has(id));
  const l: Layer = { id: r.pick(free), x: r.int(9) };
  used.add(l.id);
  if (depth < 2 && r.chance(0.5)) l.children = Array.from({ length: r.int(3) }, () => (POOL.length - used.size > 0 ? layer(r, used, depth + 1) : null)).filter(Boolean) as Layer[];
  return l;
}

/** Every list of layers in a document, with the path to it. */
function lists(doc: { artboards: { id: string; children: Layer[] }[] }): { path: (string | { i: string })[]; list: Layer[] }[] {
  const out: { path: (string | { i: string })[]; list: Layer[] }[] = [];
  const walk = (path: (string | { i: string })[], list: Layer[]) => {
    out.push({ path, list });
    for (const l of list) if (l.children) walk([...path, { i: l.id }, 'children'], l.children);
  };
  for (const ab of doc.artboards) walk(['artboards', { i: ab.id }, 'children'], ab.children);
  return out;
}

/** A document whose layer ids are all different, to start from. */
function base(r: Rng) {
  const used = new Set<string>();
  const make = (depth: number): Layer | null => {
    const id = r.pick(POOL);
    if (used.has(id)) return null;
    used.add(id);
    const l: Layer = { id, x: 0 };
    if (depth < 2) l.children = Array.from({ length: r.int(3) }, () => make(depth + 1)).filter(Boolean) as Layer[];
    return l;
  };
  return { artboards: [{ id: AB, children: Array.from({ length: 4 }, () => make(0)).filter(Boolean) as Layer[] }] };
}

describe('layer ids stay unique through any sequence of ops', () => {
  it('inserts, deletes and sets, in any list, with children inside the inserted layers', () => {
    for (const seed of seeds(300)) {
      const r = rng(seed * 31337);
      const doc = base(r);
      const log: string[] = [];
      for (let i = 0; i < 40; i++) {
        const all = lists(doc);
        const target = r.pick(all);
        const k = r.int(4);
        let op: Op;
        if (k === 0) op = { t: 'ins', p: target.path, v: layer(r), after: target.list.length && r.chance(0.7) ? r.pick(target.list).id : r.chance(0.5) ? null : r.pick(POOL) };
        else if (k === 1) op = { t: 'del', p: target.path, id: r.pick(POOL) };
        else if (k === 2) op = { t: 'set', p: [...target.path, { i: r.pick(POOL) }, 'x'], v: r.int(99) };
        else op = { t: 'ins', p: target.path, v: layer(r), after: null };
        log.push(JSON.stringify(op));
        apply(doc, JSON.parse(JSON.stringify([op])));
        const seen = ids(doc.artboards[0].children);
        expect(new Set(seen).size, `seed ${seed} after ${log.slice(-3).join(' ; ')}: ${seen}`).toBe(seen.length);
      }
    }
  });

  it('what a client does to put its lists in the server\'s order never leaves a layer twice either', () => {
    for (const seed of seeds(300)) {
      const r = rng(seed * 7);
      const shadow = base(r);
      // two editors work from the same document: `mine` unanswered, `theirs` ordered first by the server
      const make = (): Op[] => {
        const doc = JSON.parse(JSON.stringify(shadow));
        const ops: Op[] = [];
        for (let i = 0; i < 1 + r.int(4); i++) {
          const target = r.pick(lists(doc));
          const op: Op = r.chance(0.5) && target.list.length ? { t: 'del', p: target.path, id: r.pick(target.list).id } : { t: 'ins', p: target.path, v: layer(r), after: target.list.length && r.chance(0.7) ? r.pick(target.list).id : null };
          apply(doc, [op]);
          ops.push(op);
        }
        return ops;
      };
      const mine = make();
      const theirs = make();
      // the client: the shadow plus theirs, plus mine on top (what applyRemote and local edits give)
      const server = JSON.parse(JSON.stringify(shadow));
      apply(server, JSON.parse(JSON.stringify(theirs)));
      apply(server, JSON.parse(JSON.stringify(mine)));
      const local = JSON.parse(JSON.stringify(shadow));
      apply(local, JSON.parse(JSON.stringify(mine)));
      const shadowNow = JSON.parse(JSON.stringify(shadow));
      apply(shadowNow, JSON.parse(JSON.stringify(theirs)));
      // it hears of theirs while its own are unanswered (the way LiveSession takes them in: skip what ours overwrite, put ours back after)
      const ownKeys = new Set(mine.map(opKey));
      const covered = (key: string) => key.split('/').some((_, i, parts) => ownKeys.has(parts.slice(0, i + 1).join('/')));
      const usable = theirs.filter((op) => !covered(opKey(op)));
      apply(local, JSON.parse(JSON.stringify([...usable, ...replayAfter(mine, usable)])));
      const fixes = orderFixes(local, shadowNow, mine, theirs);
      apply(local, JSON.parse(JSON.stringify(fixes)));
      const seen = ids(local.artboards[0].children);
      expect(new Set(seen).size, `seed ${seed}: a layer twice in ${seen}`).toBe(seen.length);
      expect(JSON.stringify(local.artboards[0].children.map((l: Layer) => l.id)), `seed ${seed}: top level order`).toBe(JSON.stringify(server.artboards[0].children.map((l: Layer) => l.id)));
      expect(diff(local, server).length, `seed ${seed}: documents differ`).toBe(0);
    }
  });
});
