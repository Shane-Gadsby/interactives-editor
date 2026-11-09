/**
 * The Comments panel: every thread of the project with filters (open or resolved, mine, assigned to me, one artboard)
 * and a click that takes you to the pin. Used on the editor's left and on the review page's side.
 */
import { useMemo } from 'react';
import type { Project } from 'interactives-player';
import { countsOf, snippet, type Thread } from '../../shared/comments.mjs';
import { comments, useComments } from '../lib/comments';
import { placeLabel, pinPlace } from '../lib/comment-anchor';
import { Pin, timeAgo, who } from '../components/CommentUI';
import { Icons } from '../components/icons';
import { HelpLink } from '../help/Help';

export function CommentsPanel({ project, onJump, hint }: { project: Project | null; onJump: (t: Thread) => void; hint?: boolean }) {
  const c = useComments();
  const counts = useMemo(() => countsOf(c.threads, c.me), [c.threads, c.me]);
  const shown = useMemo(() => comments.visible(), [c.threads, c.filter, c.me]); // eslint-disable-line react-hooks/exhaustive-deps
  const signed = !!c.me?.username;
  const set = (status: 'open' | 'resolved' | 'all') => comments.setFilter({ status });
  return (
    <div className="cm-panel">
      <div className="cm-panel-head">
        <strong>Comments</strong>
        <span className="badge" title="Open comments">
          {counts.open}
        </span>
        <span className="spacer" />
        {c.live === 'reconnecting' && <span className="muted small" title="Reconnecting. Changes made while it was down arrive when it is back">offline</span>}
        <button type="button" className={`icon-btn${c.showPins ? ' active' : ''}`} title={c.showPins ? 'Hide the pins on the canvas' : 'Show the pins on the canvas'} aria-label="Show pins" aria-pressed={c.showPins} onClick={() => comments.setShowPins(!c.showPins)}>
          {c.showPins ? <Icons.eye width={14} /> : <Icons.eyeOff width={14} />}
        </button>
        <HelpLink topic="comments" />
      </div>
      <div className="cm-filters">
        <div className="seg" role="group" aria-label="Status">
          <button type="button" className={`seg-btn${c.filter.status === 'open' ? ' on' : ''}`} onClick={() => set('open')} title="Comments still to deal with">
            Open {counts.open}
          </button>
          <button type="button" className={`seg-btn${c.filter.status === 'resolved' ? ' on' : ''}`} onClick={() => set('resolved')} title="Comments marked as resolved">
            Resolved {counts.resolved}
          </button>
          <button type="button" className={`seg-btn${c.filter.status === 'all' ? ' on' : ''}`} onClick={() => set('all')} title="Every comment">
            All
          </button>
        </div>
        <div className="cm-filter-row">
          <select value={c.filter.scope} onChange={(e) => comments.setFilter({ scope: e.target.value as 'all' | 'mine' | 'assigned' })} aria-label="Whose" title="Everyone's comments, ones you took part in, or ones handed to you">
            <option value="all">Everyone</option>
            {signed && <option value="mine">Mine ({counts.mine})</option>}
            {signed && <option value="assigned">Assigned to me ({counts.assigned})</option>}
          </select>
          {project && project.artboards.length > 1 && (
            <select value={c.filter.artboardId} onChange={(e) => comments.setFilter({ artboardId: e.target.value })} aria-label="Artboard" title="Only the comments on one artboard">
              <option value="">All artboards</option>
              {project.artboards.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {c.error && <div className="cm-error" role="alert">{c.error}</div>}
      <ul className="cm-list" aria-label="Comments">
        {shown.map((t) => {
          const place = project ? pinPlace(project, t) : null;
          const first = t.comments[0];
          const replies = t.comments.length - 1;
          return (
            <li key={t.id}>
              <button type="button" className={`cm-row${c.openId === t.id ? ' on' : ''}${t.status === 'resolved' ? ' resolved' : ''}`} onClick={() => onJump(t)} title="Go to this comment">
                <Pin thread={t} mine={!!c.me?.username && t.assignee?.username === c.me.username} detached={place?.detached} />
                <span className="cm-row-main">
                  <span className="cm-row-text">{snippet(first?.text ?? '', 110)}</span>
                  <span className="muted small cm-row-meta">
                    {placeLabel(project, t)}
                    {place?.detached ? ' (layer deleted)' : ''}
                  </span>
                  <span className="muted small cm-row-meta">
                    {who(first?.by)} · {timeAgo(t.updated)}
                    {replies > 0 ? ` · ${replies} repl${replies === 1 ? 'y' : 'ies'}` : ''}
                    {t.assignee ? ` · for ${t.assignee.username === c.me?.username ? 'you' : t.assignee.name}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!shown.length && (
        <p className="muted small cm-empty">
          {!c.loaded
            ? 'Loading…'
            : c.threads.length
              ? 'No comments match these filters.'
              : hint
                ? 'No comments yet. Press C, then click the canvas to leave one. Share the review link to hear from others.'
                : 'No comments yet. Click Comment, then click on the project where you want to say something.'}
        </p>
      )}
    </div>
  );
}
