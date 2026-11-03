//Several editors and one server, all in memory: random concurrent edits through the real EditorStore and LiveSession,
//with the server ordering ops (shared/ops.mjs) and each client seeing them after a random delay. When everything has
//settled, every client must hold exactly the server's document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { LiveSession, replayAfter, setLiveSession } from '../src/lib/live';
import { apply, type Op } from '../shared/ops.mjs';
import { rng, seeds, type Rng } from './helpers/rng';

interface Entry {
  seq: number;
  clientId: string;
  ops: Op[];
}

class Net {
  doc: any;
  seq = 0;
  log: Entry[] = [];
  sources = new Map<string, FakeES>();
  inbox = new Map<string, Entry[]>();
  /** Ops POSTed but not yet seen by the server, to give the network some latency too. */
  constructor(doc: unknown) {
    this.doc = JSON.parse(JSON.stringify(doc));
  }
  post(clientId: string, ops: Op[]) {
    apply(this.doc, JSON.parse(JSON.stringify(ops)));
    const e = { seq: ++this.seq, clientId, ops };
    this.log.push(e);
    for (const q of this.inbox.values()) q.push(e);
  }
  /** Hand each client some of what is waiting for it, in order. */
  deliver(r: Rng, all = false) {
    for (const [id, q] of this.inbox) {
      const es = this.sources.get(id);
      if (!es) continue;
      const n = all ? q.length : r.int(q.length + 1);
      for (const e of q.splice(0, n)) es.emit('ops', e);
    }
  }
  get idle() {
    return [...this.inbox.values()].every((q) => !q.length);
  }
}

let net: Net;
class FakeES {
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    const id = /clientId=([^&]+)/.exec(url)![1];
    net.sources.set(id, this);
    net.inbox.set(id, []);
  }
  addEventListener(n: string, f: (e: { data: string }) => void) {
    (this.listeners[n] ??= []).push(f);
  }
  close() {}
  emit(n: string, data: unknown) {
    for (const f of this.listeners[n] ?? []) f({ data: JSON.stringify(data) });
  }
}

/** Two editors, no randomness: `a` then `b` edit before either hears of the other (A's batch reaches the server first), then everything settles. */
async function twoEditors(setup: (s: EditorStore) => void, a: (s: EditorStore) => void, b: (s: EditorStore) => void) {
  const base: Project = createProject('Two');
  for (const n of ['L0', 'L1', 'L2']) abOf(base).children.push(createNode('rect', { name: n, id: `id${n}` } as never));
  net = new Net(base);
  vi.stubGlobal('EventSource', FakeES);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/ops')) {
        const body = JSON.parse(init!.body!);
        net.post(body.clientId, body.ops);
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
  const mk = () => {
    const store = new EditorStore(json(base));
    return { store, session: new LiveSession('proj1', store, 0) };
  };
  const A = mk();
  const B = mk();
  await vi.advanceTimersByTimeAsync(20);
  for (const c of [A, B]) net.sources.get((c.session as any).clientId)!.emit('hello', { seq: 0, rev: 1, clientId: (c.session as any).clientId, color: '#f00', peers: [] });
  setup(A.store);
  setup(B.store);
  a(A.store);
  b(B.store);
  for (let i = 0; i < 20; i++) {
    await vi.advanceTimersByTimeAsync(100);
    net.deliver(rng(1), true);
  }
  return { A, B, server: net.doc as Project };
}

const abOf = (p: Project) => p.artboards[0];
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

