/**
 * What the editor records about its own use, and its faults. It is not optional (there is no setting for it) and it is
 * written down for people in the help ("What the editor records").
 *
 * It goes the way every toolbox app's analytics go: si-manager's utilities.js `reportAnalytics` queues a row, and it
 * reaches `lti-analytics.ingest` through si-analytics' `/analytics/ingest-bulk`, with the usual slimmed `meta.user`
 * (`suite-libs/ingest-lean.js`). A row is:
 *   app       'Interactives Editor'
 *   feature   the area (`tool`, `inspector`, `import`, `export`, `help`, `error`...), see `Area`
 *   featureID the action (`use`, `change`, `add`, `open`, `ok`, `failed`...)
 *   meta.ev   { thing, project, n, ms, detail, sum, t0, t1 }: what it was done to, which project, how many times and how
 *             long over the window, and a few low-cardinality facts. Errors carry `meta.err` instead.
 *   meta.sid  one id for this tab's visit, meta.build the editor build, meta.v the player's version.
 *
 * Volume: nothing is sent per event. Events are added up in memory by (area, action, thing, project, detail) and one row
 * per bucket goes out every minute (and when the tab is hidden or closed), with a count and the time spent. A visit has a
 * cap on rows, and a fault is sent a few times and then only counted.
 *
 * Content: nothing a person typed, no names (projects, layers, variables, files, libraries), no urls, no document. The
 * only free text anywhere is an error message, scrubbed (anything in quotes, urls, ids and long numbers removed) and cut
 * short. `thing` and the detail values must be plain tokens (no spaces), numbers or booleans, and anything else is
 * dropped here, so a call that is passed a title by mistake sends nothing.
 */
import { cleanDiagnostic, describeError, errorClass, hash32, PLAYER_VERSION, RateLimiter, scrubMessage, topFrame, type Diagnostic } from 'interactives-player';

export const APP = 'Interactives Editor';

export type Area =
  | 'session' // visits: start, active time, end
  | 'project' // opening, creating, importing and closing projects
  | 'tool' // canvas tools used, and time in each
  | 'panel' // bottom/left/right panel tabs opened, and time in each
  | 'inspector' // properties changed, by property
  | 'node' // layers added, by kind
  | 'history' // undo and redo
  | 'doc' // whole-document actions: delete, duplicate, group, align, undo, redo...
  | 'import'
  | 'export'
  | 'help'
  | 'preview'
  | 'live' // live editing sessions
  | 'feature' // the bigger features: questions, steps, drag and drop, captions, variants, interface, comments, libraries...
  | 'api' // calls to the editor's server (route patterns), rejected ones
  | 'error'
  | 'meta'; // the recorder's own housekeeping (rows it had to drop)

type Prim = string | number | boolean;

export interface Fields {
  /** What it was done to: a tool, a property, a layer kind, a format. A plain token. */
  thing?: string;
  /** Overrides the project the editor has open. */
  project?: string | null;
  /** How many times (default 1), added up over the window. */
  n?: number;
  /** Milliseconds spent, added up over the window. */
  ms?: number;
  /** A few low-cardinality facts (`{format: 'svg', outcome: 'ok'}`); different details are different rows. */
  detail?: Record<string, Prim | null | undefined>;
  /** Numbers that add up over the window instead of splitting the row (`{layers: 12}`). */
  sum?: Record<string, number>;
}

export interface Row {
  app: string;
  feature: string;
  featureID: string;
  meta: Record<string, unknown>;
}

type Sink = (app: string, feature: string, featureID: string, meta: Record<string, unknown>, instant?: boolean) => unknown;

declare const __IX_BUILD__: string | undefined;
export const BUILD = typeof __IX_BUILD__ === 'string' ? __IX_BUILD__ : 'dev';

/** How often the added-up rows go out. */
export const FLUSH_MS = 60_000;
/** The most rows one tab visit sends (the rest are counted in one `meta/dropped` row). */
export const MAX_ROWS_PER_VISIT = 2500;
/** The most different buckets held between two flushes. */
export const MAX_BUCKETS = 300;
/** The most rows one flush sends. */
export const MAX_ROWS_PER_FLUSH = 150;
/** The most times one fault is sent in a visit, and the most faults sent in a minute. */
export const MAX_SAME_ERROR = 3;
export const MAX_ERRORS_PER_MINUTE = 20;

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:+/-]{0,47}$/;

