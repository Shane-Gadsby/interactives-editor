import { useEffect, useRef, useSyncExternalStore } from 'react';
import { track } from '../lib/analytics';
import { HelpHistory, type HelpEntry } from './history';
import { isPreviewOpen } from '../lib/overlays';
import { closePalette, openPalette, paletteIsOpen } from '../lib/command-palette';
import { matches } from '../lib/keymap';
import { openShortcuts } from '../lib/shortcuts-sheet';
import { VersionInfo } from '../components/VersionInfo';
import { helpTopics, helpViews, useTopic } from './lazy';
import { hideTour, tourActive } from '../lib/tour';
import { TourOverlay } from './TourOverlay';


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
/** The open article says how far down it is, so Back can return to the same spot (set and cleared by the help's own screens). */
export function setHelpScrollSource(fn: (() => number) | null): void {
  scrollSource = fn;
}
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
/** The Help button's and F1's action: the page for what is highlighted. */
export const openContextHelp = (): void => (contextOpener ? contextOpener() : openHelp());
const openContext = openContextHelp;

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

/** Mounted once by the app: the help drawer, quick search and their shortcuts (F1, ?, and Ctrl/Cmd+K where there is no command palette). */
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
      //F1 is the help quick search. Ctrl/Cmd+K is the command palette (which lists help results too), except while editing text
      //where it's the link shortcut; where there is no palette (the home page) it falls back to the help search.
      //The Help button and ? open the page for what is highlighted
      if (matches(e, 'help-search')) {
        e.preventDefault();
        if (paletteIsOpen()) closePalette();
        openHelpSearch();
      } else if (matches(e, 'palette') && !(e.target instanceof HTMLElement && e.target.closest('.text-editor, .text-toolbar'))) {
        e.preventDefault();
        if (isPreviewOpen()) openHelpSearch();
        else if (!openPalette()) openHelpSearch();
      } else if (matches(e, 'shortcuts') && !isTyping(e)) {
        e.preventDefault();
        openShortcuts();
      } else if (matches(e, 'help-context') && !isTyping(e)) {
        e.preventDefault();
        if (state.drawer) closeHelp();
        else openContext();
      } else if (e.key === 'Escape' && tourActive()) {
        //Show me's ring goes first, and that Esc is all it does
        hideTour();
        e.preventDefault();
        e.stopPropagation();
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
          <DrawerBody s={s as HelpState & { drawer: Drawer }} />
        </aside>
      )}
      {s.search && <QuickSearchHost />}
      <TourOverlay />
    </>
  );
}

//The drawer's article and the quick search are in the help's own chunk (HelpViews): a quiet line shows while it comes in
function DrawerBody({ s }: { s: HelpState & { drawer: Drawer } }) {
  const v = helpViews.use();
  if (!v) return <p className="muted help-loading" role="status">Loading help…</p>;
  return <v.HelpView id={s.drawer.id} anchor={s.drawer.anchor} onNavigate={showTopic} focusKey={s.opened} compact onClose={closeHelp} nav={{ home: helpHome, back: helpBack, forward: helpForward, canBack: hist.canBack, canForward: hist.canForward }} navKey={s.drawer.nav} restore={s.drawer.restore} context={s.drawer.context} />;
}
function QuickSearchHost() {
  const v = helpViews.use();
  if (!v) return null;
  return <v.QuickSearch onPick={(h) => (track('help', 'search-pick', { thing: h.topic.id, detail: { in: 'quick' } }), openHelp(h.topic.id, h.anchor))} onClose={() => emit({ search: false })} />;
}


//The full page routes per topic (#/help/<topic>), so the browser's own history is its history: Back and Forward use it (HelpViews' page nav)
/** The full help page at #/help/<topic>: its frame is here at once, the article comes with the help's chunk. */
export function HelpPage({ id, anchor }: { id: string; anchor?: string }) {
  const v = helpViews.use();
  if (v) return <v.HelpPage id={id} anchor={anchor} />;
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
      <p className="muted help-loading" role="status">Loading help…</p>
    </div>
  );
}

/** A small "?" that opens a help page; its tooltip is the page's summary (the topics come in once the editor warms them up, or on hover). */
export function HelpLink({ topic, anchor }: { topic: string; anchor?: string }) {
  const t = useTopic(topic);
  return (
    <button
      type="button"
      className="help-link"
      title={t ? `${t.title}: ${t.summary}` : 'Help'}
      aria-label={t ? `Help: ${t.title}` : 'Help'}
      onPointerEnter={() => void helpTopics.ensure()}
      onFocus={() => void helpTopics.ensure()}
      onClick={(e) => {
        e.stopPropagation();
        openHelp(topic, anchor);
      }}
    >
      ?
    </button>
  );
}
