/**
 * The pieces of a review conversation, shared by the editor (the Comments panel and the pin popover on the canvas) and the
 * review page: the pin, a message, the composer with @mentions, and a thread with resolve, assign and delete.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LIMITS, type CommentMessage, type CommentUser, type Person, type Thread } from '../../shared/comments.mjs';
import { comments, useComments } from '../lib/comments';
import { confirmDialog } from './dialogs';
import { Icons } from './icons';

export function timeAgo(when: string | Date, now = Date.now()): string {
  const t = typeof when === 'string' ? Date.parse(when) : when.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export const who = (u: CommentUser | null | undefined): string => (u ? (u.guest ? `${u.name} (guest)` : u.name) : 'Someone');

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function Avatar({ user }: { user: CommentUser }) {
  return (
    <span className={`cm-avatar${user.guest ? ' guest' : ''}`} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}

/** The marker on the canvas and in lists: the thread's number, grey when resolved, ringed when it is for you. */
export function Pin({ thread, mine, selected, detached, onClick, style }: { thread: Thread; mine?: boolean; selected?: boolean; detached?: boolean; onClick?: (e: React.MouseEvent) => void; style?: React.CSSProperties }) {
  const first = thread.comments[0];
  const replies = thread.comments.length - 1;
  const label = `Comment ${thread.n} by ${who(first?.by)}${replies ? `, ${replies} repl${replies === 1 ? 'y' : 'ies'}` : ''}${thread.status === 'resolved' ? ', resolved' : ''}${detached ? '. The layer it was on has been deleted' : ''}`;
  return (
    <button
      type="button"
      className={`cm-pin${thread.status === 'resolved' ? ' resolved' : ''}${mine ? ' mine' : ''}${selected ? ' selected' : ''}${detached ? ' detached' : ''}`}
      style={style}
      data-pin={thread.id}
      title={`${label}: ${first?.text.slice(0, 80) ?? ''}`}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {thread.status === 'resolved' ? <Icons.check width={12} height={12} /> : thread.n}
    </button>
  );
}

