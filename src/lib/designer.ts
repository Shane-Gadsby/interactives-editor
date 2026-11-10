/**
 * Ask the Activity Designer: the client for the server's /api/designer/chat. You send a request and the server streams back
 * lines of json as the agent works (what it's doing in plain words, that it changed the project, its reply). The agent's
 * conversation lives on the server, so all this holds is the messages on screen and a handle to carry the chat on.
 * One chat per editor tab, kept while the panel is closed; New chat starts another.
 */
import { apiUrl, resetDesigner, restoreRevision } from './db';

export interface ChatMessage {
  id: string;
  /** me: what the person typed. agent: its reply. error and note: the panel talking (a failure, "Undone"). */
  from: 'me' | 'agent' | 'error' | 'note';
  text: string;
  /** Sending failed before the server took it, so the message can be tried again. */
  failed?: boolean;
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
}

type Listener = (s: ChatState) => void;

interface Event {
  type: 'status' | 'changed' | 'reply' | 'error' | 'done';
  text?: string;
  revision?: string | null;
  conversation?: string | null;
}

let counter = 0;
const mid = () => `m${Date.now().toString(36)}${++counter}`;

const initial = (): ChatState => ({ messages: [], working: false, status: '', undo: null, undoing: false });

export class DesignerChat {
  state: ChatState = initial();
  private listeners = new Set<Listener>();
  private conversation: string | null = null;
  private projectId = '';
  private abort: AbortController | null = null;

  constructor(private fetcher: typeof fetch = (...a) => fetch(...a)) {}

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

  /** Sends a request about this project. Another project in the same tab is a new chat. */
  async send(text: string, projectId: string): Promise<void> {
    const message = text.trim();
    if (!message || this.state.working) return;
    if (projectId !== this.projectId) {
      this.projectId = projectId;
      this.conversation = null;
      this.state = initial();
    }
    this.abort = new AbortController();
    this.set({ working: true, status: 'Sending', undo: null, messages: [...this.state.messages.filter((m) => !m.failed), { id: mid(), from: 'me', text: message }] });
    let finished = false;
    try {
      const res = await this.fetcher(apiUrl('designer/chat'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, conversation: this.conversation ?? undefined, message }),
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) {
        let why = '';
        try {
          why = ((await res.json()) as { error?: string }).error ?? '';
        } catch {
          /* not json */
        }
        this.fail(why || (res.status === 403 ? "You can't change this project, so the Activity Designer can't either." : 'The Activity Designer could not be reached. Try again in a minute.'), true);
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
        this.add({ from: 'error', text: e.text || 'Something went wrong in the Activity Designer.' });
        return false;
      case 'done':
        this.conversation = e.conversation ?? null;
        return true;
    }
    return false;
  }

  private fail(text: string, notSent: boolean) {
    const msgs = [...this.state.messages];
    const last = msgs.at(-1);
    if (notSent && last?.from === 'me') msgs[msgs.length - 1] = { ...last, failed: true };
    this.set({ messages: [...msgs, { id: mid(), from: 'error', text }] });
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
    this.state = initial();
    this.listeners.forEach((l) => l(this.state));
    if (id) await resetDesigner(id).catch(() => undefined);
  }
}

let shared: DesignerChat | null = null;
export function designerChat(): DesignerChat {
  return (shared ??= new DesignerChat());
}
