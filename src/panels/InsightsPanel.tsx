import { useEffect, useMemo, useState } from 'react';
import { store, useEditor } from '../store/store';
import { getInsights, type Insights } from '../lib/db';
import { funnel, heatFor, insightsCsv, questionRows, stepRows } from '../lib/insights';
import { download } from '../lib/export';

const RANGES: { days: number; label: string }[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last year' },
  { days: 0, label: 'All time' },
];

const n = (v: number) => v.toLocaleString();
const pct = (v: number | null) => (v === null ? '–' : `${v}%`);

/** A labelled bar: `value` out of `of`, with the text on the right. */
function Bar({ label, value, of, text, tone, title }: { label: string; value: number; of: number; text: string; tone?: 'ok' | 'bad' | 'plain'; title?: string }) {
  const w = of > 0 ? Math.max(value > 0 ? 1.5 : 0, Math.min(100, (value / of) * 100)) : 0;
  return (
    <div className="ins-bar" title={title}>
      <span className="ins-bar-label">{label}</span>
      <span className="ins-bar-track">
        <span className={`ins-bar-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${w}%` }} />
      </span>
      <span className="ins-bar-text">{text}</span>
    </div>
  );
}

/**
 * Insights: what learners did in this project, as counts. The records come from the project's learner page (the Link for
 * StudyDesk), through the suite's analytics, and are read back here by the server for the owner. Nobody is listed.
 */