/** A value as a token: plain, no spaces, short. Anything else is not sent. */
export function token(v: unknown): string | undefined {
  return typeof v === 'string' && TOKEN.test(v) ? v : undefined;
}

/** A file's extension and nothing else about its name: `.svg` -> `svg`, no extension or an odd one -> `other`. */
export function extOf(name: unknown): string {
  const m = typeof name === 'string' ? /\.([A-Za-z0-9]{1,8})$/.exec(name) : null;
  return m ? m[1].toLowerCase() : 'other';
}

/** A server route with the ids and names taken out: `projects/<id>/comments` -> `projects/:id/comments`. */
export const ROUTE_WORDS = new Set(['api', 'assets', 'comments', 'duplicate', 'insights', 'learn', 'libraries', 'library', 'live', 'messages', 'meta', 'notices', 'ops', 'play', 'prefs', 'presence', 'progress', 'projects', 'publish', 'read', 'replies', 'report', 'restore', 'results', 'review', 'revisions', 's', 'session', 'share', 'thumbnail', 'analytics', 'usage']);
export function routePattern(url: string): string {
  let path = url;
  try {
    path = new URL(url, 'http://x/').pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const parts = path.split('/').filter(Boolean);
  const at = parts.lastIndexOf('api');
  const rest = at >= 0 ? parts.slice(at + 1) : parts;
  return rest.map((p) => (ROUTE_WORDS.has(p) ? p : ':id')).join('/').slice(0, 80) || '/';
}

/** Detail values that can travel: tokens, finite numbers, booleans. Everything else is left out. */
export function cleanDetail(detail: Fields['detail']): Record<string, Prim> {
  const out: Record<string, Prim> = {};
  if (!detail) return out;
  for (const k of Object.keys(detail).slice(0, 8)) {
    const key = token(k);
    const v = detail[k];
    if (!key || v === undefined || v === null) continue;
    if (typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'number') {
      if (Number.isFinite(v)) out[key] = Math.round(v * 100) / 100;
    } else {
      const t = token(v);
      if (t) out[key] = t;
    }
  }
  return out;
}

function cleanSum(sum: Fields['sum']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(sum ?? {}).slice(0, 8)) {
    const key = token(k);
    const v = sum![k];
    if (key && typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

interface Bucket {
  area: Area;
  action: string;
  thing?: string;
  project?: string;
  detail: Record<string, Prim>;
  sum: Record<string, number>;
  n: number;
  ms: number;
  t0: number;
  t1: number;
}

let sink: Sink | null = null;
let buckets = new Map<string, Bucket>();
let rowsSent = 0;
let dropped = 0;
let projectId: string | null = null;
let projectSince = 0;
let installed = false;
let identified = false;
let identifyTimer: ReturnType<typeof setTimeout> | null = null;
let errors = new RateLimiter(MAX_SAME_ERROR, MAX_ERRORS_PER_MINUTE);
let sessionStart = 0;
let lastActive = 0;
let lastTick = 0;
let events = 0;
const once = new Set<string>();

export const sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Where rows go. The default is si-manager's `reportAnalytics`; tests put their own. */
export function setSink(next: Sink | null): void {
  sink = next;
}

function realSink(): Sink | null {
  if (sink) return sink;
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as { reportAnalytics?: Sink }).reportAnalytics;
  return typeof fn === 'function' ? fn : null;
}

/** The project the editor has open; events without a project of their own are filed under it. */
export function setProject(id: string | null): void {
  if (projectId && projectId !== id) track('project', 'close', { project: projectId, ms: Date.now() - projectSince });
  projectId = id && token(id) ? id : null;
  projectSince = Date.now();
}

function bucketKey(area: string, action: string, thing: string | undefined, project: string | undefined, detail: Record<string, Prim>): string {
  return `${area}|${action}|${thing ?? ''}|${project ?? ''}|${Object.keys(detail)
    .sort()
    .map((k) => `${k}=${detail[k]}`)
    .join(',')}`;
}

/** Note that something happened. Added up with the same thing in the window and sent as one row. Never throws. */
export function track(area: Area, action: string, f: Fields = {}): void {
  try {
    const act = token(action);
    if (!act) return;
    const now = Date.now();
    events++;
    lastActive = now;
    const thing = f.thing === undefined ? undefined : token(f.thing);
    const proj = f.project === undefined ? (projectId ?? undefined) : f.project === null ? undefined : token(f.project);
    const detail = cleanDetail(f.detail);
    const key = bucketKey(area, act, thing, proj, detail);
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= MAX_BUCKETS) {
        dropped++;
        return;
      }
      b = { area, action: act, thing, project: proj, detail, sum: {}, n: 0, ms: 0, t0: now, t1: now };
      buckets.set(key, b);
    }
    b.n += typeof f.n === 'number' && Number.isFinite(f.n) && f.n > 0 ? Math.min(f.n, 1e6) : 1;
    if (typeof f.ms === 'number' && Number.isFinite(f.ms) && f.ms > 0) b.ms += Math.min(f.ms, 86_400_000);
    for (const [k, v] of Object.entries(cleanSum(f.sum))) b.sum[k] = (b.sum[k] ?? 0) + v;
    b.t1 = now;
  } catch {
    // recording must never be the thing that breaks the editor
  }
}

