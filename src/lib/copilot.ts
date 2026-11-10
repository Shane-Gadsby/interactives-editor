/**
 * Ask the Activity Designer: a small Direct Line 3.0 client for UniSQ's Copilot Studio agent. The server swaps the
 * agent's secret for a token (one conversation, an hour); this starts the conversation, sends what the person types,
 * and hears the agent's replies over the stream Direct Line offers, falling back to asking every couple of seconds.
 * One conversation per editor tab, kept while the panel is closed; New chat starts another.
 */
import { copilotToken } from './db';

const DL = 'https://directline.botframework.com/v3/directline';

export interface ChatAction {
  title: string;
  value: string;
}

export interface ChatMessage {
  id: string;
  from: 'me' | 'agent';
  text: string;
  /** Buttons the agent offers under its message (suggested actions); clicking one sends its value. */
  actions?: ChatAction[];
  /** The agent sent something the panel can't draw (a card), so the text may be only part of it. */
  hasCard?: boolean;
  failed?: boolean;
}

export interface ChatState {
  status: 'idle' | 'connecting' | 'ready' | 'error';
  error?: string;
  messages: ChatMessage[];
  /** The agent is writing a reply. */
  typing: boolean;
}

interface Activity {
  id?: string;
  type: string;
  text?: string;
  from?: { id?: string; role?: string };
  attachments?: { contentType?: string; content?: { text?: string; body?: unknown } }[];
  suggestedActions?: { actions?: { title?: string; value?: unknown; type?: string }[] };
}

type Listener = (s: ChatState) => void;

export class CopilotChat {
  state: ChatState = { status: 'idle', messages: [], typing: false };
  private listeners = new Set<Listener>();
  private token = '';
  private conversationId = '';
  private userId = '';
  private watermark: string | undefined;
  private socket: WebSocket | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private refresh: ReturnType<typeof setTimeout> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();
  private closed = false;
  private local = 0;

