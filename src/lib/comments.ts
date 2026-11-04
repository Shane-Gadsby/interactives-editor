/**
 * Review comments on the client. One `CommentsClient` for the open page, either in the editor (the owner's routes under
 * api/projects/:id/comments) or on the review page (the routes under review/:token), holding the threads, the filters and
 * what is open on the canvas, and keeping them current over a Server-Sent Events stream. Comments are not in the project
 * document: nothing here goes through the editor's store, the op log or an export.
 */
import { useSyncExternalStore } from 'react';
import { matchesFilter, type Anchor, type CommentUser, type Filter, type Person, type Thread } from '../../shared/comments.mjs';
import { sessionId } from './session';

export type CommentsMode = { kind: 'editor'; projectId: string } | { kind: 'review'; token: string };

export interface Draft {
  anchor: Anchor;
  context: { artboard: string; layer: string };
}

export interface CommentsState {
  mode: CommentsMode | null;
  loaded: boolean;
  error: string | null;
  /** The server said this page needs a signed in StudyDesk user. */
  signin: boolean;
  threads: Thread[];
  people: Person[];
  me: (CommentUser & { manager?: boolean }) | null;
  filter: Required<Pick<Filter, 'status' | 'scope'>> & { artboardId: string };
  /** The thread whose conversation is open next to its pin. */
  openId: string | null;
  /** A pin placed but not sent yet. */
  draft: Draft | null;
  showPins: boolean;
  live: 'off' | 'live' | 'reconnecting';
  /** A guest's display name for the review page, kept in this browser. */
  guestName: string;
}

const NAME_KEY = 'ix-review-name';
const PINS_KEY = 'ix-comment-pins';

const keep = (k: string): string => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const remember = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

const initial = (): CommentsState => ({
  mode: null,
  loaded: false,
  error: null,
  signin: false,
  threads: [],
  people: [],
  me: null,
  filter: { status: 'open', scope: 'all', artboardId: '' },
  openId: null,
  draft: null,
  showPins: keep(PINS_KEY) !== 'off',
  live: 'off',
  guestName: keep(NAME_KEY),
});

type Listener = () => void;

export class CommentsClient {
  private state: CommentsState = initial();
  private listeners = new Set<Listener>();
  private source: EventSource | null = null;
  private retry = 1000;
  private run = 0;
  /** Called with a line to show when a write was for the person using this page (assigned, mentioned, replied to). */
  onNotice: ((text: string, threadId: string) => void) | null = null;

  get = (): CommentsState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(p: Partial<CommentsState>): void {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn();
  }

  private base(): string {
    const m = this.state.mode;
    if (!m) throw new Error('Comments are not open');
    return m.kind === 'editor' ? `api/projects/${encodeURIComponent(m.projectId)}/comments` : `review/${encodeURIComponent(m.token)}/comments`;
  }

  private async call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(new URL(path, document.baseURI), {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Could not reach the Interactives server');
    }
    if (!res.ok) {
      let e: { error?: string; signin?: boolean } = {};
      try {
        e = await res.json();
      } catch {
        /* not json */
      }
      throw Object.assign(new Error(e.error ?? `Server error ${res.status}`), { status: res.status, signin: !!e.signin });
    }
    return res.json() as Promise<T>;
  }

  /** Open comments for the editor's project. The people and who you are come with the first load. */
  async startEditor(projectId: string): Promise<void> {
    this.stop();
    const run = ++this.run;
    this.set({ ...initial(), mode: { kind: 'editor', projectId } });
    try {
      const r = await this.call<{ threads: Thread[]; people: Person[]; me: CommentUser }>(`api/projects/${encodeURIComponent(projectId)}/comments`);
      if (run !== this.run) return;
      this.set({ threads: r.threads, people: r.people, me: { ...r.me, manager: true }, loaded: true });
      this.connect(run);
    } catch (err) {
      if (run === this.run) this.set({ error: err instanceof Error ? err.message : String(err), loaded: true });
    }
  }

  /** The review page loads its project and threads in one go; this takes what it fetched and starts the stream. */
  startReview(token: string, first: { threads: Thread[]; people: Person[]; me: (CommentUser & { manager?: boolean }) | null }): void {
    this.stop();
    const run = ++this.run;
    this.set({ ...initial(), mode: { kind: 'review', token }, threads: first.threads, people: first.people, me: first.me, loaded: true });
    this.connect(run);
  }

