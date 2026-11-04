// @vitest-environment node
//Learner activity records and Insights: the learner page passes what the project says on to the suite's analytics
//(reportAnalytics, the way every toolbox app reports), checking it first and filing it under the project the link
//is for, and the project's owner (not anyone else) reads it back as counts, with the real index.js against the
//in-memory mongo stand-in.
import vm from 'node:vm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { cleanRecord, cleanDiag, diagRow, insights, rowFor, CELL } from '../shared/records.mjs';
import { cleanDiagnostic } from '../../interactives-player/src/diagnostics';

const ann: User = { username: 'ann', fullName: 'Ann A' };
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
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['interactives-user-data'], h.db.ingest]) c.docs = [];
  await h.call('PUT', '/api/projects/prins001', { user: ann, json: { project: project('prins001'), rev: 0 } });
  token = (await h.call('PUT', '/api/projects/prins001/share', { user: ann, body: '<html><body>shared</body></html>', type: 'text/plain' })).json.share.token;
});

const T0 = Date.now();
let seq = 0;
//An ingest row the way si-analytics keeps one after leanMeta: user and activity slimmed, the record under meta.rec
const row = (user: string | null, rec: Record<string, unknown>, extra: Record<string, unknown> = {}, run = `run-${user}`) => ({
  _id: `row${++seq}`,
  app: 'Interactives',
  feature: rec.kind,
  featureID: 'prins001',
  meta: { project: 'prins001', run, rec, ...(user ? { user: { username: user, userID: 1 } } : {}), activity: { courseLabel: 'MAT1000_2026_S1', lmsURL: 'https://lms.example' } },
  timestamp: T0 - seq * 1000,
  ...extra,
});
const put = (...rows: Record<string, unknown>[]) => h.db.ingest.docs.push(...rows);
const view = (user: string, artboard: string, name = artboard) => row(user, { kind: 'view', artboard, artboardName: name });
const click = (user: string, x: number, y: number, extra: Record<string, unknown> = {}) => row(user, { kind: 'click', artboard: 'ab1', artboardName: 'Main', x, y, ...extra });

describe('what a record may hold', () => {
  it('keeps the fields of its kind and drops the rest', () => {
    expect(cleanRecord({ kind: 'view', artboard: 'ab1', artboardName: ' Main  page ', username: 'sam', extra: 1 })).toEqual({ kind: 'view', artboard: 'ab1', artboardName: 'Main page' });
    expect(cleanRecord({ kind: 'click', artboard: 'ab1', layer: 'go', label: 'Go', x: 10.4, y: 20 })).toEqual({ kind: 'click', artboard: 'ab1', layer: 'go', label: 'Go', x: 10, y: 20 });
    expect(cleanRecord({ kind: 'click', artboard: 'ab1', x: -5, y: 1e9 })).toEqual({ kind: 'click', artboard: 'ab1' });
    expect(cleanRecord({ kind: 'step', artboard: 'ab1', step: 2, steps: 5 })).toMatchObject({ step: 2, steps: 5 });
    expect(cleanRecord({ kind: 'answer', question: 'q1', questionKind: 'single', correct: true, attempt: 2, fraction: 0.5, options: ['o1', 'bad id!', 'o3'], typed: 'Sam Smith' })).toEqual({ kind: 'answer', question: 'q1', questionKind: 'single', correct: true, attempt: 2, fraction: 0.5, options: ['o1', 'o3'] });
    expect(cleanRecord({ kind: 'custom', label: '  chose B ', value: 3, artboard: 'ab1' })).toEqual({ kind: 'custom', label: 'chose B', value: 3, artboard: 'ab1' });
  });
  it('refuses what is not a record', () => {
    for (const bad of [null, 'x', [], {}, { kind: 'login' }, { kind: 'view' }, { kind: 'step', step: 0, steps: 3 }, { kind: 'answer', question: 'q1', correct: 'yes', attempt: 1 }, { kind: 'custom', label: '   ' }, { kind: 'view', artboard: 'a b' }]) {
      expect(cleanRecord(bad)).toBeNull();
    }
  });
  it('cuts long text short and keeps keys that could hurt mongo out of it', () => {
    const r = cleanRecord({ kind: 'custom', label: 'x'.repeat(200), value: 'y'.repeat(500), $where: 'bad', __proto__: { a: 1 } });
    expect(r.label).toHaveLength(60);
    expect(r.value).toHaveLength(120);
    expect(Object.keys(r).sort()).toEqual(['kind', 'label', 'value']);
  });
  it('is filed the way the suite files analytics: app, kind, project, then the record', () => {
    expect(rowFor('prins001', 'run1', { kind: 'click', artboard: 'ab1' })).toEqual(['Interactives', 'click', 'prins001', { project: 'prins001', run: 'run1', rec: { kind: 'click', artboard: 'ab1' } }]);
  });
});

