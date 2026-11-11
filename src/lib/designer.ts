/**
 * Ask the Activity Designer: the client for the server's /api/designer/chat. You send a request and the server streams back
 * lines of json as the agent works (what it's doing in plain words, that it changed the project, its reply). The agent's
 * conversation lives on the server, so all this holds is the messages on screen and a handle to carry the chat on.
 * One chat per editor tab, kept while the panel is closed; New chat starts another.
 */
import { apiUrl, designerStatus, resetDesigner, restoreRevision } from './db';
import { localAnswer, openArtboardId, type HelpAnswer, type LocalAnswer } from './designer-local';

export interface ChatMessage {
  id: string;
  /** me: what the person typed. agent: its reply. error and note: the panel talking (a failure, "Undone"). help: an answer from the editor's own help, no AI used. */
  from: 'me' | 'agent' | 'error' | 'note' | 'help';
  text: string;
  /** Sending failed before the server took it, so the message can be tried again. */
  failed?: boolean;
  /** help: the topics that answer it. */
  topics?: HelpAnswer[];
  /** help: what was asked, so "Ask the Activity Designer anyway" can send it. */
  ask?: string;
  /** error: it is about the shared allowance, so offer "Use my own Cogniti allowance". */
  allowance?: boolean;
}

/** What is left of a person's share of the shared Cogniti token this hour. Null for people on their own token. */
export interface Quota {
  limit: number;
  left: number;
  /** Seconds until the oldest request stops counting. */
  resetsIn: number;
}

export interface ChatState {
  messages: ChatMessage[];
  /** A request is running. */
  working: boolean;
  /** What the agent is doing right now, in words ("Reading the project"). */
  status: string;
  /** The restore point from before the agent's first change in the last request, while it can still be undone. */
  undo: { revision: string } | null;
  undoing: boolean;
  /** Their share of the shared token this hour. Null when they use their own, or it isn't known yet. */
  quota: Quota | null;
  /** They have added their own Cogniti token, so the shared allowance doesn't apply to them. */
  own: boolean;
}

type Listener = (s: ChatState) => void;

interface Event {
  type: 'status' | 'changed' | 'reply' | 'error' | 'done';
  text?: string;
  kind?: string;
  revision?: string | null;
  conversation?: string | null;
  quota?: Quota | null;
}

let counter = 0;
const mid = () => `m${Date.now().toString(36)}${++counter}`;

const initial = (): ChatState => ({ messages: [], working: false, status: '', undo: null, undoing: false, quota: null, own: false });

export class DesignerChat {
  state: ChatState = initial();
  private listeners = new Set<Listener>();
  private conversation: string | null = null;
  private projectId = '';
  private abort: AbortController | null = null;
  /** Looking at whether the question can be answered for free (the help may have to load first). */
  private checking = false;

  /**
   * `local` is the panel's free answers (a "how do I" from the help, one behaviour through Describe it) and `artboard` the page that
   * is open, so the AI starts from where the person is. Both are the editor's; tests pass their own.
   */
  constructor(
    private fetcher: typeof fetch = (...a) => fetch(...a),
    private local: (text: string) => LocalAnswer | null | Promise<LocalAnswer | null> = localAnswer,
    private artboard: () => string = openArtboardId,
  ) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<ChatState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private add(m: Omit<ChatMessage, 'id'>) {
    this.set({ messages: [...this.state.messages, { id: mid(), ...m }] });
  }

  /** How many shared requests are left, and whether they are on their own token. Quiet when it can't be read. */
  async refreshStatus(): Promise<void> {
    try {
      const s = await designerStatus();
      this.set({ quota: s.mine ? null : s.shared, own: !!s.mine });
    } catch {
      /* the count is a nicety, the panel works without it */
    }
  }

