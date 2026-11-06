// @vitest-environment node
//The live editing room in index.js: joining over server-sent events, ordering and broadcasting ops, replay for a
//reconnecting client, presence, whole-document saves and restores resetting the room, saving back to mongo, and a
//deleted project ending every stream.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type Stream, type User } from './helpers/server-harness';
import { diff } from '../shared/ops.mjs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob' };

const base = (id: string) => ({
  format: 'interactives',
  id,
  name: 'Live',
  settings: {},
  artboards: [{ id: 'ab1', name: 'Main', width: 100, height: 100, children: [{ id: 'n1', type: 'rect', x: 0, y: 0, name: 'A' }] }],
});

let h: Harness;
let n = 0;
let id = '';
const streams: Stream[] = [];
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  for (const s of streams) s.close();
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  id = `prlive${String(++n).padStart(4, '0')}`;
  await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id), rev: 0 } });
});

const join = async (query = '', user: User | null = ann) => {
  const s = await h.stream(`/api/projects/${id}/live?${query}`, { user });
  streams.push(s);
  await s.waitFor((e) => e.event === 'hello');
  return s;
};
const post = (ops: unknown[], clientId = 'c1', user: User | null = ann) => h.call('POST', `/api/projects/${id}/ops`, { user, json: { clientId, ops } });
const setName = (name: string) => ({ t: 'set', p: ['name'], v: name });

describe('joining', () => {
  it('says hello with the sequence, rev, a colour and who is already there', async () => {
    const a = await join('clientId=A');
    const hello = a.events.find((e) => e.event === 'hello')!.data;
    expect(hello).toMatchObject({ seq: 0, rev: 1, clientId: 'A', peers: [{ clientId: 'A', name: 'Ann A' }] });
    expect(hello.color).toMatch(/^#[0-9a-f]{6}$/);

    const b = await join('clientId=B', bob);
    expect(b.events.find((e) => e.event === 'hello')!.data.peers.map((p: { clientId: string }) => p.clientId).sort()).toEqual(['A', 'B']);
    //A hears B arrive, with a different colour
    const joined = await a.waitFor((e) => e.event === 'presence' && e.data.clientId === 'B' && e.data.joined);
    expect(joined.data.name).toBe('bob');
    expect(joined.data.color).not.toBe(hello.color);
  });

  it('names an AI agent after itself, strips odd characters and caps it', async () => {
    const s = await join(`clientId=ag&agent=${encodeURIComponent('Claude <b>x</b>' + 'y'.repeat(60))}`);
    const name = s.events.find((e) => e.event === 'hello')!.data.peers[0].name as string;
    expect(name.endsWith(' (AI)')).toBe(true);
    expect(name).not.toMatch(/[<>/]/);
    expect(name.length).toBeLessThanOrEqual(45);
  });

  it('labels a session-less client with the name its page claimed (cleaned), else Guest', async () => {
    const s = await join(`clientId=g1&name=${encodeURIComponent('Zoë <script> O\'Neil')}`, null);
    expect(s.events.find((e) => e.event === 'hello')!.data.peers[0].name).toBe("Zoë script O'Neil");
    const g = await join('clientId=g2', null);
    expect(g.events.find((e) => e.event === 'hello')!.data.peers.find((p: { clientId: string }) => p.clientId === 'g2').name).toBe('Guest');
  });

  it('makes up a client id when none is given and caps a long one', async () => {
    const s = await join('');
    expect(s.events.find((e) => e.event === 'hello')!.data.clientId).toMatch(/^c[a-z0-9]+$/);
    const t = await join(`clientId=${'z'.repeat(100)}`);
    expect(t.events.find((e) => e.event === 'hello')!.data.clientId).toHaveLength(64);
  });

  it('refuses a project that is not there or not yours (when enforced)', async () => {
    await expect(h.stream('/api/projects/prnolive001/live')).rejects.toMatchObject({ status: 404 });
    process.env.SUITE_SESSION_ENFORCE = '1';
    await expect(h.stream(`/api/projects/${id}/live`, { user: bob })).rejects.toMatchObject({ status: 403 });
  });

  it('tells the others when someone leaves', async () => {
    const a = await join('clientId=A');
    const b = await join('clientId=B', bob);
    b.close();
    await a.waitFor((e) => e.event === 'presence' && e.data.clientId === 'B' && e.data.left);
  });
});

describe('ops', () => {
  it('numbers them in the order the server got them, and sends the sender its own back as the ack', async () => {
    const a = await join('clientId=A');
    const b = await join('clientId=B', bob);
    expect((await post([setName('one')], 'A')).json).toEqual({ ok: true, seq: 1 });
    expect((await post([setName('two')], 'B', bob)).json).toEqual({ ok: true, seq: 2 });
    for (const s of [a, b]) {
      await s.waitFor((e) => e.event === 'ops' && e.data.seq === 2);
      const got = s.events.filter((e) => e.event === 'ops');
      expect(got.map((e) => [e.data.seq, e.data.clientId])).toEqual([[1, 'A'], [2, 'B']]);
      expect(got[0].id).toBe('1');
    }
  });

  it('keeps the document in the room, so a load sees edits before they reach mongo', async () => {
    await join('clientId=A');
    await post([setName('renamed'), { t: 'set', p: ['artboards', { i: 'ab1' }, 'children', { i: 'n1' }, 'x'], v: 42 }]);
    const r = (await h.call('GET', `/api/projects/${id}`, { user: ann })).json;
    expect(r.project.name).toBe('renamed');
    expect(r.project.artboards[0].children[0].x).toBe(42);
    expect(r.live).toBe(1);
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === id)!.doc).name).toBe('Live');
  });

  it('saves the room back to mongo a second after the last change, bumping the rev', async () => {
    await join('clientId=A');
    await post([setName('saved soon')]);
    expect(h.db.projects.docs.find((d) => d._id === id)!.rev).toBe(1);
    await vi.waitFor(() => expect(h.db.projects.docs.find((d) => d._id === id)!.rev).toBe(2), { timeout: 3000 });
    const doc = h.db.projects.docs.find((d) => d._id === id)!;
    expect(doc.name).toBe('saved soon');
    expect(doc.meta.artboards).toBe(1);
    expect(JSON.parse(doc.doc).name).toBe('saved soon');
    //a plain save with the old rev now conflicts
    expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id), rev: 1 } })).status).toBe(409);
  }, 8000);

  it('refuses a body without a list of ops', async () => {
    expect((await h.call('POST', `/api/projects/${id}/ops`, { user: ann, json: { clientId: 'A' } })).status).toBe(400);
    expect((await h.call('POST', `/api/projects/${id}/ops`, { user: ann, json: { ops: 'nope' } })).status).toBe(400);
    expect((await h.call('POST', '/api/projects/prnolive001/ops', { user: ann, json: { ops: [] } })).status).toBe(404);
  });

  it('applies what diff() produced on the client to the server\'s copy, and both agree', async () => {
    await join('clientId=A');
    const before = base(id);
    const after = structuredClone(before) as any;
    after.artboards[0].children.push({ id: 'n2', type: 'rect', x: 5, y: 6, name: 'B' });
    after.artboards[0].children[0].name = 'A2';
    after.settings = { startArtboardId: 'ab1' };
    await post(diff(before, after));
    expect((await h.call('GET', `/api/projects/${id}`, { user: ann })).json.project).toEqual(after);
  });
});

