// @vitest-environment node
//A project with live collaboration off (the default): nobody's editor joins the room, but an AI agent still can. What
//the agent does is saved through the room, and an editor that isn't in the room finds out the plain way: the revision
//moves on, so its next save is refused (409) and its tab-back check sees it, and loading hands it the agent's work.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type Stream, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };

const base = (id: string, liveSync?: boolean) => ({
  format: 'interactives',
  id,
  name: 'Quiet',
  settings: liveSync === undefined ? {} : { liveSync },
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
  id = `prquiet${String(++n).padStart(4, '0')}`;
  await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id), rev: 0 } });
});

const agentEdits = async (name: string) => {
  const s = await h.stream(`/api/projects/${id}/live?clientId=AG&agent=Claude`, { user: ann });
  streams.push(s);
  await s.waitFor((e) => e.event === 'hello');
  const r = await h.call('POST', `/api/projects/${id}/ops`, { user: ann, json: { clientId: 'AG', ops: [{ t: 'set', p: ['name'], v: name }] } });
  expect(r.status).toBe(200);
};

describe('live collaboration off, an agent edits', () => {
  it('the server does not care about the setting: the live routes still answer', async () => {
    await agentEdits('agent was here');
    expect(h.db.projects.docs.find((d) => d._id === id)).toBeTruthy();
  });

  it("the editor's next save is refused instead of flattening the agent's work, even a moment after the edit", async () => {
    await agentEdits('agent was here');
    //no waiting for the room's own timer: the save itself lets the room write first
    const stale = await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id), rev: 1 } });
    expect(stale.status).toBe(409);
    expect(stale.json.rev).toBe(2);
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === id)!.doc).name).toBe('agent was here');
  });

  it('loading the project gives the agent\'s edit and a revision the next save passes', async () => {
    await agentEdits('agent was here');
    const got = await h.call('GET', `/api/projects/${id}`, { user: ann });
    expect(got.json.project.name).toBe('agent was here');
    expect(got.json.rev).toBe(2);
    const ok = await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: { ...got.json.project, name: 'mine too' }, rev: got.json.rev } });
    expect(ok.status).toBe(200);
  });

  it('the rev route is a few bytes, and moves when an agent (or another tab) saves', async () => {
    const before = await h.call('GET', `/api/projects/${id}/rev`, { user: ann });
    expect(before.json).toEqual({ rev: 1 });
    await agentEdits('agent was here');
    const after = await h.call('GET', `/api/projects/${id}/rev`, { user: ann });
    expect(after.json).toEqual({ rev: 2 });
    await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id), rev: 2 } });
    expect((await h.call('GET', `/api/projects/${id}/rev`, { user: ann })).json).toEqual({ rev: 3 });
  });

  it('the rev route is for people who can open the project, and says so for one that does not exist', async () => {
    expect((await h.call('GET', `/api/projects/nonexistent01/rev`, { user: ann })).status).toBe(404);
    process.env.SUITE_SESSION_ENFORCE = '1';
    try {
      expect((await h.call('GET', `/api/projects/${id}/rev`, { user: { username: 'eve' } })).status).toBe(403);
    } finally {
      process.env.SUITE_SESSION_ENFORCE = '';
    }
  });

  it('says how many people it is shared with when loaded', async () => {
    expect((await h.call('GET', `/api/projects/${id}`, { user: ann })).json.collaborators).toBe(0);
    await h.call('POST', `/api/projects/${id}/collaborators`, { user: ann, json: { username: 'bob', name: 'Bob' } });
    expect((await h.call('GET', `/api/projects/${id}`, { user: ann })).json.collaborators).toBe(1);
  });
});

describe('a copy starts with live collaboration off', () => {
  it('duplicating a project that had it on', async () => {
    await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: base(id, true), rev: 1 } });
    const dup = await h.call('POST', `/api/projects/${id}/duplicate`, { user: ann, json: {} });
    expect(dup.status).toBe(200);
    const copy = await h.call('GET', `/api/projects/${dup.json.id}`, { user: ann });
    expect(copy.json.project.settings.liveSync).toBeUndefined();
    const orig = await h.call('GET', `/api/projects/${id}`, { user: ann });
    expect(orig.json.project.settings.liveSync).toBe(true);
  });
});
