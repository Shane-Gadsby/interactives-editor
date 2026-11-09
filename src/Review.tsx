/**
 * The review page (#/review/<token>): the project as still artboards with the comment pins on them, a Comments panel,
 * and Play for the real thing. The link takes a signed in StudyDesk user: inside StudyDesk they are already, and in a tab of
 * its own the page signs them in through StaffDesk first (session.ts). The pins are an overlay on this page, never part
 * of the project.
 */
import { useNoProgressHost } from './lib/preview-learner';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Renderer, normalizeProject, prepareNodes, withMaster, type Artboard, type Project } from 'interactives-player';
import type { Anchor, CommentUser, Person, Thread } from '../shared/comments.mjs';
import { comments, useComments } from './lib/comments';
import { anchorAt, pinPlace, placeLabel } from './lib/comment-anchor';
import { assetUrls } from './lib/assets';
import { previewScope } from './lib/data';
import { ensureFonts } from './lib/fonts';
import { isDirectLoad, sessionId, sessionUser } from './lib/session';
import { standaloneHtml } from './lib/export';
import { CommentsPanel } from './panels/CommentsPanel';
import { DraftCard, Pin, ThreadCard } from './components/CommentUI';
import { Icons } from './components/icons';

interface Loaded {
  id: string;
  name: string;
  project: Project;
  me: (CommentUser & { manager?: boolean }) | null;
  threads: Thread[];
  people: Person[];
}

const CARD_W = 330;

