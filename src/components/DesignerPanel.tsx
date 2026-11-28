import { useEffect, useRef, useState } from 'react';
import { loadProjectRecord, session } from '../lib/db';
import { designerChat, type ChatState } from '../lib/designer';
import { designerAvailability } from '../lib/designer-availability';
import { Markdown } from '../help/markdown';
import { openHelp } from '../help/Help';
import { openPrefsSetting } from '../lib/prefs-window';
import { store } from '../store/store';
import { IconButton } from './ui';
import { Icons } from './icons';

const WIDTH_KEY = 'ix-designer-width';

function savedWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= 300 && n <= 900 ? n : 400;
  } catch {
    return 400;
  }
}

/**
 * Whether Ask Ixia is there right now: set up on this box, with allowance left. It turns false the moment the allowance
 * runs out (a chat reply or a status check says so) and true again when it's back, so everything that shows Ask Ixia
 * gates on this and nothing else.
 */
export function useDesignerOn(): boolean {
  const avail = designerAvailability();
  const [on, setOn] = useState(avail.state.available);
  useEffect(() => {
    let live = true;
    const off = avail.subscribe((a) => live && setOn(a.available));
    setOn(avail.state.available);
    if (!avail.state.initialized) {
      session()
        .then((s) => live && avail.initFromSession(s))
        .catch(() => undefined);
    }
    return () => {
      live = false;
      off();
    };
  }, [avail]);
  return on;
}

/** The open project's id. That's all the server is told: it reads the name itself, and the agent reads the rest as the person. */
const openProjectId = (): string => {
  try {
    return store().get().project.id;
  } catch {
    return '';
  }
};

let showing = false;
let showAgain = false;
/**
 * Puts what Ixia has just built on the canvas. A tab in the live session is sent each change as it happens; live
 * collaboration is off by default though, and then nothing arrives, so the tab fetches the project and swaps it in.
 * One fetch at a time, and one more after it if changes kept coming.
 */
export async function showWhatChanged(): Promise<void> {
  if (showing) {
    showAgain = true;
    return;
  }
  showing = true;
  try {
    do {
      showAgain = false;
      const st = store();
      if (st.get().live?.status === 'live') return;
      const p = await loadProjectRecord(st.get().project.id).catch(() => null);
      if (p && store() === st && p.id === st.get().project.id) st.replaceProject(p);
    } while (showAgain);
  } finally {
    showing = false;
  }
}

/** One of each thing it does: builds, makes an activity, checks, and answers a how-do-I from the help (which costs nothing). */
const EXAMPLES: { icon: keyof typeof Icons; text: string }[] = [
  { icon: 'plus', text: 'Add a page called Results with a heading and a button back to the start' },
  { icon: 'question', text: 'Make a multiple choice question with feedback for each answer' },
  { icon: 'check', text: 'Check my project for problems and fix them' },
  { icon: 'help', text: 'How do I make a layer fade in when the page opens?' },
];

/** Past this far from the bottom, new messages stop pulling the list down (you scrolled up to read). */
const NEAR_BOTTOM = 48;
/** How many finished steps show above the one it's on. */
const STEPS_SHOWN = 3;

const took = (seconds: number) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
  </svg>
);

const openLink = (href: string) => {
  if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
};

/**
 * Ixia's way in: a round button with the Ixia bloom at the bottom right of the canvas, where people look
 * for an assistant, and the chat opening above it. Nothing shows on a box that hasn't got the designer switched on.
 */
export function DesignerDock() {
  const on = useDesignerOn();
  const [state, setState] = useState<'never' | 'open' | 'closed'>('never');
  const fab = useRef<HTMLButtonElement>(null);
  const wasOn = useRef(on);
  useEffect(() => {
    if (wasOn.current && !on) {
      //It went away (the allowance ran out). When it comes back the chat starts closed, not popping open on its own
      setState((s) => (s === 'never' ? s : 'closed'));
      if (designerChat().state.undo) {
        store().toast('Ixia updated your project. Ask Ixia is unavailable until more usage is available; use Revision history ("Before Ixia") to undo if needed.', 'info');
      }
    }
    wasOn.current = on;
  }, [on]);
  if (!on) return null;
  const open = state === 'open';
  return (
    <>
      {state !== 'never' && (
        <DesignerPanel
          open={open}
          onClose={() => {
            setState('closed');
            fab.current?.focus();
          }}
        />
      )}
      <button
        ref={fab}
        type="button"
        className={open ? 'designer-fab open' : 'designer-fab'}
        title={open ? 'Close the chat (it keeps the conversation)' : 'Having trouble? Ask me for help'}
        data-tip-side="top"
        aria-label="Ask Ixia"
        aria-expanded={open}
        onClick={() => setState(open ? 'closed' : 'open')}
      >
        <img src="./favicon.svg" alt="" width={30} height={30} />
      </button>
    </>
  );
}