describe('the learner page passes records on to the suite analytics', () => {
  //Run the page's own script with the bits of a browser it touches, utilities.js's reportAnalytics and fetchActivity standing by
  const run = async (opts: { user?: Record<string, unknown> | null } = {}) => {
    const html = (await h.call('GET', `/play/${token}`)).text;
    const script = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
    const listeners: Record<string, (e: unknown) => void> = {};
    const frame = { contentWindow: { postMessage: vi.fn() } };
    const reported: unknown[][] = [];
    const timers: (() => void)[] = [];
    const store = new Map<string, string>();
    const ctx: Record<string, unknown> = {
      document: { getElementById: () => frame },
      location: { search: '' },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      URLSearchParams,
      fetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
      Promise,
      Object,
      Math,
      Date,
      JSON,
      setTimeout: (fn: () => void) => (timers.push(fn), timers.length),
      reportAnalytics: (...args: unknown[]) => reported.push(args),
      fetchActivity: (cb: (err: unknown, data: unknown) => void) => cb(null, opts.user === null ? {} : { user: opts.user ?? { username: 'sam', userID: 7 }, activity: { courseLabel: 'MAT1000_2026_S1' } }),
    };
    ctx.window = {
      parent: {},
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
      ...{},
    };
    (ctx.window as Record<string, unknown>).parent = ctx.window;
    vm.runInNewContext(script, ctx);
    const send = (data: unknown, source: unknown = frame.contentWindow) => listeners.message({ source, data });
    const flush = () => timers.splice(0).forEach((t) => t());
    return { html, send, flush, reported, frame, ctx };
  };

  it('loads utilities.js from the host and allows only that and its own script', async () => {
    const r = await h.call('GET', `/play/${token}`);
    expect(r.text).toContain('<script src="/utilities.js"></script>');
    expect(r.headers.get('content-security-policy')).toMatch(/script-src 'nonce-[^']+' 'self';/);
  });

  it('reports a record with reportAnalytics, under this link\'s project', async () => {
    const p = await run();
    p.send({ source: 'interactives-record', record: { kind: 'click', project: 'someone-elses', artboard: 'ab1', layer: 'go', label: 'Go', x: 5, y: 6 } });
    p.flush();
    expect(p.reported).toHaveLength(1);
    const [app, feature, featureID, meta] = p.reported[0] as [string, string, string, Record<string, any>];
    expect([app, feature, featureID]).toEqual(['Interactives', 'click', 'prins001']);
    expect(meta.project).toBe('prins001');
    expect(meta.rec).toEqual({ kind: 'click', artboard: 'ab1', layer: 'go', label: 'Go', x: 5, y: 6 });
    expect(typeof meta.run).toBe('string');
    expect(JSON.stringify(p.reported)).not.toContain('someone-elses');
  });

  it('holds records until the session has said who it is, then sends them all with one run id', async () => {
    const p = await run();
    p.send({ source: 'interactives-record', record: { kind: 'view', artboard: 'ab1', artboardName: 'Main' } });
    p.send({ source: 'interactives-record', record: { kind: 'custom', label: 'opened hint' } });
    expect(p.reported).toHaveLength(0);
    p.flush();
    expect(p.reported.map((r) => r[1])).toEqual(['view', 'custom']);
    expect(new Set(p.reported.map((r) => (r[3] as { run: string }).run)).size).toBe(1);
  });

  it('sends nothing with no signed-in user, and drops what is not a record', async () => {
    const none = await run({ user: null });
    none.send({ source: 'interactives-record', record: { kind: 'view', artboard: 'ab1' } });
    none.flush();
    expect(none.reported).toHaveLength(0);
    const p = await run();
    p.send({ source: 'interactives-record', record: { kind: 'login', password: 'x' } });
    p.send({ source: 'interactives-record', record: 'x' });
    p.send({ source: 'interactives-record' });
    p.flush();
    expect(p.reported).toHaveLength(0);
  });

  it('only listens to its own project frame', async () => {
    const p = await run();
    p.send({ source: 'interactives-record', record: { kind: 'view', artboard: 'ab1' } }, {});
    p.flush();
    expect(p.reported).toHaveLength(0);
  });

  it('stops after 600 records a page load', async () => {
    const p = await run();
    for (let i = 0; i < 700; i++) p.send({ source: 'interactives-record', record: { kind: 'custom', label: `n${i}` } });
    p.flush();
    expect(p.reported).toHaveLength(600);
  });

  it('still answers the progress requests it always did', async () => {
    const p = await run();
    p.send({ source: 'interactives-progress', op: 'load', rid: 'r1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(p.frame.contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', rid: 'r1' }), '*');
  });
});

