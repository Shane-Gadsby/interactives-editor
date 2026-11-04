import { useEffect, useState } from 'react';
import { getUsageReport, session, type EditorFault, type PlayerFault, type UsageReport, type UsageRow } from './lib/db';

/**
 * Usage and errors, for the people who make the product (power users; the server checks too). What the editor records about
 * its own use and its faults, and how published projects ran, counted from the suite's analytics. Counts and scrubbed fault
 * text only: nothing here is a project's content, and nobody's projects are listed.
 */
const DAYS = [1, 7, 30, 90, 365];

const hm = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 360) / 10}h`;
};
const when = (t: number) => (t ? new Date(t).toLocaleString() : '');

function Table({ head, rows, empty = 'Nothing yet' }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <table className="usage-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={i ? 'num' : ''}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={j ? 'num' : ''}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const useRows = (rows: UsageRow[], limit = 12) => rows.slice(0, limit).map((r) => [r.key, r.uses, r.users]);

export function UsagePage() {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'editor' | 'errors' | 'published'>('editor');

  useEffect(() => {
    document.title = 'Usage and errors · Interactives';
    void session().then(
      (s) => setAllowed(!!s.power),
      () => setAllowed(false),
    );
  }, []);
  useEffect(() => {
    if (allowed !== true) return;
    setReport(null);
    setError(null);
    getUsageReport(days).then(setReport, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [days, allowed]);

  const e = report?.editor;
  const p = report?.player;
  return (
    <div className="home usage-page">
      <header className="home-head">
        <a className="brand" href="#/">
          Interactives
        </a>
        <span className="muted">Usage and errors</span>
        <div className="home-actions">
          <label className="muted small">
            Last{' '}
            <select value={days} onChange={(ev) => setDays(Number(ev.target.value))}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? '24 hours' : `${d} days`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {allowed === false && <div className="error-banner">Usage and errors are for power users (press F9 on the projects page first).</div>}
      {error && allowed !== false && <div className="error-banner">{error}</div>}
      {!report && !error && allowed === true && <p className="muted usage-pad">Counting…</p>}
      {report && e && p && (
        <div className="usage-body">
          <p className="muted small">
            What the editor records about its own use (nothing typed, no names, no file names) and how published projects ran. Rows are added up before they are sent, so a count is uses, not clicks.
            {report.truncated ? ' This much data was cut short: pick fewer days.' : ''} Counted {when(report.generatedAt)}.
          </p>
          <div className="usage-tabs" role="tablist">
            {(['editor', 'errors', 'published'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'editor' ? 'Editor use' : t === 'errors' ? `Editor errors (${e.faultCount})` : `Published projects (${p.faults.length})`}
              </button>
            ))}
          </div>

          {tab === 'editor' && (
            <>
              <div className="ins-values usage-tiles">
                <span className="ins-value">
                  <b>{e.users}</b> people
                </span>
                <span className="ins-value">
                  <b>{e.visits}</b> visits
                </span>
                <span className="ins-value">
                  <b>{hm(e.activeMs)}</b> active in the editor
                </span>
                <span className="ins-value">
                  <b>{e.rows}</b> rows
                </span>
              </div>
              <div className="ins-grid">
                <section className="ins-card">
                  <h4>Funnel</h4>
                  <p className="muted small">People who got as far as each step</p>
                  {e.funnel.map((s) => (
                    <div className="ins-bar" key={s.label}>
                      <span className="ins-bar-label">{s.label}</span>
                      <span className="ins-bar-track">
                        <span className="ins-bar-fill" style={{ width: `${e.funnel[0].people ? (100 * s.people) / e.funnel[0].people : 0}%` }} />
                      </span>
                      <span className="ins-bar-text">{s.people}</span>
                    </div>
                  ))}
                </section>
                <section className="ins-card">
                  <h4>Tools</h4>
                  <Table head={['Tool', 'Uses', 'People', 'Time']} rows={e.tools.slice(0, 16).map((t) => [t.tool, t.uses, t.users, hm(t.ms)])} />
                </section>
                <section className="ins-card">
                  <h4>Panels</h4>
                  <Table head={['Panel', 'Opens', 'People', 'Time']} rows={e.panels.slice(0, 16).map((t) => [t.panel, t.opens, t.users, hm(t.ms)])} />
                </section>
                <section className="ins-card">
                  <h4>Features used</h4>
                  <Table head={['Feature', 'Uses', 'People']} rows={useRows(e.features, 20)} />
                </section>
                <section className="ins-card">
                  <h4>Properties changed</h4>
                  <Table head={['Property', 'Changes', 'People']} rows={useRows(e.inspector, 20)} />
                </section>
                <section className="ins-card">
                  <h4>Layers added</h4>
                  <Table head={['Kind', 'Added', 'People']} rows={useRows(e.nodes, 20)} />
                </section>
                <section className="ins-card">
                  <h4>Imports</h4>
                  <Table head={['Format', 'Worked', 'Failed', 'People']} rows={e.imports.map((i) => [i.format, i.ok, i.failed, i.users])} />
                </section>
                <section className="ins-card">
                  <h4>Exports</h4>
                  <Table head={['File', 'Downloads', 'People']} rows={useRows(e.exports)} />
                </section>
                <section className="ins-card">
                  <h4>Help</h4>
                  <p className="muted small">
                    {e.help.searches} searches, {e.help.notFound} found nothing
                  </p>
                  <Table head={['Topic', 'Opened', 'People']} rows={useRows(e.help.topics, 15)} />
                </section>
                <section className="ins-card">
                  <h4>Document actions</h4>
                  <Table head={['Action', 'Times', 'People']} rows={useRows([...e.doc, ...e.history], 20)} />
                </section>
                <section className="ins-card">
                  <h4>Live editing</h4>
                  <Table head={['What', 'Times', 'People']} rows={useRows(e.live)} />
                </section>
                <section className="ins-card">
                  <h4>Server calls</h4>
                  <Table head={['Route', 'Calls', 'People']} rows={useRows(e.api, 20)} />
                </section>
                <section className="ins-card">
                  <h4>Builds and browsers</h4>
                  <Table head={['Build', 'Rows']} rows={e.builds.map((b) => [b.build, b.rows])} />
                  <Table head={['Browser', 'Visits']} rows={e.browsers.map((b) => [b.browser, b.visits])} />
                </section>
              </div>
            </>
          )}

          {tab === 'errors' && <Faults list={e.faults} />}

          {tab === 'published' && (
            <>
              <div className="ins-values usage-tiles">
                <span className="ins-value">
                  <b>{p.pageLoads}</b> page loads reporting
                </span>
                <span className="ins-value">
                  <b>{p.loads.p50}</b> ms first frame (median)
                </span>
                <span className="ins-value">
                  <b>{p.loads.p90}</b> ms (90th)
                </span>
                <span className="ins-value">
                  <b>{p.loads.n}</b> loads timed
                </span>
              </div>
              <div className="ins-grid">
                <section className="ins-card">
                  <h4>By kind</h4>
                  <Table head={['Kind', 'Rows']} rows={p.byKind.map((k) => [k.kind, k.rows])} />
                </section>
                <section className="ins-card">
                  <h4>Player versions</h4>
                  <Table head={['Version', 'Rows']} rows={p.versions.map((k) => [k.version, k.rows])} />
                </section>
                <section className="ins-card">
                  <h4>Projects with the most faults</h4>
                  <Table head={['Project id', 'Faults', 'Loads']} rows={p.projects.map((k) => [k.project, k.faults, k.loads])} />
                </section>
              </div>
              <PlayerFaults list={p.faults} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Faults({ list }: { list: EditorFault[] }) {
  if (!list.length) return <p className="muted usage-pad">No faults in this time. That is good news.</p>;
  return (
    <table className="usage-table faults">
      <thead>
        <tr>
          <th>Last seen</th>
          <th>Kind</th>
          <th>Where</th>
          <th>What</th>
          <th className="num">Count</th>
          <th className="num">People</th>
          <th className="num">Visits</th>
          <th>Builds</th>
          <th>Fingerprint</th>
        </tr>
      </thead>
      <tbody>
        {list.map((f) => (
          <tr key={f.fp}>
            <td>{when(f.last)}</td>
            <td>{f.kind}</td>
            <td>{f.where || ''}</td>
            <td title={f.frame}>
              {f.cls}: {f.msg}
              {f.status ? ` (${f.status})` : ''}
            </td>
            <td className="num">{f.count}</td>
            <td className="num">{f.users}</td>
            <td className="num">{f.visits}</td>
            <td>{f.builds.join(', ')}</td>
            <td className="mono">{f.fp}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayerFaults({ list }: { list: PlayerFault[] }) {
  if (!list.length) return <p className="muted usage-pad">No faults from published projects in this time.</p>;
  return (
    <table className="usage-table faults">
      <thead>
        <tr>
          <th>Last seen</th>
          <th>Kind</th>
          <th>Where</th>
          <th>What</th>
          <th className="num">Count</th>
          <th className="num">Page loads</th>
          <th className="num">Projects</th>
          <th>Versions</th>
          <th>Fingerprint</th>
        </tr>
      </thead>
      <tbody>
        {list.map((f) => (
          <tr key={`${f.kind}|${f.fp}|${f.where}`}>
            <td>{when(f.last)}</td>
            <td>{f.kind}</td>
            <td>{f.where}</td>
            <td>{f.msg}</td>
            <td className="num">{f.count}</td>
            <td className="num">{f.runs}</td>
            <td className="num">{f.projects}</td>
            <td>{f.versions.join(', ')}</td>
            <td className="mono">{f.fp}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