  constructor(private readonly fetcher: typeof fetch = (...a) => fetch(...a)) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => void this.listeners.delete(fn);
  }

  private set(patch: Partial<ChatState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private async dl<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetcher(DL + path, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Direct Line ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Get a token, open the conversation and say hello, so the agent's greeting arrives first. */
  async start(context?: Record<string, unknown>): Promise<void> {
    if (this.state.status === 'connecting' || this.state.status === 'ready') return;
    this.closed = false;
    this.set({ status: 'connecting', error: undefined });
    try {
      const t = await copilotToken();
      this.token = t.token;
      this.userId = t.userId;
      const conv = await this.dl<{ conversationId: string; streamUrl?: string; expires_in?: number }>('POST', '/conversations', {});
      if (this.closed) return;
      this.conversationId = conv.conversationId;
      this.scheduleRefresh((conv.expires_in ?? t.expiresIn ?? 3600) * 1000);
      this.listen(conv.streamUrl);
      this.set({ status: 'ready' });
      await this.dl('POST', `/conversations/${this.conversationId}/activities`, {
        type: 'event',
        name: 'startConversation',
        from: { id: this.userId },
        locale: navigator.language || 'en-AU',
        value: context ?? {},
      });
      this.expectReply();
    } catch (err) {
      this.set({ status: 'error', error: friendly(err) });
    }
  }

  async send(text: string, context?: Record<string, unknown>): Promise<void> {
    const words = text.trim();
    if (!words) return;
    if (this.state.status !== 'ready') await this.start(context);
    if (this.state.status !== 'ready') return;
    const id = `local-${++this.local}`;
    this.set({ messages: [...this.state.messages, { id, from: 'me', text: words }] });
    try {
      await this.dl('POST', `/conversations/${this.conversationId}/activities`, {
        type: 'message',
        text: words,
        from: { id: this.userId },
        locale: navigator.language || 'en-AU',
        channelData: context ? { interactives: context } : undefined,
      });
      this.expectReply();
    } catch {
      this.set({ messages: this.state.messages.map((m) => (m.id === id ? { ...m, failed: true } : m)) });
    }
  }

  /** Drop this conversation; the next start or send opens a new one. */
  close(): void {
    this.closed = true;
    this.socket?.close();
    this.socket = null;
    for (const t of [this.poll, this.refresh, this.typingTimer]) if (t) clearTimeout(t);
    this.poll = this.refresh = this.typingTimer = null;
    this.watermark = undefined;
    this.seen.clear();
    this.set({ status: 'idle', messages: [], typing: false, error: undefined });
  }

  private expectReply() {
    this.set({ typing: true });
    if (this.typingTimer) clearTimeout(this.typingTimer);
    // the agent signals the end of a turn; this is only the backstop
    this.typingTimer = setTimeout(() => this.set({ typing: false }), 30000);
    if (!this.socket) {
      // a reply is due: look sooner than the idle round would
      if (this.poll) clearTimeout(this.poll);
      this.poll = null;
      this.schedulePoll(800);
    }
  }

  private listen(streamUrl?: string) {
    if (!streamUrl || typeof WebSocket === 'undefined') return this.schedulePoll(1500);
    try {
      const ws = new WebSocket(streamUrl);
      this.socket = ws;
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || !e.data.trim()) return; // keep-alives are empty
        try {
          const d = JSON.parse(e.data) as { activities?: Activity[]; watermark?: string };
          if (d.watermark) this.watermark = d.watermark;
          this.take(d.activities ?? []);
        } catch {
          /* not one of ours */
        }
      };
      ws.onclose = () => {
        if (this.socket === ws) this.socket = null;
        if (!this.closed) this.schedulePoll(1500);
      };
    } catch {
      this.schedulePoll(1500);
    }
  }

  private schedulePoll(ms: number) {
    if (this.poll || this.closed) return;
    this.poll = setTimeout(async () => {
      this.poll = null;
      if (this.closed || !this.conversationId) return;
      try {
        const d = await this.dl<{ activities: Activity[]; watermark?: string }>(
          'GET',
          `/conversations/${this.conversationId}/activities${this.watermark ? `?watermark=${encodeURIComponent(this.watermark)}` : ''}`,
        );
        if (d.watermark) this.watermark = d.watermark;
        this.take(d.activities ?? []);
      } catch {
        /* try again on the next round */
      }
      // quick while a reply is due, slow otherwise
      if (!this.socket) this.schedulePoll(this.state.typing ? 1000 : 5000);
    }, ms);
  }

  private scheduleRefresh(life: number) {
    if (this.refresh) clearTimeout(this.refresh);
    this.refresh = setTimeout(async () => {
      try {
        const d = await this.dl<{ token: string; expires_in?: number }>('POST', '/tokens/refresh');
        this.token = d.token;
        this.scheduleRefresh((d.expires_in ?? 3600) * 1000);
      } catch {
        /* the next send starts a fresh conversation */
        this.set({ status: 'idle' });
      }
    }, Math.max(60000, life - 5 * 60000));
  }

  /** Turn the agent's activities into messages; our own echoes are already on the list. */
  take(activities: Activity[]): void {
    let messages = this.state.messages;
    let typing = this.state.typing;
    for (const a of activities) {
      if (a.id && this.seen.has(a.id)) continue;
      if (a.id) this.seen.add(a.id);
      const mine = a.from?.id === this.userId || a.from?.role === 'user';
      if (mine) continue;
      if (a.type === 'typing') typing = true;
      else if (a.type === 'event' && /turn\.complete|endOfTurn/i.test((a as { name?: string }).name ?? '')) typing = false;
      else if (a.type === 'message') {
        const cards = (a.attachments ?? []).filter((x) => x.contentType && x.contentType !== 'text/plain' && x.contentType !== 'text/markdown');
        const extra = (a.attachments ?? []).map((x) => x.content?.text).filter((t): t is string => typeof t === 'string' && !!t.trim());
        const text = [a.text ?? '', ...extra].filter(Boolean).join('\n\n');
        const actions = (a.suggestedActions?.actions ?? [])
          .map((x) => ({ title: String(x.title ?? x.value ?? ''), value: String(x.value ?? x.title ?? '') }))
          .filter((x) => x.title);
        if (!text && !actions.length && !cards.length) continue;
        messages = [...messages, { id: a.id ?? `agent-${messages.length}`, from: 'agent', text, actions: actions.length ? actions : undefined, hasCard: cards.length > 0 && !extra.length }];
        typing = false;
      }
    }
    if (messages !== this.state.messages || typing !== this.state.typing) this.set({ messages, typing });
  }
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|Too many/i.test(msg)) return 'Too many chats started in a minute. Try again shortly.';
  if (/404|switched off/i.test(msg)) return 'The Activity Designer is switched off here.';
  return 'The Activity Designer could not be reached. Try again in a moment.';
}

let shared: CopilotChat | null = null;
/** The tab's one conversation. */
export function copilotChat(): CopilotChat {
  return (shared ??= new CopilotChat());
}
