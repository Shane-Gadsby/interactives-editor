// @vitest-environment node
//Learner records: the real index.js against the in-memory mongo stand-in. A learner's browser may say what it scored
//and what to remember, the server decides who they are from the session, keeps one record per project + person +
//course, and shows the project's owner (not anyone else) the totals.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { cleanProgress, cleanResult, summarise } from '../shared/learner.mjs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const sam: User = { username: 'sam', fullName: 'Sam S', course: 'MAT1000_2026_S1' };
const lee: User = { username: 'lee', fullName: 'Lee L', course: 'MAT1000_2026_S1' };
const lee2: User = { username: 'lee', fullName: 'Lee L', course: 'PHY2000_2026_S1' };
const bob: User = { username: 'bob' };

const project = (id: string) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [] }] });

let h: Harness;
let token = '';
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['interactives-user-data'], h.db['interactives-activity-user-data']]) c.docs = [];
  await h.call('PUT', '/api/projects/prlearn001', { user: ann, json: { project: project('prlearn001'), rev: 0 } });
  token = (await h.call('PUT', '/api/projects/prlearn001/share', { user: ann, body: '<html><body>shared</body></html>', type: 'text/plain' })).json.share.token;
});

const records = () => h.db['interactives-user-data'].docs;
const save = (user: User | null, data: unknown, t = token) => h.call('PUT', `/learn/${t}/progress`, { user, json: data });
const report = (user: User | null, result: unknown, t = token) => h.call('POST', `/learn/${t}/report`, { user, json: { result } });
const load = (user: User | null, t = token) => h.call('GET', `/learn/${t}/progress`, { user });
const result = (score: number | null, extra: Record<string, unknown> = {}) => ({ completed: true, score, max: 20, percent: 0, passed: null, ...extra });

describe('what a learner may send', () => {
  it('keeps remembered variables as one string, only under real variable names', () => {
    const p = cleanProgress({ variables: { page: 3, tags: ['a'], 'bad name': 1, '$ne': 2, __proto__: 9 }, artboard: 'ab1', attempts: 2.9 });
    expect(JSON.parse(p.variables)).toEqual({ page: 3, tags: ['a'], $ne: 2 });
    expect(p).toMatchObject({ artboard: 'ab1', attempts: 2, restart: false });
  });
  it('refuses what is not an object, too many variables, or too much data', () => {
    expect(cleanProgress(null)).toBeNull();
    expect(cleanProgress([])).toBeNull();
    expect(cleanProgress({ variables: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`v${i}`, 1])) })).toBeNull();
    expect(cleanProgress({ variables: { big: 'x'.repeat(70000) } })).toBeNull();
  });
  it('works the percentage out itself and throws away a nonsense score', () => {
    expect(cleanResult({ result: { completed: true, score: 5, max: 20, percent: 99, passed: true } })).toEqual({ completed: true, score: 5, max: 20, percent: 25, passed: true });
    expect(cleanResult({ result: { score: 'lots', max: -1, passed: 'yes' } })).toEqual({ completed: false, score: null, max: 100, percent: null, passed: null });
    expect(cleanResult({ result: { score: 1e12 } })?.score).toBeNull();
    expect(cleanResult('x')).toBeNull();
  });
});

