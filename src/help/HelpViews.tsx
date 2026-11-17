import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VersionInfo } from '../components/VersionInfo';
import { Markdown } from './markdown';
import { searchHelp, type HelpHit } from './search';
import { noteHelpSearch, track } from '../lib/analytics';
import { GROUPS, TOPICS, getTopic, topicBody } from './topics';
import { Icons } from '../components/icons';
import { setHelpScrollSource } from './Help';
import { usePrefs } from '../lib/prefs';
import { tickStep } from '../lib/tutorial-actions';
import { isDone } from '../lib/tutorial-progress';
import { TUTORIAL_SETS } from './tutorial-catalog';
import { TutorialFoot, TutorialHead, guideFor, trackedFor, useEditorOpen } from './TutorialBar';
import { startGuide } from '../lib/tutorial-guide';
import { targetsOf } from '../lib/tutorial-checks';
import { hideTour, showMe } from '../lib/tour';

// The help's own screens: the drawer, quick search and the full page. Help.tsx holds the state and shortcuts and loads this
// when something first asks to show help, so the topics (about 650 kB of prose) stay out of the editor's first download.

//The branded starters topic lists the starters when it is read; they come in a chunk of their own, and the page redraws when they are in
export function useBrandedHelp(): void {
  const [, ready] = useState(false);
  useEffect(() => {
    let live = true;
    void import('./branded-help').then(() => live && ready(true));
    return () => {
      live = false;
    };
  }, []);
}

export interface HelpNav {
  home: () => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
}

