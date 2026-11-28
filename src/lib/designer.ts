/**
 * Ask Ixia: the client for the server's /api/designer/chat. You send a request and the server streams back
 * lines of json as the agent works (what it's doing in plain words, that it changed the project, its reply). The agent's
 * conversation lives on the server, so all this holds is the messages on screen and a handle to carry the chat on.
 * One chat per editor tab, kept while the panel is closed; New chat starts another.
 */
import { apiUrl, designerStatus, resetDesigner, restoreRevision } from './db';
import { designerAvailability } from './designer-availability';
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
  /** help: what was asked, so "Ask Ixia anyway" can send it. */
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
  /** Each thing it has said it was doing in this request, in order, the newest last. */
  steps: string[];
  /** When this request was sent (ms), so the panel can say how long it has been. */
  startedAt: number;
  /** The last request once it has finished: what it did and how long it took. Null before one has, and while one runs. */
  lastRun: { steps: string[]; seconds: number } | null;
  /** The restore point from before the agent's first change in the last request, while it can still be undone. */
  undo: { revision: string } | null;
  undoing: boolean;
  /** Their share of the shared token this hour. Null when they use their own, or it isn't known yet. */
  quota: Quota | null;
  /** They have added their own Cogniti token, so the shared allowance doesn't apply to them. */
  own: boolean;
  /** This box takes people's own tokens (Cogniti does, Gemini has one key for everyone), so "Use my own" is worth offering. */
  ownTokens: boolean;
}

type Listener = (s: ChatState) => void;

interface Event {
  type: 'status' | 'changed' | 'touched' | 'reply' | 'error' | 'done';
  text?: string;
  kind?: string;
  revision?: string | null;
  conversation?: string | null;
  quota?: Quota | null;
  /** done and error: whether Ask Ixia has any allowance left after this request, and when it comes back if not. */
  available?: boolean;
  resetAt?: string | null;
}

let counter = 0;
const mid = () => `m${Date.now().toString(36)}${++counter}`;

const initial = (): ChatState => ({ messages: [], working: false, status: '', steps: [], startedAt: 0, lastRun: null, undo: null, undoing: false, quota: null, own: false, ownTokens: true });

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
  /**
   * Called each time the server says the project has changed (and once more when the request ends), so a tab that isn't in
   * the live session can fetch what was built and show it. The editor sets it; nothing happens without it.
   */
  onChanged: (() => void) | null = null;
  private sawChange = false;
  /** The request used the last of the allowance: Ask Ixia goes once it has finished (undefined: it hasn't). */
  private goneAfter: string | null | undefined = undefined;

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
      this.set({ quota: s.mine ? null : s.shared, own: !!s.mine, ownTokens: s.ownTokens !== false });
      designerAvailability().setAvailability(!!s.on, s.resetAt ?? null);
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
      this.state = { ...initial(), quota: this.state.quota, own: this.state.own, ownTokens: this.state.ownTokens };
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
            ? { id: mid(), from: 'help', text: 'This is in the help. Nothing was sent to Ixia.', topics: free.topics, ask: message }
            : { id: mid(), from: 'note', text: `Done without using the AI: ${free.sentence}. You can undo it like any other change.` };
        this.set({ messages: [...this.state.messages.filter((m) => !m.failed), asked, answer] });
        return;
      }
    }
    this.abort = new AbortController();
    this.set({ working: true, status: 'Sending', steps: [], startedAt: Date.now(), lastRun: null, undo: null, messages: [...this.state.messages.filter((m) => !m.failed), { id: mid(), from: 'me', text: message }] });
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
        let body: { error?: string; kind?: string; quota?: Quota; available?: boolean; resetAt?: string | null } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          /* not json */
        }
        //The allowance has run out: nothing was sent, and Ask Ixia goes away until it's back
        if (body.available === false || body.kind === 'exhausted') {
          this.fail(body.error || 'Ixia has used all it can for now.', true);
          designerAvailability().setAvailability(false, body.resetAt ?? null);
          return;
        }
        //Out of their share of the shared token: nothing was sent, and their own allowance is the way on
        if (body.kind === 'quota') {
          if (body.quota) this.set({ quota: body.quota });
          this.fail(body.error || 'You have used your shared Ixia requests for this hour.', true, true);
          return;
        }
        this.fail(body.error || (res.status === 403 ? "You can't change this project, so Ixia can't either." : 'Ixia could not be reached. Try again in a minute.'), true);
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
      if (!finished) this.add({ from: 'error', text: this.state.undo ? 'Lost contact with Ixia partway through. Have a look at your project; you can undo what it did.' : 'Lost contact with Ixia. Try again.' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') this.add({ from: 'note', text: 'Stopped. It finishes the step it was on, so check the project.' });
      else this.fail('Ixia could not be reached. Try again in a minute.', true);
    } finally {
      this.abort = null;
      //whatever it got to, the canvas ends on what is really there
      if (this.sawChange) this.onChanged?.();
      this.sawChange = false;
      const { steps, startedAt } = this.state;
      this.set({ working: false, status: '', steps: [], lastRun: steps.length ? { steps, seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) } : null });
      if (this.goneAfter !== undefined) {
        const at = this.goneAfter;
        this.goneAfter = undefined;
        designerAvailability().setAvailability(false, at);
      }
    }
  }

  /** One line from the server. True once it's the last. */
  private handle(e: Event): boolean {
    switch (e.type) {
      case 'status':
        if (e.text) this.set({ status: e.text, steps: this.state.steps[this.state.steps.length - 1] === e.text ? this.state.steps : [...this.state.steps, e.text] });
        return false;
      case 'changed':
        if (e.revision) this.set({ undo: { revision: e.revision } });
        this.sawChange = true;
        this.onChanged?.();
        return false;
      case 'touched':
        this.sawChange = true;
        this.onChanged?.();
        return false;
      case 'reply':
        if (e.text) this.add({ from: 'agent', text: e.text });
        return false;
      case 'error':
        //Cogniti's own hourly limit on the shared token: their own allowance gets round it
        this.add({ from: 'error', text: e.text || 'Something went wrong in Ixia.', allowance: e.kind === 'limit' && !this.state.own && this.state.ownTokens });
        if (e.available === false) this.goneAfter = e.resetAt ?? null;
        return false;
      case 'done':
        this.conversation = e.conversation ?? null;
        if (e.quota !== undefined) this.set({ quota: e.quota });
        if (e.available === false) this.goneAfter = e.resetAt ?? null;
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
      this.add({ from: 'error', text: `Could not undo that${e instanceof Error && e.message ? ` (${e.message})` : ''}. You can still go back from Revision history, the version called "Before Ixia".` });
    }
  }

  /** New chat: this one is cleared, here and on the server. */
  async newChat(): Promise<void> {
    this.stop();
    const id = this.projectId;
    this.conversation = null;
    this.state = { ...initial(), quota: this.state.quota, own: this.state.own, ownTokens: this.state.ownTokens };
    this.listeners.forEach((l) => l(this.state));
    if (id) await resetDesigner(id).catch(() => undefined);
  }
}

let shared: DesignerChat | null = null;
export function designerChat(): DesignerChat {
  return (shared ??= new DesignerChat());
}