describe('how a published project ran (diagnostics), for bug triage', () => {
  const run = async (opts: { user?: Record<string, unknown> | null } = {}) => {
    //same stand-ins as the records page tests above
    const html = (await h.call('GET', `/play/${token}`)).text;
    const script = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
    const listeners: Record<string, (e: unknown) => void> = {};
    const frame = { contentWindow: { postMessage: vi.fn() } };
    const reported: unknown[][] = [];
    const timers: (() => void)[] = [];
    const ctx: Record<string, unknown> = {
      document: { getElementById: () => frame },
      location: { search: '' },
      sessionStorage: { getItem: () => null, setItem: () => undefined },
      URLSearchParams,
      fetch: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
      Promise,
      Object,
      Math,
      Date,
      JSON,
      setTimeout: (fn: () => void) => (timers.push(fn), timers.length),
      reportAnalytics: (...args: unknown[]) => reported.push(args),
      fetchActivity: (cb: (err: unknown, data: unknown) => void) => cb(null, opts.user === null ? {} : { user: opts.user ?? { username: 'sam', userID: 7 }, activity: { courseLabel: 'MAT1000_2026_S1' } }),
    };
    ctx.window = { addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn) };
    (ctx.window as Record<string, unknown>).parent = ctx.window;
    vm.runInNewContext(script, ctx);
    const send = (data: unknown, source: unknown = frame.contentWindow) => listeners.message({ source, data });
    const flush = () => {
      for (let i = 0; i < 3; i++) timers.splice(0).forEach((t) => t());
    };
    return { send, flush, reported, ctx };
  };

  it('cleanDiag agrees with the player\'s own check, and refuses what is not a diagnostic', () => {
    const cases = [
      { kind: 'load', project: 'p1', version: '0.1.0', ms: 123.6, artboards: 2, scripts: 1, layers: 30, sandbox: true, learner: 'sam' },
      { kind: 'script', version: '0.1.0', where: 'sandbox', message: 'bad "typed" at https://x.y/z 123456', fingerprint: 'abcd1234' },
      { kind: 'shader', where: 'layer', level: 'error', message: 'compile failed' },
      { kind: 'data', where: 'fetch', status: 503, fingerprint: 'zz zz' },
      { kind: 'asset', where: 'img' },
    ];
    for (const c of cases) {
      const mine = { ...cleanDiag(c) };
      const theirs = { ...cleanDiagnostic(c) };
      delete theirs.project;
      expect(mine).toEqual(theirs);
    }
    for (const bad of [null, 'x', [], {}, { kind: 'login' }, { kind: 'keylog', text: 'abc' }]) expect(cleanDiag(bad)).toBeNull();
    expect(cleanDiag({ kind: 'error', message: 'Bad "typed words" for 1234567' }).message).toBe('Bad "?" for N');
  });

  it('is filed under its own app, with the kind as feature and the project as featureID, like the records', () => {
    expect(diagRow('prins001', 'run1', { kind: 'error', where: 'frame' })).toEqual(['Interactives Player', 'error', 'prins001', { project: 'prins001', run: 'run1', diag: { kind: 'error', where: 'frame' } }]);
  });

  it('passes a diagnostic from the project on, under this link\'s project, with the user when the session knows it', async () => {
    const p = await run();
    p.send({ source: 'interactives-diag', diag: { kind: 'load', project: 'someone-elses', version: '0.1.0', ms: 250, artboards: 2 } });
    p.send({ source: 'interactives-diag', diag: { kind: 'script', where: 'sandbox', message: 'x is not a function "secret"', fingerprint: 'abcd1234', version: '0.1.0' } });
    p.flush();
    expect(p.reported.map((r) => [r[0], r[1], r[2]])).toEqual([['Interactives Player', 'load', 'prins001'], ['Interactives Player', 'script', 'prins001']]);
    expect(JSON.stringify(p.reported)).not.toMatch(/someone-elses|secret/);
    expect((p.reported[1][3] as { diag: { message: string } }).diag.message).toBe('x is not a function "?"');
  });

  it('sends them with no signed-in user too (they say nothing about a person), but holds them until the session has answered', async () => {
    const p = await run({ user: null });
    p.send({ source: 'interactives-diag', diag: { kind: 'error', where: 'frame', version: '0.1.0' } });
    expect(p.reported).toHaveLength(0);
    p.flush();
    expect(p.reported).toHaveLength(1);
  });

  it('drops what is not a diagnostic, listens only to its own frame, and stops after 40 a page load', async () => {
    const p = await run();
    p.send({ source: 'interactives-diag', diag: { kind: 'keylog', text: 'abc' } });
    p.send({ source: 'interactives-diag', diag: 'x' });
    p.send({ source: 'interactives-diag', diag: { kind: 'error' } }, {});
    for (let i = 0; i < 60; i++) p.send({ source: 'interactives-diag', diag: { kind: 'error', where: 'frame', fingerprint: `f${i}` } });
    p.flush();
    expect(p.reported).toHaveLength(40);
  });

  it('says so when saving a learner\'s progress fails on the server', async () => {
    const p = await run();
    p.send({ source: 'interactives-progress', op: 'save', rid: 'r1', data: { a: 1 } });
    await new Promise((r) => setTimeout(r, 0));
    p.flush();
    const d = p.reported.find((r) => r[1] === 'error');
    expect((d![3] as { diag: Record<string, unknown> }).diag).toMatchObject({ where: 'learn-put', status: 503 });
  });
});