async function run(seed: number, opts: { structure: boolean; nest?: boolean }) {
  const r = rng(seed * 104729);
  const base: Project = createProject('Converge');
  for (let i = 0; i < 5; i++) abOf(base).children.push(createNode('rect', { name: `L${i}`, x: i * 10, y: 0, width: 40, height: 40 }));
  if (opts.nest) {
    //two groups with a couple of layers each, so layers can be reordered and reparented between lists
    for (let g = 0; g < 2; g++) {
      const group = createNode('group', { name: `G${g}`, x: 0, y: 0, width: 100, height: 100 });
      for (let i = 0; i < 3; i++) (group as any).children.push(createNode('rect', { name: `G${g}L${i}`, x: i * 10, y: 0, width: 20, height: 20 }));
      abOf(base).children.push(group);
    }
  }
  net = new Net(base);
  vi.stubGlobal('EventSource', FakeES);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/ops')) {
        const body = JSON.parse(init!.body!);
        net.post(body.clientId, body.ops);
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
  const clients = Array.from({ length: 3 }, () => {
    const store = new EditorStore(json(base));
    const session = new LiveSession('proj1', store, 0);
    return { store, session };
  });
  await vi.advanceTimersByTimeAsync(20);
  for (const c of clients) net.sources.get((c.session as any).clientId)!.emit('hello', { seq: 0, rev: 1, clientId: (c.session as any).clientId, color: '#f00', peers: [] });

  const flat = (nodes: any[]): string[] => nodes.flatMap((n) => [n.id, ...flat(n.children ?? [])]);
  const layerIds = (s: EditorStore) => (opts.nest ? flat(abOf(s.get().project).children) : abOf(s.get().project).children.map((n) => n.id));
  const groupIds = (s: EditorStore) => flat(abOf(s.get().project).children).filter((id) => /group/.test(String(findType(s, id))));
  const findType = (s: EditorStore, id: string) => {
    const walk = (nodes: any[]): any => {
      for (const n of nodes) {
        if (n.id === id) return n.type;
        const t = walk(n.children ?? []);
        if (t) return t;
      }
    };
    return walk(abOf(s.get().project).children);
  };
  for (let step = 0; step < 40; step++) {
    const c = r.pick(clients);
    const s = c.store;
    const ids = layerIds(s);
    const k = r.int(opts.structure ? 10 : 6);
    if (k <= 2 && ids.length) s.setProps([r.pick(ids)], { x: r.int(500) });
    else if (k === 3 && ids.length) s.setProps([r.pick(ids)], { name: `n${r.int(50)}`, opacity: r() });
    else if (k === 4 && ids.length) s.setProps([r.pick(ids), r.pick(ids)], { y: r.int(500) });
    else if (k === 5) {
      s.undo();
    } else if (k === 6) s.redo();
    else if (k === 7) s.addNodes([createNode('ellipse', { name: 'E', x: r.int(50), y: r.int(50) })]);
    else if (k === 8 && ids.length > 2) {
      s.select([r.pick(ids)]);
      s.deleteSelection();
    } else if (k === 9 && ids.length > 2) {
      const groups = opts.nest ? groupIds(s) : [];
      //into a group (any depth), or back to the top level
      const parent = groups.length && r.chance(0.6) ? r.pick(groups) : null;
      s.moveNode(r.pick(ids), parent, r.int(ids.length));
    }
    await vi.advanceTimersByTimeAsync(r.int(120));
    net.deliver(r);
  }
  //settle: let every client send what it has queued, and every client receive everything
  for (let i = 0; i < 40; i++) {
    await vi.advanceTimersByTimeAsync(100);
    net.deliver(r, true);
    if (net.idle && !clients.some((c) => c.session.busy)) break;
  }
  await vi.advanceTimersByTimeAsync(100);
  net.deliver(r, true);
  await vi.advanceTimersByTimeAsync(100);
  return { clients, server: net.doc as Project };
}

