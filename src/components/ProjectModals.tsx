import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer, prepareNodes, type Project } from 'interactives-player';
import { getArtboard } from '../store/doc';
import { store } from '../store/store';
import { getShare, listRevisions, loadRevision, publishShare, restoreRevision, shareUrl, stopShare, type RevisionMeta, type ShareInfo } from '../lib/db';
import { assetUrls } from '../lib/assets';
import { standaloneHtml } from '../lib/export';
import { IconButton } from './ui';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';
import { confirmDialog } from './dialogs';

function Modal({ title, help, onClose, children, className }: { title: string; help?: string; onClose: () => void; children: React.ReactNode; className?: string }) {
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
  useEffect(() => {
    listRevisions(projectId)
      .then((l) => {
        setList(l);
        if (l[0]) setSel(l[0].id);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [projectId]);
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
                <strong>{r.reason}</strong>
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
  useEffect(() => {
    getShare(projectId).then(setShare, (e) => setError(String(e.message ?? e)));
  }, [projectId]);
  const publish = async () => {
    setBusy('Building and uploading…');
    setError(null);
    try {
      setShare(await publishShare(projectId, await standaloneHtml(store().get().project)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    if (!(await confirmDialog({ title: 'Turn off share link', message: 'Turn the share link off? Anyone using it will get a "turned off" page.', confirmLabel: 'Turn off', danger: true }))) return;
    setBusy('Turning off…');
    try {
      await stopShare(projectId);
      setShare(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const url = share ? shareUrl(share.token) : '';
  return (
    <Modal title="Share link" help="export#share-link" onClose={onClose} className="share-modal">
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
            <div className="row">
              <button className="btn primary" disabled={!!busy} onClick={publish} title="Publish the project as it is now to the same link">
                {busy ?? 'Update to the latest version'}
              </button>
              <button className="btn danger" disabled={!!busy} onClick={stop}>
                Turn off link
              </button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
