import { useEffect, useRef, useState } from 'react';
import { session } from '../lib/db';
import { designerChat, type ChatState } from '../lib/designer';
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

/** Whether this box has the Activity Designer set up (the server holds its Cogniti token). */
export function useDesignerOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    session()
      .then((s) => live && setOn(s.designer === true))
      .catch(() => undefined);
    return () => void (live = false);
  }, []);
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

const EXAMPLES = ['Add a page called Results with a heading and a button back to the start', 'Check my project for problems and fix them', 'Make a multiple choice question with feedback for each answer'];

const openLink = (href: string) => {
  if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
};

/**
 * Ask the Activity Designer: UniSQ's Cogniti agent in a panel beside the canvas. It builds in the open project while you
 * watch (its edits arrive like another person's, as "Activity Designer"), and one click undoes what it did. Kept mounted once
 * opened, and the conversation lives with the tab, so closing and reopening carries on.
 */
export function DesignerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [width, setWidth] = useState(savedWidth);
  const [chat, setChat] = useState<ChatState>(() => designerChat().state);
  const [draft, setDraft] = useState('');
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => designerChat().subscribe(setChat), []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    //how much of the shared allowance is left (or that they are on their own)
    void designerChat().refreshStatus();
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.working, chat.status, chat.undo, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement?.closest('.designer-panel')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = (text: string) => {
    if (!text.trim() || chat.working) return;
    void designerChat().send(text, openProjectId());
    setDraft('');
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

  return (
    <aside className="designer-panel" hidden={!open} style={{ width }} aria-label="Ask the Activity Designer">
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
        <h2 ref={headRef} tabIndex={-1}>
          Ask the Activity Designer
        </h2>
        <button
          className="btn small"
          title="Start a new conversation (this one is cleared)"
          onClick={() => {
            void designerChat().newChat();
            inputRef.current?.focus();
          }}
        >
          New chat
        </button>
        <IconButton icon={<Icons.close />} title="Close the chat (it keeps the conversation)" onClick={onClose} />
      </header>
      <p className="designer-note muted small">It builds in your project as you watch. Check what it made; you can undo it.</p>
      {!chat.own && chat.quota && (
        <p className="designer-quota muted small" role="status">
          {chat.quota.left > 0
            ? `${chat.quota.left} of ${chat.quota.limit} shared requests left this hour`
            : `No shared requests left this hour (the next comes back in about ${Math.max(1, Math.ceil(chat.quota.resetsIn / 60))} min)`}{' '}
          <button className="link-btn" onClick={ownAllowance} title="Add your own Cogniti token in Preferences, so your requests don't use the shared allowance">
            Use my own Cogniti allowance
          </button>
        </p>
      )}
      <div className="designer-log" ref={listRef} role="log" aria-live="polite" aria-label="Conversation">
        {chat.messages.length === 0 && (
          <div className="designer-examples">
            <p className="muted small">Say what you want in your own words, for example:</p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                className="btn small"
                onClick={() => {
                  setDraft(ex);
                  inputRef.current?.focus();
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        {chat.messages.map((m) => (
          <div key={m.id} className={`designer-msg ${m.from}${m.failed ? ' failed' : ''}`}>
            {m.from === 'agent' ? <Markdown text={m.text} onLink={openLink} /> : <p>{m.text}</p>}
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
                  <button className="btn small" disabled={chat.working} onClick={() => void designerChat().send(m.ask ?? '', openProjectId(), { force: true })} title="Send this to the Activity Designer. It uses one of your requests.">
                    Ask the Activity Designer anyway
                  </button>
                </p>
              </>
            )}
            {m.allowance && (
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
          <p className="designer-progress muted small" role="status">
            {chat.status || 'Working'}…{' '}
            <button className="link-btn" onClick={() => designerChat().stop()} title="Stop after the step it's on">
              Stop
            </button>
          </p>
        )}
        {!chat.working && chat.undo && (
          <div className="designer-undo">
            <button className="btn small" disabled={chat.undoing} onClick={() => void undo()} title="Put the project back as it was before this request">
              {chat.undoing ? 'Undoing…' : 'Undo what the Activity Designer did'}
            </button>
          </div>
        )}
      </div>
      <form
        className="designer-send"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={2}
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
        <button className="btn primary" type="submit" disabled={!draft.trim() || chat.working} title="Send (Enter; Shift+Enter for a new line)">
          Send
        </button>
      </form>
    </aside>
  );
}