/**
 * Ask Ixia: the chat in a card over the bottom right of the canvas. It builds in the open project while you
 * watch (its edits arrive like another person's, as "Ixia"), and one click undoes what it did. Kept mounted once
 * opened, and the conversation lives with the tab, so closing and reopening carries on.
 */
export function DesignerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [width, setWidth] = useState(savedWidth);
  const [chat, setChat] = useState<ChatState>(() => designerChat().state);
  const [draft, setDraft] = useState('');
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Whether the list is at its end. A ref for the effect that follows new messages, state for the "Latest" button
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => designerChat().subscribe(setChat), []);
  useEffect(() => {
    designerChat().onChanged = () => void showWhatChanged();
    return () => void (designerChat().onChanged = null);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    //how much of the shared allowance is left (or that they are on their own)
    void designerChat().refreshStatus();
  }, [open]);

  const toEnd = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stuck.current = true;
    setAway(false);
  };

  // New messages and steps pull the list down only while you're at its end: scroll up to read and it stays put
  useEffect(() => {
    if (stuck.current) toEnd();
  }, [chat.messages.length, chat.working, chat.status, chat.undo, chat.lastRun, open]);

  // The clock beside the step it's on
  useEffect(() => {
    if (!chat.working) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [chat.working]);

  // The box grows with what you type, up to its max-height (then it scrolls)
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !el.scrollHeight) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, open, width]);

  // Escape stops a request that is running; with nothing running it closes the card
  const working = chat.working;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !document.activeElement?.closest('.designer-panel')) return;
      if (working) designerChat().stop();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, working]);

  const send = (text: string) => {
    if (!text.trim() || chat.working) return;
    stuck.current = true;
    void designerChat().send(text, openProjectId());
    setDraft('');
  };

  const copy = (text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => store().toast('Copied', 'info'))
      .catch(() => undefined);
  };

  const ownAllowance = () => openPrefsSetting('general', 'designerAllowance');

  const undo = async () => {
    await designerChat().undo();
    //Live editors get told to reload by the server. A tab that isn't connected to the live session won't, so it does it itself
    if (!designerChat().state.undo && store().get().live?.status !== 'live') location.reload();
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const panel = (e.currentTarget as HTMLElement).parentElement;
    panel?.classList.add('resizing');
    const move = (ev: PointerEvent) => setWidth(Math.min(900, Math.max(300, w0 + (x0 - ev.clientX))));
    const up = () => {
      panel?.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setWidth((w) => {
        try {
          localStorage.setItem(WIDTH_KEY, String(w));
        } catch {
          /* only a convenience */
        }
        return w;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const nudge = (by: number) =>
    setWidth((w) => {
      const n = Math.min(900, Math.max(300, w + by));
      try {
        localStorage.setItem(WIDTH_KEY, String(n));
      } catch {
        /* only a convenience */
      }
      return n;
    });

  const elapsed = chat.working ? Math.max(0, Math.round((now - chat.startedAt) / 1000)) : 0;
  const done = chat.steps.slice(0, -1);
  const quota = !chat.own && chat.quota ? chat.quota : null;

  return (
    <aside className="designer-panel" hidden={!open} style={{ width }} aria-label="Ask Ixia">
      <div
        className="designer-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Panel width"
        aria-valuenow={width}
        aria-valuemin={300}
        aria-valuemax={900}
        tabIndex={0}
        title="Drag to make the panel wider or narrower (or use the arrow keys)"
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') (e.preventDefault(), nudge(20));
          if (e.key === 'ArrowRight') (e.preventDefault(), nudge(-20));
        }}
      />
      <header>
        <img src="./favicon.svg" alt="" width={20} height={20} />
        <h2 ref={headRef} tabIndex={-1}>
          Ask Ixia
        </h2>
        <IconButton
          icon={<Icons.plus />}
          title="New chat (this conversation is cleared)"
          disabled={chat.messages.length === 0 && !chat.working}
          onClick={() => {
            void designerChat().newChat();
            stuck.current = true;
            inputRef.current?.focus();
          }}
        />
        <IconButton icon={<Icons.close />} title="Close the chat (it keeps the conversation)" onClick={onClose} />
      </header>
      <div className="designer-body">
        <div
          className="designer-log"
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          onScroll={(e) => {
            const el = e.currentTarget;
            const far = el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM;
            stuck.current = !far;
            setAway(far);
          }}
        >
          {chat.messages.length === 0 && (
            <div className="designer-empty">
              <img src="./favicon.svg" alt="" width={36} height={36} />
              <h3>What would you like to build?</h3>
              <p className="muted">It builds in your project as you watch. Check what it made; you can undo it.</p>
              <div className="designer-examples">
                {EXAMPLES.map((ex) => {
                  const Icon = Icons[ex.icon];
                  return (
                    <button
                      key={ex.text}
                      type="button"
                      className="designer-example"
                      onClick={() => {
                        setDraft(ex.text);
                        inputRef.current?.focus();
                      }}
                    >
                      <Icon />
                      <span>{ex.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {chat.messages.map((m) => (
            <div key={m.id} className={`designer-msg ${m.from}${m.failed ? ' failed' : ''}`}>
              {m.from === 'agent' ? <Markdown text={m.text} onLink={openLink} /> : <p>{m.text}</p>}
              {m.from === 'agent' && (
                <div className="designer-acts">
                  <button type="button" className="designer-act" title="Copy this reply" aria-label="Copy this reply" onClick={() => copy(m.text)}>
                    <Icons.copy />
                  </button>
                </div>
              )}
              {m.from === 'help' && (
                <>
                  <ul className="designer-topics">
                    {(m.topics ?? []).map((t) => (
                      <li key={`${t.id}#${t.anchor ?? ''}`}>
                        <button className="link-btn" onClick={() => openHelp(t.id, t.anchor)} title={t.snippet}>
                          {t.title}
                          {t.heading ? `: ${t.heading}` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="small">
                    <button className="btn small" disabled={chat.working} onClick={() => void designerChat().send(m.ask ?? '', openProjectId(), { force: true })} title="Send this to Ixia. It uses one of your requests.">
                      Ask Ixia anyway
                    </button>
                  </p>
                </>
              )}
              {m.allowance && chat.ownTokens && (
                <p className="small">
                  <button className="btn small" onClick={ownAllowance} title="Add your own Cogniti token in Preferences, so your requests don't use the shared allowance">
                    Use my own Cogniti allowance
                  </button>
                </p>
              )}
              {m.failed && (
                <p className="small">
                  Not sent.{' '}
                  <button className="link-btn" onClick={() => send(m.text)}>
                    Try again
                  </button>
                </p>
              )}
            </div>
          ))}
          {chat.working && (
            <div className="designer-run">
              {done.length > 0 && (
                <ol className="designer-steps" aria-label="Done so far">
                  {done.length > STEPS_SHOWN && <li className="more">{done.length - STEPS_SHOWN} earlier</li>}
                  {done.slice(-STEPS_SHOWN).map((step, i) => (
                    <li key={`${done.length}-${i}`}>
                      <Icons.check />
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              <div className="designer-progress">
                <span className="designer-spin" aria-hidden="true" />
                <span className="designer-now" role="status">
                  {chat.status || 'Working'}…
                </span>
                <span className="designer-time" aria-hidden="true">
                  {took(elapsed)}
                </span>
              </div>
            </div>
          )}
          {!chat.working && chat.lastRun && (
            <details className="designer-worked">
              <summary>
                Worked for {took(chat.lastRun.seconds)}, {chat.lastRun.steps.length} {chat.lastRun.steps.length === 1 ? 'step' : 'steps'}
              </summary>
              <ol className="designer-steps">
                {chat.lastRun.steps.map((step, i) => (
                  <li key={i}>
                    <Icons.check />
                    {step}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {!chat.working && chat.undo && (
            <div className="designer-undo">
              <span>Ixia changed your project.</span>
              <button className="btn small" disabled={chat.undoing} onClick={() => void undo()} title="Put the project back as it was before this request">
                {chat.undoing ? 'Undoing…' : 'Undo what Ixia did'}
              </button>
            </div>
          )}
        </div>
        {away && (
          <button type="button" className="designer-latest" title="Go to the newest message" aria-label="Go to the newest message" onClick={toEnd}>
            <Icons.chevronDown />
          </button>
        )}
      </div>
      <form
        className="designer-send"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div
          className="designer-box"
          onMouseDown={(e) => {
            // anywhere in the box that isn't the button or the text itself puts the caret in the text
            if (e.target === e.currentTarget) (e.preventDefault(), inputRef.current?.focus());
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            aria-label="Your message"
            placeholder="Say what you would like built"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          {chat.working ? (
            <button type="button" className="designer-go stop" title="Stop after the step it's on (Esc)" aria-label="Stop" onClick={() => designerChat().stop()}>
              <Icons.stop />
            </button>
          ) : (
            <button type="submit" className="designer-go" disabled={!draft.trim()} title="Send (Enter; Shift+Enter for a new line)" aria-label="Send">
              <SendIcon />
            </button>
          )}
        </div>
        {quota ? (
          <p className="designer-quota designer-foot" role="status">
            {quota.left > 0 ? `${quota.left} of ${quota.limit} shared requests left this hour` : `No shared requests left this hour (the next comes back in about ${Math.max(1, Math.ceil(quota.resetsIn / 60))} min)`}{' '}
            {chat.ownTokens && (
              <button type="button" className="link-btn" onClick={ownAllowance} title="Add your own Cogniti token in Preferences, so your requests don't use the shared allowance">
                Use my own Cogniti allowance
              </button>
            )}
          </p>
        ) : (
          <p className="designer-foot">Ixia can make mistakes, so check what it made.</p>
        )}
      </form>
    </aside>
  );
}
