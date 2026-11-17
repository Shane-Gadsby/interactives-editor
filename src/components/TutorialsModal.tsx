import { useEffect, useMemo, useState } from 'react';
import { exampleThumbUrl, listExamples, type ExampleInfo } from '../lib/db';
import { usePrefs } from '../lib/prefs';
import { countDone, isDone, setStatus, ticked, type TutorialProgressMap, type TutorialSet } from '../lib/tutorial-progress';
import { openHelp } from '../help/Help';
import { tutorialCatalog } from '../help/lazy';
import type { CatalogItem } from '../help/tutorial-catalog';
import { Badge } from './Badge';
import { Modal } from './ProjectModals';
import { PlayModal, UseModal, type Pick, type Playing } from './TemplatesTab';

/**
 * The Tutorials button on the projects page: every Getting started and Build it tutorial and every Concept as a card, grouped as
 * the help groups them, each with its finished picture, a line about it, how long it takes and where you are. Start opens it in
 * the help; Open the finished example plays the same example the Templates tab lists, and from there you can make your copy.
 * Everything listed comes from the help's own registries (help/tutorial-catalog.ts), so a new tutorial shows up here by itself.
 */
export function TutorialsModal({ folder, folders, open, onClose }: { folder: string | null; folders: string[]; open: (id: string) => void; onClose: () => void }) {
  const cat = tutorialCatalog.use();
  const prefs = usePrefs();
  const badges = prefs.tutorialBadges !== false;
  const progress = prefs.tutorialProgress;
  const [examples, setExamples] = useState<Map<string, ExampleInfo>>(new Map());
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  useEffect(() => {
    let live = true;
    listExamples().then((l) => live && setExamples(new Map(l.map((e) => [e.key, e]))), () => undefined);
    return () => {
      live = false;
    };
  }, []);
  const q = query.trim().toLowerCase();
  const items = useMemo(() => (cat ? cat.CATALOG.filter((c) => !q || `${c.title} ${c.summary}`.toLowerCase().includes(q)) : []), [cat, q]);
  const start = (c: CatalogItem) => {
    onClose();
    openHelp(c.id);
  };
  const group = (name: CatalogItem['group']) => items.filter((c) => c.group === name);
  const tutorials = cat ? cat.CATALOG.filter((c) => c.group !== 'Concepts') : [];

  const card = (c: CatalogItem) => {
    const ex = c.example ? examples.get(c.example) : undefined;
    const done = badges && isDone(progress, c.id);
    const n = badges ? ticked(progress, c.id, c.steps).length : 0;
    return (
      <article key={c.id} className={`tut-card${done ? ' done' : ''}`}>
        {ex && (
          <div className="tut-pic">
            <img src={exampleThumbUrl(ex.key)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
          </div>
        )}
        <div className="tut-body">
          <h4>
            {done && <Badge size={18} label="Finished" />} {c.title}
          </h4>
          <p className="muted small tut-line">{c.summary}</p>
          <p className="muted small tut-meta">
            {[c.level, c.minutes ? `about ${c.minutes} minutes` : '', c.steps.length ? `${c.steps.length} steps` : ''].filter(Boolean).join(' · ')}
            {badges && !done && n > 0 && <strong className="tut-progress"> {n} of {c.steps.length} done</strong>}
            {done && <strong className="tut-progress"> {c.group === 'Concepts' ? 'Read' : 'Finished'}</strong>}
          </p>
        </div>
        <div className="tut-actions">
          <button type="button" className="btn primary" onClick={() => start(c)} title={c.group === 'Concepts' ? 'Read this in the help' : 'Open this tutorial in the help, beside your projects'}>
            {c.group === 'Concepts' ? 'Read' : done ? 'Do it again' : n > 0 ? 'Carry on' : 'Start'}
          </button>
          {ex && (
            <button type="button" className="btn" onClick={() => setPlaying({ kind: 'example', e: ex })} title="Play the finished project. From there you can make your own copy to pull apart">
              Open the finished example
            </button>
          )}
        </div>
      </article>
    );
  };

  const section = (name: CatalogItem['group'], blurb: string) => {
    const list = group(name);
    if (!list.length) return null;
    const levels = name === 'Build it' ? (cat?.LEVELS ?? []).map((l) => [l, list.filter((c) => c.level === l)] as const).filter(([, l]) => l.length) : [['', list] as const];
    return (
      <section key={name} className="tut-group">
        <h3>{name}</h3>
        <p className="muted small">{blurb}</p>
        {levels.map(([level, l]) => (
          <div key={level || name}>
            {level && <h5 className="tut-level">{level}</h5>}
            <div className="tut-grid">{l.map(card)}</div>
          </div>
        ))}
      </section>
    );
  };

  return (
    <>
      <Modal title="Tutorials" help="build-it" onClose={() => !playing && !pick && onClose()} className="tutorials-modal">
        <div className="tut-body-wrap">
          <div className="tut-top">
            <input type="search" className="help-search" placeholder="Search the tutorials…" aria-label="Search the tutorials" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            {badges && cat && <Summary progress={progress} ids={tutorials.map((c) => c.id)} sets={cat.TUTORIAL_SETS} />}
          </div>
          {!cat && <p className="muted">Loading…</p>}
          {cat && !items.length && <p className="muted">Nothing matches “{query}”. Try fewer or different words.</p>}
          {section('Getting started', 'Five short ones, best done in order if you have not used the editor before.')}
          {section('Build it', 'One kind of activity at a time, from a blank project. Each has its finished project to open.')}
          {section('Concepts', 'The ideas people trip over. A few minutes each, and no building.')}
        </div>
      </Modal>
      {playing && <PlayModal playing={playing} onClose={() => setPlaying(null)} onUse={() => (setPick(playing.kind === 'example' ? { kind: 'example', e: playing.e } : playing.pick), setPlaying(null))} />}
      {pick && <UseModal pick={pick} folder={folder} folders={folders} onClose={() => setPick(null)} onMade={(id) => (onClose(), open(id))} />}
    </>
  );
}

/** How far through you are, and a badge for each set, won or still to win. */
function Summary({ progress, ids, sets }: { progress: TutorialProgressMap | undefined; ids: string[]; sets: TutorialSet[] }) {
  const done = countDone(progress, ids);
  return (
    <div className="tut-summary">
      <span className="tut-total" role="status">
        {done} of {ids.length} tutorials finished
      </span>
      <ul className="tut-sets" aria-label="Badges">
        {sets.map((s) => {
          const st = setStatus(progress, s);
          return (
            <li key={s.id} className={st.earned ? 'earned' : ''} title={st.earned ? `${s.name}: badge earned` : `${s.name}: finish all ${st.total} to earn the badge`}>
              <Badge earned={st.earned} size={22} />
              <span>
                {s.name} <span className="muted small">{st.done}/{st.total}</span>
              </span>
              {st.earned && <span className="sr-only"> badge earned</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
