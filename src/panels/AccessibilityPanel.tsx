import { track } from '../lib/analytics';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { store, useEditor } from '../store/store';
import { assetUrls } from '../lib/assets';
import { download, fileSafe } from '../lib/export';
import { SplitColumns } from '../components/SplitColumns';
import { checkAccessibility, summarise } from '../lib/a11y/checks';
import { applyFix, fixValues } from '../lib/a11y/fixes';
import { imageColoursFrom, loadGrids, type ImageGrid } from '../lib/a11y/images';
import { canvasTextMeasure } from '../lib/a11y/measure';
import { reportCsv, reportHtml, type ReviewedMap } from '../lib/a11y/report';
import { loadReviewed, toggleReviewed } from '../lib/a11y/reviewed';
import type { A11yReport, Finding, Fix, Severity } from '../lib/a11y/types';
import type { Project } from 'interactives-player';
import { SectionBlurb } from '../components/SectionBlurb';

const SEVERITY: { id: Severity; label: string; plural: string; tip: string }[] = [
  { id: 'issue', label: 'Problem', plural: 'problems', tip: 'A check found a problem' },
  { id: 'warning', label: 'Probable', plural: 'probable', tip: 'Probably a problem: a person decides' },
  { id: 'review', label: 'Look', plural: 'to look at', tip: 'The checker could not tell (a photo behind text, a video, what a script does): a person has to look' },
];

/** Move to what a finding is about: select its layer, or open its artboard. */
function go(f: Finding): void {
  const st = store();
  if (f.nodeId && f.artboardId) st.select([f.nodeId], { artboardId: f.artboardId });
  else if (f.artboardId) st.set({ activeArtboardId: f.artboardId, selection: [], artboardSelected: true });
}

function applyOne(f: Finding, typed?: string): void {
  if (!f.fix) return;
  if (!fixValues(f.fix, typed)) {
    store().toast('Type the text first', 'error');
    return;
  }
  const fix = f.fix;
  track('feature', 'a11y-fix', { thing: f.check, detail: { severity: f.severity } });
  const mark = store().historyMark();
  store().update((d) => void applyFix(d as Project, fix, typed));
  store().toastUndo(`${f.fix.label}: done.`, mark);
}

/** Every fix that needs no typing, as one undo step. */
function applyQuick(list: Finding[]): void {
  const fixes = list.map((f) => f.fix).filter((x): x is Fix => !!x && !x.input);
  if (!fixes.length) return;
  track('feature', 'a11y-fix-all', { sum: { fixes: fixes.length } });
  for (const f of list) if (f.fix && !f.fix.input) track('feature', 'a11y-fix', { thing: f.check, detail: { severity: f.severity, bulk: true } });
  const mark = store().historyMark();
  store().update((d) => {
    for (const fx of fixes) applyFix(d as Project, fx);
  });
  store().toastUndo(`${fixes.length} fix${fixes.length === 1 ? '' : 'es'} applied.`, mark);
}