describe('live editing converges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    setLiveSession(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('property edits from three editors, with undo and redo, end up identical everywhere', async () => {
    for (const seed of seeds(25)) {
      const { clients, server } = await run(seed, { structure: false });
      for (const [i, c] of clients.entries()) {
        const mine = c.store.get().project;
        expect(json(mine.artboards), `seed ${seed} client ${i}`).toEqual(json(server.artboards));
        c.session.close();
      }
    }
  }, 60000);

  it('adding, deleting and moving layers leaves every editor with exactly the server document, stacking order included', async () => {
    for (const seed of seeds(300)) {
      const { clients, server } = await run(seed, { structure: true });
      for (const [i, c] of clients.entries()) {
        expect(json(c.store.get().project.artboards), `seed ${seed} client ${i}`).toEqual(json(server.artboards));
        c.session.close();
      }
    }
  }, 300000);

  it('the same with layers inside groups, reordered and moved between lists', async () => {
    for (const seed of seeds(300)) {
      const { clients, server } = await run(seed, { structure: true, nest: true });
      for (const [i, c] of clients.entries()) {
        expect(json(c.store.get().project.artboards), `seed ${seed} client ${i}`).toEqual(json(server.artboards));
        c.session.close();
      }
    }
  }, 300000);

  describe('the common collisions, exactly', () => {
    const ids = (p: Project) => abOf(p).children.map((n) => n.id);

    it('two editors adding a layer on top at the same moment see the same stacking order as the server', async () => {
      const { A, B, server } = await twoEditors(
        () => {},
        (s) => s.addNodes([createNode('ellipse', { name: 'from A', id: 'idA' } as never)]),
        (s) => s.addNodes([createNode('ellipse', { name: 'from B', id: 'idB' } as never)]),
      );
      expect(ids(server)).toHaveLength(5);
      expect(ids(A.store.get().project)).toEqual(ids(server));
      expect(ids(B.store.get().project)).toEqual(ids(server));
    });

    it('one editor moving a layer while another edits it: everyone ends with the same layer, in the same place', async () => {
      const { A, B, server } = await twoEditors(
        () => {},
        (s) => s.setProps(['idL1'], { x: 321, name: 'renamed' }),
        (s) => s.moveNode('idL1', null, 0),
      );
      const get = (p: Project) => abOf(p).children.find((n) => n.id === 'idL1')!;
      expect(ids(A.store.get().project)).toEqual(ids(server));
      expect(ids(B.store.get().project)).toEqual(ids(server));
      expect(json(get(A.store.get().project))).toEqual(json(get(server)));
      expect(json(get(B.store.get().project))).toEqual(json(get(server)));
    });

    it('one editor deleting a layer while another edits it: the edit is dropped everywhere, nothing comes back', async () => {
      const { A, B, server } = await twoEditors(
        () => {},
        (s) => {
          s.select(['idL2']);
          s.deleteSelection();
        },
        (s) => s.setProps(['idL2'], { x: 99 }),
      );
      expect(ids(server)).not.toContain('idL2');
      expect(ids(A.store.get().project)).toEqual(ids(server));
      expect(ids(B.store.get().project)).toEqual(ids(server));
    });
  });
});

describe('replayAfter', () => {
  const set = (path: (string | { i: string })[], v: unknown): Op => ({ t: 'set', p: path, v });
  const ins = (path: (string | { i: string })[], id: string, after: string | null): Op => ({ t: 'ins', p: path, v: { id }, after });
  const A = ['artboards', { i: 'ab' }, 'children'];

  it('replays nothing when there is nothing of ours, or nothing of theirs', () => {
    expect(replayAfter([], [set(['x'], 1)])).toEqual([]);
    expect(replayAfter([set(['x'], 1)], [])).toEqual([]);
  });

  it('does not replay an edit of ours that nothing of theirs touches', () => {
    expect(replayAfter([set([...A, { i: 'n1' }, 'x'], 1)], [set([...A, { i: 'n2' }, 'x'], 2)])).toEqual([]);
  });

  it('replays our edit inside a layer they inserted or moved, since it arrives with its old properties', () => {
    const mine = set([...A, { i: 'n1' }, 'x'], 1);
    expect(replayAfter([mine], [ins(A, 'n1', null)])).toEqual([mine]);
  });

  it('replays our inserts and deletes in a list they also inserted into, with whatever of ours is inside those layers', () => {
    const own = [ins(A, 'p', 'y'), set([...A, { i: 'p' }, 'x'], 5), set(['name'], 'z')];
    expect(replayAfter(own, [ins(A, 'q', 'y')])).toEqual([own[0], own[1]]);
  });

  it('keeps our ops in the order we made them', () => {
    const own = [{ t: 'del', p: A, id: 'a' } as Op, ins(A, 'a', 'b'), ins(A, 'c', 'a')];
    expect(replayAfter(own, [ins(A, 'z', null)])).toEqual(own);
  });
});
