//Remote edits and undo history: other people's changes reach undo steps when the step is used, not every time they arrive.
//The outcome has to be exactly what putting them on every step at once gives (the `Eager` store below does that).
import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import type { Op } from '../shared/ops.mjs';
import { rng, seeds, type Rng } from './helpers/rng';

type Internals = { past: { seen: number }[]; future: { seen: number }[]; remoteLog: unknown[]; caughtUp(h: { seen: number }): { seen: number } };

/** The store as it was: every remote batch is put on every undo and redo step as it arrives. */
class Eager extends EditorStore {
  override applyRemote(ops: Op[]): void {
    super.applyRemote(ops);
    const me = this as unknown as Internals;
    me.past = me.past.map((h) => me.caughtUp(h));
    me.future = me.future.map((h) => me.caughtUp(h));
  }
}

function makeProject(r: Rng): Project {
  const p = createProject('History');
  for (let i = 0; i < 5; i++) p.artboards[0].children.push(createNode(r.pick(['rect', 'ellipse', 'text'] as const), { name: `L${i}`, x: r.int(300), y: r.int(300), width: 20 + r.int(80), height: 20 + r.int(80) }));
  return p;
}

const kids = (s: EditorStore): SceneNode[] => s.artboard()!.children as SceneNode[];

/** One random remote batch: property sets, an insert, a delete, a move. */
function remoteOps(s: EditorStore, r: Rng, fresh: () => SceneNode): Op[] {
  const abId = s.artboard()!.id;
  const list = kids(s);
  const at = (n: SceneNode, k: string) => ['artboards', { i: abId }, 'children', { i: n.id }, k] as never;
  const ops: Op[] = [];
  const n = r.int(3) + 1;
  for (let i = 0; i < n; i++) {
    const t = r.int(8);
    if (t < 4 && list.length) ops.push({ t: 'set', p: at(r.pick(list), r.pick(['x', 'y', 'opacity', 'name', 'rotation'])), v: r.pick([r.int(500), r(), 'theirs' + r.int(9)]) } as Op);
    else if (t === 4) ops.push({ t: 'ins', p: ['artboards', { i: abId }, 'children'] as never, v: fresh() as never, after: list.length ? r.pick(list).id : null });
    else if (t === 5 && list.length > 2) ops.push({ t: 'del', p: ['artboards', { i: abId }, 'children'] as never, id: r.pick(list).id });
    else if (t === 6 && list.length > 1) ops.push({ t: 'mv', p: ['artboards', { i: abId }, 'children'] as never, id: r.pick(list).id, after: r.pick(list).id } as Op);
    else if (list.length) ops.push({ t: 'set', p: at(r.pick(list), 'x'), v: 'not a number' } as Op); //wrong typed: sanitised
  }
  return ops;
}

function local(s: EditorStore, r: Rng): void {
  const list = kids(s);
  switch (r.int(6)) {
    case 0:
    case 1:
      if (list.length) s.setProps([r.pick(list).id], { x: r.int(600), y: r.int(600) });
      break;
    case 2:
      if (list.length) s.setProps([r.pick(list).id], { opacity: r(), name: 'mine' + r.int(99) });
      break;
    case 3:
      s.addNodes([createNode('rect', { id: 'loc' + r.int(1e9), name: 'New', x: r.int(200) })]);
      break;
    case 4:
      if (list.length > 1) {
        s.select([r.pick(list).id]);
        s.deleteSelection();
      }
      break;
    default:
      if (list.length) {
        const id = r.pick(list).id;
        for (let i = 0; i < 3; i++) s.setProps([id], { y: r.int(600) }, `drag-${id}`);
        s.commit();
      }
  }
}