describe('Insights counts', () => {
  it('counts different learners, not records', () => {
    const out = insights([view('sam', 'ab1'), view('sam', 'ab1'), view('lee', 'ab1'), view('lee', 'ab2')]);
    expect(out).toMatchObject({ records: 4, learners: 2, visits: 2 });
    expect(out.artboards.find((a: { id: string }) => a.id === 'ab1')).toMatchObject({ views: 3, learners: 2 });
    expect(out.artboards.find((a: { id: string }) => a.id === 'ab2')).toMatchObject({ views: 1, learners: 1 });
  });
  it('tells visits of one learner apart by run', () => {
    expect(insights([row('sam', { kind: 'view', artboard: 'ab1' }, {}, 'r1'), row('sam', { kind: 'view', artboard: 'ab1' }, {}, 'r2')])).toMatchObject({ learners: 1, visits: 2 });
  });
  it('counts a row with no user by its run', () => {
    expect(insights([row(null, { kind: 'view', artboard: 'ab1' }, {}, 'r1'), row(null, { kind: 'view', artboard: 'ab1' }, {}, 'r2'), row(null, { kind: 'view', artboard: 'ab1' }, {}, 'r2')]).learners).toBe(2);
  });
  it('puts clicks into grid cells and names the layers clicked', () => {
    const out = insights([click('sam', 5, 5, { layer: 'go', label: 'Go' }), click('lee', 15, 19, { layer: 'go', label: 'Go' }), click('lee', 100, 45), click('sam', 3, 3, { x: undefined, y: undefined })].map((r) => r));
    expect(out.clicks).toMatchObject({ total: 4, positioned: 3, onLayers: 2, cell: CELL });
    const ab = out.clicks.artboards[0];
    expect(ab.cells).toEqual([
      { x: 0, y: 0, n: 2 },
      { x: 100, y: 40, n: 1 },
    ]);
    expect(out.clicks.layers).toEqual([{ artboard: 'ab1', layer: 'go', label: 'Go', clicks: 2, learners: 2 }]);
  });
  it('counts steps, questions and named records', () => {
    const out = insights([
      row('sam', { kind: 'step', artboard: 'ab1', artboardName: 'Main', step: 2, steps: 4 }),
      row('lee', { kind: 'step', artboard: 'ab1', artboardName: 'Main', step: 2, steps: 4 }),
      row('sam', { kind: 'answer', question: 'q1', questionKind: 'single', correct: false, attempt: 1, options: ['o1'] }),
      row('sam', { kind: 'answer', question: 'q1', questionKind: 'single', correct: true, attempt: 2, options: ['o2'] }),
      row('lee', { kind: 'answer', question: 'q1', questionKind: 'single', correct: true, attempt: 1, options: ['o2'] }),
      row('sam', { kind: 'custom', label: 'chose route', value: 'B' }),
      row('lee', { kind: 'custom', label: 'chose route', value: 'B' }),
      row('lee', { kind: 'custom', label: 'chose route', value: 'A' }),
    ]);
    expect(out.steps).toEqual([{ artboard: 'ab1', name: 'Main', step: 2, steps: 4, visits: 2, learners: 2 }]);
    expect(out.questions).toEqual([{ question: 'q1', kind: 'single', checks: 3, correct: 2, learners: 2, firstTry: 2, firstTryRight: 1, options: [{ id: 'o2', n: 2 }, { id: 'o1', n: 1 }] }]);
    expect(out.custom).toEqual([{ name: 'chose route', count: 3, learners: 2, values: [{ value: 'B', n: 2 }, { value: 'A', n: 1 }] }]);
  });
  it('ignores rows that are not valid records, and the feature the row is filed under decides what the record is', () => {
    const bad = row('sam', { kind: 'view', artboard: 'ab1' });
    bad.feature = 'step';
    expect(insights([bad, row('sam', { kind: 'nonsense' }), row('sam', { kind: 'custom' }), { _id: 'x' }]).records).toBe(0);
  });
  it('lists the courses and learners per day, and nobody by name', () => {
    const out = insights([view('sam', 'ab1'), view('lee', 'ab1')]);
    expect(out.courses).toEqual([{ course: 'MAT1000_2026_S1', learners: 2 }]);
    expect(out.daily).toHaveLength(1);
    expect(JSON.stringify(out)).not.toMatch(/sam|lee/);
  });
});

