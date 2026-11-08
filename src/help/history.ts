/** What the help drawer shows at one step of its history. */
export interface HelpEntry {
  id: string;
  anchor?: string;
  /** What opened it, when it was the Help button: "Chart layer". Drives the "Back to general help" banner. */
  context?: string;
  /** Where the article was scrolled to when the person left it, so Back puts it there. */
  scroll?: number;
}

const LIMIT = 60;

/** The drawer's own back and forward stack: topics and anchors visited, in order. */
export class HelpHistory {
  entries: HelpEntry[] = [];
  pos = -1;

  get current(): HelpEntry | undefined {
    return this.entries[this.pos];
  }
  get canBack(): boolean {
    return this.pos > 0;
  }
  get canForward(): boolean {
    return this.pos < this.entries.length - 1;
  }

  /** Remember how far the current article is scrolled (call before leaving it). */
  saveScroll(scroll: number): void {
    if (this.current) this.current.scroll = scroll;
  }

  /** Go somewhere new: drops anything ahead, and does nothing when it is where we already are. Returns whether the stack grew. */
  push(e: Omit<HelpEntry, 'scroll'>): boolean {
    const cur = this.current;
    if (cur && cur.id === e.id && cur.anchor === e.anchor) {
      //the same place asked for again (a context change at most): keep the scroll position the person is at
      cur.context = e.context;
      return false;
    }
    this.entries = [...this.entries.slice(0, this.pos + 1), { ...e }];
    if (this.entries.length > LIMIT) this.entries.shift();
    this.pos = this.entries.length - 1;
    return true;
  }

  back(): HelpEntry | null {
    if (!this.canBack) return null;
    this.pos--;
    return this.current ?? null;
  }
  forward(): HelpEntry | null {
    if (!this.canForward) return null;
    this.pos++;
    return this.current ?? null;
  }
  clear(): void {
    this.entries = [];
    this.pos = -1;
  }
}