describe('replay', () => {
  it('sends a reconnecting client the ops it missed, in order, before hello', async () => {
    const a = await join('clientId=A');
    await post([setName('one')]);
    await post([setName('two')]);
    await post([setName('three')]);
    await a.waitFor((e) => e.event === 'ops' && e.data.seq === 3);
    const again = await join('clientId=A2&since=1');
    const seqs = again.events.filter((e) => e.event === 'ops').map((e) => e.data.seq);
    expect(seqs).toEqual([2, 3]);
    expect(again.events.findIndex((e) => e.event === 'ops')).toBeLessThan(again.events.findIndex((e) => e.event === 'hello'));
    expect(again.events.find((e) => e.event === 'hello')!.data.seq).toBe(3);
  });

  it('sends nothing to replay when the client is up to date, and ignores a nonsense since', async () => {
    await join('clientId=A');
    await post([setName('one')]);
    const up = await join('clientId=A2&since=1');
    expect(up.events.some((e) => e.event === 'ops' || e.event === 'reset')).toBe(false);
    const junk = await join('clientId=A3&since=abc');
    expect(junk.events.some((e) => e.event === 'ops' || e.event === 'reset')).toBe(false);
  });

  it('tells a client to reload when the gap is gone from the log', async () => {
    await join('clientId=A');
    //a log that has rolled over: the oldest ops are gone
    for (let i = 0; i < 3; i++) await post([setName(`n${i}`)]);
    const room = await h.call('GET', `/api/projects/${id}`, { user: ann });
    expect(room.json.live).toBe(3);
    //a replay from before the log began cannot be made when a whole-document save emptied it
    await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id), rev: room.json.rev, force: true } });
    const s = await join('clientId=A2&since=0');
    //seq 3 is still ahead of since 0, the log is empty, so it must reset instead of replaying nothing
    expect(s.events.some((e) => e.event === 'reset')).toBe(true);
  });
});

