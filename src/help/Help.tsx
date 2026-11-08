import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { VersionInfo } from '../components/VersionInfo';
import { Markdown } from './markdown';
import { searchHelp, type HelpHit } from './search';
import { noteHelpSearch, track } from '../lib/analytics';
import { GROUPS, TOPICS, getTopic, topicBody } from './topics';
import './branded-help';
import { Icons } from '../components/icons';
import { HelpHistory, type HelpEntry } from './history';
import { isPreviewOpen } from '../lib/overlays';

// ---------------------------------------------------------------- opening help from anywhere

// `opened` counts requests to show the help from outside it, so the drawer can put the caret in its search box each time
// (moving between topics inside the help leaves focus where it is). `nav` counts every move of any kind, so the article
// scrolls to its anchor (or back to where it was) even when the topic didn't change
type Drawer = { id: string; anchor?: string; context?: string; restore?: number; nav: number };
type HelpState = { drawer: Drawer | null; search: boolean; opened: number };
let state: HelpState = { drawer: null, search: false, opened: 0 };
const subs = new Set<() => void>();
const emit = (next: Partial<HelpState>) => {
  state = { ...state, ...next };
  subs.forEach((f) => f());
};

// The drawer's own history: topics and anchors visited, kept while it is closed too, so reopening it from somewhere else
// (the Help button on a layer, say) can still go Back to what was being read
const hist = new HelpHistory();
let scrollSource: (() => number) | null = null;
const leave = () => hist.saveScroll(scrollSource?.() ?? hist.current?.scroll ?? 0);
const nextNav = () => (state.drawer?.nav ?? 0) + 1;

function show(e: { id: string; anchor?: string; context?: string }, fromOutside: boolean) {
  leave();
  const grew = hist.push(e);
  const cur = hist.current!;
  emit({
    drawer: { id: cur.id, anchor: cur.anchor, context: cur.context, restore: !grew && !cur.anchor ? cur.scroll : undefined, nav: nextNav() },
    search: false,
    ...(fromOutside ? { opened: state.opened + 1 } : {}),
  });
}
function goTo(e: HelpEntry | null) {
  if (!e) return;
  emit({ drawer: { id: e.id, anchor: e.anchor, context: e.context, restore: e.scroll ?? 0, nav: nextNav() }, search: false });
}

/** The full page of help at #/help, in a window of its own (Preview sits above the drawer, so help can't open over it). */
export const helpWindowUrl = (id = 'welcome', anchor?: string) => `${location.pathname}${location.search}#/help/${id}${anchor ? `/${anchor}` : ''}`;
const openInWindow = (id?: string, anchor?: string) => void window.open(helpWindowUrl(id, anchor), '_blank', 'noopener');

/**
 * Open the help beside whatever is on screen (the full page at #/help works too). `context` names what it was opened for
 * ("Chart layer"), which puts a "Back to general help" line at the top. With Preview open it goes to its own window instead.
 */
export function openHelp(id = 'welcome', anchor?: string, context?: string): void {
  if (isPreviewOpen()) return openInWindow(id, anchor);
  show({ id, anchor, context }, true);
}
const showTopic = (id: string, anchor?: string) => show({ id, anchor }, false);
export function openHelpSearch(): void {
  if (isPreviewOpen()) return openInWindow();
  emit({ search: true });
}
export function closeHelp(): void {
  leave();
  emit({ drawer: null, search: false });
}
export const helpBack = () => (leave(), goTo(hist.back()));
export const helpForward = () => (leave(), goTo(hist.forward()));
export const helpHome = () => showTopic('welcome');
/** For tests and for the nav buttons' disabled state. */
export const helpHistory = hist;

// What F1 and ? open: the page for what is highlighted. The editor registers it (it knows the selection), so the help doesn't import the editor
let contextOpener: (() => void) | null = null;
export function setContextHelp(fn: (() => void) | null): void {
  contextOpener = fn;
}
const openContext = () => (contextOpener ? contextOpener() : openHelp());

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
  const drawerRef = useRef<HTMLElement>(null);
  const open = !!s.drawer;
  // Alt+Left and Alt+Right (and the mouse's back and forward buttons) move through the drawer's history while it has the focus or the pointer.
  // Capture phase, since the search box stops every key from bubbling. The full page at #/help leaves them to the browser, which routes per topic
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'ArrowLeft') helpBack();
      else helpForward();
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.type !== 'mouseup') return;
      if (e.button === 3) helpBack();
      else helpForward();
    };
    el.addEventListener('keydown', onKey, true);
    for (const t of ['mousedown', 'mouseup', 'auxclick'] as const) el.addEventListener(t, onMouse);
    return () => {
      el.removeEventListener('keydown', onKey, true);
      for (const t of ['mousedown', 'mouseup', 'auxclick'] as const) el.removeEventListener(t, onMouse);
    };
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      //Ctrl/Cmd+K is the link shortcut while editing text (F1 still opens the search there)
      if (e.key === 'F1') {
        //F1 is the keyboard way to the Help button: the page for what is highlighted, with the caret in the search box
        e.preventDefault();
        openContext();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !(e.target instanceof HTMLElement && e.target.closest('.text-editor, .text-toolbar'))) {
        e.preventDefault();
        openHelpSearch();
      } else if (e.key === '?' && !isTyping(e) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (state.drawer) closeHelp();
        else openContext();
      } else if (e.key === 'Escape' && (state.drawer || state.search) && !e.defaultPrevented && !isPreviewOpen()) {
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
        <aside className="help-drawer" aria-label="Help" ref={drawerRef}>
          <HelpView id={s.drawer.id} anchor={s.drawer.anchor} onNavigate={showTopic} focusKey={s.opened} compact onClose={closeHelp} nav={{ home: helpHome, back: helpBack, forward: helpForward, canBack: hist.canBack, canForward: hist.canForward }} navKey={s.drawer.nav} restore={s.drawer.restore} context={s.drawer.context} />
        </aside>
      )}
      {s.search && <QuickSearch onPick={(h) => (track('help', 'search-pick', { thing: h.topic.id, detail: { in: 'quick' } }), openHelp(h.topic.id, h.anchor))} onClose={() => emit({ search: false })} />}
    </>
  );
}

// ---------------------------------------------------------------- the help itself

export interface HelpNav {
  home: () => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
}

export function HelpView({ id, anchor, onNavigate, compact, onClose, focusKey, nav, navKey, restore, context }: { id: string; anchor?: string; onNavigate: (id: string, anchor?: string) => void; compact?: boolean; onClose?: () => void; focusKey?: number; nav?: HelpNav; navKey?: number; restore?: number; context?: string }) {
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
  //the drawer asks where the article is scrolled when it leaves it
  useEffect(() => {
    if (!compact) return;
    scrollSource = () => body.current?.scrollTop ?? 0;
    return () => {
      scrollSource = null;
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