/** The text of a message, with the @names of people who are known set in bold. */
function Words({ text, people }: { text: string; people: Person[] }) {
  const names = new Set(people.map((p) => p.username));
  const parts: ReactNode[] = [];
  const re = /@([\w.@-]+)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!names.has(m[1])) continue;
    parts.push(text.slice(last, m.index), <strong key={m.index} className="cm-mention">{people.find((p) => p.username === m[1])?.name ?? m[1]}</strong>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Usernames of the people named with @ in a text. */
export function mentionsIn(text: string, people: Person[]): string[] {
  const names = new Set(people.map((p) => p.username));
  const out: string[] = [];
  for (const m of text.matchAll(/@([\w.@-]+)/g)) if (names.has(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/**
 * A text box that sends on Ctrl/Cmd+Enter or its button. Typing @ offers the people who can be named (not on the
 * review page for a guest, who can't). A guest on the review page is asked for a display name first.
 */
export function Composer({
  placeholder,
  submitLabel = 'Send',
  initial = '',
  autoFocus,
  onSubmit,
  onCancel,
  extra,
}: {
  placeholder: string;
  submitLabel?: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (text: string, mentions: string[]) => Promise<void>;
  onCancel?: () => void;
  extra?: ReactNode;
}) {
  const c = useComments();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ query: string; at: number } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const guest = c.mode?.kind === 'review' && !c.me?.username;
  const needName = guest && c.guestName.trim().length < 2;
  const canMention = !guest;
  useEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy || needName) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(t, canMention ? mentionsIn(t, c.people) : []);
      setText('');
      setPick(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onChange = (v: string, caret: number) => {
    setText(v);
    const m = canMention ? /(?:^|\s)@([\w.@-]*)$/.exec(v.slice(0, caret)) : null;
    setPick(m ? { query: m[1].toLowerCase(), at: caret - m[1].length - 1 } : null);
  };
  const choices = pick ? c.people.filter((p) => p.username.toLowerCase().includes(pick.query) || p.name.toLowerCase().includes(pick.query)).slice(0, 6) : [];
  const choose = (p: Person) => {
    if (!pick) return;
    const caret = area.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, pick.at)}@${p.username} ${text.slice(caret)}`;
    setText(next);
    setPick(null);
    requestAnimationFrame(() => {
      area.current?.focus();
      const pos = pick.at + p.username.length + 2;
      area.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="cm-composer">
      {guest && (
        <label className="cm-name">
          <span className="muted small">Your name, shown beside your comments</span>
          <input type="text" value={c.guestName} maxLength={LIMITS.name} placeholder="Display name" onChange={(e) => comments.setGuestName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </label>
      )}
      <textarea
        ref={area}
        value={text}
        rows={3}
        maxLength={LIMITS.text}
        placeholder={canMention ? `${placeholder} (@ to mention someone)` : placeholder}
        aria-label={placeholder}
        disabled={busy}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          } else if (e.key === 'Escape') {
            if (pick) setPick(null);
            else onCancel?.();
          } else if (e.key === 'Tab' && choices.length) {
            e.preventDefault();
            choose(choices[0]);
          }
        }}
      />
      {choices.length > 0 && (
        <div className="cm-people" role="listbox" aria-label="People to mention">
          {choices.map((p) => (
            <button key={p.username} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)} title={`Mention ${p.name}`}>
              <strong>{p.name}</strong> <span className="muted small">@{p.username}</span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="cm-error" role="alert">{error}</div>}
      <div className="cm-actions">
        {extra}
        <span className="spacer" />
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy} title="Discard this (Esc)">
            Cancel
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => void send()} disabled={busy || !text.trim() || needName} title={needName ? 'Give your name first' : `${submitLabel} (Ctrl+Enter)`}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function Message({ thread, message, first }: { thread: Thread; message: CommentMessage; first: boolean }) {
  const c = useComments();
  const [editing, setEditing] = useState(false);
  const mineMsg = !!c.me?.username && !message.by.guest && message.by.username === c.me.username;
  const may = mineMsg || !!c.me?.manager;
  const remove = async () => {
    const whole = first && thread.comments.length > 1;
    const ok = await confirmDialog({
      title: first ? 'Delete this comment thread?' : 'Delete this reply?',
      message: whole ? `The ${thread.comments.length - 1} repl${thread.comments.length === 2 ? 'y' : 'ies'} under it go too.` : undefined,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await comments.remove(thread.id, message.id).catch(() => undefined);
  };
  return (
    <div className="cm-msg">
      <Avatar user={message.by} />
      <div className="cm-body">
        <div className="cm-head">
          <strong>{who(message.by)}</strong>
          <span className="muted small" title={new Date(message.created).toLocaleString()}>
            {timeAgo(message.created)}
            {message.edited ? ' (edited)' : ''}
          </span>
          <span className="spacer" />
          {may && !editing && (
            <>
              {mineMsg && (
                <button type="button" className="icon-btn" title="Edit" aria-label="Edit" onClick={() => setEditing(true)}>
                  <Icons.pencil width={12} />
                </button>
              )}
              <button type="button" className="icon-btn" title={first ? 'Delete the whole thread' : 'Delete this reply'} aria-label="Delete" onClick={() => void remove()}>
                <Icons.trash width={12} />
              </button>
            </>
          )}
        </div>
        {editing ? (
          <Composer
            placeholder="Edit comment"
            submitLabel="Save"
            initial={message.text}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (text, mentions) => {
              await comments.edit(thread.id, message.id, text, mentions);
              setEditing(false);
            }}
          />
        ) : (
          <p className="cm-text">
            <Words text={message.text} people={c.people} />
          </p>
        )}
      </div>
    </div>
  );
}

/** One conversation: where it is, who it is for, the messages, a reply box, resolve. */
export function ThreadCard({ thread, where, onClose }: { thread: Thread; where?: string; onClose?: () => void }) {
  const c = useComments();
  const [error, setError] = useState<string | null>(null);
  const canResolve = !!c.me?.username || !!c.me?.manager;
  const resolved = thread.status === 'resolved';
  const run = (p: Promise<unknown>) => p.then(() => setError(null), (err) => setError(err instanceof Error ? err.message : String(err)));
  return (
    <section className={`cm-thread${resolved ? ' resolved' : ''}`} aria-label={`Comment ${thread.n}`}>
      <header className="cm-thread-head">
        <Pin thread={thread} />
        <div className="cm-where" title={where}>
          <strong>{where ?? 'Comment'}</strong>
          {resolved && thread.resolved && <span className="muted small">Resolved by {who(thread.resolved.by)}</span>}
        </div>
        <span className="spacer" />
        {canResolve && (
          <button type="button" className="btn small-btn" onClick={() => void run(comments.setStatus(thread.id, resolved ? 'open' : 'resolved'))} title={resolved ? 'Open this conversation again' : 'Mark this as dealt with. It stays in the Resolved list'}>
            {resolved ? 'Reopen' : 'Resolve'}
          </button>
        )}
        {onClose && (
          <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={onClose}>
            <Icons.close width={13} />
          </button>
        )}
      </header>
      {c.me?.manager && (
        <label className="cm-assign">
          <span className="muted small">Assigned to</span>
          <select
            value={thread.assignee?.username ?? ''}
            onChange={(e) => {
              const p = c.people.find((x) => x.username === e.target.value);
              void run(comments.assign(thread.id, p ?? null));
            }}
            title="Hand this to someone. They are told, and it shows under Assigned to me"
          >
            <option value="">Nobody</option>
            {thread.assignee && !c.people.some((p) => p.username === thread.assignee!.username) && <option value={thread.assignee.username}>{thread.assignee.name}</option>}
            {c.people.map((p) => (
              <option key={p.username} value={p.username}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!c.me?.manager && thread.assignee && (
        <div className="cm-assign">
          <span className="muted small">Assigned to {thread.assignee.name}</span>
        </div>
      )}
      <div className="cm-messages">
        {thread.comments.map((m, i) => (
          <Message key={m.id} thread={thread} message={m} first={i === 0} />
        ))}
      </div>
      {error && <div className="cm-error" role="alert">{error}</div>}
      {thread.comments.length < LIMITS.perThread && <Composer placeholder="Reply" submitLabel="Reply" onSubmit={(text, mentions) => comments.reply(thread.id, text, mentions)} />}
    </section>
  );
}

/** A new pin's first message, with an optional assignee. */
export function DraftCard({ where, onClose }: { where: string; onClose: () => void }) {
  const c = useComments();
  const [assignee, setAssignee] = useState('');
  return (
    <section className="cm-thread draft" aria-label="New comment">
      <header className="cm-thread-head">
        <span className="cm-pin draft" aria-hidden="true">
          +
        </span>
        <div className="cm-where">
          <strong>New comment</strong>
          <span className="muted small">{where}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="icon-btn" title="Discard (Esc)" aria-label="Discard" onClick={onClose}>
          <Icons.close width={13} />
        </button>
      </header>
      <Composer
        placeholder="Write a comment"
        submitLabel="Comment"
        autoFocus
        onCancel={onClose}
        onSubmit={async (text, mentions) => {
          await comments.create(text, { mentions, assignee: c.people.find((p) => p.username === assignee) ?? null });
        }}
        extra={
          c.me?.manager ? (
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign to" title="Hand this comment to someone as you send it">
              <option value="">Assign to nobody</option>
              {c.people.map((p) => (
                <option key={p.username} value={p.username}>
                  Assign to {p.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />
    </section>
  );
}
