// @vitest-environment node
//The usage and errors view for the people who make the product: the editor's own analytics rows and the published
//projects' diagnostics, counted. Power users only; counts and scrubbed fault text, never content.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { editorReport, playerReport } from '../shared/usage-report.mjs';

const power: User = { username: 'pat', power: true };
const ann: User = { username: 'ann' };
let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  h.db.ingest.docs = [];
});

const NOW = Date.now();
let seq = 0;
//An editor row the way analytics.ts sends it and ingest-lean leaves it
const ed = (user: string | null, sid: string, feature: string, featureID: string, ev: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, ago = 1000) => ({
  _id: `e${++seq}`,
  app: 'Interactives Editor',
  feature,
  featureID,
  meta: { sid, build: 'b1', v: '0.1.0', ...(user ? { user: { username: user } } : {}), ev: { n: 1, ...ev }, ...extra },
  timestamp: NOW - ago - seq,
});
const fault = (user: string | null, sid: string, fp: string, extra: Record<string, unknown> = {}, ago = 1000) =>
  ed(user, sid, 'error', 'boundary', undefined, { err: { fp, kind: 'boundary', cls: 'TypeError', msg: 'options.split is not a function', where: 'inspector', frame: 'render@index.js', project: 'pr1', ...extra } }, ago);
const diag = (user: string | null, run: string, feature: string, project: string, d: Record<string, unknown>, ago = 1000) => ({
  _id: `p${++seq}`,
  app: 'Interactives Player',
  feature,
  featureID: project,
  meta: { project, run, ...(user ? { user: { username: user } } : {}), diag: { kind: feature, version: '0.1.0', ...d } },
  timestamp: NOW - ago - seq,
});
const put = (...rows: Record<string, unknown>[]) => h.db.ingest.docs.push(...rows);

describe('who may read it', () => {
  it('is for power users', async () => {
    expect((await h.call('GET', '/api/analytics/usage', { user: ann })).status).toBe(403);
    expect((await h.call('GET', '/api/analytics/usage', { user: null })).status).toBe(403);
    expect((await h.call('GET', '/api/analytics/usage', { user: power })).status).toBe(200);
  });
});

