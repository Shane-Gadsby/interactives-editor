// @vitest-environment node
//Course collections: the real index.js against the in-memory mongo stand-in. A collection is a person's, in a course, by name: shared by
//every project in that course that uses the name, never by anyone else. Identity and course come off the session.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A', course: 'MAT1000_2026_S1' };
const annOther: User = { username: 'ann', fullName: 'Ann A', course: 'PHY2000_2026_S1' };
const bob: User = { username: 'bob', fullName: 'Bob B', course: 'MAT1000_2026_S1' };
const owner: User = { username: 'olly', fullName: 'Olly Owner' };
const big: User = { username: 'big', course: 'MAT1000_2026_S1' };
const fast: User = { username: 'fast', course: 'MAT1000_2026_S1' };
const tidy: User = { username: 'tidy', course: 'MAT1000_2026_S1' };
const nobody: User = { username: 'zed', fullName: 'Zed' };

const project = (id: string) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, dataSources: [], artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [], timelines: [], logic: { nodes: [], edges: [] } }], variables: [], scripts: [], assets: [], fonts: [] });
const pageOf = (p: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>player()</script></body></html>`;

let h: Harness;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

async function share(id: string) {
  await h.call('PUT', `/api/projects/${id}`, { user: owner, json: { project: project(id), rev: 0 } });
  const r = await h.call('PUT', `/api/projects/${id}/share`, { user: owner, body: pageOf(project(id)), type: 'text/plain' });
  tokens[id] = r.json.share.token;
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['interactives-course-collections'], h.db.audit]) c.docs = [];
  await share('prcourse001');
  await share('prcourse002');
});

const read = (user: User | null, name = 'passport', id = 'prcourse001') => h.call('GET', `/learn/${tokens[id]}/course/${encodeURIComponent(name)}`, { user });
const add = (user: User | null, body: unknown, name = 'passport', id = 'prcourse001') => h.call('POST', `/learn/${tokens[id]}/course/${encodeURIComponent(name)}`, { user, json: body });
const rows = () => h.db['interactives-course-collections'].docs;

describe('reading and adding', () => {
  it('starts empty, then holds what was added', async () => {
    expect((await read(ann)).json).toEqual({ available: true, ok: true, value: { stamps: [], counts: {}, course: true } });
    const r = await add(ann, { stamps: ['Gold star', 'Map'], counts: { quizzes: 3 } });
    expect(r.json).toMatchObject({ available: true, ok: true, value: { stamps: ['Gold star', 'Map'], counts: { quizzes: 3 }, course: true, changed: 3 } });
    expect((await read(ann)).json.value).toMatchObject({ stamps: ['Gold star', 'Map'], counts: { quizzes: 3 } });
  });

  it('shares a collection between projects in the same course, by its name', async () => {
    await add(ann, { stamps: ['From one'] }, 'Passport', 'prcourse001');
    const seen = await read(ann, 'PASSPORT', 'prcourse002');
    expect(seen.json.value.stamps).toEqual(['From one']);
    await add(ann, { stamps: ['From two'] }, 'passport', 'prcourse002');
    expect((await read(ann, 'passport', 'prcourse001')).json.value.stamps).toEqual(['From one', 'From two']);
    expect(rows()).toHaveLength(1);
  });

  it('keeps a stamp once whatever its capitals, and a counter at the larger number', async () => {
    await add(ann, { stamps: ['Gold star'], counts: { seen: 5 } });
    const r = await add(ann, { stamps: ['gold  STAR', 'Map'], counts: { Seen: 2, other: 1 } });
    expect(r.json.value).toMatchObject({ stamps: ['Gold star', 'Map'], counts: { seen: 5, other: 1 }, changed: 2 });
    const again = await add(ann, { stamps: ['map'], counts: { seen: 5 } });
    expect(again.json.value).toMatchObject({ changed: 0, stamps: ['Gold star', 'Map'] });
  });

  it('two tabs at once make one row and lose nothing', async () => {
    const all = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => add(ann, { stamps: [`stamp ${n}`, 'shared'], counts: { top: n } })));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(rows()).toHaveLength(1);
    const v = (await read(ann)).json.value;
    expect([...v.stamps].sort()).toEqual(['shared', 'stamp 1', 'stamp 2', 'stamp 3', 'stamp 4', 'stamp 5', 'stamp 6']);
    expect(v.counts).toEqual({ top: 6 });
  });

  it('retries as an update when another tab got the first insert in', async () => {
    const col = h.db['interactives-course-collections'];
    const real = col.updateOne.bind(col);
    let first = true;
    col.updateOne = async (...args: Parameters<typeof real>) => {
      if (first) {
        first = false;
        await real(args[0], { $set: { updated: new Date() }, $addToSet: { stamps: { $each: ['other tab'] } } }, { upsert: true });
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      return real(...args);
    };
    try {
      const r = await add(ann, { stamps: ['mine'] });
      expect(r.status).toBe(200);
      expect(r.json.value.stamps).toEqual(['other tab', 'mine']);
      expect(rows()).toHaveLength(1);
    } finally {
      col.updateOne = real;
    }
  });
});

describe('who it belongs to', () => {
  it('is the signed-in person\'s own: another person in the same course sees nothing of it', async () => {
    await add(ann, { stamps: ['Ann only'] });
    expect((await read(bob)).json.value.stamps).toEqual([]);
    await add(bob, { stamps: ['Bob only'] });
    expect((await read(ann)).json.value.stamps).toEqual(['Ann only']);
    expect((await read(bob)).json.value.stamps).toEqual(['Bob only']);
  });

  it('is the course\'s: the same person in another course has their own', async () => {
    await add(ann, { stamps: ['MAT'] });
    expect((await read(annOther)).json.value.stamps).toEqual([]);
    await add(annOther, { stamps: ['PHY'] });
    expect((await read(ann)).json.value.stamps).toEqual(['MAT']);
    expect(rows().map((r: any) => r.course).sort()).toEqual(['MAT1000_2026_S1', 'PHY2000_2026_S1']);
  });

  it('is never named in the request: a username or course in the body or query changes nothing', async () => {
    await add(bob, { stamps: ['Bob'] });
    const r = await h.call('POST', `/learn/${tokens.prcourse001}/course/passport?username=bob&course=MAT1000_2026_S1`, { user: ann, json: { stamps: ['Ann'], username: 'bob', course: 'MAT1000_2026_S1' } });
    expect(r.json.value.stamps).toEqual(['Ann']);
    expect((await read(bob)).json.value.stamps).toEqual(['Bob']);
  });

  it('has nowhere to keep it with no session, or a session that is in no course', async () => {
    expect((await read(null)).json).toEqual({ available: false });
    expect((await add(null, { stamps: ['x'] })).json).toEqual({ available: false });
    const noCourse = { ...nobody, course: '' };
    expect((await read(noCourse)).json).toEqual({ available: false });
    expect((await add(noCourse, { stamps: ['x'] })).json).toEqual({ available: false });
    expect(rows()).toHaveLength(0);
  });

  it('only works through a share link that is on', async () => {
    expect((await h.call('GET', '/learn/not-a-real-token-1234/course/passport', { user: ann })).status).toBe(404);
    await h.call('DELETE', `/api/projects/prcourse001/share`, { user: owner });
    expect((await read(ann)).status).toBe(404);
    expect((await read(ann, 'passport', 'prcourse002')).status).toBe(200);
  });
});

describe('limits', () => {
  it('needs a name that is something', async () => {
    expect((await read(ann, '$$')).status).toBe(400);
    expect((await add(ann, { stamps: ['x'] }, '...')).status).toBe(400);
  });

  it('keeps no more than the limit of stamps, counters and collections', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `s${i}`);
    for (let i = 0; i < 5; i++) await add(big, { stamps: many.map((s) => `${s}-${i}`) });
    const full = await add(big, { stamps: ['one more'] });
    expect(full.json.value.problem).toBe('full');
    expect(full.json.value.stamps).toHaveLength(200);

    for (let i = 0; i < 19; i++) await add(big, { stamps: ['x'] }, `collection ${i}`);
    expect(rows()).toHaveLength(20);
    const over = await add(big, { stamps: ['x'] }, 'one too many');
    expect(over.json.value).toMatchObject({ problem: 'full', changed: 0, stamps: [] });
    expect(rows()).toHaveLength(20);
  });

  it('ignores a malformed body, and long names are cut', async () => {
    const r = await add(ann, { stamps: 'not a list', counts: [1, 2] });
    expect(r.json.value).toMatchObject({ changed: 0, stamps: [], counts: {} });
    expect(rows()).toHaveLength(0);
    const long = await add(ann, { stamps: ['x'.repeat(500)], counts: { ['c'.repeat(200)]: 1e15 } });
    expect(long.json.value.stamps[0]).toHaveLength(60);
    expect(Object.entries(long.json.value.counts)).toEqual([['c'.repeat(40), 1e9]]);
  });

  it('slows a person who goes too fast, and says so without losing what they had', async () => {
    let last: any = null;
    for (let i = 0; i < 70; i++) last = await add(fast, { stamps: [`s${i}`] });
    expect(last.json.value.problem).toBe('busy');
    expect(rows()).toHaveLength(1);
  });

  it('stores nothing but the name, the person, the course and what was added', async () => {
    await add(tidy, { stamps: ['a'], counts: { n: 1 } });
    expect(Object.keys(rows()[0]).sort()).toEqual(['collection', 'counts', 'course', 'created', 'stamps', 'updated', 'username']);
    expect(rows()[0]).toMatchObject({ username: 'tidy', course: 'MAT1000_2026_S1', collection: 'passport' });
  });
});

describe('the learner page', () => {
  it('answers the player\'s course messages from the course routes', async () => {
    const page = await h.call('GET', `/play/${tokens.prcourse001}`, { user: ann });
    expect(page.status).toBe(200);
    expect(page.text).toContain("m.op === 'course-read'");
    expect(page.text).toContain("m.op === 'course-add'");
  });
});