/** Like `track`, once per visit per (area, action, thing): the first time a feature is used. */
export function trackFirst(area: Area, action: string, f: Fields = {}): void {
  const key = `${area}|${action}|${f.thing ?? ''}`;
  if (once.has(key)) return;
  once.add(key);
  track(area, action, f);
}

/**
 * A help search, once typing stops: that one happened, how many words (to 5), and whether anything matched. The words are
 * never kept. Returns the cleanup for an effect.
 */
export function noteHelpSearch(query: string, hits: number): () => void {
  const words = query.trim().split(/\s+/).filter(Boolean).length;
  if (!words || hits < 0) return () => undefined;
  const timer = setTimeout(() => track('help', 'search', { detail: { words: Math.min(words, 5), found: hits > 0 } }), 1200);
  return () => clearTimeout(timer);
}

/**
 * A diagnostic from a project playing inside the editor (the preview, the canvas): its load time becomes a row, and a
 * fault goes to triage as an error of kind `project-<kind>` (a script, shader or layer fault may be the author's own, so they
 * are told apart by kind). The player already scrubbed it; it is cleaned again here.
 */
export function noteProjectDiagnostic(raw: unknown, via: string): void {
  const d = cleanDiagnostic(raw);
  if (!d) return;
  if (d.kind === 'load') {
    track('preview', 'loaded', { thing: via, ms: d.ms, sum: { artboards: d.artboards ?? 0, layers: d.layers ?? 0 } });
    return;
  }
  reportFromPlayer(d, `project-${d.kind}`, via);
}

function reportFromPlayer(d: Diagnostic, kind: string, via: string): void {
  try {
    const fp = hash32(`${d.fingerprint ?? ''}|${kind}|${d.where ?? ''}`);
    track('error', kind, { thing: token(d.where), detail: { fp } });
    if (!errors.allow(`${kind}|${fp}`)) return;
    const err: Record<string, unknown> = { fp, kind, cls: 'ProjectFault', msg: d.message ?? '', via, at: Date.now() };
    if (d.where) err.where = d.where;
    if (d.level) err.level = d.level;
    if (d.status) err.status = d.status;
    if (projectId) err.project = projectId;
    send('error', kind, { err }, true);
  } catch {
    // never fails
  }
}

/** A script layer or shader layer failed on the editor's own canvas (while someone is writing it, or a preset that does not suit a device). */
export function noteLayerFault(kind: 'draw' | 'shader', message: string, level: 'error' | 'warning'): void {
  noteProjectDiagnostic({ kind, project: projectId ?? '', version: PLAYER_VERSION, where: 'canvas', level, message: scrubMessage(message), fingerprint: describeError(new Error(message)).fingerprint }, 'canvas');
}

/** Starts timing; call the result when it is over and the time is added to the row. */
export function span(area: Area, action: string, f: Fields = {}): (extra?: Fields) => void {
  const t = Date.now();
  let done = false;
  return (extra = {}) => {
    if (done) return;
    done = true;
    track(area, action, { ...f, ...extra, ms: Date.now() - t });
  };
}

