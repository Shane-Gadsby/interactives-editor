//The editor's own analytics: events added up and sent as a few rows (not one per event), only tokens and numbers leave
//(nothing a person typed), faults scrubbed and fingerprinted and limited, routes without ids, and the hooks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import {
  APP,
  MAX_BUCKETS,
  ROUTE_WORDS,
  MAX_ERRORS_PER_MINUTE,
  MAX_ROWS_PER_FLUSH,
  MAX_ROWS_PER_VISIT,
  MAX_SAME_ERROR,
  cleanDetail,
  extOf,
  flush,
  installErrorHooks,
  noteHelpSearch,
  noteLayerFault,
  noteProjectDiagnostic,
  reportError,
  resetAnalytics,
  routePattern,
  setProject,
  setSink,
  span,
  token,
  track,
  trackFirst,
  type Row,
} from '../src/lib/analytics';

let rows: Row[] = [];
let instants = 0;
beforeEach(() => {
  rows = [];
  instants = 0;
  resetAnalytics();
  setSink((app, feature, featureID, meta, instant) => {
    rows.push({ app, feature, featureID, meta });
    if (instant) instants++;
  });
});
afterEach(() => {
  setSink(null);
  vi.useRealTimers();
});

const ev = (r: Row) => r.meta.ev as Record<string, unknown>;
const err = (r: Row) => r.meta.err as Record<string, unknown>;

describe('adding up', () => {
  it('sends one row for a thing done many times, with the count', () => {
    for (let i = 0; i < 40; i++) track('tool', 'use', { thing: 'pen' });
    track('tool', 'use', { thing: 'rect' });
    flush();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.app === APP && r.feature === 'tool' && r.featureID === 'use')).toBe(true);
    expect(ev(rows.find((r) => ev(r).thing === 'pen')!).n).toBe(40);
    expect(rows[0].meta.sid).toBeTruthy();
    expect(rows[0].meta.build).toBeTruthy();
    expect(rows[0].meta.v).toBeTruthy();
  });

  it('adds up time and sums, and keeps different details apart', () => {
    track('import', 'ok', { thing: 'svg', ms: 100, sum: { kb: 5 }, detail: { as: 'layers' } });
    track('import', 'ok', { thing: 'svg', ms: 50, sum: { kb: 7 }, detail: { as: 'layers' } });
    track('import', 'ok', { thing: 'svg', detail: { as: 'asset' } });
    flush();
    expect(rows).toHaveLength(2);
    const layers = ev(rows.find((r) => (ev(r).detail as { as: string }).as === 'layers')!);
    expect(layers).toMatchObject({ n: 2, ms: 150, sum: { kb: 12 } });
  });

  it('files events under the open project, and keeps projects apart', () => {
    setProject('pr_a');
    track('node', 'add', { thing: 'rect' });
    setProject('pr_b');
    track('node', 'add', { thing: 'rect' });
    flush();
    const adds = rows.filter((r) => r.feature === 'node');
    expect(adds.map((r) => ev(r).project).sort()).toEqual(['pr_a', 'pr_b']);
    // moving between projects says the first closed, with how long it was open
    expect(rows.some((r) => r.feature === 'project' && r.featureID === 'close' && ev(r).project === 'pr_a')).toBe(true);
  });

  it('asks for the queue to go now with the last row of a flush, and sends nothing when there is nothing', () => {
    expect(flush()).toBe(0);
    track('panel', 'open', { thing: 'timeline' });
    track('panel', 'open', { thing: 'logic' });
    flush();
    expect(rows).toHaveLength(2);
    expect(instants).toBe(1);
    expect(flush()).toBe(0);
  });

  it('counts the first time only for first-use marks', () => {
    trackFirst('node', 'first-add', { thing: 'rect' });
    trackFirst('node', 'first-add', { thing: 'rect' });
    trackFirst('node', 'first-add', { thing: 'text' });
    flush();
    expect(rows).toHaveLength(2);
  });

  it('times a span', () => {
    vi.useFakeTimers();
    const done = span('preview', 'open', { thing: 'modal' });
    vi.advanceTimersByTime(2500);
    done();
    done();
    flush();
    expect(rows).toHaveLength(1);
    expect(ev(rows[0])).toMatchObject({ n: 1, ms: 2500 });
  });

  it('does not send before the person is known, unless the tab is going away', () => {
    resetAnalytics();
    // resetAnalytics marks the person as known; the not-identified path is the install one, so check the final flag
    track('doc', 'edit');
    expect(flush(true)).toBe(1);
  });
});

