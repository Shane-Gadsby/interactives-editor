/**
 * Live (multiplayer) editing. Local changes become ops (shared/ops.mjs) sent
 * to the server, which orders, applies and broadcasts them over Server-Sent
 * Events; remote ops are applied to the open document and its undo history.
 *
 * Last write wins per property in the server's order. A remote op on a path we
 * still have an op for that the server hasn't acknowledged (sent and waiting,
 * or still queued to be sent) is skipped: ours comes later on the server, so it
 * is the one that sticks everywhere.
 *
 * Order in lists is the one thing that can't be settled op by op ("insert after X" lands somewhere else once someone
 * else's inserts come first), so the session keeps a copy of the server's document (`shadow`, every op the server
 * sends, ours included, applied in its order). After someone else's inserts or deletes it works out what the lists
 * will look like once the server has our unanswered ops too (orderFixes) and moves ours to match. When everything
 * is answered the document is the shadow, which is the server's document.
 *
 * A batch the server refuses for good (a 4xx such as 413 or 400) is never retried:
 * the session ends and the whole document is saved the normal way instead.
 * Network errors and 5xx are retried with a growing delay.
 */
import { sessionId, sessionUser } from './session';
import { apply as applyOps, diff, opKey, orderFixes, type Op } from '../../shared/ops.mjs';
import type { Project } from 'interactives-player';
import type { EditorStore } from '../store/store';
import { loadProjectRecord } from './db';

export interface Peer {
  clientId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  artboardId?: string | null;
  selection?: string[];
}

/** Fired on `window` when a live session gave up and the editor should save the whole document. */
export const LIVE_FALLBACK_EVENT = 'ix-live-fallback';

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
  /** Server trouble and "slow down" are worth trying again; any other 4xx will fail the same way every time. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

/** Is `key` the property one of `keys` writes, or somewhere inside it? (keys are opKey()s: steps joined by "/") */
function coveredBy(key: string, keys: Set<string>): boolean {
  if (!keys.size) return false;
  for (let i = key.indexOf('/'); i >= 0; i = key.indexOf('/', i + 1)) if (keys.has(key.slice(0, i))) return true;
  return keys.has(key);
}

/** Is `key` somewhere inside (but not the same as) a property one of `keys` writes? */
function strictlyUnder(key: string, keys: Set<string>): boolean {
  for (let i = key.indexOf('/'); i >= 0; i = key.indexOf('/', i + 1)) if (keys.has(key.slice(0, i))) return true;
  return false;
}

/** The step list of an op's array (for an insert or delete), as opKey() would write it without the element's id. */
const arrayKey = (op: Op): string => op.p.map((st) => (typeof st === 'string' ? st : '#' + st.i)).join('/');

/**
 * Which of our own ops (sent but not echoed, or queued) have to be applied again after someone else's ops, which the
 * server orders first. That is what they upset: ours inside a layer they inserted or moved (the layer arrives with
 * its old properties), and ours that insert or delete in a list they also inserted into or deleted from (so the same
 * layer ends up in the same place for everyone). Whatever else of ours lives inside a replayed layer goes with it.
 */
export function replayAfter(own: Op[], remote: Op[]): Op[] {
  if (!own.length || !remote.length) return [];
  const remoteKeys = new Set(remote.map(opKey));
  const remoteLists = new Set(remote.filter((o) => o.t !== 'set').map(arrayKey));
  const picked = new Set<Op>();
  for (const op of own) if (strictlyUnder(opKey(op), remoteKeys) || (op.t !== 'set' && remoteLists.has(arrayKey(op)))) picked.add(op);
  if (!picked.size) return [];
  const keys = new Set([...picked].map(opKey));
  return own.filter((op) => picked.has(op) || coveredBy(opKey(op), keys));
}

const API = new URL('api/', document.baseURI).href;