describe('the editor side', () => {
  it('counts visits, people, features, tools, imports, exports and help', async () => {
    put(
      ed('ann', 's1', 'session', 'start', { detail: { browser: 'chrome', major: 155 } }),
      ed('ann', 's1', 'session', 'active', { ms: 1800000 }),
      ed('ann', 's1', 'project', 'open'),
      ed('ann', 's1', 'tool', 'use', { thing: 'pen', n: 4 }),
      ed('ann', 's1', 'tool', 'time', { thing: 'pen', ms: 90000 }),
      ed('bob', 's2', 'tool', 'use', { thing: 'pen' }),
      ed('bob', 's2', 'tool', 'use', { thing: 'rect', n: 2 }),
      ed('ann', 's1', 'node', 'add', { thing: 'rect', n: 3 }),
      ed('ann', 's1', 'inspector', 'change', { thing: 'fill', n: 5, detail: { node: 'rect' } }),
      ed('ann', 's1', 'preview', 'open', { ms: 40000 }),
      ed('ann', 's1', 'import', 'ok', { thing: 'riv', sum: { kb: 20 } }),
      ed('ann', 's1', 'import', 'failed', { thing: 'riv' }),
      ed('bob', 's2', 'import', 'ok', { thing: 'svg' }),
      ed('ann', 's1', 'export', 'download', { thing: 'html', n: 2 }),
      ed('ann', 's1', 'help', 'topic', { thing: 'welcome', n: 3 }),
      ed('ann', 's1', 'help', 'search', { n: 4, detail: { words: 2, found: false } }),
      ed('ann', 's1', 'help', 'search', { n: 6, detail: { words: 1, found: true } }),
      ed('ann', 's1', 'feature', 'steps-enable', { n: 2 }),
    );
    const r = (await h.call('GET', '/api/analytics/usage?days=7', { user: power })).json.editor;
    expect(r).toMatchObject({ visits: 2, users: 2, activeMs: 1800000 });
    expect(r.browsers).toEqual([{ browser: 'chrome 155', visits: 1 }]);
    expect(r.tools).toEqual([
      { tool: 'pen', uses: 5, users: 2, ms: 90000 },
      { tool: 'rect', uses: 2, users: 1, ms: 0 },
    ]);
    expect(r.imports).toEqual([
      { format: 'riv', ok: 1, failed: 1, kb: 20, users: 1 },
      { format: 'svg', ok: 1, failed: 0, kb: 0, users: 1 },
    ]);
    expect(r.exports).toEqual([expect.objectContaining({ key: 'html', uses: 2 })]);
    expect(r.help.topics[0]).toMatchObject({ key: 'welcome', uses: 3 });
    expect(r.help).toMatchObject({ searches: 10, notFound: 4 });
    expect(r.features).toEqual([expect.objectContaining({ key: 'steps-enable', uses: 2 })]);
    expect(r.funnel.map((s: { label: string; people: number }) => [s.label, s.people])).toEqual([
      ['Opened the editor', 2],
      ['Opened a project', 1],
      ['Added a layer', 1],
      ['Changed a property', 1],
      ['Opened the preview', 1],
      ['Exported or shared', 1],
    ]);
  });

  it('groups faults by fingerprint, counting every time (including those held back from being sent in full)', async () => {
    put(
      fault('ann', 's1', 'aaaa1111', {}, 5000),
      fault('ann', 's1', 'aaaa1111', {}, 4000),
      fault('bob', 's2', 'aaaa1111', {}, 3000),
      ed('ann', 's1', 'error', 'boundary', { n: 40, detail: { fp: 'aaaa1111' } }),
      fault('bob', 's2', 'bbbb2222', { kind: 'api', where: 'projects/:id', detail: { status: 500 }, msg: 'Server error 500' }, 100),
    );
    const r = (await h.call('GET', '/api/analytics/usage', { user: power })).json.editor;
    expect(r.faultCount).toBe(2);
    expect(r.faults.map((f: { fp: string }) => f.fp)).toEqual(['bbbb2222', 'aaaa1111']);
    const a = r.faults.find((f: { fp: string }) => f.fp === 'aaaa1111');
    expect(a).toMatchObject({ reports: 3, count: 40, users: 2, visits: 2, msg: 'options.split is not a function', where: 'inspector', builds: ['b1'], projects: 1 });
    expect(r.faults[0]).toMatchObject({ status: 500, count: 1 });
  });

  it('only looks at the days asked for, and takes the editor\'s rows alone', async () => {
    put(ed('ann', 's1', 'tool', 'use', { thing: 'pen' }, {}, 1000), ed('ann', 's9', 'tool', 'use', { thing: 'old' }, {}, 10 * 86400000), { ...ed('ann', 's1', 'tool', 'use', { thing: 'other-app' }), app: 'Reaction Bar' });
    const week = (await h.call('GET', '/api/analytics/usage?days=7', { user: power })).json.editor;
    expect(week.tools.map((t: { tool: string }) => t.tool)).toEqual(['pen']);
    const month = (await h.call('GET', '/api/analytics/usage?days=30', { user: power })).json.editor;
    expect(month.tools.map((t: { tool: string }) => t.tool).sort()).toEqual(['old', 'pen']);
    expect((await h.call('GET', '/api/analytics/usage?days=banana', { user: power })).json.days).toBe(7);
  });

  it('copes with rows that are not the shape it expects', () => {
    expect(() => editorReport([{}, { feature: 'tool' }, { feature: 'error', meta: { err: 'x' } }, { feature: 'import', featureID: 'ok', meta: { ev: 'x' } }, null].filter(Boolean))).not.toThrow();
    expect(() => playerReport([{}, { meta: { diag: 'x' } }, { feature: 'load', meta: { diag: { ms: 'x' } } }])).not.toThrow();
  });
});

describe('the published projects\' side', () => {
  it('counts page loads, load times, and faults grouped by fingerprint, without listing anyone', async () => {
    put(
      diag('sam', 'r1', 'load', 'prA', { ms: 100 }),
      diag('sam', 'r2', 'load', 'prA', { ms: 300 }),
      diag(null, 'r3', 'load', 'prB', { ms: 200 }),
      diag('sam', 'r1', 'script', 'prA', { fingerprint: 'f1', where: 'sandbox', message: 'x is not a function' }),
      diag('kim', 'r4', 'script', 'prA', { fingerprint: 'f1', where: 'sandbox', message: 'x is not a function', version: '0.2.0' }),
      diag('kim', 'r4', 'shader', 'prB', { fingerprint: 's1', where: 'layer', level: 'error', message: 'compile failed' }),
    );
    const r = (await h.call('GET', '/api/analytics/usage', { user: power })).json.player;
    expect(r).toMatchObject({ pageLoads: 4, learners: 3 });
    expect(r.loads).toMatchObject({ n: 3, p50: 200 });
    const f = r.faults.find((x: { fp: string }) => x.fp === 'f1');
    expect(f).toMatchObject({ kind: 'script', where: 'sandbox', count: 2, learners: 2, runs: 2, projects: 1 });
    expect(f.versions.sort()).toEqual(['0.1.0', '0.2.0']);
    expect(r.projects[0]).toMatchObject({ project: 'prA', faults: 2, loads: 2 });
    expect(JSON.stringify(r)).not.toMatch(/sam|kim/);
  });
});