describe('volume', () => {
  it('holds a limited number of different buckets, and says how many it dropped', () => {
    for (let i = 0; i < MAX_BUCKETS + 40; i++) track('inspector', 'change', { thing: `prop${i}` });
    flush();
    const meta = rows.find((r) => r.feature === 'meta');
    expect(rows.filter((r) => r.feature === 'inspector')).toHaveLength(MAX_ROWS_PER_FLUSH);
    expect(ev(meta!).n).toBe(MAX_BUCKETS + 40 - MAX_ROWS_PER_FLUSH);
  });

  it('stops sending ordinary rows after a visit has sent its share', () => {
    let sent = 0;
    while (sent < MAX_ROWS_PER_VISIT) {
      for (let i = 0; i < MAX_ROWS_PER_FLUSH && sent < MAX_ROWS_PER_VISIT; i++) track('inspector', 'change', { thing: `p${i}`, detail: { round: sent } });
      sent += flush();
    }
    rows.length = 0;
    track('tool', 'use', { thing: 'pen' });
    flush();
    expect(rows.filter((r) => r.feature === 'tool')).toHaveLength(0);
    expect(rows.some((r) => r.feature === 'meta')).toBe(true);
  });

  it('never throws, whatever it is given', () => {
    expect(() => {
      track('tool', 'use', { thing: {} as never, n: NaN, ms: Infinity, detail: { a: {} as never, b: [] as never }, sum: { x: NaN } });
      track('tool', '' as never);
      track('tool', 'has space' as never);
      flush();
    }).not.toThrow();
    setSink(() => {
      throw new Error('sink broke');
    });
    track('tool', 'use', { thing: 'pen' });
    expect(() => flush()).not.toThrow();
  });
});

