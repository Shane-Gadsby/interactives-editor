import { track } from '../lib/analytics';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer, prepareNodes, type Project } from 'interactives-player';
import { getArtboard } from '../store/doc';
import { store } from '../store/store';
import { serverMarkedCounts } from '../lib/question-kit';
import { addCollaborator, clearResults, resultsCsv, transferOwner, findPeople, getCollaborators, type Person, removeCollaborator, type CollaboratorList, getResults, getShare, learnerUrl, listRevisions, loadRevision, saveNamedVersion, updateRevision, publishShare, restoreRevision, revertShare, setShareRemix, shareUrl, stopShare, type Results, type RevisionMeta, type ShareInfo } from '../lib/db';
import { assetUrls } from '../lib/assets';
import { download, standaloneHtml, warnInEditor } from '../lib/export';
import { IconButton } from './ui';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';
import { confirmDialog, promptDialog } from './dialogs';
import { inUseWarning } from '../lib/in-use';
import { getReview, putReview, reviewUrl, stopReview, type ReviewLink } from '../lib/comments';

export function Modal({ title, help, onClose, children, className }: { title: string; help?: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className ?? ''}`}>
        <header>
          <strong>{title}</strong>
          {help && <HelpLink topic={help.split('#')[0]} anchor={help.split('#')[1]} />}
          <div className="spacer" />
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 60 * 24 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  return `${d.toLocaleString()} · ${rel}`;
};

/** A still of a project's start artboard, scaled into the box. */
function ProjectThumb({ project }: { project: Project }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ab = getArtboard(project, project.settings.startArtboardId) ?? project.artboards[0];
    el.textContent = '';
    if (!ab) return;
    const r = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve });
    const vars = Object.fromEntries(project.variables.map((v) => [v.name, v.initial]));
    r.render(ab, prepareNodes(ab.children, { vars }), { vars });
    const scale = Math.min(el.clientWidth / ab.width, el.clientHeight / ab.height);
    Object.assign(r.root.style, { position: 'absolute', left: `${(el.clientWidth - ab.width * scale) / 2}px`, top: `${(el.clientHeight - ab.height * scale) / 2}px`, transform: `scale(${scale})`, transformOrigin: '0 0' });
    el.appendChild(r.root);
    return () => r.root.remove();
  }, [project]);
  return <div ref={host} className="revision-thumb" />;
}

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const projectId = store().get().project.id;
  const [list, setList] = useState<RevisionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = (select?: string) =>
    listRevisions(projectId)
      .then((l) => {
        setList(l);
        setSel((cur) => select ?? cur ?? l[0]?.id ?? null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  useEffect(() => {
    void reload();
  }, [projectId]);
  const saveNamed = async () => {
    const name = await promptDialog({ title: 'Save a named version', message: 'Keeps the project as it is now under this name, pinned so it is never cleared out of the history.', label: 'Name', placeholder: 'For example: Sent to the coordinator', confirmLabel: 'Save version' });
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const r = await saveNamedVersion(projectId, name);
      track('feature', 'revision-named');
      await reload(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const patch = async (p: { name?: string | null; pinned?: boolean }) => {
    if (!chosen) return;
    try {
      await updateRevision(projectId, chosen.id, p);
      track('feature', p.pinned !== undefined ? 'revision-pin' : 'revision-rename');
      await reload(chosen.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const rename = async () => {
    if (!chosen) return;
    const name = await promptDialog({ title: 'Name this version', label: 'Name', initial: chosen.name ?? '', placeholder: 'Leave empty to remove the name', confirmLabel: 'Save' });
    if (name === null) return;
    await patch({ name: name.trim() || null });
  };
  useEffect(() => {
    setPreview(null);
    if (sel) loadRevision(projectId, sel).then(setPreview, (e) => setError(String(e.message ?? e)));
  }, [projectId, sel]);
  const chosen = list?.find((r) => r.id === sel);
  const restore = async () => {
    if (!chosen || !(await confirmDialog({ title: 'Restore version', message: `Restore the version from ${new Date(chosen.created).toLocaleString()}? What's there now is saved in the history first, so you can come back to it.`, confirmLabel: 'Restore' }))) return;
    setBusy(true);
    try {
      await (window as unknown as { __ixForceSave?: () => Promise<void> }).__ixForceSave?.().catch(() => undefined);
      await restoreRevision(projectId, chosen.id);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal title="Revision history" help="live-editing#revision-history" onClose={onClose} className="history-modal">
      <div className="history-body">
        <ul className="revision-list">
          {list === null && !error && <li className="muted">Loading…</li>}
          {list?.length === 0 && <li className="muted">No saved revisions yet. One is kept every few minutes while the project changes.</li>}
          {list?.map((r) => (
            <li key={r.id}>
              <button className={r.id === sel ? 'active' : ''} onClick={() => setSel(r.id)}>
                <strong>
                  {r.pinned && <Icons.pin width={12} height={12} aria-label="Pinned" />} {r.name ?? r.reason}
                </strong>
                {r.name && <span className="small muted">{r.reason}</span>}
                <span className="small muted">{when(r.created)}</span>
                {r.by?.name && <span className="small muted">{r.by.name}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="revision-preview">
          {error && <p className="error">{error}</p>}
          {preview ? <ProjectThumb project={preview} /> : sel && !error ? <p className="muted">Loading preview…</p> : null}
          {preview && (
            <p className="small muted">
              {preview.artboards.length} artboard{preview.artboards.length === 1 ? '' : 's'} · {preview.variables.length} variables · start artboard shown
            </p>
          )}
          <div className="row">
            <button className="btn primary" disabled={!chosen || busy} onClick={restore} title="Replace the project with this version (the current one is kept in the history)">
              {busy ? 'Restoring…' : 'Restore this version'}
            </button>
            <button className="btn" disabled={!chosen || busy} onClick={() => void rename()} title="Give this version a name, so it's easy to find">
              {chosen?.name ? 'Rename' : 'Name it'}
            </button>
            <button className="btn" disabled={!chosen || busy} onClick={() => void patch({ pinned: !chosen?.pinned })} title={chosen?.pinned ? 'Let this version be cleared out of the history in time, like the others' : 'Keep this version whatever its age (up to 20 a project)'}>
              {chosen?.pinned ? 'Unpin' : 'Pin'}
            </button>
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void saveNamed()} title="Keep the project as it is now under a name, pinned">
              Save a named version…
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ShareModal({ onClose }: { onClose: () => void }) {
  const projectId = store().get().project.id;
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLearner, setCopiedLearner] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const serverMarked = serverMarkedCounts(store().get().project);
  useEffect(() => {
    getShare(projectId).then(setShare, (e) => setError(String(e.message ?? e)));
  }, [projectId]);
  const publish = async () => {
    setBusy('Building and uploading…');
    setError(null);
    try {
      setShare(await publishShare(projectId, await standaloneHtml(store().get().project, { embedFonts: true, optimise: true, onWarning: warnInEditor })));
      track('feature', 'share-publish');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const revert = async () => {
    const prev = share?.previous;
    if (!prev) return;
    const when = prev.updated ? new Date(prev.updated).toLocaleString() : 'before the last update';
    if (!(await confirmDialog({ title: 'Revert share link', message: `Put back the version published ${when}${prev.by?.name ? ` by ${prev.by.name}` : ''}? Everyone using the link (and the Link for StudyDesk) gets it straight away. The version showing now is kept, so you can switch back the same way.`, confirmLabel: 'Revert' }))) return;
    setBusy('Reverting…');
    try {
      setShare(await revertShare(projectId));
      track('feature', 'share-revert');
      store().toast('The previous version is back on the share link.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    const live = await inUseWarning(projectId, 'unshare');
    if (!(await confirmDialog({ title: 'Turn off share link', message: live ? `Turn the share link off?\n\n${live}` : 'Turn the share link off? Anyone using it will get a "turned off" page.', confirmLabel: 'Turn off', danger: true }))) return;
    setBusy('Turning off…');
    try {
      await stopShare(projectId);
      track('feature', 'share-stop');
      setShare(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const url = share ? shareUrl(share.token) : '';
  return (
    <>
      <Modal title="Share link" help="export#share-link" onClose={() => !resultsOpen && onClose()} className="share-modal">
        <div className="share-body">
          {share === undefined && !error && <p className="muted">Checking…</p>}
          {share === null && (
            <>
              <p>A share link plays this project in the browser, exactly like the exported HTML file. It is a snapshot: update it when you want people to see your latest changes.</p>
              <p className="hint">Anyone who has the link can view the project (not edit it). Links are long and random, so they can't be guessed, and you can turn the link off at any time.</p>
              <button className="btn primary" disabled={!!busy} onClick={publish}>
                {busy ?? 'Create share link'}
              </button>
            </>
          )}
          {share && (
            <>
              <div className="share-url">
                <input readOnly value={url} onFocus={(e) => e.target.select()} />
                <button
                  className="btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a className="btn" href={url} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
              <p className="small muted">Last updated {when(share.updated)}.</p>
              {serverMarked.marked > 0 && (
                <p className="small muted">
                  {serverMarked.marked === 1 ? '1 question is' : `${serverMarked.marked} questions are`} marked on the server: both links serve the project without {serverMarked.marked === 1 ? 'its' : 'their'} right answers, and the score the server works out is the one recorded. Learners need the Link for StudyDesk to have an answer checked. Update the link after changing a question. Files you export and the Preview still carry the answers.
                  {serverMarked.inPage > 0 && ` ${serverMarked.inPage === 1 ? '1 more is' : `${serverMarked.inPage} more are`} set that way but can't be, so ${serverMarked.inPage === 1 ? 'it is' : 'they are'} marked in the page.`}
                </p>
              )}
              <div className="learner-link">
                <strong>Link for StudyDesk</strong>
                <p className="small muted">Use this one in StudyDesk instead, when you want each learner's score, completion and progress kept, and what they do counted for Insights. Learners signed in to StudyDesk resume where they left off; anyone else plays as with the link above.</p>
                <div className="share-url">
                  <input readOnly value={learnerUrl(share.token)} aria-label="Link for StudyDesk" onFocus={(e) => e.target.select()} />
                  <button
                    className="btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(learnerUrl(share.token)).then(() => {
                        setCopiedLearner(true);
                        setTimeout(() => setCopiedLearner(false), 1500);
                      });
                    }}
                  >
                    {copiedLearner ? 'Copied' : 'Copy'}
                  </button>
                  <button className="btn" onClick={() => setResultsOpen(true)} title="Who has played, how they did">
                    Results…
                  </button>
                </div>
              </div>
              <label className="check-row remix-row" title="Signed-in StudyDesk staff who play it from the Link for StudyDesk get a Remix this button, which copies the project into their own projects">
                <input
                  type="checkbox"
                  checked={!!share.remix}
                  disabled={!!busy}
                  onChange={async (e) => {
                    const on = e.target.checked;
                    setBusy('Saving…');
                    setError(null);
                    try {
                      setShare(await setShareRemix(projectId, on));
                      track('feature', 'share-remix', { detail: { on } });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
                <span>
                  <strong>Allow remix</strong>
                  <span className="muted small block"> Staff who open the Link for StudyDesk get a "Remix this" button that copies the project, as it is now, into their own projects. Your project is not changed, and the copy is theirs.</span>
                </span>
              </label>
              <div className="row">
                <button className="btn primary" disabled={!!busy} onClick={publish} title="Publish the project as it is now to the same link">
                  {busy ?? 'Update to the latest version'}
                </button>
                {share.previous && (
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() => void revert()}
                    title={`Put back the version published ${share.previous.updated ? new Date(share.previous.updated).toLocaleString() : 'before'}${share.previous.by?.name ? ` by ${share.previous.by.name}` : ''}. The one showing now is kept, so you can switch back`}
                  >
                    Revert to previous version
                  </button>
                )}
                <button className="btn danger" disabled={!!busy} onClick={stop}>
                  Turn off link
                </button>
              </div>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </Modal>
      {resultsOpen && <ResultsModal onClose={() => setResultsOpen(false)} />}
    </>
  );
}

/**
 * The "Can comment" link: a second link, apart from the share link, that opens the project for looking at and commenting on
 * (still artboards with pins, or play it). It always shows the project as it is now, and can allow guests who give a name.
 */
export function ReviewLinkSection({ projectId }: { projectId: string }) {
  const [link, setLink] = useState<ReviewLink | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    getReview(projectId).then(setLink, (e) => setError(String(e.message ?? e)));
  }, [projectId]);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const url = link ? reviewUrl(link.token) : '';
  return (
    <div className="learner-link review-link">
      <strong>Can comment: review link</strong>
      {link === undefined && !error && <p className="small muted">Checking…</p>}
      {link === null && (
        <>
          <p className="small muted">For subject experts and reviewers. They see the project as it is now, leave notes pinned to a layer or a spot, reply and resolve, and you see them under Comments. The notes stay on the server: they are never part of the project, an export or the share link.</p>
          <button className="btn" disabled={busy} onClick={() => void run(async () => setLink(await putReview(projectId, false)))} title="Create a link that lets signed in StudyDesk users view the project and comment">
            Create review link
          </button>
        </>
      )}
      {link && (
        <>
          <div className="share-url">
            <input readOnly value={url} aria-label="Review link" onFocus={(e) => e.target.select()} />
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
          <label className="check-row" title="Without this, reviewers have to be signed in to StudyDesk and their comments carry their own name. With it, anyone who has the link can comment after giving a display name (limited to a few comments every few minutes)">
            <input type="checkbox" checked={link.guests} disabled={busy} onChange={(e) => void run(async () => setLink(await putReview(projectId, e.target.checked)))} />
            Let people comment without signing in (they give a display name)
          </label>
          <div className="row">
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!(await confirmDialog({ title: 'Turn off review link', message: 'Turn the review link off? Reviewers using it get a "turned off" page. The comments are kept.', confirmLabel: 'Turn off', danger: true }))) return;
                  await stopReview(projectId);
                  setLink(null);
                })
              }
            >
              Turn off review link
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * "Share for review" as a dialog of its own: the Can comment link (create, copy, allow guests, turn off). The Share menu
 * calls openShareForReview() and the open editor shows this; the same section also sits inside the Share link dialog.
 */
export function ShareForReviewModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Share for review" help="comments#the-review-link" onClose={onClose} className="share-modal">
      <div className="share-body">
        <ReviewLinkSection projectId={store().get().project.id} />
      </div>
    </Modal>
  );
}

const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 10) / 10}%`);

/** What this project's learners have done: counts and averages, then the people. Owner only (the server checks). */
export function ResultsModal({ onClose }: { onClose: () => void }) {
  const projectId = store().get().project.id;
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    getResults(projectId).then(setResults, (e) => setError(String(e.message ?? e)));
  };
  useEffect(load, [projectId]);
  const clear = async () => {
    if (!(await confirmDialog({ title: 'Clear results', message: 'Delete every learner record for this project (scores, completion, remembered progress)? Learners start again from nothing. This cannot be undone.', confirmLabel: 'Clear results', danger: true }))) return;
    try {
      await clearResults(projectId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal title="Results" help="results" onClose={onClose} className="results-modal">
      <div className="results-body">
        {!results && !error && <p className="muted">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {results && (
          <>
            {!results.shared && <p className="hint">Results are collected through the project's share link. There is none on yet, so only records from before are shown.</p>}
            {results.records === 0 ? (
              <p className="muted">Nobody has played it with results kept yet. Give learners the Link for StudyDesk from Share link, and sign-in to StudyDesk is what identifies them.</p>
            ) : (
              <>
                <div className="result-tiles">
                  <div>
                    <strong>{results.learners}</strong>
                    <span>learner{results.learners === 1 ? '' : 's'}</span>
                  </div>
                  <div>
                    <strong>{pct(results.completionRate)}</strong>
                    <span>completed ({results.completed})</span>
                  </div>
                  <div>
                    <strong>{pct(results.averageBestPercent)}</strong>
                    <span>average best score</span>
                  </div>
                  <div>
                    <strong>{pct(results.passRate)}</strong>
                    <span>passed ({results.passed})</span>
                  </div>
                  <div>
                    <strong>{results.averageAttempts ?? '–'}</strong>
                    <span>attempts each, on average</span>
                  </div>
                </div>
                {results.courses.length > 1 && (
                  <p className="small muted">
                    {results.courses.map((c) => `${c.course}: ${c.learners} learner${c.learners === 1 ? '' : 's'}, ${c.completed} completed`).join(' · ')}
                  </p>
                )}
                <div className="results-scroll">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Course</th>
                        <th>Status</th>
                        <th title="Best score over every attempt">Best</th>
                        <th title="The most recent reported score">Latest</th>
                        <th>Attempts</th>
                        <th>Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.list.map((r, i) => (
                        <tr key={`${r.username}-${r.course}-${i}`}>
                          <td>{r.name ? `${r.name} (${r.username})` : r.username}</td>
                          <td>{r.course ?? '–'}</td>
                          <td>{r.completed ? (r.passed ? 'Passed' : 'Completed') : 'In progress'}</td>
                          <td>{pct(r.bestPercent)}</td>
                          <td>{pct(r.lastPercent)}</td>
                          <td>{r.attempts}</td>
                          <td>{r.updated ? new Date(r.updated).toLocaleDateString() : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {results.truncated && <p className="small muted">Only the most recent 5000 records were counted.</p>}
              </>
            )}
            <div className="row">
              <button className="btn" onClick={load}>
                Refresh
              </button>
              <button
                className="btn"
                disabled={results.records === 0}
                title="Download every learner's record as a spreadsheet (CSV): username, name, course, completed, passed, attempts, best and last score, last active"
                onClick={() => {
                  track('feature', 'results-csv');
                  resultsCsv(projectId).then(
                    (blob) => download(blob, `${store().get().project.name || 'project'} results.csv`),
                    (e) => setError(e instanceof Error ? e.message : String(e)),
                  );
                }}
              >
                Export CSV
              </button>
              <button
                className="btn danger"
                disabled={results.records === 0 || results.mayClear === false}
                title={results.mayClear === false ? "Only the project's owner can clear its results" : undefined}
                onClick={clear}
              >
                Clear results
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}


/** Invite to collaborate: people who can open and edit this project with you (live), by their StudyDesk username. */
export function InviteModal({ onClose }: { onClose: () => void }) {
  const projectId = store().get().project.id;
  const [data, setData] = useState<CollaboratorList | null>(null);
  const [username, setUsername] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  // Suggestions as you type a name (or an email or username), a moment after typing stops
  useEffect(() => {
    const q = username.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    const t = setTimeout(() => {
      findPeople(q).then(setFound, () => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [username]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getCollaborators(projectId).then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [projectId]);
  const add = async (person?: Person) => {
    const u = person?.username ?? username.trim();
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      const collaborators = await addCollaborator(projectId, u, person?.name ?? '');
      setData((d) => (d ? { ...d, collaborators } : d));
      setUsername('');
      setFound([]);
      store().toast(`${person?.name ?? u} can now open and edit this project.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const makeOwner = async (c: { username: string; name: string | null }) => {
    const who = c.name || c.username;
    if (!(await confirmDialog({ title: 'Transfer ownership', message: `Make ${who} the owner of this project? They can then delete it, clear its results and change who's invited. You stay on as a collaborator. The share link, the Link for StudyDesk and its library don't change.`, confirmLabel: 'Make owner', danger: true }))) return;
    setBusy(true);
    try {
      const r = await transferOwner(projectId, c.username);
      setData((d) => (d ? { ...d, owner: r.owner, collaborators: r.collaborators, canManage: false } : d));
      track('feature', 'transfer-owner');
      store().toast(`${who} is now the owner.`);
      // A power user still manages it; ask the server rather than guess
      getCollaborators(projectId).then(setData, () => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (u: string) => {
    if (!(await confirmDialog({ title: 'Remove collaborator', message: `${u} won't be able to open this project any more. Their changes stay.`, confirmLabel: 'Remove', danger: true }))) return;
    try {
      const collaborators = await removeCollaborator(projectId, u);
      setData((d) => (d ? { ...d, collaborators } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal title="Invite to collaborate" help="live-editing#inviting-people" onClose={onClose} className="share-modal">
      <div className="share-body">
        <p className="muted">People you invite can open this project from their own projects page and edit it with you, live. They can comment and share it too; only you can delete it or change who's invited.</p>
        {data?.canManage !== false && (
          <form
            className="invite-row"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input autoFocus placeholder="Search by name, email or username" aria-label="Find someone to invite" value={username} onChange={(e) => setUsername(e.target.value)} />
            <button className="btn primary" disabled={busy || !username.trim()} title="Invite by the username typed (or pick someone from the list below)">
              Invite
            </button>
          </form>
        )}
        {found.length > 0 && (
          <ul className="invite-found" role="listbox" aria-label="People found">
            {found.map((p) => (
              <li key={p.username}>
                <button type="button" role="option" aria-selected={false} disabled={busy || !!data?.collaborators.some((c) => c.username === p.username)} onClick={() => void add(p)} title={`Invite ${p.name}`}>
                  <span>{p.name}</span>
                  <span className="muted small">
                    {p.username}
                    {p.email ? ` · ${p.email}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="invite-list">
          {data?.owner && (
            <li>
              <span>{data.owner.name || data.owner.username}</span>
              <span className="muted small">{data.owner.username} · owner</span>
            </li>
          )}
          {data?.collaborators.map((c) => (
            <li key={c.username}>
              <span>{c.name || c.username}</span>
              <span className="muted small">{c.username} · can edit</span>
              {data.canManage && (
                <button className="btn small" disabled={busy} title={`Make ${c.name || c.username} the owner. You stay on as a collaborator; the links and StudyDesk embeds don't change`} onClick={() => void makeOwner(c)}>
                  Make owner
                </button>
              )}
              {data.canManage && <IconButton icon={<Icons.trash />} title={`Remove ${c.username}`} onClick={() => void remove(c.username)} />}
            </li>
          ))}
          {data && !data.collaborators.length && <li className="muted small">Nobody else yet.</li>}
        </ul>
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