export function Review({ token }: { token: string }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string; signin: boolean } | { kind: 'ok'; data: Loaded }>({ kind: 'loading' });
  useEffect(() => {
    let off = false;
    // Pictures and fonts load as plain urls, which carry no header, so the session goes on the url (the live stream does the same)
    assetUrls.external = (id) => {
      const url = new URL(`review/${encodeURIComponent(token)}/assets/${encodeURIComponent(id)}`, document.baseURI);
      const sid = sessionId();
      if (sid) url.searchParams.set('sessionID', sid);
      return url.href;
    };
    (async () => {
      // The session id is stored by the time this answers, and then goes on this request
      await sessionUser();
      try {
        const res = await fetch(new URL(`review/${encodeURIComponent(token)}`, document.baseURI), { credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        if (off) return;
        if (!res.ok) return setState({ kind: 'error', message: body.error ?? `Server error ${res.status}`, signin: !!body.signin });
        const project = normalizeProject(body.project);
        ensureFonts(project);
        comments.startReview(token, { threads: body.threads, people: body.people, me: body.me });
        setState({ kind: 'ok', data: { id: body.id, name: body.name, project, me: body.me, threads: body.threads, people: body.people } });
      } catch {
        if (!off) setState({ kind: 'error', message: 'Could not reach the Interactives server', signin: false });
      }
    })();
    return () => {
      off = true;
      comments.stop();
      assetUrls.external = null;
    };
  }, [token]);

  if (state.kind === 'loading') return <div className="center-msg muted">{isDirectLoad() ? 'Sign in with StudyDesk to open this review…' : 'Opening the review…'}</div>;
  if (state.kind === 'error')
    return (
      <div className="review-note">
        <h2>{state.signin ? 'Sign in to review' : 'This review link does not work'}</h2>
        <p>{state.message}.</p>
        {state.signin && (
          <p className="muted small">
            Open the link from StudyDesk, where you are already signed in, or{' '}
            <button type="button" className="link-btn" onClick={() => location.reload()}>
              reload this page
            </button>{' '}
            to sign in with StudyDesk.
          </p>
        )}
      </div>
    );
  return <ReviewPage token={token} data={state.data} />;
}

function ReviewPage({ token, data }: { token: string; data: Loaded }) {
  const { project } = data;
  const c = useComments();
  const [artboardId, setArtboardId] = useState(project.settings.startArtboardId ?? project.artboards[0]?.id ?? '');
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [playing, setPlaying] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(900);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const read = () => setRoom(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const artboard = project.artboards.find((a) => a.id === artboardId) ?? project.artboards[0];
  const scale = artboard ? (zoom === 'fit' ? Math.min(1.5, Math.max(0.1, (room - 64) / artboard.width)) : zoom) : 1;

  const jump = useCallback(
    (t: Thread) => {
      if (project.artboards.some((a) => a.id === t.anchor.artboardId)) setArtboardId(t.anchor.artboardId);
      comments.open(t.id);
      requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-pin="${t.id}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })));
    },
    [project],
  );
  // C and Escape, as in the editor (a click on the artboard already places a pin; Escape puts it away)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') {
        if (playing) setPlaying(false);
        else {
          comments.startDraft(null);
          comments.open(null);
        }
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [playing]);

  const me = c.me;
  return (
    <div className="review-page">
      <header className="review-head">
        <img src="./favicon.svg" alt="" width={22} height={22} />
        <h1 title={data.name}>{data.name}</h1>
        <span className="badge" title="You can look at this project and leave comments. You cannot change it">
          Review
        </span>
        {project.artboards.length > 1 && (
          <select value={artboard?.id ?? ''} onChange={(e) => setArtboardId(e.target.value)} aria-label="Artboard" title="Which artboard to look at">
            {project.artboards.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <div className="seg" role="group" aria-label="Zoom">
          <button type="button" className={`seg-btn${zoom === 'fit' ? ' on' : ''}`} onClick={() => setZoom('fit')} title="Fit the artboard to the window">
            Fit
          </button>
          <button type="button" className={`seg-btn${zoom === 1 ? ' on' : ''}`} onClick={() => setZoom(1)} title="Actual size">
            100%
          </button>
        </div>
        <span className="spacer" />
        <span className="muted small" title="Your comments carry your StudyDesk name">
          {me?.username ? `Commenting as ${me.name}` : 'Not signed in'}
        </span>
        <button type="button" className="btn" onClick={() => setPlaying(true)} title="Play the project the way a learner would (comments are not shown while it plays)">
          <Icons.play width={13} /> Play
        </button>
      </header>
      <div className="review-body">
        <div className="review-stage" ref={stage}>
          {artboard ? (
            <ReviewBoard project={project} artboard={artboard} scale={scale} />
          ) : (
            <p className="muted review-note">This project has no artboards.</p>
          )}
          <p className="review-hint muted small">Click anywhere on the artboard to leave a comment there.</p>
        </div>
        <aside className="review-side">
          <CommentsPanel project={project} onJump={jump} />
        </aside>
      </div>
      {playing && <ReviewPlay token={token} project={project} startArtboardId={artboard?.id} onClose={() => setPlaying(false)} />}
    </div>
  );
}

/** One artboard as a still, with the pins over it and a click to leave a comment. */
function ReviewBoard({ project, artboard, scale }: { project: Project; artboard: Artboard; scale: number }) {
  const c = useComments();
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  useLayoutEffect(() => {
    const r = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve });
    renderer.current = r;
    host.current!.appendChild(r.root);
    return () => {
      r.destroy();
      renderer.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const vars = previewScope(project, artboard);
    r.render(artboard, prepareNodes(withMaster(project.artboards, artboard), { vars }), { vars });
  }, [project, artboard]);

  const place = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.cm-card, [data-pin]')) return;
    const rect = board.current!.getBoundingClientRect();
    const where = anchorAt(project, artboard.id, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
    if (where) comments.startDraft(where);
  };

  const here = (a: Anchor) => a.artboardId === artboard.id;
  const shown = comments.visible().filter((t) => here(t.anchor) && (c.showPins || t.id === c.openId));
  const open = comments.thread(c.openId);
  const cardAt = (x: number, y: number) => {
    const sx = x * scale;
    const sy = y * scale;
    return { left: sx + 36 + CARD_W > artboard.width * scale + 60 ? Math.max(0, sx - 10 - CARD_W) : sx + 36, top: Math.max(0, sy - 32), width: CARD_W };
  };
  const openPlace = open ? pinPlace(project, open) : null;

  return (
    <div className="review-scroll">
      <div ref={board} className="review-board placing" style={{ width: artboard.width * scale, height: artboard.height * scale }} onClick={place}>
        <div ref={host} className="artboard-host" style={{ width: artboard.width, height: artboard.height, transform: `scale(${scale})` }} />
        <div className="review-pins">
          {shown.map((t) => {
            const p = pinPlace(project, t);
            return <Pin key={t.id} thread={t} detached={p.detached} selected={c.openId === t.id} mine={!!c.me?.username && t.assignee?.username === c.me.username} style={{ left: p.x * scale, top: p.y * scale }} onClick={(e) => (e.stopPropagation(), comments.open(c.openId === t.id ? null : t.id))} />;
          })}
          {c.draft && here(c.draft.anchor) && (
            <>
              <span className="cm-pin draft" style={{ left: c.draft.anchor.x * scale, top: c.draft.anchor.y * scale }} aria-hidden="true">
                +
              </span>
              <div className="cm-card" style={cardAt(c.draft.anchor.x, c.draft.anchor.y)} onClick={(e) => e.stopPropagation()}>
                <DraftCard where={c.draft.context.layer ? `${c.draft.context.artboard} › ${c.draft.context.layer}` : c.draft.context.artboard} onClose={() => comments.startDraft(null)} />
              </div>
            </>
          )}
          {open && openPlace && !openPlace.missing && openPlace.artboardId === artboard.id && (
            <div className="cm-card" style={cardAt(openPlace.x, openPlace.y)} onClick={(e) => e.stopPropagation()}>
              <ThreadCard thread={open} where={placeLabel(project, open)} onClose={() => comments.open(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The real thing, in a sandbox like a share link's: the page built from the project, with its assets fetched through the link. */
function ReviewPlay({ token, project, startArtboardId, onClose }: { token: string; project: Project; startArtboardId?: string; onClose: () => void }) {
  const progressHost = useNoProgressHost();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bytesFor = useMemo(
    () => async (a: { id: string; src?: string }) => {
      if (a.src?.startsWith('data:')) return new Uint8Array(await (await fetch(a.src)).arrayBuffer());
      const res = await fetch(new URL(`review/${encodeURIComponent(token)}/assets/${encodeURIComponent(a.id)}`, document.baseURI), { credentials: 'same-origin' });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    [token],
  );
  useEffect(() => {
    let live = true;
    standaloneHtml(project, { startArtboardId, bytesFor: bytesFor as never }).then(
      (h) => live && setHtml(h),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [project, startArtboardId, bytesFor]);
  return (
    <div className="review-play" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      {html ? <iframe ref={progressHost} title="Play" sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" allow="autoplay" srcDoc={html} /> : <div className="center-msg muted">{error ? `Could not build it: ${error}` : 'Building…'}</div>}
      <button type="button" className="btn review-play-close" onClick={onClose} title="Back to the comments (Esc)">
        Close
      </button>
    </div>
  );
}