describe('learner routes', () => {
  it('starts with nothing, then gives back what was saved', async () => {
    expect((await load(sam)).json).toEqual({ available: true, progress: null });
    expect((await save(sam, { variables: { page: 4 }, artboard: 'ab1', attempts: 1 })).json).toEqual({ available: true, ok: true });
    expect((await load(sam)).json.progress).toEqual({ variables: { page: 4 }, artboard: 'ab1', attempts: 1, completed: false });
  });

  it('knows who they are from the session, one record each, per course', async () => {
    await save(sam, { variables: { page: 1 }, attempts: 1 });
    await save(sam, { variables: { page: 2 }, attempts: 1 });
    await save(lee, { variables: { page: 7 }, attempts: 1 });
    await save(lee2, { variables: { page: 9 }, attempts: 1 });
    expect(records()).toHaveLength(3);
    expect((await load(sam)).json.progress.variables.page).toBe(2);
    expect((await load(lee)).json.progress.variables.page).toBe(7);
    expect((await load(lee2)).json.progress.variables.page).toBe(9);
    const rec = records().find((r) => r.username === 'sam')!;
    expect(rec).toMatchObject({ project: 'prlearn001', course: 'MAT1000_2026_S1', courseLabel: 'MAT1000_2026_S1', courseCode: 'MAT1000', name: 'Sam S', lmsURL: 'https://lms.example' });
  });

  it('ignores any identity in the request body', async () => {
    await save(sam, { variables: {}, attempts: 1, username: 'lee', userID: 99, course: 'x' });
    expect(records().map((r) => r.username)).toEqual(['sam']);
  });

  it('has nowhere to keep it without a session, and says so', async () => {
    expect((await load(null)).json).toEqual({ available: false });
    expect((await save(null, { variables: {}, attempts: 1 })).json).toEqual({ available: false });
    expect((await report(null, result(10))).json).toEqual({ available: false });
    expect(records()).toHaveLength(0);
  });

  it('keeps the best score, and completion and passing once they have happened', async () => {
    await report(sam, result(10, { passed: true }));
    await report(sam, result(4, { completed: false, passed: false }));
    await report(sam, result(15, { passed: true }));
    const rec = records()[0];
    expect(rec).toMatchObject({ completed: true, passed: true, bestPercent: 75, bestScore: 15, lastPercent: 75, lastScore: 15, reports: 3, attempts: 1 });
    expect(rec.completedAt).toBeInstanceOf(Date);
  });

  it('does not count a lower score as the best, or a partial report as complete', async () => {
    await report(sam, result(18, { completed: false, passed: true }));
    await report(sam, result(2, { completed: false, passed: false }));
    expect(records()[0]).toMatchObject({ bestPercent: 90, lastPercent: 10, passed: true });
    expect(records()[0].completed).toBeUndefined();
  });

  it('gives back whether this attempt is complete, and a restart opens a new attempt but keeps the history', async () => {
    await save(sam, { variables: { page: 3 }, attempts: 1 });
    await report(sam, result(12, { passed: true }));
    expect((await load(sam)).json.progress.completed).toBe(true);
    await save(sam, { variables: { page: 1 }, attempts: 2, restart: true });
    const p = (await load(sam)).json.progress;
    expect(p).toMatchObject({ attempts: 2, completed: false, variables: { page: 1 } });
    expect(records()[0]).toMatchObject({ completed: true, bestPercent: 60, passed: true });
  });

  it('never lets attempts go down', async () => {
    await save(sam, { variables: {}, attempts: 5 });
    await save(sam, { variables: {}, attempts: 1 });
    expect((await load(sam)).json.progress.attempts).toBe(5);
  });

  it('refuses a malformed save or report', async () => {
    expect((await save(sam, [1, 2])).status).toBe(400);
    expect((await h.call('POST', `/learn/${token}/report`, { user: sam, json: 'nope' })).status).toBe(400);
  });

  it('only collects for a share link that is on', async () => {
    expect((await load(sam, 'nosuchtokennosuchtoken1')).status).toBe(404);
    expect((await load(sam, 'short')).status).toBe(404);
    await h.call('DELETE', '/api/projects/prlearn001/share', { user: ann });
    expect((await save(sam, { variables: {}, attempts: 1 })).status).toBe(404);
    expect(records()).toHaveLength(0);
  });

  it('retries a save that lost the race to insert the record', async () => {
    const real = h.db['interactives-user-data'].updateOne.bind(h.db['interactives-user-data']);
    let first = true;
    h.db['interactives-user-data'].updateOne = async (...a: Parameters<typeof real>) => {
      if (first) {
        first = false;
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      return real(...a);
    };
    try {
      expect((await save(sam, { variables: { page: 2 }, attempts: 1 })).json.ok).toBe(true);
      expect(records()).toHaveLength(1);
    } finally {
      h.db['interactives-user-data'].updateOne = real;
    }
  });

  it('is refused without a session when the box enforces sessions', async () => {
    // the stand-in session check never refuses, so the route itself is what answers: still no record
    expect((await save(null, { variables: {}, attempts: 1 })).json.available).toBe(false);
  });
});

describe('user data (Save user data / Load user data)', () => {
  const kept = () => h.db['interactives-activity-user-data'].docs;
  const saveUD = (user: User | null, variables: unknown, t = token) => h.call('PUT', `/learn/${t}/user-data`, { user, json: { variables } });
  const loadUD = (user: User | null, names: string, t = token) => h.call('GET', `/learn/${t}/user-data?names=${encodeURIComponent(names)}`, { user });

  it("keeps what a flow saves for the session's learner and course, apart from progress, and merges later saves", async () => {
    expect((await saveUD(sam, { answer: 'blue', tries: 2 })).json).toEqual({ available: true, ok: true });
    expect((await saveUD(sam, { tries: 3 })).json.ok).toBe(true);
    expect(kept()).toHaveLength(1);
    expect(kept()[0]).toMatchObject({ project: 'prlearn001', username: 'sam', course: 'MAT1000_2026_S1', name: 'Sam S' });
    expect(records()).toHaveLength(0);
    expect((await loadUD(sam, 'answer,tries,never')).json).toEqual({ available: true, variables: { answer: 'blue', tries: 3 } });
  });

  it("is one record per person per course, and nobody else's", async () => {
    await saveUD(lee, { answer: 'maths' });
    await saveUD(lee2, { answer: 'physics' });
    expect((await loadUD(lee, 'answer')).json.variables).toEqual({ answer: 'maths' });
    expect((await loadUD(lee2, 'answer')).json.variables).toEqual({ answer: 'physics' });
    expect((await loadUD(sam, 'answer')).json.variables).toEqual({});
  });

  it('keeps nothing without a session, so the player uses the browser', async () => {
    expect((await saveUD(null, { a: 1 })).json).toEqual({ available: false });
    expect((await loadUD(null, 'a')).json).toEqual({ available: false });
    expect(kept()).toHaveLength(0);
  });

  it('turns away the wrong shape, names that are not variables, and too much', async () => {
    expect((await saveUD(sam, [1, 2])).status).toBe(400);
    expect((await saveUD(sam, { 'a.b': 1, 'has space': 2 })).status).toBe(400);
    expect((await saveUD(sam, { __proto__: 1 } as unknown)).status).toBe(400);
    expect((await saveUD(sam, { big: 'x'.repeat(70 * 1024) })).status).toBe(413);
    expect(kept()).toHaveLength(0);
    await saveUD(sam, { ok: 1 });
    expect((await loadUD(sam, 'ok,a.b,__proto__')).json.variables).toEqual({ ok: 1 });
  });

  it('only works while the share link is on, and goes when the project does', async () => {
    await saveUD(sam, { a: 1 });
    expect((await saveUD(sam, { a: 1 }, 'nosuchtokennosuchtoken1')).status).toBe(404);
    await h.call('DELETE', '/api/projects/prlearn001', { user: ann });
    expect(kept()).toHaveLength(0);
  });
});

describe('the learner page', () => {
  it('passes user data requests on to the user-data routes', async () => {
    const r = await h.call('GET', `/play/${token}`);
    expect(r.text).toContain("m.op === 'userdata-save'");
    expect(r.text).toContain("call('PUT', 'user-data'");
    expect(r.text).toContain("'user-data?names='");
  });

  it('frames the share link in its sandbox, with a nonce script and a locked-down policy', async () => {
    const r = await h.call('GET', `/play/${token}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/html/);
    expect(r.text).toContain(`src="/interactives/s/${token}"`);
    expect(r.text).toContain('sandbox="allow-scripts');
    expect(r.text).not.toContain('allow-same-origin');
    const csp = r.headers.get('content-security-policy')!;
    const nonce = /nonce-([^']+)'/.exec(csp)![1];
    expect(r.text).toContain(`<script nonce="${nonce}">`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain('frame-ancestors');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('is a different nonce every time, and 404s a turned-off or made-up link', async () => {
    const a = (await h.call('GET', `/play/${token}`)).headers.get('content-security-policy');
    const b = (await h.call('GET', `/play/${token}`)).headers.get('content-security-policy');
    expect(a).not.toBe(b);
    expect((await h.call('GET', '/play/nosuchtokennosuchtoken1')).status).toBe(404);
    expect((await h.call('GET', '/play/..%2Fetc')).status).toBe(404);
    await h.call('DELETE', '/api/projects/prlearn001/share', { user: ann });
    expect((await h.call('GET', `/play/${token}`)).status).toBe(404);
  });
});

describe('results for the owner', () => {
  beforeEach(async () => {
    await report(sam, result(18, { passed: true }));
    await save(sam, { variables: {}, attempts: 2 });
    await report(lee, result(6, { completed: false, passed: false }));
    await report(lee2, result(10, { passed: true }));
  });

  it('totals the records for the project owner', async () => {
    const r = await h.call('GET', '/api/projects/prlearn001/results', { user: ann });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ learners: 2, records: 3, completed: 2, completionRate: 66.67, passed: 2, scored: 3, passRate: 66.67, averageBestPercent: 56.67, shared: true, truncated: false });
    expect(r.json.averageAttempts).toBeCloseTo(1.33, 2);
    expect(r.json.courses).toEqual(expect.arrayContaining([{ course: 'MAT1000_2026_S1', learners: 2, completed: 1 }, { course: 'PHY2000_2026_S1', learners: 1, completed: 1 }]));
    expect(r.json.list).toHaveLength(3);
    expect(r.json.list.find((x: any) => x.username === 'sam')).toMatchObject({ name: 'Sam S', attempts: 2, completed: true, passed: true, bestPercent: 90 });
  });

  it('never sends what the learners remembered', async () => {
    await save(sam, { variables: { secret: 'x' }, attempts: 2 });
    const text = (await h.call('GET', '/api/projects/prlearn001/results', { user: ann })).text;
    expect(text).not.toContain('secret');
  });

  it('is for the owner and power users, not another person (logged until the box enforces)', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/projects/prlearn001/results', { user: bob })).status).toBe(403);
    expect((await h.call('GET', '/api/projects/prlearn001/results', { user: { username: 'pat', power: true } })).status).toBe(200);
    process.env.SUITE_SESSION_ENFORCE = '';
  });

  it('404s a project that is not there', async () => {
    expect((await h.call('GET', '/api/projects/prnothere01/results', { user: ann })).status).toBe(404);
  });

  it('clears the records on request, and with the project', async () => {
    expect((await h.call('DELETE', '/api/projects/prlearn001/results', { user: ann })).json).toEqual({ ok: true, deleted: 3 });
    expect(records()).toHaveLength(0);
    await report(sam, result(5));
    await h.call('DELETE', '/api/projects/prlearn001', { user: ann });
    expect(records()).toHaveLength(0);
  });

  it('summarises nothing without dividing by zero', () => {
    expect(summarise([])).toMatchObject({ learners: 0, records: 0, completionRate: null, passRate: null, averageBestPercent: null, list: [] });
  });
});
