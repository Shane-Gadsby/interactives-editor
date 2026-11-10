import { useEffect, useRef, useState } from 'react';
import { session } from '../lib/db';
import { copilotChat, type ChatState } from '../lib/copilot';
import { Markdown } from '../help/markdown';
import { store } from '../store/store';
import { IconButton } from './ui';
import { Icons } from './icons';

const WIDTH_KEY = 'ix-copilot-width';

function savedWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= 300 && n <= 900 ? n : 400;
  } catch {
    return 400;
  }
}

/** Whether this box has the Activity Designer set up (the server holds its secret). */
export function useCopilotOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    session()
      .then((s) => live && setOn(s.copilot === true))
      .catch(() => undefined);
    return () => void (live = false);
  }, []);
  return on;
}

/** What the agent is told about where the person is: the open project's name and id (never its content). */
function context(): Record<string, unknown> {
  try {
    const p = store().get().project;
    return { projectId: p.id, projectName: p.name };
  } catch {
    return {};
  }
}

const openLink = (href: string) => {
  if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
};

/**
 * Ask the Activity Designer: UniSQ's Copilot Studio agent in a panel beside the canvas, over Direct Line. It's told the
 * open project's name but can't see or change the project; it gives advice. Kept mounted once opened, and the
 * conversation lives with the tab, so closing and reopening carries on.
 */
export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [width, setWidth] = useState(savedWidth);
  const [chat, setChat] = useState<ChatState>(() => copilotChat().state);
  const [draft, setDraft] = useState('');
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => copilotChat().subscribe(setChat), []);

  useEffect(() => {
    if (!open) return;
    if (copilotChat().state.status === 'idle') void copilotChat().start(context());
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.typing, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement?.closest('.copilot-panel')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = (text: string) => {
    if (!text.trim()) return;
    void copilotChat().send(text, context());
    setDraft('');
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

  const busy = chat.status === 'connecting';
  return (
    <aside className="copilot-panel" hidden={!open} style={{ width }} aria-label="Ask the Activity Designer">
      <div
        className="copilot-resize"
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
            copilotChat().close();
            void copilotChat().start(context());
            inputRef.current?.focus();
          }}
        >
          New chat
        </button>
        <IconButton icon={<Icons.close />} title="Close the chat (it keeps the conversation)" onClick={onClose} />
      </header>
      <p className="copilot-note muted small">UniSQ's Copilot agent. It knows your project's name and can suggest how to build it, but it can't see or change the project. Check what it says.</p>
      <div className="copilot-log" ref={listRef} role="log" aria-live="polite" aria-label="Conversation">
        {chat.messages.map((m) => (
          <div key={m.id} className={`copilot-msg ${m.from}${m.failed ? ' failed' : ''}`}>
            {m.from === 'agent' ? <Markdown text={m.text} onLink={openLink} /> : <p>{m.text}</p>}
            {m.hasCard && <p className="muted small">The agent sent a card the editor can't show. Ask it to say it in words.</p>}
            {m.failed && (
              <p className="small">
                Not sent.{' '}
                <button className="link-btn" onClick={() => send(m.text)}>
                  Try again
                </button>
              </p>
            )}
            {m.actions && (
              <div className="copilot-actions">
                {m.actions.map((a) => (
                  <button key={a.title} className="btn small" onClick={() => send(a.value)}>
                    {a.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="muted small">Connecting…</p>}
        {chat.typing && <p className="copilot-typing muted small">The Activity Designer is writing…</p>}
        {chat.status === 'error' && (
          <p className="copilot-error small">
            {chat.error}{' '}
            <button className="link-btn" onClick={() => void copilotChat().start(context())}>
              Try again
            </button>
          </p>
        )}
      </div>
      <form
        className="copilot-send"
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
          placeholder="Ask for ideas, or how to build something"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button className="btn primary" type="submit" disabled={!draft.trim()} title="Send (Enter; Shift+Enter for a new line)">
          Send
        </button>
      </form>
    </aside>
  );
}
