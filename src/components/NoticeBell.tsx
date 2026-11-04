/**
 * The projects page's bell: comments handed to you, mentions of you, and replies where you are in the thread. The count
 * is what is unread; opening a notice opens its project (which marks that project's notices read).
 */
import { useEffect, useState } from 'react';
import { getNotices, readNotices, type Notice } from '../lib/comments';
import { timeAgo } from './CommentUI';
import { Icons } from './icons';

const WHY: Record<Notice['kind'], string> = { assigned: 'gave you comment', mention: 'mentioned you on comment', reply: 'replied on comment' };

export function NoticeBell({ open }: { open: (projectId: string) => void }) {
  const [state, setState] = useState<{ unread: number; items: Notice[] } | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => getNotices().then((r) => live && setState(r), () => undefined);
    void load();
    // Quietly, now and then, so a page left open hears about a new assignment
    const t = setInterval(load, 60 * 1000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  if (!state || (!state.items.length && !shown)) return null;
  return (
    <span className="notice-bell">
      <button
        type="button"
        className={`icon-btn${state.unread ? ' active' : ''}`}
        title={state.unread ? `${state.unread} unread comment notice${state.unread === 1 ? '' : 's'}` : 'Comment notices'}
        aria-label={`Comment notices, ${state.unread} unread`}
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
      >
        <Icons.bell width={16} />
        {state.unread > 0 && <span className="notice-n">{state.unread}</span>}
      </button>
      {shown && (
        <>
          <div className="q-menu-scrim" onClick={() => setShown(false)} />
          <div className="notice-list" role="menu" aria-label="Comment notices">
            {state.items.length === 0 && <p className="muted small">Nothing yet.</p>}
            {state.items.map((n) => (
              <button
                key={n._id}
                role="menuitem"
                className={n.read ? 'read' : ''}
                onClick={() => {
                  setShown(false);
                  void readNotices({ project: n.project }).catch(() => undefined);
                  open(n.project);
                }}
              >
                <span>
                  <strong>{n.by}</strong> {WHY[n.kind]} {n.n} in <strong>{n.projectName}</strong>
                </span>
                <span className="muted small">
                  {n.text} · {timeAgo(n.at)}
                </span>
              </button>
            ))}
            {state.unread > 0 && (
              <button
                className="notice-all"
                onClick={() => {
                  void readNotices().then(() => getNotices()).then(setState, () => undefined);
                }}
              >
                Mark all as read
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
}
