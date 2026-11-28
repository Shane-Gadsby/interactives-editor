/**
 * Whether Ask Ixia is there right now, for every part of the editor that shows it. The server says no when its usage
 * allowance (Antigravity's 5 hour or weekly window), a daily ceiling or this person's hourly share runs out, and says
 * when it should be back. Ask Ixia then goes away at once, with no reload, and comes back by itself: a check is set for
 * just after the time the server gave, and another runs when the tab comes back into view (no more than every 2 minutes).
 */
import { designerStatus, type SessionInfo } from './db';

export interface Availability {
  available: boolean;
  /** When the server expects it back (ms), if it said. */
  resetAt: number | null;
  /** The first answer has arrived (from the session or a status check). */
  initialized: boolean;
}

type Listener = (a: Availability) => void;

const FOCUS_EVERY = 2 * 60 * 1000;

export class DesignerAvailability {
  state: Availability = { available: false, resetAt: null, initialized: false };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFocusCheck = 0;
  private watching = false;

  constructor(
    private check: () => Promise<{ on: boolean; resetAt?: string | null }> = designerStatus,
    private jitter: () => number = () => 5000 + Math.floor(Math.random() * 25000),
    private now: () => number = () => Date.now(),
  ) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    this.watch();
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** What /api/session said, the first time it's read. Later answers come from status checks and chat replies. */
  initFromSession(s: Pick<SessionInfo, 'designer' | 'designerResetAt'>): void {
    if (this.state.initialized) return;
    this.setAvailability(s.designer === true, s.designerResetAt ?? null);
  }

  setAvailability(available: boolean, resetAt?: string | number | null): void {
    const at = resetAt == null ? null : typeof resetAt === 'number' ? resetAt : Date.parse(resetAt);
    const next = { available, resetAt: available || !Number.isFinite(at) ? null : (at as number), initialized: true };
    const same = next.available === this.state.available && next.resetAt === this.state.resetAt && this.state.initialized;
    this.state = next;
    this.schedule();
    if (!same) this.listeners.forEach((l) => l(this.state));
  }

  /** Asks the server now. Quiet when it can't be reached: what was known stays. */
  async checkNow(): Promise<void> {
    try {
      const s = await this.check();
      this.setAvailability(!!s.on, s.resetAt ?? null);
    } catch {
      /* the next check will try again */
    }
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.state.available || !this.state.resetAt) return;
    this.timer = setTimeout(() => void this.checkNow(), Math.max(1000, this.state.resetAt - this.now()) + this.jitter());
  }

  /** Coming back to the tab: has anything changed while it was out of sight (used up in another tab, or back again)? */
  private onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!this.state.initialized || this.now() - this.lastFocusCheck < FOCUS_EVERY) return;
    this.lastFocusCheck = this.now();
    void this.checkNow();
  };

  private watch() {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    window.addEventListener('focus', this.onVisible);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** For tests: forget everything and stop listening. */
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.watching && typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onVisible);
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.watching = false;
    this.listeners.clear();
  }
}

let shared: DesignerAvailability | null = null;
export function designerAvailability(): DesignerAvailability {
  return (shared ??= new DesignerAvailability());
}
/** Tests start each one fresh. */
export function resetDesignerAvailability(): void {
  shared?.dispose();
  shared = null;
}