  stop(): void {
    this.run++;
    this.source?.close();
    this.source = null;
    this.state = initial();
    for (const fn of this.listeners) fn();
  }

  private connect(run: number): void {
    const m = this.state.mode;
    if (!m || run !== this.run) return;
    const sid = sessionId();
    const path = m.kind === 'editor' ? `api/projects/${encodeURIComponent(m.projectId)}/comments/live` : `review/${encodeURIComponent(m.token)}/live`;
    const url = new URL(path, document.baseURI);
    if (sid) url.searchParams.set('sessionID', sid);
    const es = new EventSource(url.href, { withCredentials: true });
    this.source = es;
    es.addEventListener('hello', () => {
      this.retry = 1000;
      // Whatever happened while the stream was down
      if (this.state.live === 'reconnecting') void this.refresh(run);
      this.set({ live: 'live' });
    });
    es.addEventListener('thread', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { thread: Thread; by: string; notify: { user: string; kind: string }[] };
      this.apply(d.thread);
      const mine = this.state.me?.username;
      const n = mine ? d.notify.find((x) => x.user === mine) : undefined;
      if (n && d.by !== this.state.me?.name) {
        const what = n.kind === 'assigned' ? 'assigned you a comment' : n.kind === 'mention' ? 'mentioned you' : 'replied to a comment you are in';
        this.onNotice?.(`${d.by} ${what}`, d.thread.id);
      }
    });
    es.addEventListener('gone', (e) => this.drop((JSON.parse((e as MessageEvent).data) as { id: string }).id));
    es.onerror = () => {
      es.close();
      if (run !== this.run) return;
      this.set({ live: 'reconnecting' });
      // A link turned off or a project deleted answers the next attempt with a 404; the page says so on its next call
      setTimeout(() => this.connect(run), this.retry);
      this.retry = Math.min(15000, this.retry * 2);
    };
  }

  private async refresh(run: number): Promise<void> {
    const m = this.state.mode;
    if (!m || m.kind !== 'editor') {
      if (m?.kind === 'review') {
        try {
          const r = await this.call<{ threads: Thread[]; people: Person[] }>(`review/${encodeURIComponent(m.token)}`);
          if (run === this.run) this.set({ threads: r.threads, people: r.people });
        } catch {
          /* the next event will do it */
        }
      }
      return;
    }
    try {
      const r = await this.call<{ threads: Thread[]; people: Person[] }>(`api/projects/${encodeURIComponent(m.projectId)}/comments`);
      if (run === this.run) this.set({ threads: r.threads, people: r.people });
    } catch {
      /* the next event will do it */
    }
  }

  /** Put a thread in place by id, keeping the list in thread-number order. Idempotent: the writer gets its own back too. */
  apply(t: Thread): void {
    const rest = this.state.threads.filter((x) => x.id !== t.id);
    const threads = [...rest, t].sort((a, b) => a.n - b.n || String(a.created).localeCompare(String(b.created)));
    this.set({ threads, people: this.mergePeople(t) });
  }

  private mergePeople(t: Thread): Person[] {
    const have = new Map(this.state.people.map((p) => [p.username, p]));
    for (const c of t.comments) if (c.by.username && !c.by.guest && !have.has(c.by.username)) have.set(c.by.username, { username: c.by.username, name: c.by.name });
    return [...have.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private drop(id: string): void {
    this.set({ threads: this.state.threads.filter((t) => t.id !== id), openId: this.state.openId === id ? null : this.state.openId });
  }

  // ---- what the page shows

  setFilter(p: Partial<CommentsState['filter']>): void {
    this.set({ filter: { ...this.state.filter, ...p } });
  }

  visible(): Thread[] {
    const { threads, filter, me } = this.state;
    return threads.filter((t) => matchesFilter(t, filter, me));
  }

  open(id: string | null): void {
    this.set({ openId: id, draft: id ? null : this.state.draft });
  }

  startDraft(d: Draft | null): void {
    this.set({ draft: d, openId: d ? null : this.state.openId });
  }

  setShowPins(on: boolean): void {
    remember(PINS_KEY, on ? 'on' : 'off');
    this.set({ showPins: on });
  }

  setGuestName(name: string): void {
    remember(NAME_KEY, name);
    this.set({ guestName: name });
  }

  /** The thread number as the panel and pins show it. */
  thread(id: string | null): Thread | undefined {
    return id ? this.state.threads.find((t) => t.id === id) : undefined;
  }

  // ---- writes. Each answer is the whole thread, applied at once; the stream's copy of it arrives too and changes nothing

  private who(): { guestName?: string } {
    const { me, guestName, mode } = this.state;
    return mode?.kind === 'review' && !me?.username ? { guestName } : {};
  }

  async create(text: string, o: { mentions?: string[]; assignee?: Person | null } = {}): Promise<Thread> {
    const d = this.state.draft;
    if (!d) throw new Error('Place a pin first');
    const r = await this.call<{ thread: Thread }>(this.base(), 'POST', { anchor: d.anchor, context: d.context, text, mentions: o.mentions, assignee: o.assignee ?? undefined, ...this.who() });
    this.apply(r.thread);
    this.set({ draft: null, openId: r.thread.id });
    return r.thread;
  }

  async reply(threadId: string, text: string, mentions: string[] = []): Promise<void> {
    const r = await this.call<{ thread: Thread }>(`${this.base()}/${threadId}/replies`, 'POST', { text, mentions, ...this.who() });
    this.apply(r.thread);
  }

  async setStatus(threadId: string, status: 'open' | 'resolved'): Promise<void> {
    const r = await this.call<{ thread: Thread }>(`${this.base()}/${threadId}`, 'PATCH', { status, ...this.who() });
    this.apply(r.thread);
  }

  async assign(threadId: string, person: Person | null): Promise<void> {
    const r = await this.call<{ thread: Thread }>(`${this.base()}/${threadId}`, 'PATCH', { assignee: person });
    this.apply(r.thread);
  }

  async edit(threadId: string, messageId: string, text: string, mentions: string[] = []): Promise<void> {
    const r = await this.call<{ thread: Thread }>(`${this.base()}/${threadId}/messages/${messageId}`, 'PATCH', { text, mentions });
    this.apply(r.thread);
  }

  /** A reply, or the whole thread when it is the first message. */
  async remove(threadId: string, messageId?: string): Promise<void> {
    const first = !messageId || messageId === threadId;
    const r = await this.call<{ thread?: Thread }>(first ? `${this.base()}/${threadId}` : `${this.base()}/${threadId}/messages/${messageId}`, 'DELETE');
    if (first || !r.thread) this.drop(threadId);
    else this.apply(r.thread);
  }
}

export const comments = new CommentsClient();

export function useComments(): CommentsState {
  return useSyncExternalStore(comments.subscribe, comments.get, comments.get);
}

// ---- the review link, the notices and the counts (editor side)

export interface ReviewLink {
  token: string;
  guests: boolean;
  created: string;
  updated: string;
}

const API = new URL('api/', document.baseURI).href;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    let e: { error?: string } = {};
    try {
      e = await res.json();
    } catch {
      /* not json */
    }
    throw new Error(e.error ?? `Server error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const getReview = (projectId: string) => api<{ review: ReviewLink | null }>(`projects/${encodeURIComponent(projectId)}/review`).then((r) => r.review);
export const putReview = (projectId: string, guests: boolean) =>
  api<{ review: ReviewLink }>(`projects/${encodeURIComponent(projectId)}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guests }) }).then((r) => r.review);
export const stopReview = (projectId: string) => api<{ ok: boolean }>(`projects/${encodeURIComponent(projectId)}/review`, { method: 'DELETE' });
/** The page's own address minus its query and hash: the editor's url can carry the owner's ?sessionID=, which must never end up in a link to hand out. */
export const reviewUrl = (token: string) => `${new URL('./', document.baseURI).href}#/review/${token}`;

export interface Notice {
  _id: string;
  project: string;
  projectName: string;
  thread: string;
  n: number;
  kind: 'assigned' | 'mention' | 'reply';
  by: string;
  text: string;
  at: string;
  read: boolean;
}

export const getNotices = () => api<{ unread: number; items: Notice[] }>('notices');
export const readNotices = (o: { project?: string; thread?: string } = {}) => api<{ ok: boolean }>('notices/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });

/** Open the "Share for review" dialog of the open editor (the review link: create, copy, allow guests, turn off). Any menu or button can call it. */
export const SHARE_FOR_REVIEW_EVENT = 'ix-share-for-review';
export function openShareForReview(): void {
  window.dispatchEvent(new CustomEvent(SHARE_FOR_REVIEW_EVENT));
}