export function HelpView({ id, anchor, onNavigate, compact, onClose, focusKey, nav, navKey, restore, context }: { id: string; anchor?: string; onNavigate: (id: string, anchor?: string) => void; compact?: boolean; onClose?: () => void; focusKey?: number; nav?: HelpNav; navKey?: number; restore?: number; context?: string }) {
  useBrandedHelp();
  const topic = getTopic(id) ?? TOPICS[0];
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(!compact);
  const hits = useMemo(() => searchHelp(query, 30), [query]);
  const prefs = usePrefs();
  //Tutorials (and concepts) carry tick boxes and a progress strip, unless Preferences turned the badges off
  const tracked = prefs.tutorialBadges !== false ? trackedFor(topic.id) : null;
  //A tutorial with checks ticks its steps itself while a project is open, and its steps with a target get a Show me
  const guide = tracked ? guideFor(topic.id) : undefined;
  const editorOpen = useEditorOpen();
  const ticks =
    tracked && tracked.steps.length
      ? {
          done: new Set(prefs.tutorialProgress?.[topic.id]?.steps ?? []),
          onTick: (n: number, on: boolean) => tickStep(tracked, n, on, TUTORIAL_SETS),
          ...(guide && editorOpen
            ? {
                auto: new Set(Object.keys(guide).map(Number).filter((n) => guide[n].check)),
                shows: new Set(Object.keys(guide).map(Number).filter((n) => targetsOf(guide[n]).length)),
                onShow: (n: number) => showMe(targetsOf(guide[n])),
              }
            : {}),
        }
      : undefined;
  const watched = !!tracked && !!guide;
  useEffect(() => {
    if (!watched || !tracked) return;
    const stop = startGuide(tracked, guide!, TUTORIAL_SETS);
    return () => {
      stop();
      hideTour();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, watched]);
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  // Showing the help (on mount, and again each time it's asked for) puts the caret in the search box, so people can type
  // straight away. preventScroll keeps the article where an anchor scrolled it.
  useEffect(() => {
    search.current?.focus({ preventScroll: true });
  }, [focusKey]);
  const go = (href: string) => {
    const [tid, a] = href.split('#');
    if (query.trim()) track('help', 'search-pick', { thing: tid || topic.id });
    onNavigate(tid || topic.id, a);
    setQuery('');
  };
  useEffect(() => {
    track('help', 'topic', { thing: topic.id, detail: { in: compact ? 'drawer' : 'page' } });
  }, [topic.id, compact]);
  useEffect(() => noteHelpSearch(query, hits.length), [query, hits.length]);
  //the drawer asks where the article is scrolled when it leaves it
  useEffect(() => {
    if (!compact) return;
    setHelpScrollSource(() => body.current?.scrollTop ?? 0);
    return () => {
      setHelpScrollSource(null);
    };
  }, [compact]);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    //Back and Forward put the article where it was, ahead of its anchor
    if (restore !== undefined) {
      el.scrollTop = restore;
      return;
    }
    const target = anchor ? el.querySelector(`#${CSS.escape(anchor)}`) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add('help-flash');
      setTimeout(() => target.classList.remove('help-flash'), 1200);
    } else el.scrollTop = 0;
  }, [topic.id, anchor, navKey]);
  const idx = TOPICS.indexOf(topic);
  const prev = TOPICS[idx - 1];
  const next = TOPICS[idx + 1];

  return (
    <div className={`help-view${compact ? ' compact' : ''}${navOpen ? ' nav-open' : ''}`}>
      <header className="help-head">
        {nav && (
          <div className="help-nav-btns" role="group" aria-label="Help history">
            <button className="icon-btn" title="Back (Alt+Left)" aria-label="Back" disabled={!nav.canBack} onClick={nav.back}>
              <Icons.arrowLeft />
            </button>
            <button className="icon-btn" title="Forward (Alt+Right)" aria-label="Forward" disabled={!nav.canForward} onClick={nav.forward}>
              <Icons.arrowRight />
            </button>
            <button className="icon-btn" title="Help home: the welcome page" aria-label="Help home" onClick={nav.home}>
              <Icons.home />
            </button>
          </div>
        )}
        {compact && (
          <button className="icon-btn" title={navOpen ? 'Hide contents' : 'Show contents'} onClick={() => setNavOpen(!navOpen)}>
            <Icons.more />
          </button>
        )}
        <input ref={search} className="help-search" type="search" placeholder="Search help…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && hits[0]) go(`${hits[0].topic.id}${hits[0].anchor ? `#${hits[0].anchor}` : ''}`);
          if (e.key === 'Escape') setQuery('');
        }} />
        {compact && (
          <a className="icon-btn" title="Open the help in a new tab" href={`#/help/${topic.id}`} target="_blank" rel="noreferrer">
            <Icons.external />
          </a>
        )}
        {compact && <VersionInfo />}
        {onClose && (
          <button className="icon-btn" title="Close help (Esc)" onClick={onClose}>
            <Icons.close />
          </button>
        )}
      </header>
      <div className="help-main">
        {navOpen && !query && (
          <nav className="help-nav">
            {GROUPS.map((g) => (
              <div key={g} className="help-group">
                <div className="help-group-title">{g}</div>
                {TOPICS.filter((t) => t.group === g).map((t) => (
                  <a
                    key={t.id}
                    href={`#/help/${t.id}`}
                    className={t.id === topic.id ? 'active' : ''}
                    title={t.summary}
                    onClick={(e) => {
                      e.preventDefault();
                      go(t.id);
                      if (compact) setNavOpen(false);
                    }}
                  >
                    {t.title}
                    {prefs.tutorialBadges !== false && isDone(prefs.tutorialProgress, t.id) && <span className="nav-done" role="img" aria-label="Finished" title="You have finished this"><Icons.check width={12} height={12} /></span>}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        )}
        <div className="help-body" ref={body}>
          {query ? (
            <SearchResults hits={hits} query={query} onPick={(h) => go(`${h.topic.id}${h.anchor ? `#${h.anchor}` : ''}`)} />
          ) : (
            <article className="help-article">
              {context && topic.id !== 'welcome' && (
                <div className="help-context" role="note">
                  <span>
                    Help for <strong>{context}</strong>
                  </span>
                  <button type="button" className="link-btn" onClick={() => go('welcome')}>
                    Back to general help
                  </button>
                </div>
              )}
              <div className="help-crumb">{topic.group}</div>
              <h1>
                {topic.icon && topic.icon in Icons && <span className="help-topic-icon">{(Icons[topic.icon as keyof typeof Icons] as () => JSX.Element)()}</span>}
                {topic.title}
              </h1>
              <p className="help-summary">{topic.summary}</p>
              {tracked && <TutorialHead t={tracked} progress={prefs.tutorialProgress} />}
              <Markdown text={topicBody(topic)} onLink={go} steps={ticks} />
              {tracked && <TutorialFoot t={tracked} progress={prefs.tutorialProgress} />}
              <footer className="help-pager">
                {prev ? (
                  <a href={`#/help/${prev.id}`} onClick={(e) => (e.preventDefault(), go(prev.id))}>
                    ← {prev.title}
                  </a>
                ) : (
                  <span />
                )}
                {next && (
                  <a href={`#/help/${next.id}`} onClick={(e) => (e.preventDefault(), go(next.id))}>
                    {next.title} →
                  </a>
                )}
              </footer>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResults({ hits, query, onPick }: { hits: HelpHit[]; query: string; onPick: (h: HelpHit) => void }) {
  if (!hits.length) return <p className="muted help-none">Nothing matches “{query}”. Try fewer or different words.</p>;
  return (
    <ul className="help-results">
      {hits.map((h, i) => (
        <li key={i}>
          <button onClick={() => onPick(h)}>
            <strong>
              {h.topic.title}
              {h.heading ? ` › ${h.heading}` : ''}
            </strong>
            <span className="muted small">{h.snippet}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** F1 (and Ctrl/Cmd+K where there is no command palette): type, arrow to a result, Enter to open it. */
export function QuickSearch({ onPick, onClose }: { onPick: (h: HelpHit) => void; onClose: () => void }) {
  useBrandedHelp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => (q ? searchHelp(q, 10) : TOPICS.slice(0, 8).map((t) => ({ topic: t, snippet: t.summary, score: 0 }) as HelpHit)), [q]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => noteHelpSearch(q, q ? hits.length : -1), [q, hits.length]);
  return (
    <div className="modal-backdrop quick-help-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quick-help" role="dialog" aria-label="Search help">
        <input
          autoFocus
          placeholder="Search help (e.g. “zoom”, “repeat list”, “trim path”)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(hits.length - 1, s + 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
            if (e.key === 'Enter' && hits[sel]) onPick(hits[sel]);
            if (e.key === 'Escape') onClose();
          }}
        />
        <ul>
          {hits.map((h, i) => (
            <li key={i} className={i === sel ? 'active' : ''} onPointerEnter={() => setSel(i)} onClick={() => onPick(h)}>
              <strong>
                {h.topic.title}
                {h.heading ? ` › ${h.heading}` : ''}
              </strong>
              <span className="muted small">{h.snippet}</span>
            </li>
          ))}
          {!hits.length && <li className="muted">Nothing matches. Try other words.</li>}
        </ul>
        <div className="quick-help-foot muted small">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
          </span>
          <VersionInfo />
        </div>
      </div>
    </div>
  );
}

/** The full help page at #/help/<topic>. */
//The full page routes per topic (#/help/<topic>), so the browser's own history is its history: Back and Forward use it
const pageNav: HelpNav = {
  home: () => (location.hash = '#/help/welcome'),
  back: () => history.back(),
  forward: () => history.forward(),
  get canBack() {
    return (window as unknown as { navigation?: { canGoBack: boolean } }).navigation?.canGoBack ?? true;
  },
  get canForward() {
    return (window as unknown as { navigation?: { canGoForward: boolean } }).navigation?.canGoForward ?? true;
  },
};

export function HelpPage({ id, anchor }: { id: string; anchor?: string }) {
  useEffect(() => {
    document.title = `${getTopic(id)?.title ?? 'Help'} · Interactives help`;
  }, [id]);
  return (
    <div className="help-page">
      <header className="home-head">
        <a className="brand" href="#/">
          Interactives
        </a>
        <span className="muted help-page-label">
          Help <VersionInfo />
        </span>
      </header>
      <HelpView id={id} anchor={anchor} onNavigate={(t, a) => (location.hash = `#/help/${t}${a ? `/${a}` : ''}`)} nav={pageNav} />
    </div>
  );
}

