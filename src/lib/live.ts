/**
 * Live (multiplayer) editing. Local changes become ops (shared/ops.mjs) sent
 * to the server, which orders, applies and broadcasts them over Server-Sent
 * Events; remote ops are applied to the open document and its undo history.
 *
 * Last write wins per property in the server's order. A remote op on a path we
 * still have an unacknowledged op for is skipped: ours comes later on the
 * server, so it is the one that sticks everywhere.
 */
import { sessionId, sessionUser } from './session';
import { diff, opKey, type Op } from '../../shared/ops.mjs';
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

const API = new URL('api/', document.baseURI).href;

export class LiveSession {
  readonly clientId = `c${Math.random().toString(36).slice(2, 10)}`;
  private source: EventSource | null = null;
  private seq = 0;
  private queue: Op[] = [];
  private sending = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, number>();
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPresence: Partial<Peer> = {};
  private closed = false;
  private retry = 1000;

  constructor(
    private readonly projectId: string,
    private readonly store: EditorStore,
    since: number,
  ) {
    this.seq = since;
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
      if (d.clientId === this.clientId) {
        for (const op of d.ops) {
          const k = opKey(op);
          const n = (this.pending.get(k) ?? 1) - 1;
          if (n <= 0) this.pending.delete(k);
          else this.pending.set(k, n);
        }
        if (!this.pending.size && !this.queue.length) this.store.set({ saveState: 'saved', saveError: null });
        return;
      }
      const usable = d.ops.filter((op) => !this.pending.has(opKey(op)));
      if (usable.length) this.store.applyRemote(usable);
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
    this.pending.clear();
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
    if (this.flushTimer) return;
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
    try {
      const res = await fetch(`${API}projects/${encodeURIComponent(this.projectId)}/ops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ clientId: this.clientId, ops: batch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Put them back at the front and try again shortly
      for (const op of batch) {
        const n = (this.pending.get(opKey(op)) ?? 1) - 1;
        if (n <= 0) this.pending.delete(opKey(op));
        else this.pending.set(opKey(op), n);
      }
      this.queue.unshift(...batch);
      this.store.set({ saveState: 'error', saveError: `Live save failed: ${err instanceof Error ? err.message : err}` });
      setTimeout(() => this.schedule(), 2000);
    } finally {
      this.sending = false;
      if (this.queue.length) this.schedule();
    }
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