export function InsightsPanel() {
  const s = useEditor((st) => ({ project: st.project, activeArtboardId: st.activeArtboardId, heat: st.heat }));
  const projectId = s.project.id;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [heatOn, setHeatOn] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    getInsights(projectId, days).then(
      (d) => {
        setData(d);
        setLoading(false);
      },
      (e) => {
        setError(String(e.message ?? e));
        setLoading(false);
      },
    );
  };
  useEffect(load, [projectId, days]); // eslint-disable-line react-hooks/exhaustive-deps

  // The heat overlay follows the artboard being edited, and goes when this tab closes or the switch is turned off
  useEffect(() => {
    const heat = heatOn && data ? heatFor(data, s.activeArtboardId) : null;
    store().set({ heat: heat ? { artboardId: s.activeArtboardId, cell: heat.cell, cells: heat.cells, max: heat.max } : null });
  }, [heatOn, data, s.activeArtboardId]);
  useEffect(() => () => store().set({ heat: null }), []);

  const view = useMemo(() => (data ? { funnel: funnel(s.project, data), questions: questionRows(s.project, data), steps: stepRows(s.project, data) } : null), [data, s.project]);
  const heatHere = data ? heatFor(data, s.activeArtboardId) : null;
  const activeName = s.project.artboards.find((a) => a.id === s.activeArtboardId)?.name ?? '';

  const exportCsv = () => {
    if (!data) return;
    download(new Blob([insightsCsv(s.project, data)], { type: 'text/csv;charset=utf-8' }), `${(s.project.name || 'project').replace(/[^\w.-]+/g, '-')}-insights.csv`);
  };

  const empty = data && data.records === 0;
  const topFunnel = view?.funnel[0]?.learners ?? 0;
  const answered = view?.questions.reduce((t, q) => t + q.checks, 0) ?? 0;

  return (
    <div className="insights">
      <div className="insights-bar">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} title="How far back to count">
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={load} disabled={loading} title="Count again">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <label className="usage-only" title={heatHere ? `Draw where learners clicked on ${activeName} over the canvas` : `Nobody has clicked on ${activeName || 'this artboard'} in this period`}>
          <input type="checkbox" checked={heatOn} onChange={(e) => setHeatOn(e.target.checked)} disabled={!data} /> Click heat on the canvas
        </label>
        {heatOn && data && !heatHere && <span className="muted small">No clicks recorded on {activeName}.</span>}
        <div className="spacer" />
        <button className="btn" onClick={exportCsv} disabled={!data || !!empty} title="Download the counts as a CSV file (no learner is named in it)">
          Export CSV
        </button>
      </div>
      <div className="insights-body">
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && !data.shared && data.records === 0 && <p className="hint">Records come from learners who open the project from the Link for StudyDesk in Share link. There is no share link on yet.</p>}
        {empty && (
          <p className="muted">
            Nothing recorded {data.days ? `in the last ${data.days} days` : 'yet'}. Learners who open the project from the Link for StudyDesk, signed in to StudyDesk, are counted. A project that switched recording off in Learner records (Project section of the Inspector) records nothing.
          </p>
        )}
        {data && view && !empty && (
          <>
            <div className="result-tiles ins-tiles">
              <div>
                <strong>{n(data.learners)}</strong>
                <span>learner{data.learners === 1 ? '' : 's'}</span>
              </div>
              <div>
                <strong>{n(data.visits)}</strong>
                <span>visit{data.visits === 1 ? '' : 's'}</span>
              </div>
              <div>
                <strong>{n(data.clicks.total)}</strong>
                <span>clicks</span>
              </div>
              <div>
                <strong>{n(answered)}</strong>
                <span>answers checked</span>
              </div>
              <div>
                <strong>{n(data.records)}</strong>
                <span>records</span>
              </div>
            </div>
            {data.truncated && <p className="hint">There are more records than Insights reads at once. These counts cover the most recent ones; choose a shorter period for the whole of it.</p>}
            {data.learners < 5 && <p className="hint">With so few learners a count can be one person. Wait for more before reading anything into it.</p>}
            <div className="ins-grid">
              <section className="ins-card">
                <h4>Artboards reached</h4>
                <p className="muted small">Different learners who saw each artboard, in the project's order. The first is the start.</p>
                {view.funnel.map((r) => (
                  <Bar
                    key={r.id}
                    label={r.name + (r.removed ? ' (removed)' : '')}
                    value={r.learners}
                    of={Math.max(topFunnel, ...view.funnel.map((x) => x.learners))}
                    text={`${n(r.learners)}${r.ofStart !== null ? `  ${r.ofStart}%` : ''}`}
                    title={`${n(r.views)} view${r.views === 1 ? '' : 's'}${r.ofPrevious !== null ? `, ${r.ofPrevious}% of the artboard before it` : ''}`}
                  />
                ))}
              </section>

              {view.steps.map((r) => (
                <section className="ins-card" key={r.artboard}>
                  <h4>Steps reached on {r.name}</h4>
                  {r.steps.map((st) => (
                    <Bar key={st.step} label={`Step ${st.step}`} value={st.learners} of={Math.max(1, ...r.steps.map((x) => x.learners))} text={n(st.learners)} />
                  ))}
                </section>
              ))}

              {view.questions.map((q) => (
                <section className="ins-card" key={q.question}>
                  <h4 title={q.question}>{q.prompt}{q.removed ? ' (removed)' : ''}</h4>
                  <p className="muted small">
                    {q.checks === 0 ? 'Nobody has checked an answer.' : `${n(q.learners)} learner${q.learners === 1 ? '' : 's'}, ${n(q.checks)} check${q.checks === 1 ? '' : 's'}: ${pct(q.rightRate)} right, ${pct(q.firstTryRate)} right first time.`}
                  </p>
                  {q.options.length > 0
                    ? q.options.map((o) => <Bar key={o.id} label={o.text} value={o.chosen} of={Math.max(1, ...q.options.map((x) => x.chosen))} text={n(o.chosen)} tone={o.correct ? 'ok' : 'plain'} title={o.correct ? 'The right answer' : undefined} />)
                    : q.checks > 0 && <p className="muted small">Typed and ordered answers are only counted as right or wrong, what was typed is not kept.</p>}
                </section>
              ))}

              <section className="ins-card">
                <h4>Where learners clicked</h4>
                <p className="muted small">
                  {n(data.clicks.total)} click{data.clicks.total === 1 ? '' : 's'}, {n(data.clicks.onLayers)} on a button, link or layer with a click. Turn on Click heat to see where, on the artboard.
                </p>
                {data.clicks.layers.slice(0, 12).map((l) => (
                  <Bar key={`${l.artboard}|${l.layer}`} label={l.label || l.layer} value={l.clicks} of={Math.max(1, data.clicks.layers[0]?.clicks ?? 1)} text={`${n(l.clicks)} (${n(l.learners)} learner${l.learners === 1 ? '' : 's'})`} title={s.project.artboards.find((a) => a.id === l.artboard)?.name} />
                ))}
              </section>

              {data.custom.length > 0 && (
                <section className="ins-card">
                  <h4>Your records</h4>
                  <p className="muted small">From Record nodes and ix.record.</p>
                  {data.custom.map((c) => (
                    <div key={c.name} className="ins-custom">
                      <Bar label={c.name} value={c.count} of={Math.max(1, data.custom[0].count)} text={`${n(c.count)} (${n(c.learners)} learner${c.learners === 1 ? '' : 's'})`} />
                      {c.values.length > 0 && (
                        <div className="ins-values">
                          {c.values.map((v) => (
                            <span key={v.value} className="ins-value">
                              {v.value} <b>{n(v.n)}</b>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {data.courses.length > 1 && (
                <section className="ins-card">
                  <h4>Courses</h4>
                  {data.courses.map((c) => (
                    <Bar key={c.course} label={c.course} value={c.learners} of={data.courses[0].learners} text={n(c.learners)} />
                  ))}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
