import { useEffect, useMemo, useState } from 'react';
import { deleteProject, getAdminProjects, getAudit, session, stopShareFor, type AdminProject, type AuditEvent } from './lib/db';
import { confirmDialog } from './components/dialogs';
import { track } from './lib/analytics';

/**
 * Admin, for power users (the server checks too): every project in one table with its owner, size, links, library and
 * learners, a couple of bulk actions that go through the ordinary routes (so the bin and the audit log apply), and the
 * audit log of governance events.
 */
type SortKey = 'updated' | 'name' | 'owner' | 'size' | 'learners';

const kb = (n: number | null) => (n === null ? '–' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const EVENT_LABEL: Record<string, string> = {
  'share-on': 'Share link turned on',
  'share-updated': 'Share link updated',
  'share-reverted': 'Share link reverted',
  'share-off': 'Share link turned off',
  'review-on': 'Review link turned on',
  'review-updated': 'Review link changed',
  'review-off': 'Review link turned off',
  'collaborator-added': 'Collaborator added',
  'collaborator-removed': 'Collaborator removed',
  'results-cleared': 'Results cleared',
  'project-binned': 'Moved to the Bin',
  'project-restored': 'Restored from the Bin',
  'project-purged': 'Deleted for good',
  'owner-changed': 'Owner changed',
};

export function sortProjects(rows: AdminProject[], key: SortKey): AdminProject[] {
  const size = (r: AdminProject) => (r.docBytes ?? 0) + r.fileBytes;
  const by: Record<SortKey, (a: AdminProject, b: AdminProject) => number> = {
    updated: (a, b) => b.updated.localeCompare(a.updated),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    owner: (a, b) => (a.owner?.name ?? a.owner?.username ?? '').localeCompare(b.owner?.name ?? b.owner?.username ?? ''),
    size: (a, b) => size(b) - size(a),
    learners: (a, b) => b.learners - a.learners,
  };
  return [...rows].sort(by[key]);
}

export function filterProjects(rows: AdminProject[], q: string, only: 'all' | 'shared' | 'learners' | 'library'): AdminProject[] {
  const t = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (only === 'shared' && !r.share) return false;
    if (only === 'learners' && !r.learners) return false;
    if (only === 'library' && !r.library) return false;
    if (!t) return true;
    return r.name.toLowerCase().includes(t) || (r.owner?.username ?? '').toLowerCase().includes(t) || (r.owner?.name ?? '').toLowerCase().includes(t) || r.id === q.trim();
  });
}