function metaFor(extra: Record<string, unknown>): Record<string, unknown> {
  return { sid: sessionId, build: BUILD, v: PLAYER_VERSION, ...extra };
}

function send(feature: string, featureID: string, extra: Record<string, unknown>, instant: boolean): boolean {
  const fn = realSink();
  if (!fn) return false;
  try {
    fn(APP, feature, featureID, metaFor(extra), instant);
    rowsSent++;
    return true;
  } catch {
    return false;
  }
}

/** Sends the added-up rows. `final` (the tab is going away) sends even before the user is known and drains everything. */
export function flush(final = false): number {
  if (!buckets.size && !dropped) return 0;
  if (!identified && !final) return 0;
  if (!realSink()) return 0;
  const list = [...buckets.values()].sort((a, b) => a.t0 - b.t0);
  buckets = new Map();
  let sent = 0;
  const room = Math.max(0, Math.min(MAX_ROWS_PER_FLUSH, MAX_ROWS_PER_VISIT - rowsSent));
  const out = list.slice(0, room);
  dropped += list.length - out.length;
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    const ev: Record<string, unknown> = { n: b.n, t0: b.t0, t1: b.t1 };
    if (b.thing) ev.thing = b.thing;
    if (b.project) ev.project = b.project;
    if (b.ms) ev.ms = Math.round(b.ms);
    if (Object.keys(b.detail).length) ev.detail = b.detail;
    if (Object.keys(b.sum).length) ev.sum = b.sum;
    // The last row of the flush asks utilities.js to send the whole queue now (a beacon, so it survives the page going)
    const last = i === out.length - 1 && !dropped;
    if (send(b.area, b.action, { ev }, last)) sent++;
  }
  if (dropped) {
    send('meta', 'dropped', { ev: { n: dropped, t0: Date.now(), t1: Date.now() } }, true);
    dropped = 0;
  }
  return sent;
}

export interface ErrorInfo {
  /** What kind of fault: `window`, `promise`, `boundary`, `api`, `chunk`, `import`, `export`, `save`, `shader`, `draw`, `preview`... */
  kind: string;
  /** The error itself, or its message. */
  error?: unknown;
  /** Where in the editor (a token): the boundary's name, the route, the importer. */
  where?: string;
  /** More facts, as detail: `{status: 500, method: 'PUT', format: 'riv'}`. */
  detail?: Record<string, Prim | null | undefined>;
}

/**
 * Reports a fault for triage, now: a scrubbed message (no quoted text, urls or ids), the error class, a fingerprint (a hash
 * of class, scrubbed message and the top stack frame without line numbers) so duplicates group, and where it happened. A
 * fingerprint is sent a few times per visit and then only counted. Never throws.
 */
export function reportError(info: ErrorInfo): void {
  try {
    const kind = token(info.kind) ?? 'other';
    const d = describeError(info.error);
    // The same error from two places is two faults to look at: the place is part of the fingerprint
    const fp = hash32(`${d.fingerprint}|${kind}|${token(info.where) ?? ''}`);
    const key = `${kind}|${fp}`;
    // Counted in the usual rows too, so the sums still add up when a fault is held back
    track('error', kind, { thing: token(info.where), detail: { fp } });
    if (!errors.allow(key)) return;
    const err: Record<string, unknown> = { fp, kind, cls: d.errorClass, msg: d.message };
    if (d.frame) err.frame = d.frame;
    const where = token(info.where);
    if (where) err.where = where;
    const detail = cleanDetail(info.detail);
    if (Object.keys(detail).length) err.detail = detail;
    if (projectId) err.project = projectId;
    err.at = Date.now();
    send('error', kind, { err }, true);
  } catch {
    // never fails
  }
}

// ---------------------------------------------------------------- the visit: identity, activity, hooks

type FetchActivity = (cb: (err: unknown, data: { user?: Record<string, unknown>; activity?: Record<string, unknown> } | null) => void) => void;

/** `reportAnalytics` reads the signed-in person and course from the global `m`, which utilities.js leaves to the page. */
function identify(): void {
  const w = window as unknown as { m?: Record<string, unknown>; fetchActivity?: FetchActivity };
  w.m = w.m ?? {};
  w.m.app = APP;
  const done = () => {
    if (identified) return;
    identified = true;
    if (identifyTimer) clearTimeout(identifyTimer);
    flush();
  };
  // Rows wait for the person to be known, but not forever: after a few seconds they go with a partial user
  identifyTimer = setTimeout(done, 4000);
  if (typeof w.fetchActivity !== 'function') return void done();
  try {
    w.fetchActivity((err, data) => {
      if (!err && data?.user) {
        w.m!.user = data.user;
        w.m!.activity = data.activity ?? {};
      }
      done();
    });
  } catch {
    done();
  }
}