/** Lists what automatic accessibility checks found, per artboard, with a plain reason for each and a fix where one is safe. */
export function AccessibilityPanel() {
  const project = useEditor((st) => st.project);
  // The checks walk the whole document: while changes keep coming (typing in a field) they wait for a pause
  const analysed = useDeferredValue(project);
  const [grids, setGrids] = useState<Map<string, ImageGrid>>(new Map());
  const [reviewed, setReviewed] = useState<ReviewedMap>(() => loadReviewed(project.id));
  const [show, setShow] = useState<Set<Severity>>(new Set(['issue', 'warning', 'review']));
  const [showDone, setShowDone] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [assetsRev, setAssetsRev] = useState(assetUrls.version);

  useEffect(() => assetUrls.subscribe(() => setAssetsRev(assetUrls.version)), []);
  useEffect(() => setReviewed(loadReviewed(project.id)), [project.id]);
  // Decode the pictures text may sit on, so contrast over a photo is measured and not just flagged
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void loadGrids(analysed, (id) => assetUrls.resolve(id)).then((g) => live && setGrids(g));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysed.assets, analysed.artboards, assetsRev]);

  const report: A11yReport = useMemo(() => checkAccessibility(analysed, { images: imageColoursFrom(grids), measure: canvasTextMeasure }), [analysed, grids]);
  const done = useMemo(() => new Set(Object.keys(reviewed)), [reviewed]);
  const counts = summarise(report.findings, done);
  const multi = project.artboards.length > 1;

  const visible = report.findings.filter((f) => show.has(f.severity) && (showDone || !done.has(f.id)));
  const active = report.findings.find((f) => f.id === activeId) ?? visible[0];
  const quick = visible.filter((f) => f.fix && !f.fix.input && !done.has(f.id));

  const groups = [...report.artboards.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null as string | null, name: 'Whole project' }]
    .map((g) => ({ ...g, list: visible.filter((f) => f.artboardId === g.id) }))
    .filter((g) => g.list.length);

  const toggle = (s: Severity) => {
    const next = new Set(show);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setShow(next);
  };

  const exportHtml = () => {
    const html = reportHtml(checkAccessibility(project, { images: imageColoursFrom(grids), measure: canvasTextMeasure }), reviewed);
    download(new Blob([html], { type: 'text/html' }), `${fileSafe(project.name)}-accessibility-report.html`);
  };
  const exportCsv = () => download(new Blob([reportCsv(report, reviewed)], { type: 'text/csv' }), `${fileSafe(project.name)}-accessibility-findings.csv`);

  const total = report.findings.length;

  return (
    <div className="a11y">
      <div className="a11y-bar">
        {SEVERITY.map((s) => (
          <button key={s.id} type="button" className={`a11y-chip ${s.id}${show.has(s.id) ? ' on' : ''}`} aria-pressed={show.has(s.id)} title={`${s.tip}. Click to ${show.has(s.id) ? 'hide' : 'show'} these`} onClick={() => toggle(s.id)}>
            <span className="a11y-count">{counts[s.id]}</span> {s.plural}
          </button>
        ))}
        <label className="usage-only" title="Show the findings you have marked reviewed too">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Reviewed ({counts.reviewed})
        </label>
        <div className="spacer" />
        <span className="muted small a11y-note" title="These are the problems the automatic checks could find. They cannot prove the project meets WCAG: some things need a person, and the report lists what was not checked.">
          Checks found, not a compliance result
        </span>
        <button className="btn small-btn" disabled={!quick.length} title={quick.length ? `Apply the ${quick.length} fix${quick.length === 1 ? '' : 'es'} that need no typing, as one undo step` : 'No fixes that need no typing are listed'} onClick={() => applyQuick(quick)}>
          Apply quick fixes{quick.length ? ` (${quick.length})` : ''}
        </button>
        <button className="btn small-btn" title="Download a printable report for sign-off: every finding, why it matters, what was not checked, and a sign-off box" onClick={exportHtml}>
          Export report
        </button>
        <button className="btn small-btn" title="Download the findings as a spreadsheet (CSV)" onClick={exportCsv}>
          CSV
        </button>
      </div>
      <SplitColumns id="a11y" columns={[{ width: 380, min: 220, max: 700 }, 'flex']} className="usage-body">
        <div className="a11y-list" role="list" aria-label="Accessibility findings">
          {!groups.length && (
            <div className="panel-empty">
              <p>{total ? 'Nothing matches the filters.' : 'The checks found nothing to look at.'}</p>
              <SectionBlurb text="That is not the same as accessible: a person still has to check some things." name="what the checks cannot see" help={['accessibility-checker', 'what-it-cannot-see']} />
            </div>
          )}
          {groups.map((g) => (
            <div key={g.id ?? 'project'} className="a11y-group">
              <div className="a11y-group-head" title={g.id ? `Findings on the artboard ${g.name}` : 'Findings that belong to the whole project'}>
                {g.name}
                <span className="badge">{g.list.length}</span>
              </div>
              {g.list.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="listitem"
                  className={`a11y-row ${f.severity}${f.id === active?.id ? ' active' : ''}${done.has(f.id) ? ' done' : ''}`}
                  title={f.nodeId ? `${f.title}: select ${f.nodeName} on the canvas` : f.title}
                  onClick={() => {
                    setActiveId(f.id);
                    go(f);
                  }}
                >
                  <span className={`a11y-dot ${f.severity}`} aria-label={SEVERITY.find((s) => s.id === f.severity)!.label} />
                  <span className="a11y-row-text" title={`${f.title}${f.nodeName ? ` · ${f.nodeName}` : ''}`}>
                    <strong>{f.title}</strong>
                    {f.nodeName && <span className="muted"> · {f.nodeName}</span>}
                  </span>
                  {done.has(f.id) && <span className="badge">reviewed</span>}
                  {f.fix && !done.has(f.id) && <span className="a11y-fixable" title="A fix is offered">fix</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="usage-detail">
          {!active ? (
            <div className="panel-empty">
              <p>Pick a finding to see why it matters and what to do.</p>
            </div>
          ) : (
            <Detail
              f={active}
              info={report.checks.find((c) => c.id === active.check)!}
              multi={multi}
              isDone={done.has(active.id)}
              typed={typed[active.id] ?? active.fix?.input?.value ?? ''}
              setTyped={(v) => setTyped({ ...typed, [active.id]: v })}
              onReview={() => setReviewed(toggleReviewed(project.id, active.id))}
            />
          )}
        </div>
      </SplitColumns>
    </div>
  );
}

function Detail({ f, info, multi, isDone, typed, setTyped, onReview }: { f: Finding; info: A11yReport['checks'][number]; multi: boolean; isDone: boolean; typed: string; setTyped: (v: string) => void; onReview: () => void }) {
  const sev = SEVERITY.find((s) => s.id === f.severity)!;
  return (
    <>
      <div className="usage-head">
        <span className={`a11y-dot ${f.severity}`} aria-hidden="true" />
        <strong>{f.title}</strong>
        <span className="muted">{sev.label}</span>
        {f.artboardName && multi && <span className="muted"> · {f.artboardName}</span>}
        <div className="spacer" />
        {f.nodeId && (
          <button className="btn small-btn" title={`Select ${f.nodeName} on the canvas`} onClick={() => go(f)}>
            Select layer
          </button>
        )}
      </div>
      <p className="a11y-what">{f.detail}</p>
      <div className="field-label block">Why it matters</div>
      <p className="a11y-why">{info.why}</p>
      <div className="field-label block">What to do</div>
      <p className="a11y-why">{info.how}</p>
      <div className="muted small a11y-wcag" title="The success criteria of the Web Content Accessibility Guidelines (WCAG 2.2) this speaks to">
        {info.wcag}
      </div>
      <div className="a11y-actions">
        {f.fix?.input && (
          <label className="a11y-input">
            <span>{f.fix.input.label}</span>
            <input
              type="text"
              value={typed}
              placeholder={f.fix.input.placeholder}
              title={`${f.fix.input.label}. Press Enter to apply`}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyOne(f, typed);
              }}
            />
          </label>
        )}
        {f.fix && (
          <button className="btn primary" title="Change the project. One undo step takes it back" onClick={() => applyOne(f, typed)}>
            {f.fix.input ? 'Apply' : f.fix.label}
          </button>
        )}
        {!f.fix && !f.readOnly && <span className="muted small">No safe automatic fix: this one needs a decision.</span>}
        {f.readOnly && <span className="muted small">This artboard comes from a library and is read-only here. Detach it to fix this.</span>}
        <div className="spacer" />
        <button
          className="btn small-btn"
          aria-pressed={isDone}
          title={isDone ? 'Put it back on the list' : f.severity === 'review' || f.check === 'description' ? 'You have looked and it is fine (for example, the picture is decoration). It stays in the report, marked reviewed, and is left out of the counts' : 'Leave it out of the counts and mark it reviewed in the report'}
          onClick={onReview}
        >
          {isDone ? 'Undo reviewed' : f.check === 'description' ? 'Decorative / reviewed' : 'Mark reviewed'}
        </button>
      </div>
    </>
  );
}
