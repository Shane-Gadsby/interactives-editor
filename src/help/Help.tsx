import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Markdown } from './markdown';
import { searchHelp, type HelpHit } from './search';
import { noteHelpSearch, track } from '../lib/analytics';
import { GROUPS, TOPICS, getTopic, topicBody } from './topics';
import { Icons } from '../components/icons';

// ---------------------------------------------------------------- opening help from anywhere

// `opened` counts requests to show the help from outside it, so the drawer can put the caret in its search box each time
// (moving between topics inside the help leaves focus where it is)
type HelpState = { drawer: { id: string; anchor?: string } | null; search: boolean; opened: number };
let state: HelpState = { drawer: null, search: false, opened: 0 };
const subs = new Set<() => void>();
const emit = (next: Partial<HelpState>) => {
  state = { ...state, ...next };
  subs.forEach((f) => f());
};

/** Open the help beside whatever is on screen (the full page at #/help works too). */
export function openHelp(id = 'welcome', anchor?: string): void {
  emit({ drawer: { id, anchor }, search: false, opened: state.opened + 1 });
}
const showTopic = (id: string, anchor?: string) => emit({ drawer: { id, anchor }, search: false });
export function openHelpSearch(): void {
  emit({ search: true });
}
export function closeHelp(): void {
  emit({ drawer: null, search: false });
}

function useHelpState(): HelpState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target instanceof HTMLElement ? e.target : null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor'));
};

/** Mounted once by the app: the help drawer, quick search and their shortcuts (F1, Ctrl/Cmd+K, ?). */
export function HelpHost() {
  const s = useHelpState();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        openHelpSearch();
      } else if (e.key === '?' && !isTyping(e) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (state.drawer) closeHelp();
        else openHelp();
      } else if (e.key === 'Escape' && (state.drawer || state.search) && !e.defaultPrevented) {
        if (state.search) emit({ search: false });
        else closeHelp();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <>
      {s.drawer && (
        <aside className="help-drawer" aria-label="Help">
          <HelpView id={s.drawer.id} anchor={s.drawer.anchor} onNavigate={showTopic} focusKey={s.opened} compact onClose={closeHelp} />
        </aside>
      )}
      {s.search && <QuickSearch onPick={(h) => (track('help', 'search-pick', { thing: h.topic.id, detail: { in: 'quick' } }), openHelp(h.topic.id, h.anchor))} onClose={() => emit({ search: false })} />}
    </>
  );
}

// ---------------------------------------------------------------- the help itself

export function HelpView({ id, anchor, onNavigate, compact, onClose, focusKey }: { id: string; anchor?: string; onNavigate: (id: string, anchor?: string) => void; compact?: boolean; onClose?: () => void; focusKey?: number }) {
  const topic = getTopic(id) ?? TOPICS[0];
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(!compact);
  const hits = useMemo(() => searchHelp(query, 30), [query]);
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
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const target = anchor ? el.querySelector(`#${CSS.escape(anchor)}`) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add('help-flash');
      setTimeout(() => target.classList.remove('help-flash'), 1200);
    } else el.scrollTop = 0;
  }, [topic.id, anchor]);
  const idx = TOPICS.indexOf(topic);
  const prev = TOPICS[idx - 1];
  const next = TOPICS[idx + 1];

  return (
    <div className={`help-view${compact ? ' compact' : ''}${navOpen ? ' nav-open' : ''}`}>
      <header className="help-head">
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
              <div className="help-crumb">{topic.group}</div>
              <h1>{topic.title}</h1>
              <p className="help-summary">{topic.summary}</p>
              <Markdown text={topicBody(topic)} onLink={go} />
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

/** Ctrl/Cmd+K or F1: type, arrow to a result, Enter to open it. */
function QuickSearch({ onPick, onClose }: { onPick: (h: HelpHit) => void; onClose: () => void }) {
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
          <kbd>↑</kbd> <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

/** The full help page at #/help/<topic>. */
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
        <span className="muted">Help</span>
      </header>
      <HelpView id={id} anchor={anchor} onNavigate={(t, a) => (location.hash = `#/help/${t}${a ? `/${a}` : ''}`)} />
    </div>
  );
}

/** A small "?" that opens a help page; its tooltip is the page's summary. */
export function HelpLink({ topic, anchor }: { topic: string; anchor?: string }) {
  const t = getTopic(topic);
  return (
    <button
      type="button"
      className="help-link"
      title={t ? `${t.title}: ${t.summary}` : 'Help'}
      aria-label={`Help: ${t?.title ?? topic}`}
      onClick={(e) => {
        e.stopPropagation();
        openHelp(topic, anchor);
      }}
    >
      ?
    </button>
  );
}