/** Coarse browser facts: names and major versions, and the window's size in steps. */
export function browserFacts(): Record<string, Prim> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const pick = (re: RegExp) => re.exec(ua)?.[1];
  const browser = pick(/(Edg|OPR|Firefox|Chrome|Safari)\/(\d+)/) ? (/Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : 'safari') : 'other';
  const major = Number(/(?:Edg|OPR|Firefox|Chrome|Version)\/(\d+)/.exec(ua)?.[1] ?? 0);
  const os = /Windows/.test(ua) ? 'windows' : /Android/.test(ua) ? 'android' : /iPhone|iPad/.test(ua) ? 'ios' : /Mac OS/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : 'other';
  const w = typeof innerWidth === 'number' ? innerWidth : 0;
  const bucket = w < 600 ? 'xs' : w < 1000 ? 's' : w < 1400 ? 'm' : w < 1900 ? 'l' : 'xl';
  return { browser, major, os, width: bucket, touch: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0, lang: token((navigator.language || '').slice(0, 5)) ?? 'other' };
}

function tick(): void {
  const now = Date.now();
  const dt = lastTick ? Math.min(now - lastTick, 15_000) : 0;
  lastTick = now;
  // Time in the editor counts while the tab is showing and something was done in the last minute
  if (dt && typeof document !== 'undefined' && document.visibilityState === 'visible' && now - lastActive < 60_000) track('session', 'active', { ms: dt });
}

/** Turns recording on for this page. Safe to call again. */
export function installAnalytics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  sessionStart = lastActive = lastTick = Date.now();
  identify();
  track('session', 'start', { detail: browserFacts() });
  const poke = () => {
    lastActive = Date.now();
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, poke, { capture: true, passive: true });
  // Every few seconds: count the active time, and every twelfth time send what has been added up
  let beats = 0;
  setInterval(() => {
    tick();
    if (++beats % 12 === 0) flush();
  }, FLUSH_MS / 12);
  const leave = () => {
    tick();
    track('session', 'end', { ms: Date.now() - sessionStart, sum: { events } });
    flush(true);
  };
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      tick();
      flush(true);
    } else lastTick = Date.now();
  });
  installErrorHooks();
  // Buttons that carry data-track="name" count as a use of that feature (the name is in the code, never the label)
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('[data-track]');
      const name = el?.getAttribute('data-track');
      if (name) track('feature', name, { thing: el!.getAttribute('data-track-thing') ?? undefined });
    },
    true,
  );
}

/** window errors and unhandled rejections, in the editor page (the player's own are reported by the player). */
export function installErrorHooks(): void {
  window.addEventListener('error', (e) => {
    // The browser's own "ResizeObserver loop" notices and cross-origin "Script error." have nothing to triage
    if (/ResizeObserver loop/i.test(e.message || '')) return;
    if (!e.error && (!e.message || e.message === 'Script error.')) {
      // A picture or script that would not load shows up here with a target and no error
      return;
    }
    reportError({ kind: 'window', error: e.error ?? e.message, where: 'window' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? `${e.reason.name} ${e.reason.message}` : String(e.reason ?? '');
    const chunk = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg);
    reportError({ kind: chunk ? 'chunk' : 'promise', error: e.reason, where: chunk ? 'lazy-load' : 'promise' });
  });
  window.addEventListener('vite:preloadError', (e) => reportError({ kind: 'chunk', error: (e as Event & { payload?: unknown }).payload ?? 'preload', where: 'preload' }));
}

/** For tests: forget everything held. */
export function resetAnalytics(): void {
  buckets = new Map();
  rowsSent = 0;
  dropped = 0;
  events = 0;
  projectId = null;
  identified = true;
  once.clear();
  errors = new RateLimiter(MAX_SAME_ERROR, MAX_ERRORS_PER_MINUTE);
}

export { errorClass, scrubMessage, topFrame };