  /**
   * Sends a request about this project. Another project in the same tab is a new chat. A question about how to do something, or one
   * behaviour Describe it already reads, is answered here with no message to the AI; `force` sends it to the AI anyway.
   */
  async send(text: string, projectId: string, opts: { force?: boolean } = {}): Promise<void> {
    const message = text.trim();
    if (!message || this.state.working || this.checking) return;
    if (projectId !== this.projectId) {
      this.projectId = projectId;
      this.conversation = null;
      this.state = { ...initial(), quota: this.state.quota, own: this.state.own };
    }
    if (!opts.force) {
      let free: LocalAnswer | null = null;
      this.checking = true;
      try {
        //a question for the help has to wait for it to load; everything else answers at once, so Stop works straight away
        const got = this.local(message);
        free = got instanceof Promise ? await got : got;
      } catch {
        free = null;
      } finally {
        this.checking = false;
      }
      if (free) {
        const asked: ChatMessage = { id: mid(), from: 'me', text: message };
        const answer: ChatMessage =
          free.kind === 'help'
            ? { id: mid(), from: 'help', text: 'This is in the help. Nothing was sent to the Activity Designer.', topics: free.topics, ask: message }
            : { id: mid(), from: 'note', text: `Done without using the AI: ${free.sentence}. You can undo it like any other change.` };
        this.set({ messages: [...this.state.messages.filter((m) => !m.failed), asked, answer] });
        return;
      }
    }
    this.abort = new AbortController();
    this.set({ working: true, status: 'Sending', undo: null, messages: [...this.state.messages.filter((m) => !m.failed), { id: mid(), from: 'me', text: message }] });
    let finished = false;
    try {
      const res = await this.fetcher(apiUrl('designer/chat'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, artboardId: this.artboard() || undefined, conversation: this.conversation ?? undefined, message }),
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) {
        let body: { error?: string; kind?: string; quota?: Quota } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          /* not json */
        }
        //Out of their share of the shared token: nothing was sent, and their own allowance is the way on
        if (body.kind === 'quota') {
          if (body.quota) this.set({ quota: body.quota });
          this.fail(body.error || 'You have used your shared Activity Designer requests for this hour.', true, true);
          return;
        }
        this.fail(body.error || (res.status === 403 ? "You can't change this project, so the Activity Designer can't either." : 'The Activity Designer could not be reached. Try again in a minute.'), true);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const line = (l: string) => {
        if (!l.trim()) return;
        try {
          if (this.handle(JSON.parse(l) as Event)) finished = true;
        } catch {
          /* half a line, or not ours */
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          line(buf.slice(0, i));
          buf = buf.slice(i + 1);
        }
      }
      line(buf);
      if (!finished) this.add({ from: 'error', text: this.state.undo ? 'Lost contact with the Activity Designer partway through. Have a look at your project; you can undo what it did.' : 'Lost contact with the Activity Designer. Try again.' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') this.add({ from: 'note', text: 'Stopped. It finishes the step it was on, so check the project.' });
      else this.fail('The Activity Designer could not be reached. Try again in a minute.', true);
    } finally {
      this.abort = null;
      this.set({ working: false, status: '' });
    }
  }

  /** One line from the server. True once it's the last. */
  private handle(e: Event): boolean {
    switch (e.type) {
      case 'status':
        if (e.text) this.set({ status: e.text });
        return false;
      case 'changed':
        if (e.revision) this.set({ undo: { revision: e.revision } });
        return false;
      case 'reply':
        if (e.text) this.add({ from: 'agent', text: e.text });
        return false;
      case 'error':
        //Cogniti's own hourly limit on the shared token: their own allowance gets round it
        this.add({ from: 'error', text: e.text || 'Something went wrong in the Activity Designer.', allowance: e.kind === 'limit' && !this.state.own });
        return false;
      case 'done':
        this.conversation = e.conversation ?? null;
        if (e.quota !== undefined) this.set({ quota: e.quota });
        return true;
    }
    return false;
  }

  private fail(text: string, notSent: boolean, allowance = false) {
    const msgs = [...this.state.messages];
    const last = msgs.at(-1);
    if (notSent && last?.from === 'me') msgs[msgs.length - 1] = { ...last, failed: !allowance };
    this.set({ messages: [...msgs, { id: mid(), from: 'error', text, ...(allowance ? { allowance: true } : {}) }] });
  }

  /** Stop after the step the agent is on. */
  stop() {
    this.abort?.abort();
  }

  /** Put the project back as it was before the agent's first change in the last request. Live editors see it too. */
  async undo(): Promise<void> {
    const u = this.state.undo;
    if (!u || this.state.undoing) return;
    this.set({ undoing: true });
    try {
      await restoreRevision(this.projectId, u.revision);
      this.set({ undo: null, undoing: false });
      this.add({ from: 'note', text: 'Done. Your project is back as it was before that request.' });
    } catch (e) {
      this.set({ undoing: false });
      this.add({ from: 'error', text: `Could not undo that${e instanceof Error && e.message ? ` (${e.message})` : ''}. You can still go back from Revision history, the version called "Before the Activity Designer".` });
    }
  }

  /** New chat: this one is cleared, here and on the server. */
  async newChat(): Promise<void> {
    this.stop();
    const id = this.projectId;
    this.conversation = null;
    this.state = { ...initial(), quota: this.state.quota, own: this.state.own };
    this.listeners.forEach((l) => l(this.state));
    if (id) await resetDesigner(id).catch(() => undefined);
  }
}

let shared: DesignerChat | null = null;
export function designerChat(): DesignerChat {
  return (shared ??= new DesignerChat());
}
