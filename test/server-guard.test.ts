// @vitest-environment node
//Learner records: the real index.js against the in-memory mongo stand-in. A learner's browser may say what it scored
//and what to remember, the server decides who they are from the session, keeps one record per project + person +
//course, and shows the project's owner (not anyone else) the totals.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { cleanGuard, guardUpdate, guardLabel, resultsCsv } from '../shared/learner.mjs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const sam: User = { username: 'sam', fullName: 'Sam S', course: 'MAT1000_2026_S1' };
const lee: User = { username: 'lee', fullName: 'Lee L', course: 'MAT1000_2026_S1' };
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
const guard = (user: User | null, g: unknown, t = token) => h.call('POST', `/learn/${t}/guard`, { user, json: { guard: g } });
const found = (extra: Record<string, unknown> = {}) => ({ tools: ['grammarly'], valueChanges: 0, shown: 1, exempt: false, mode: 'block', ...extra });

describe('what the spelling guard may say', () => {
  it('keeps only tools it knows, and sane counts', () => {
    expect(cleanGuard({ guard: { tools: ['grammarly', 'grammarly', 'evil', 5, 'answer-changed'], valueChanges: 2.7, shown: -4, exempt: true, mode: 'block' } })).toEqual({ tools: ['grammarly', 'answer-changed'], valueChanges: 2, shown: 0, exempt: true, mode: 'block' });
    expect(cleanGuard({ guard: { tools: 'x', mode: 'odd' } })).toEqual({ tools: [], valueChanges: 0, shown: 0, exempt: false, mode: 'warn' });
    expect(cleanGuard('x')).toBeNull();
    expect(cleanGuard({ guard: [] })).toBeNull();
  });
  it('remembers what was seen, and only counts up', () => {
    const first = guardUpdate(undefined, cleanGuard(found()), { userID: 1 }, new Date(1000)).guard;
    const next = guardUpdate({ guard: first }, cleanGuard(found({ tools: ['languagetool'], valueChanges: 3, shown: 2 })), { userID: 1 }, new Date(2000)).guard;
    const lower = guardUpdate({ guard: next }, cleanGuard(found({ tools: [], valueChanges: 1, shown: 1 })), { userID: 1 }, new Date(3000)).guard;
    expect(lower).toMatchObject({ tools: ['grammarly', 'languagetool'], valueChanges: 3, shown: 2, exempt: false });
    expect(lower.first).toEqual(new Date(1000));
    expect(guardLabel(lower)).toBe('Grammarly; LanguageTool');
    expect(guardLabel({ tools: [], exempt: true })).toBe('Exemption code used');
    expect(guardLabel({ tools: [] })).toBe('');
  });
});

describe('the guard route', () => {
  it('keeps what a learner\'s browser found on their record, under their session', async () => {
    expect((await guard(sam, found({ tools: ['grammarly', 'answer-changed'], valueChanges: 1 }))).json).toEqual({ available: true, ok: true });
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ username: 'sam', guard: { tools: ['grammarly', 'answer-changed'], valueChanges: 1, shown: 1, exempt: false } });
  });
  it('has nowhere to keep it without a session, and refuses nonsense', async () => {
    expect((await guard(null, found())).json).toEqual({ available: false });
    expect((await h.call('POST', `/learn/${token}/guard`, { user: sam, json: 'nope' })).status).toBe(400);
    expect(records()).toHaveLength(0);
  });
  it('shows the project owner who had a tool, and puts it in the spreadsheet', async () => {
    await guard(sam, found({ tools: ['quillbot'] }));
    await guard(lee, found({ tools: [], exempt: true, shown: 1 }));
    await guard(bob, found({ tools: [] }));
    const r = await h.call('GET', '/api/projects/prlearn001/results', { user: ann });
    const by = (u: string) => r.json.list.find((x: { username: string }) => x.username === u);
    expect(by('sam').guard).toMatchObject({ tools: ['quillbot'], label: 'QuillBot' });
    expect(by('lee').guard).toMatchObject({ exempt: true, label: 'Exemption code used' });
    expect(by('bob').guard).toBeNull();
    const csv = (await h.call('GET', '/api/projects/prlearn001/results.csv', { user: ann })).text;
    expect(csv.split('\r\n')[0]).toContain('writing tools found');
    expect(csv).toContain('QuillBot');
  });
  it('is kept for a project that marks on the server too (the route does not depend on that)', async () => {
    await guard(sam, found());
    expect(records()[0].guard.tools).toEqual(['grammarly']);
    expect(resultsCsv(records())).toContain('Grammarly');
  });
});