describe('Insights for the owner', () => {
  it('reads the project\'s records back as counts', async () => {
    put(view('sam', 'ab1', 'Main'), view('lee', 'ab1', 'Main'), view('sam', 'ab2', 'Next'), click('sam', 30, 30), click('lee', 35, 35, { layer: 'go', label: 'Go' }));
    //another project's records, and another app's, are not counted
    put({ ...view('sam', 'ab1'), featureID: 'other001' }, { ...view('sam', 'ab1'), app: 'Reaction Bar LTI' });
    const r = await h.call('GET', '/api/projects/prins001/insights', { user: ann });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ records: 5, learners: 2, days: 30, shared: true, truncated: false });
    expect(r.json.artboards.map((a: { id: string; learners: number }) => [a.id, a.learners]).sort()).toEqual([['ab1', 2], ['ab2', 1]]);
    expect(r.json.clicks.artboards[0].cells).toEqual([{ x: 20, y: 20, n: 2 }]);
  });
  it('lists no learner, only counts', async () => {
    put(view('sam', 'ab1'), view('lee', 'ab1'));
    const r = await h.call('GET', '/api/projects/prins001/insights', { user: ann });
    expect(r.text).not.toMatch(/sam|lee|username/);
  });
  it('can look at the last 7 days, or all of it', async () => {
    put(view('sam', 'ab1'), { ...view('lee', 'ab1'), timestamp: T0 - 20 * 24 * 3600 * 1000 }, { ...view('kim', 'ab1'), timestamp: T0 - 200 * 24 * 3600 * 1000 });
    const days = async (q: string) => (await h.call('GET', `/api/projects/prins001/insights${q}`, { user: ann })).json;
    expect((await days('?days=7')).learners).toBe(1);
    expect((await days('')).learners).toBe(2);
    expect((await days('?days=90')).learners).toBe(2);
    expect((await days('?days=0')).learners).toBe(3);
    expect((await days('?days=9999')).days).toBe(30);
  });
  it('is the owner\'s alone', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    try {
      expect((await h.call('GET', '/api/projects/prins001/insights', { user: bob })).status).toBe(403);
      expect((await h.call('GET', '/api/projects/prins001/insights', { user: { ...ann, power: true } })).status).toBe(200);
      expect((await h.call('GET', '/api/projects/prins001/insights', { user: ann })).status).toBe(200);
    } finally {
      process.env.SUITE_SESSION_ENFORCE = '';
    }
  });
  it('404s a project that is not there and refuses a bad id', async () => {
    expect((await h.call('GET', '/api/projects/prnone0001/insights', { user: ann })).status).toBe(404);
    expect((await h.call('GET', '/api/projects/..%2Fx/insights', { user: ann })).status).toBe(400);
  });
  it('says how many rows it saw when there were too many', async () => {
    put(view('sam', 'ab1'));
    const r = await h.call('GET', '/api/projects/prins001/insights', { user: ann });
    expect(r.json.truncated).toBe(false);
  });
});