describe('presence', () => {
  it('shares a cursor, artboard and selection, cleaned, with everyone', async () => {
    const a = await join('clientId=A');
    const b = await join('clientId=B', bob);
    const r = await h.call('POST', `/api/projects/${id}/presence`, { user: bob, json: { clientId: 'B', presence: { cursor: { x: 1.5, y: 2 }, artboardId: 'ab1', selection: ['n1', 5, null] } } });
    expect(r.json).toEqual({ ok: true });
    const got = await a.waitFor((e) => e.event === 'presence' && e.data.clientId === 'B' && e.data.cursor);
    expect(got.data).toMatchObject({ cursor: { x: 1.5, y: 2 }, artboardId: 'ab1', selection: ['n1', '5', 'null'], name: 'bob' });
    //it shows to newcomers too
    const c = await join('clientId=C');
    expect(c.events.find((e) => e.event === 'hello')!.data.peers.find((p: { clientId: string }) => p.clientId === 'B').cursor).toEqual({ x: 1.5, y: 2 });
    void b;
  });

  it('drops a cursor that is not finite, caps the selection at 200 and the artboard id at 64', async () => {
    const a = await join('clientId=A');
    await h.call('POST', `/api/projects/${id}/presence`, { user: ann, json: { clientId: 'A', presence: { cursor: { x: 'a', y: 1 }, artboardId: 'x'.repeat(100), selection: Array.from({ length: 300 }, (_, i) => `n${i}`) } } });
    const got = await a.waitFor((e) => e.event === 'presence' && e.data.selection?.length > 0);
    expect(got.data.cursor).toBeNull();
    expect(got.data.artboardId).toHaveLength(64);
    expect(got.data.selection).toHaveLength(200);
  });

  it('says ok:false for someone who is not in a room, rather than failing', async () => {
    expect((await h.call('POST', `/api/projects/${id}/presence`, { user: ann, json: { clientId: 'nobody', presence: {} } })).json).toEqual({ ok: false });
    expect((await h.call('POST', '/api/projects/prnoroom01/presence', { user: ann, json: {} })).json).toEqual({ ok: false });
  });
});

describe('whole-document changes while people are connected', () => {
  it('a plain save resets everyone and replaces the room\'s document', async () => {
    const a = await join('clientId=A');
    await post([setName('live edit')]);
    const next = { ...base(id), name: 'from a plain save' };
    const saved = await h.call('PUT', `/api/projects/${id}`, { user: bob, json: { project: next, rev: 1, force: true } });
    const reset = await a.waitFor((e) => e.event === 'reset');
    expect(reset.data.rev).toBe(saved.json.rev);
    const r = (await h.call('GET', `/api/projects/${id}`, { user: ann })).json;
    expect(r.project.name).toBe('from a plain save');
    expect(r.rev).toBe(saved.json.rev);
    //the room's pending autosave must not put the live edit back on top
    await new Promise((res) => setTimeout(res, 1300));
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === id)!.doc).name).toBe('from a plain save');
  }, 8000);

  it('restoring a revision saves the room first, then resets everyone', async () => {
    const a = await join('clientId=A');
    await post([setName('before restore')]);
    await vi.waitFor(() => expect(h.db.revisions.docs.some((r) => r.project === id)).toBe(true));
    const first = h.db.revisions.docs.find((r) => r.project === id)!;
    const r = await h.call('POST', `/api/projects/${id}/revisions/${first._id}/restore`, { user: ann });
    expect(r.json.ok).toBe(true);
    await a.waitFor((e) => e.event === 'reset');
    const history = h.db.revisions.docs.filter((x) => x.project === id && x.reason === 'Before restore');
    expect(JSON.parse(history[0].doc).name).toBe('before restore');
    expect((await h.call('GET', `/api/projects/${id}`, { user: ann })).json.project.name).toBe('Live');
  });

  it('deleting the project tells everyone and ends their streams', async () => {
    const a = await join('clientId=A');
    await post([setName('x')]);
    await h.call('DELETE', `/api/projects/${id}`, { user: ann });
    await a.waitFor((e) => e.event === 'deleted');
    await new Promise((res) => setTimeout(res, 1300));
    //nothing came back from the room's timers, and the edit the room hadn't saved went into the bin with it
    expect(h.db.projects.docs.find((d) => d._id === id)).toBeUndefined();
    expect(JSON.parse(h.db['projects-bin'].docs.find((d) => d._id === id)!.doc).name).toBe('x');
  }, 8000);

  it('a failed save to mongo leaves the room dirty so it is tried again', async () => {
    await join('clientId=A');
    h.db.projects.failNext.updateOne = new Error('mongo down');
    await post([setName('retry me')]);
    await new Promise((res) => setTimeout(res, 1300));
    //the first attempt failed; a later ops post schedules another save, which now works
    await post([setName('retry me again')]);
    await vi.waitFor(() => expect(JSON.parse(h.db.projects.docs.find((d) => d._id === id)!.doc).name).toBe('retry me again'), { timeout: 3000 });
  }, 10000);

  it('tells the room when mongo refuses the save, tries again by itself, and says when it got there', async () => {
    const a = await join('clientId=A');
    h.db.projects.failNext.updateOne = new Error('mongo down');
    await post([setName('no second post')]);
    const failed = await a.waitFor((e) => e.event === 'stored' && e.data.ok === false, 3000);
    expect(failed.data.error).toMatch(/could not save/);
    //someone joining while it's failing hears it in their hello
    const b = await join('clientId=B', bob);
    expect(b.events.find((e) => e.event === 'hello')!.data.stored).toMatchObject({ ok: false });
    //no new ops: the retry is the server's own
    await a.waitFor((e) => e.event === 'stored' && e.data.ok === true, 5000);
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === id)!.doc).name).toBe('no second post');
  }, 10000);

  it('says the project is too big rather than that it was saved somewhere else', async () => {
    const a = await join('clientId=A');
    h.db.projects.failNext.updateOne = Object.assign(new Error('BSONObj size: 17000000 is invalid'), { code: 10334 });
    await post([setName('huge')]);
    const failed = await a.waitFor((e) => e.event === 'stored' && e.data.ok === false, 3000);
    expect(failed.data.error).toMatch(/too big to save/);
  }, 8000);
});