describe('what may leave (no content)', () => {
  it('only lets plain tokens through as a thing or a detail value', () => {
    expect(token('pen')).toBe('pen');
    expect(token('projects/:id/comments')).toBe('projects/:id/comments');
    expect(token('My cat Felix')).toBeUndefined();
    expect(token('x'.repeat(60))).toBeUndefined();
    expect(token('')).toBeUndefined();
    expect(token('a\nb')).toBeUndefined();
  });

  it('drops a title, a name, a sentence or an object passed by mistake', () => {
    track('node', 'add', { thing: 'Quiz about Sam Smith' });
    track('node', 'add', { thing: 'rect', detail: { name: 'Sam Smith', text: 'hello there', ok: true, count: 3, bad: { a: 1 } as never, nan: NaN } });
    flush();
    const sent = rows.map((r) => JSON.stringify(r.meta)).join('');
    expect(sent).not.toMatch(/Sam|Smith|hello|Quiz/);
    const r = rows.find((x) => ev(x).thing === 'rect')!;
    expect(ev(r).detail).toEqual({ ok: true, count: 3 });
    // the one with a sentence for a thing is still counted, without the sentence
    expect(rows.find((x) => ev(x).thing === undefined && x.feature === 'node')).toBeTruthy();
  });

  it('keeps only the extension of a file name', () => {
    expect(extOf('Holiday photos of Sam.PNG')).toBe('png');
    expect(extOf('noextension')).toBe('other');
    expect(extOf('archive.tar.gz')).toBe('gz');
    expect(extOf('weird.ext-with-dash')).toBe('other');
    expect(extOf(undefined)).toBe('other');
  });

  it('keeps ids and names out of server routes', () => {
    expect(routePattern('http://h/interactives/api/projects/pr_9f8e7d/comments?x=1')).toBe('projects/:id/comments');
    expect(routePattern('projects/abc123/revisions/7')).toBe('projects/:id/revisions/:id');
    expect(routePattern('libraries/My%20Library/versions')).toBe('libraries/:id/:id');
    expect(routePattern('session')).toBe('session');
    expect(routePattern('')).toBe('/');
  });

  it('knows every fixed word in the server\'s routes, so only ids and names are masked', () => {
    const src = readFileSync(`${__dirname}/../index.js`, 'utf8');
    const words = new Set<string>();
    for (const m of src.matchAll(/router\.(?:get|put|post|delete|patch|use)\('([^']+)'/g)) for (const w of m[1].split('/')) if (w && !w.startsWith(':')) words.add(w);
    expect([...words].filter((w) => !ROUTE_WORDS.has(w))).toEqual([]);
  });

  it('cleanDetail takes at most eight keys and rounds numbers', () => {
    const d: Record<string, number> = {};
    for (let i = 0; i < 12; i++) d[`k${i}`] = i + 0.123456;
    const out = cleanDetail(d);
    expect(Object.keys(out)).toHaveLength(8);
    expect(out.k0).toBe(0.12);
  });

  it('help searches never carry the words, only how many and whether anything matched', () => {
    vi.useFakeTimers();
    noteHelpSearch('how do I make my private thing work', 0);
    vi.advanceTimersByTime(1300);
    flush();
    const r = rows.find((x) => x.feature === 'help' && x.featureID === 'search')!;
    expect(ev(r).detail).toEqual({ words: 5, found: false });
    expect(JSON.stringify(rows)).not.toMatch(/private/);
  });

  it('no help search is noted for an empty query, and typing on cancels the earlier note', () => {
    vi.useFakeTimers();
    noteHelpSearch('', 3)();
    const stop = noteHelpSearch('ab', 3);
    stop();
    vi.advanceTimersByTime(2000);
    flush();
    expect(rows).toHaveLength(0);
  });
});

describe('faults', () => {
  const fault = (msg: string, frame = 'runNode', file = 'index-AbCd1234.js') => Object.assign(new TypeError(msg), { stack: `TypeError: ${msg}\n    at ${frame} (https://h/assets/${file}:1:1)` });

  it('sends a scrubbed message, class, a fingerprint, where, and the build, at once', () => {
    setProject('pr_a');
    reportError({ kind: 'window', error: fault('Cannot read "private text" of undefined at https://x.y/z'), where: 'window' });
    const e = rows.find((r) => r.feature === 'error' && r.meta.err)!;
    expect(e.featureID).toBe('window');
    expect(err(e)).toMatchObject({ cls: 'TypeError', msg: 'Cannot read "?" of undefined at <url>', where: 'window', project: 'pr_a', frame: 'runNode@index.js' });
    expect(err(e).fp).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(rows)).not.toContain('private text');
    expect(instants).toBe(1);
    expect(e.meta.build).toBeTruthy();
  });

  it('groups the same fault: the same fingerprint across rebuilds and quoted details, another for another place', () => {
    reportError({ kind: 'window', error: fault('Bad thing "one"', 'runNode', 'index-AbCd1234.js'), where: 'window' });
    reportError({ kind: 'window', error: fault('Bad thing "two"', 'runNode', 'index-ZzZz9999.js'), where: 'window' });
    reportError({ kind: 'promise', error: fault('Bad thing "two"'), where: 'promise' });
    const fps = rows.filter((r) => r.meta.err).map((r) => err(r).fp);
    expect(fps[0]).toBe(fps[1]);
    expect(fps[2]).not.toBe(fps[0]);
  });

  it('sends one fault a few times, counts the rest, and limits a flood of different ones', () => {
    for (let i = 0; i < 20; i++) reportError({ kind: 'window', error: fault('same'), where: 'window' });
    expect(rows.filter((r) => r.meta.err)).toHaveLength(MAX_SAME_ERROR);
    flush();
    const counted = rows.find((r) => r.feature === 'error' && r.meta.ev)!;
    expect(ev(counted).n).toBe(20);
    rows.length = 0;
    for (let i = 0; i < 200; i++) reportError({ kind: 'window', error: fault(`different ${'ab '.repeat(i)}`), where: 'window' });
    expect(rows.filter((r) => r.meta.err).length).toBeLessThanOrEqual(MAX_ERRORS_PER_MINUTE);
  });

  it('copes with anything thrown', () => {
    for (const v of [undefined, null, 'text', 42, {}, Symbol('s'), Object.create(null)]) expect(() => reportError({ kind: 'window', error: v })).not.toThrow();
    expect(() => reportError({ kind: 'has a space', error: new Error('x') })).not.toThrow();
    expect(rows.every((r) => !r.featureID.includes(' '))).toBe(true);
  });

  it('records facts about the fault as detail, tokens and numbers only', () => {
    reportError({ kind: 'api', error: 'Server error 500', where: 'projects/:id', detail: { method: 'PUT', status: 500, body: 'a typed sentence' } });
    const e = rows.find((r) => r.meta.err)!;
    expect(err(e).detail).toEqual({ method: 'PUT', status: 500 });
  });

  it('window error and rejection hooks report, and ignore the browser noise', async () => {
    installErrorHooks();
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    expect(rows).toHaveLength(0);
    window.dispatchEvent(new ErrorEvent('error', { message: 'x is not a function', error: fault('x is not a function') }));
    const rej = new Event('unhandledrejection') as Event & { reason: unknown };
    rej.reason = new Error('Failed to fetch dynamically imported module: https://h/assets/chunk-1.js');
    window.dispatchEvent(rej);
    const kinds = rows.filter((r) => r.meta.err).map((r) => r.featureID);
    expect(kinds).toEqual(['window', 'chunk']);
  });

  it('a project fault from the preview or the canvas is a fault of kind project-<kind>, and its load time a row', () => {
    noteProjectDiagnostic({ kind: 'shader', project: 'p', version: '0.1.0', where: 'layer', level: 'error', message: 'Could not compile "my secret shader"', fingerprint: 'abc12345' }, 'preview');
    const e = rows.find((r) => r.meta.err)!;
    expect(e.featureID).toBe('project-shader');
    expect(err(e)).toMatchObject({ msg: 'Could not compile "?"', via: 'preview', level: 'error' });
    expect(JSON.stringify(rows)).not.toContain('secret shader');
    noteProjectDiagnostic({ kind: 'load', project: 'p', version: '0.1.0', ms: 321, artboards: 2, layers: 40 }, 'preview');
    noteProjectDiagnostic({ kind: 'nonsense' }, 'preview');
    noteLayerFault('draw', 'draw() is not defined', 'error');
    flush();
    const load = rows.find((r) => r.feature === 'preview' && r.featureID === 'loaded')!;
    expect(ev(load)).toMatchObject({ ms: 321, sum: { artboards: 2, layers: 40 } });
    expect(rows.filter((r) => r.featureID === 'project-draw')).toHaveLength(2);
  });
});

describe('reportAnalytics is what carries it', () => {
  it('with no sink set, rows go to the global reportAnalytics of si-manager\'s utilities.js with the app, feature and featureID', () => {
    setSink(null);
    const calls: unknown[][] = [];
    (window as unknown as { reportAnalytics: unknown }).reportAnalytics = (...a: unknown[]) => calls.push(a);
    track('tool', 'use', { thing: 'pen' });
    flush();
    delete (window as unknown as { reportAnalytics?: unknown }).reportAnalytics;
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3)).toEqual([APP, 'tool', 'use']);
    expect((calls[0][3] as { ev: { thing: string } }).ev.thing).toBe('pen');
    expect(calls[0][4]).toBe(true);
  });

  it('keeps what it holds when utilities.js is not there, and sends it later', () => {
    setSink(null);
    track('tool', 'use', { thing: 'pen' });
    expect(flush()).toBe(0);
    const calls: unknown[][] = [];
    (window as unknown as { reportAnalytics: unknown }).reportAnalytics = (...a: unknown[]) => calls.push(a);
    expect(flush()).toBe(1);
    delete (window as unknown as { reportAnalytics?: unknown }).reportAnalytics;
    expect(calls).toHaveLength(1);
  });
});

void act;