describe('remote edits and undo history', () => {
  for (const seed of seeds(40)) {
    it(`gives what patching every step at once gives (seed ${seed})`, () => {
      const base = makeProject(rng(seed));
      const lazy = new EditorStore(structuredClone(base));
      const eager = new Eager(structuredClone(base));
      const rl = rng(seed * 7 + 1);
      const re = rng(seed * 7 + 1);
      let counter = 0;
      const fresh = (): SceneNode => createNode('rect', { id: `remote${seed}_${counter++}`, name: 'Theirs', x: 3 }) as SceneNode;
      const rr = rng(seed * 13 + 5);
      const log: string[] = [];
      for (let i = 0; i < 160; i++) {
        const t = rr.int(10);
        log.push(String(t));
        if (t < 3) {
          local(lazy, rl);
          local(eager, re);
        } else if (t < 6) {
          //the same batch for both (built from the lazy store; their documents are the same)
          const ops = remoteOps(lazy, rr, fresh);
          lazy.applyRemote(ops);
          eager.applyRemote(structuredClone(ops));
        } else if (t < 8) {
          lazy.undo();
          eager.undo();
        } else {
          lazy.redo();
          eager.redo();
        }
        expect(JSON.stringify(lazy.get().project.artboards), `step ${i} (${log.join('')})`).toBe(JSON.stringify(eager.get().project.artboards));
        expect(lazy.canUndo()).toBe(eager.canUndo());
        expect(lazy.canRedo()).toBe(eager.canRedo());
        expect(lazy.get().selection).toEqual(eager.get().selection);
      }
      //and all the way back, and forward again
      while (lazy.canUndo()) {
        lazy.undo();
        eager.undo();
        expect(JSON.stringify(lazy.get().project.artboards)).toBe(JSON.stringify(eager.get().project.artboards));
      }
      while (lazy.canRedo()) {
        lazy.redo();
        eager.redo();
        expect(JSON.stringify(lazy.get().project.artboards)).toBe(JSON.stringify(eager.get().project.artboards));
      }
    });
  }

  it('undo takes back only your own changes, however many remote batches came in between', () => {
    const p = createProject('T');
    p.artboards[0].children.push(createNode('rect', { name: 'A', x: 1 }), createNode('rect', { name: 'B', x: 2 }));
    const s = new EditorStore(p);
    const [a, b] = kids(s);
    const abId = s.artboard()!.id;
    const set = (id: string, k: string, v: unknown): Op => ({ t: 'set', p: ['artboards', { i: abId }, 'children', { i: id }, k] as never, v }) as Op;
    s.setProps([a.id], { x: 100 });
    for (let i = 0; i < 300; i++) s.applyRemote([set(b.id, 'x', 1000 + i)]);
    s.setProps([a.id], { x: 200 });
    for (let i = 0; i < 300; i++) s.applyRemote([set(a.id, 'opacity', i / 1000), set(b.id, 'y', i)]);
    s.undo();
    expect([kids(s)[0].x, kids(s)[0].opacity, kids(s)[1].x, kids(s)[1].y]).toEqual([100, 0.299, 1299, 299]);
    s.undo();
    expect([kids(s)[0].x, kids(s)[0].opacity, kids(s)[1].x]).toEqual([1, 0.299, 1299]);
    s.redo();
    s.redo();
    expect([kids(s)[0].x, kids(s)[0].opacity, kids(s)[1].x, kids(s)[1].y]).toEqual([200, 0.299, 1299, 299]);
    expect(s.canRedo()).toBe(false);
  });

  it('does not patch the history when remote edits arrive, and does not keep batches no step needs', () => {
    const p = createProject('T');
    p.artboards[0].children.push(createNode('rect', { name: 'A' }));
    const s = new EditorStore(p);
    const abId = s.artboard()!.id;
    const id = kids(s)[0].id;
    for (let i = 0; i < 50; i++) s.setProps([id], { x: i + 10 });
    const past = (s as unknown as Internals).past;
    const stale = past.map((h) => (h as unknown as { project: Project }).project);
    for (let i = 0; i < 30; i++) s.applyRemote([{ t: 'set', p: ['artboards', { i: abId }, 'children', { i: id }, 'opacity'] as never, v: 0.5 } as Op]);
    // untouched until used: the same documents as before
    expect((s as unknown as Internals).past.map((h) => (h as unknown as { project: Project }).project).every((pr, i) => pr === stale[i])).toBe(true);
    // with nothing to undo no batch is kept
    const t = new EditorStore(createProject('E'));
    for (let i = 0; i < 200; i++) t.applyRemote([{ t: 'set', p: ['name'] as never, v: 'n' + i } as Op]);
    expect((t as unknown as Internals).remoteLog.length).toBeLessThanOrEqual(64);
    expect(t.get().project.name).toBe('n199');
  });

  it('catches every step up when a few old ones would hold too many batches, and replaceProject starts over', () => {
    const p = createProject('T');
    p.artboards[0].children.push(createNode('rect', { name: 'A' }));
    const s = new EditorStore(p);
    const abId = s.artboard()!.id;
    const id = kids(s)[0].id;
    s.setProps([id], { x: 7 });
    for (let i = 0; i < 1300; i++) s.applyRemote([{ t: 'set', p: ['artboards', { i: abId }, 'children', { i: id }, 'rotation'] as never, v: i } as Op]);
    expect((s as unknown as Internals).remoteLog.length).toBeLessThan(1100);
    s.undo();
    expect(kids(s)[0].x).not.toBe(7);
    expect(kids(s)[0].rotation).toBe(1299);
    s.replaceProject(createProject('R'));
    expect(s.canUndo()).toBe(false);
    s.applyRemote([{ t: 'set', p: ['name'] as never, v: 'after' } as Op]);
    expect(s.get().project.name).toBe('after');
  });
});