export class LiveSession {
  readonly clientId = `c${Math.random().toString(36).slice(2, 10)}`;
  private source: EventSource | null = null;
  private seq = 0;
  private queue: Op[] = [];
  /** Ops sent to the server that it has not echoed back yet, in the order sent. */
  private inflight: Op[] = [];
  private sending = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, number>();
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPresence: Partial<Peer> = {};
  private closed = false;
  private retry = 1000;
  private flushRetry = 2000;
  private backingOff = false;
  /** The server's document as of the last op seen (ours and everyone's), kept apart from the one on screen. */
  private shadow: unknown;

  constructor(
    private readonly projectId: string,
    private readonly store: EditorStore,
    since: number,
  ) {
    this.seq = since;
    this.shadow = JSON.parse(JSON.stringify(store.get().project));
    store.onLocalChange = (before, after) => this.local(before, after);
    void this.connect();
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    // EventSource can't send the X-Session-ID header, so the session id (and the name the page's session gave us,
    // for when the server has no session to check) go in the URL
    const me = await sessionUser();
    if (this.closed) return;
    const sid = sessionId();
    const url =
      `${API}projects/${encodeURIComponent(this.projectId)}/live?clientId=${this.clientId}&since=${this.seq}` +
      (sid ? `&sessionID=${encodeURIComponent(sid)}` : '') +
      (me ? `&name=${encodeURIComponent(me.name)}` : '');
    const es = new EventSource(url, { withCredentials: true });
    this.source = es;
    es.addEventListener('hello', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      this.retry = 1000;
      const peers: Record<string, Peer> = {};
      for (const p of d.peers as Peer[]) if (p.clientId !== this.clientId) peers[p.clientId] = p;
      this.store.set({ live: { status: 'live', color: d.color }, peers });
      if (this.queue.length) this.schedule();
    });
    es.addEventListener('ops', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { seq: number; clientId: string; ops: Op[] };
      if (d.seq <= this.seq) return;
      this.seq = d.seq;
      applyOps(this.shadow, d.ops);
      if (d.clientId === this.clientId) {
        this.inflight.splice(0, d.ops.length);
        for (const op of d.ops) {
          const k = opKey(op);
          const n = (this.pending.get(k) ?? 1) - 1;
          if (n <= 0) this.pending.delete(k);
          else this.pending.set(k, n);
        }
        if (!this.pending.size && !this.queue.length) this.store.set({ saveState: 'saved', saveError: null });
        return;
      }
      // The server puts these before everything of ours it has not echoed yet (sent, or still queued). Skip what one
      // of those overwrites (the same property, or a layer we are inserting, moving or deleting)...
      const own = [...this.inflight, ...this.queue];
      const ownKeys = new Set(own.map(opKey));
      const usable = d.ops.filter((op) => !coveredBy(opKey(op), ownKeys));
      if (usable.length) {
        // ...and put back what these upset of ours, since ours come after them on the server
        const again = replayAfter(own, usable);
        this.store.applyRemote(again.length ? [...usable, ...again] : usable);
      }
      // ...then settle the order of any list they inserted into or deleted from, the way the server will end up with it
      const fixes = own.length ? orderFixes(this.store.get().project, this.shadow, own, d.ops) : [];
      if (fixes.length) this.store.applyRemote(fixes);
    });
    es.addEventListener('presence', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Peer & { left?: boolean; joined?: boolean };
      if (d.clientId === this.clientId) return;
      const peers = { ...this.store.get().peers };
      if (d.left) delete peers[d.clientId];
      else peers[d.clientId] = { ...peers[d.clientId], ...d };
      this.store.set({ peers });
    });
    es.addEventListener('reset', () => void this.reload());
    es.addEventListener('deleted', () => {
      this.close();
      this.store.set({ live: { status: 'deleted' } });
    });
    es.onerror = () => {
      es.close();
      if (this.closed) return;
      this.store.set({ live: { ...this.store.get().live, status: 'reconnecting' } });
      setTimeout(() => void this.connect(), this.retry);
      this.retry = Math.min(15000, this.retry * 2);
    };
  }

  /** Someone replaced the whole document: start again from the server's copy. */
  private async reload(): Promise<void> {
    const p = await loadProjectRecord(this.projectId);
    if (!p) return;
    this.queue = [];
    this.inflight = [];
    this.pending.clear();
    this.shadow = JSON.parse(JSON.stringify(p));
    this.store.replaceProject(p as Project);
    this.store.toast('The project was replaced elsewhere and has been reloaded');
  }

  private local(before: Project, after: Project): void {
    const ops = diff(before, after);
    if (!ops.length) return;
    this.queue.push(...ops);
    this.store.set({ saveState: 'saving' });
    this.schedule();
  }

  private schedule(): void {
    if (this.flushTimer || this.backingOff) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 60);
  }

  /** Send queued ops in order, one batch at a time. Consecutive sets of one property collapse to the last. */
  private async flush(): Promise<void> {
    if (this.sending || !this.queue.length || this.store.get().live?.status !== 'live') return;
    this.sending = true;
    const batch: Op[] = [];
    for (const op of this.queue.splice(0)) {
      const prev = batch[batch.length - 1];
      if (prev && prev.t === 'set' && op.t === 'set' && opKey(prev) === opKey(op)) batch[batch.length - 1] = op;
      else batch.push(op);
    }
    for (const op of batch) this.pending.set(opKey(op), (this.pending.get(opKey(op)) ?? 0) + 1);
    this.inflight.push(...batch);
    try {
      const res = await fetch(`${API}projects/${encodeURIComponent(this.projectId)}/ops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ clientId: this.clientId, ops: batch }),
      });
      if (!res.ok) throw new HttpError(res.status);
      this.flushRetry = 2000;
    } catch (err) {
      // Put them back at the front and try again shortly
      this.inflight.splice(this.inflight.length - batch.length, batch.length);
      for (const op of batch) {
        const n = (this.pending.get(opKey(op)) ?? 1) - 1;
        if (n <= 0) this.pending.delete(opKey(op));
        else this.pending.set(opKey(op), n);
      }
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof HttpError && !err.retryable) {
        // The server won't take this batch however often it is sent, and it would block every edit after it
        this.giveUp(message);
        return;
      }
      this.queue.unshift(...batch);
      this.store.set({ saveState: 'error', saveError: `Live save failed: ${message}` });
      // Backing off: 2 s, 4 s, ... up to 30 s
      this.backingOff = true;
      setTimeout(() => {
        this.backingOff = false;
        this.schedule();
      }, this.flushRetry);
      this.flushRetry = Math.min(30000, this.flushRetry * 2);
    } finally {
      this.sending = false;
      if (this.queue.length) this.schedule();
    }
  }

  /**
   * Stop live syncing after the server refused a batch for good. Local edits stay in the document; the editor's
   * normal whole-document save (with its revision check) takes over, and the person is told.
   */
  private giveUp(message: string): void {
    this.queue = [];
    this.inflight = [];
    this.pending.clear();
    this.close();
    if (current === this) current = null;
    this.store.set({ live: null, saveState: 'error', saveError: `Live save failed: ${message}` });
    this.store.toast(`Live editing stopped (${message}). Saving the whole project instead.`, 'error');
    window.dispatchEvent(new CustomEvent(LIVE_FALLBACK_EVENT, { detail: { projectId: this.projectId } }));
  }

  /** Cursor (world coordinates), artboard and selection; sent at most ~12 times a second. */
  presence(p: Partial<Peer>): void {
    this.lastPresence = { ...this.lastPresence, ...p };
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      void fetch(`${API}projects/${encodeURIComponent(this.projectId)}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ clientId: this.clientId, presence: this.lastPresence }),
      }).catch(() => undefined);
    }, 80);
  }

  /** True while ops are queued or waiting for the server. */
  get busy(): boolean {
    return this.queue.length > 0 || this.pending.size > 0;
  }

  close(): void {
    this.closed = true;
    this.source?.close();
    if (this.store.onLocalChange) this.store.onLocalChange = null;
  }
}

let current: LiveSession | null = null;
export function liveSession(): LiveSession | null {
  return current;
}
export function setLiveSession(s: LiveSession | null): void {
  current = s;
}