describe('a room that never goes quiet', () => {
  const settle = async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  };

  it('still saves within 10 seconds of the first unsaved change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      await join('clientId=A');
      const row = () => h.db.projects.docs.find((d) => d._id === id)!;
      //an op every half second, so a plain one-second debounce would never fire
      for (let i = 0; i < 24 && row().rev === 1; i++) {
        await post([setName(`edit ${i}`)]);
        await settle();
        await vi.advanceTimersByTimeAsync(500);
      }
      await settle();
      expect(row().rev).toBeGreaterThan(1);
      expect(JSON.parse(row().doc).name).toMatch(/^edit (19|20|21)$/);
    } finally {
      vi.useRealTimers();
    }
  }, 15000);
});

describe('closing a room', () => {
  const settle = async (check: () => boolean) => {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setImmediate(r));
  };

  it('keeps the room 30 seconds after the last person leaves (saving it a second after the last change), then lets it go', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const a = await join('clientId=A');
      await post([setName('saved on close')]);
      expect(h.db.projects.docs.find((d) => d._id === id)!.rev).toBe(1);
      a.close();
      await settle(() => false);
      await vi.advanceTimersByTimeAsync(10_000);
      //the autosave a second after the change has been written, and the room is still open for whoever comes back
      await settle(() => h.db.projects.docs.find((d) => d._id === id)!.rev === 2);
      expect(JSON.parse(h.db.projects.docs.find((d) => d._id === id)!.doc).name).toBe('saved on close');
      expect((await h.call('GET', `/api/projects/${id}`, { user: ann })).json.live).toBe(1);

      await vi.advanceTimersByTimeAsync(25_000);
      await settle(() => false);
      const after = (await h.call('GET', `/api/projects/${id}`, { user: ann })).json;
      expect(after.live).toBeNull();
      expect(after.project.name).toBe('saved on close');
      expect(after.rev).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  }, 15000);

  it('keeps the room, with the person who came back in it, when someone rejoins before the 30 seconds are up', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const a = await join('clientId=A');
      await post([setName('still live')]);
      a.close();
      await settle(() => false);
      await vi.advanceTimersByTimeAsync(20_000);
      const b = await join('clientId=B', bob);
      expect(b.events.find((e) => e.event === 'hello')!.data.seq).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect((await h.call('GET', `/api/projects/${id}`, { user: ann })).json.live).toBe(1);
      b.close();
    } finally {
      vi.useRealTimers();
    }
  }, 15000);
});