export function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'projects' | 'audit'>('projects');
  const [data, setData] = useState<{ projects: AdminProject[]; bin: number; generatedAt: string } | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'shared' | 'learners' | 'library'>('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [auditProject, setAuditProject] = useState('');

  useEffect(() => {
    document.title = 'Admin · Interactives';
    void session().then(
      (s) => setAllowed(!!s.power),
      () => setAllowed(false),
    );
  }, []);
  const load = () => {
    setError(null);
    getAdminProjects().then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    if (allowed) load();
  }, [allowed]);
  useEffect(() => {
    if (!allowed || tab !== 'audit') return;
    setAudit(null);
    getAudit({ project: auditProject || undefined, limit: 300 }).then(setAudit, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [allowed, tab, auditProject]);

  const rows = useMemo(() => (data ? sortProjects(filterProjects(data.projects, q, only), sort) : []), [data, q, only, sort]);
  const totals = useMemo(() => {
    const p = data?.projects ?? [];
    return { projects: p.length, shared: p.filter((r) => r.share).length, learners: p.reduce((t, r) => t + r.learners, 0), bytes: p.reduce((t, r) => t + (r.docBytes ?? 0) + r.fileBytes, 0) };
  }, [data]);
  const picked = rows.filter((r) => checked.has(r.id));

  const bulk = async (what: 'bin' | 'unshare') => {
    const list = what === 'unshare' ? picked.filter((r) => r.share) : picked;
    if (!list.length) return;
    const names = list.slice(0, 8).map((r) => `• ${r.name} (${r.owner?.name ?? r.owner?.username ?? 'no owner'})`).join('\n') + (list.length > 8 ? `\n…and ${list.length - 8} more` : '');
    const learnersHit = list.reduce((t, r) => t + r.learners, 0);
    const ok = await confirmDialog({
      title: what === 'bin' ? 'Move to the Bin' : 'Turn off share links',
      message:
        what === 'bin'
          ? `Move ${list.length} project${list.length === 1 ? '' : 's'} to the Bin? Their owners can restore them for 30 days.\n${names}${learnersHit ? `\n\n${learnersHit} learner records belong to these projects.` : ''}`
          : `Turn off the share link of ${list.length} project${list.length === 1 ? '' : 's'}? Anyone using them, the Link for StudyDesk included, gets a "turned off" page.\n${names}`,
      confirmLabel: what === 'bin' ? 'Move to Bin' : 'Turn off',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    let failed = 0;
    for (const r of list) {
      try {
        if (what === 'bin') await deleteProject(r.id);
        else await stopShareFor(r.id);
      } catch {
        failed++;
      }
    }
    track('feature', `admin-${what}`, { sum: { projects: list.length } });
    setBusy(false);
    setChecked(new Set());
    if (failed) setError(`${failed} of ${list.length} could not be changed.`);
    load();
  };

  const toggle = (id: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="home usage-page admin-page">
      <header className="home-head">
        <a className="brand" href="#/">
          Interactives
        </a>
        <span className="muted">Admin</span>
        <div className="home-actions">
          <a className="btn" href="#/usage">
            Usage and errors
          </a>
        </div>
      </header>
      {allowed === false && <div className="error-banner">Admin is for power users (press F9 on the projects page first).</div>}
      {error && <div className="error-banner">{error}</div>}
      {allowed && (
        <div className="usage-body">
          <div className="usage-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'projects'} className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>
              All projects{data ? ` (${data.projects.length})` : ''}
            </button>
            <button role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
              Audit log
            </button>
          </div>

          {tab === 'projects' && (
            <>
              {!data && !error && <p className="muted">Loading…</p>}
              {data && (
                <>
                  <p className="muted small">
                    {totals.projects} projects, {totals.shared} with a share link on, {totals.learners} learner records, {kb(totals.bytes)} in all. {data.bin} in the Bin. Counted {new Date(data.generatedAt).toLocaleString()}.
                  </p>
                  <div className="admin-tools">
                    <input type="search" placeholder="Search name, owner or id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
                    <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="Show">
                      <option value="all">All</option>
                      <option value="shared">Share link on</option>
                      <option value="learners">With learner records</option>
                      <option value="library">Libraries</option>
                    </select>
                    <label className="muted small">
                      Sort{' '}
                      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                        <option value="updated">Last changed</option>
                        <option value="name">Name</option>
                        <option value="owner">Owner</option>
                        <option value="size">Size</option>
                        <option value="learners">Learners</option>
                      </select>
                    </label>
                    <span className="muted small">{picked.length ? `${picked.length} ticked` : ''}</span>
                    <button className="btn" disabled={busy || !picked.some((r) => r.share)} onClick={() => void bulk('unshare')} title="Turn off the share links of the ticked projects">
                      Turn off share links
                    </button>
                    <button className="btn danger" disabled={busy || !picked.length} onClick={() => void bulk('bin')} title="Move the ticked projects to the Bin (their owners can restore them for 30 days)">
                      Move to Bin
                    </button>
                  </div>
                  <table className="usage-table admin-table">
                    <thead>
                      <tr>
                        <th>
                          <input type="checkbox" aria-label="Tick every project shown" checked={!!rows.length && rows.every((r) => checked.has(r.id))} onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                        </th>
                        <th>Project</th>
                        <th>Owner</th>
                        <th className="num">Changed</th>
                        <th className="num">Size</th>
                        <th>Links</th>
                        <th className="num">Learners</th>
                        <th className="num">Open comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <input type="checkbox" aria-label={`Tick ${r.name}`} checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                          </td>
                          <td>
                            <a href={`#/p/${r.id}`}>{r.name}</a>
                            {r.library && <span className="tag-n"> library{r.libraryVersion ? ` v${r.libraryVersion}` : ''}</span>}
                            <div className="muted small">{r.id}</div>
                          </td>
                          <td>
                            {r.owner?.name ?? r.owner?.username ?? <span className="muted">no owner</span>}
                            {r.collaborators ? <span className="muted small"> +{r.collaborators}</span> : null}
                          </td>
                          <td className="num">{date(r.updated)}</td>
                          <td className="num" title={`Document ${kb(r.docBytes)}, ${r.files} file${r.files === 1 ? '' : 's'} ${kb(r.fileBytes)}`}>
                            {kb((r.docBytes ?? 0) + r.fileBytes)}
                          </td>
                          <td>
                            {[r.share && `share${r.shareUpdated ? ` (${date(r.shareUpdated)})` : ''}`, r.review && 'review', r.serverMarked && 'server marked'].filter(Boolean).join(', ') || <span className="muted">none</span>}
                          </td>
                          <td className="num">{r.learners || ''}</td>
                          <td className="num">{r.openComments || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && <p className="muted">No projects match.</p>}
                </>
              )}
            </>
          )}

          {tab === 'audit' && (
            <>
              <div className="admin-tools">
                <input type="search" placeholder="A project id, to see only its events" value={auditProject} onChange={(e) => setAuditProject(e.target.value.trim())} aria-label="Project id" />
              </div>
              {!audit && <p className="muted">Loading…</p>}
              {audit && !audit.length && <p className="muted">Nothing recorded yet.</p>}
              {audit && !!audit.length && (
                <table className="usage-table admin-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>What</th>
                      <th>Project</th>
                      <th>Who</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e, i) => (
                      <tr key={i}>
                        <td>{new Date(e.at).toLocaleString()}</td>
                        <td>{EVENT_LABEL[e.event] ?? e.event}</td>
                        <td>{e.project ? <button className="link-btn" onClick={() => setAuditProject(e.project!)}>{e.projectName ?? e.project}</button> : ''}</td>
                        <td>
                          {e.by?.name ?? e.by?.username ?? 'nobody signed in'}
                          {e.power && <span className="muted small"> (power user)</span>}
                        </td>
                        <td className="muted small">{Object.entries(e.detail ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
