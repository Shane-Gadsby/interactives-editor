import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VersionInfo } from './VersionInfo';
import { resetPrefs, usePrefs, type Prefs } from '../lib/prefs';
import { IconButton } from './ui';
import { Icons } from './icons';
import { HelpLink } from '../help/Help';
import { confirmDialog } from './dialogs';
import { restartTips } from '../lib/onboarding';
import { COMMANDS, suspendKeys } from '../lib/keymap';
import { resetKeymap } from '../lib/keymap-sets';
import { ensureCommandKeys } from '../lib/command-keys';
import { trapFocus } from '../lib/overlays';
import { announce } from '../lib/announce';
import { PAGES, closePrefs, searchShortcuts, setPrefsPage, takeSetting, usePrefsWindow, type PageId } from '../lib/prefs-window';
import { PAGE_INFO, pageIsDefault, pageKeys, pagesFor, searchSettings, sectionsOf, type SettingDef } from './PrefsPages';

/** Mounted once by the app: the Preferences window, wherever it was opened from (the gear, the ? key, the command palette, a share link). */
export function PrefsHost() {
  const w = usePrefsWindow();
  return w.open ? <PrefsModal workspace={w.editor} page={w.page} setting={w.setting} onPage={setPrefsPage} onClose={closePrefs} /> : null;
}

const SIZE_KEY = 'ix-prefs-window-size';
const MIN_W = 560;
const MIN_H = 380;
const readSize = (): { w: number; h: number } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null');
    return v && Number.isFinite(v.w) && Number.isFinite(v.h) ? { w: v.w, h: v.h } : null;
  } catch {
    return null;
  }
};

const NARROW = '(max-width: 720px)';
const useNarrow = (): boolean => {
  const q = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null;
  const [narrow, setNarrow] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setNarrow(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, [q]);
  return narrow;
};

/**
 * Personal preferences: a window with a list of pages down the left and one page of related settings at a time. Changes apply
 * as they are made (there is no OK), Esc closes it, and the search finds a setting on any page and takes you to it.
 */
export function PrefsModal({ onClose, workspace = false, page, setting, onPage }: { onClose: () => void; workspace?: boolean; page?: PageId; setting?: string | null; onPage?: (p: PageId) => void }) {
  const p = usePrefs();
  const [own, setOwn] = useState<PageId>(page ?? 'general');
  const cur: PageId = !workspace && PAGE_INFO[own].editorOnly ? 'general' : own;
  const [q, setQ] = useState('');
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const [size, setSize] = useState(readSize);
  const [said, setSaid] = useState('');
  const narrow = useNarrow();
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pages = pagesFor(workspace);

  useEffect(() => {
    if (page && page !== own) setOwn(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  const go = (to: PageId) => {
    setOwn(to);
    onPage?.(to);
  };
  //Opened from a link to one setting (the Activity Designer panel's own allowance): mark it once the page is up
  useEffect(() => {
    if (!setting) return;
    const id = takeSetting();
    if (id) setJump({ id, n: Date.now() });
  }, [setting]);

  //While the window is open the editor's own keys stand down (a key press here is for the window), apart from ? which switches to the shortcuts page
  useEffect(() => {
    suspendKeys(true);
    return () => suspendKeys(false);
  }, []);
  useEffect(() => (box.current ? trapFocus(box.current) : undefined), []);
  useEffect(() => {
    //opened on the shortcuts page (the ? key): type to search them straight away; anywhere else the search of all the preferences is first
    const first = cur === 'keys' ? box.current?.querySelector<HTMLInputElement>('.keys-search input') : null;
    (first ?? search.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  //A search result was picked: the page is up, so scroll to the setting, mark it for a moment and put focus on it
  useLayoutEffect(() => {
    if (!jump) return;
    const el = panel.current?.querySelector<HTMLElement>(`[data-pref="${jump.id}"]`);
    if (!el) return;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    el.classList.add('pref-flash');
    const t = setTimeout(() => el.classList.remove('pref-flash'), 1800);
    el.querySelector<HTMLElement>('input, select, button, textarea')?.focus({ preventScroll: true });
    return () => clearTimeout(t);
  }, [jump]);

  const results = useMemo(() => searchSettings(q, workspace), [q, workspace]);
  const searching = q.trim().length > 0;
  const shortcutMatches = useMemo(() => {
    if (!searching) return 0;
    ensureCommandKeys();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return COMMANDS.filter((c) => words.every((w) => `${c.name} ${c.group} ${c.words ?? ''}`.toLowerCase().includes(w))).length;
  }, [q, searching]);

  const pick = (s: SettingDef) => {
    setQ('');
    go(s.page);
    setJump({ id: s.id, n: Date.now() });
  };

  const resetKeys = (keys: (keyof Prefs)[]) => {
    const rest = keys.filter((k) => k !== 'keymap' && k !== 'keymapPreset' && k !== 'keymapActive' && k !== 'gettingStarted');
    resetPrefs(rest);
    if (keys.includes('gettingStarted')) restartTips();
    if (keys.includes('keymap')) resetKeymap();
  };
  const resetPage = async () => {
    const label = PAGE_INFO[cur].label;
    const extra = cur === 'keys' ? ' Your keys go back to the Default set; the sets you saved stay.' : '';
    if (!(await confirmDialog({ title: `Reset the ${label} page?`, message: `Every setting on this page goes back to how the editor starts. The other pages stay as they are.${extra}`, confirmLabel: 'Reset this page', danger: true }))) return;
    resetKeys(pageKeys(cur));
    setSaid(`${label} reset`);
    announce(`${label} reset`);
  };
  const resetAll = async () => {
    if (!(await confirmDialog({ title: 'Reset all preferences?', message: 'Every setting on every page goes back to how the editor starts, and your keys go back to the Default set. The keyboard sets and workspace layouts you saved stay, and so do your projects.', confirmLabel: 'Reset everything', danger: true }))) return;
    resetKeys([...new Set(PAGES.flatMap((id) => pageKeys(id)))]);
    setSaid('Every preference reset');
    announce('Every preference reset');
  };

  //Resizing from the corner on a big screen. The window stays centred, so each pixel the corner moves is two pixels of size
  const grip = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!box.current || narrow) return;
    e.preventDefault();
    const r = box.current.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
    let last = { w: start.w, h: start.h };
    const move = (m: PointerEvent) => {
      last = { w: clamp(start.w + (m.clientX - start.x) * 2, MIN_W, window.innerWidth - 16), h: clamp(start.h + (m.clientY - start.y) * 2, MIN_H, window.innerHeight - 16) };
      setSize(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(last));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resetSize = () => {
    setSize(null);
    try {
      localStorage.removeItem(SIZE_KEY);
    } catch {
      /* storage unavailable */
    }
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const keys = narrow ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const i = pages.findIndex((x) => x.id === cur);
    let next = -1;
    if (e.key === keys[0]) next = (i - 1 + pages.length) % pages.length;
    else if (e.key === keys[1]) next = (i + 1) % pages.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = pages.length - 1;
    if (next < 0) return;
    e.preventDefault();
    go(pages[next].id);
    //the tab that became current takes the focus, on the render that makes it so
    setTimeout(() => box.current?.querySelector<HTMLElement>(`#prefs-tab-${pages[next].id}`)?.focus(), 0);
  };

  const info = PAGE_INFO[cur];
  const canReset = pageKeys(cur).length > 0 && !pageIsDefault(cur, p);
  const style = size && !narrow ? { width: size.w, height: size.h } : undefined;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal prefs-window" role="dialog" aria-modal="true" aria-label="Preferences" tabIndex={-1} ref={box} style={style}>
        <header>
          <strong>Preferences</strong>
          <HelpLink topic="preferences" />
          <input
            ref={search}
            type="search"
            className="prefs-search"
            aria-label="Search preferences"
            placeholder="Search all preferences"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && q) {
                e.preventDefault();
                e.stopPropagation();
                setQ('');
              } else if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                pick(results[0]);
              }
            }}
          />
          <VersionInfo />
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        <div className="prefs-main">
          <nav className="prefs-nav" aria-label="Preference pages">
            <div role="tablist" aria-orientation={narrow ? 'horizontal' : 'vertical'} aria-label="Preference pages" onKeyDown={onTabKey}>
              {pages.map((pg) => (
                <button
                  key={pg.id}
                  id={`prefs-tab-${pg.id}`}
                  type="button"
                  role="tab"
                  aria-selected={cur === pg.id}
                  aria-controls="prefs-panel"
                  tabIndex={cur === pg.id ? 0 : -1}
                  className={`prefs-tab${cur === pg.id ? ' on' : ''}`}
                  title={pg.about}
                  onClick={() => (setQ(''), go(pg.id))}
                >
                  {pg.label}
                </button>
              ))}
            </div>
          </nav>
          <div className="prefs-panel" id="prefs-panel" role="tabpanel" aria-labelledby={`prefs-tab-${cur}`} ref={panel} tabIndex={-1}>
            {searching ? (
              <div className="prefs-results" aria-label="Search results">
                <h2>{results.length || shortcutMatches ? `Found for “${q.trim()}”` : `Nothing found for “${q.trim()}”`}</h2>
                <ul>
                  {results.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="prefs-result" onClick={() => pick(s)} title={s.tip}>
                        <span className="prefs-result-name">{s.label}</span>
                        <span className="prefs-result-where muted small">
                          {PAGE_INFO[s.page].label} › {s.section}
                        </span>
                      </button>
                    </li>
                  ))}
                  {shortcutMatches > 0 && (
                    <li>
                      <button type="button" className="prefs-result" onClick={() => (searchShortcuts(q.trim()), setQ(''))}>
                        <span className="prefs-result-name">
                          {shortcutMatches} keyboard shortcut{shortcutMatches === 1 ? '' : 's'} match
                        </span>
                        <span className="prefs-result-where muted small">Keyboard shortcuts › Every shortcut</span>
                      </button>
                    </li>
                  )}
                </ul>
                {!results.length && !shortcutMatches && <p className="muted">Try another word, or pick a page from the list.</p>}
              </div>
            ) : (
              <>
                <div className="prefs-page-head">
                  <h2>{info.label}</h2>
                  <p className="muted small">{info.about}</p>
                </div>
                {sectionsOf(cur).map((sec) => (
                  <section key={sec.name} className="prefs-section" aria-label={sec.name}>
                    <h3>{sec.name}</h3>
                    {sec.settings.map((s) => (
                      <div key={s.id} className="pref" data-pref={s.id}>
                        {s.render(p)}
                      </div>
                    ))}
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
        <footer className="prefs-foot">
          <span className="muted small prefs-foot-note">Changes apply at once. They are yours: saved with your account, never in a project.</span>
          <span className="sr-only" role="status">
            {said}
          </span>
          <button
            type="button"
            className="btn small-btn"
            disabled={!canReset || searching}
            title={canReset ? `Put every setting on the ${info.label} page back to how the editor starts` : pageKeys(cur).length ? 'This page is already as the editor starts' : 'There is nothing to reset on this page'}
            onClick={() => void resetPage()}
          >
            Reset this page
          </button>
          <button type="button" className="btn small-btn" title="Put every setting on every page back to how the editor starts. Saved key sets and layouts stay" onClick={() => void resetAll()}>
            Reset everything
          </button>
        </footer>
        {!narrow && <div className="prefs-grip" role="presentation" title="Drag to resize the window (double-click to put it back)" onPointerDown={grip} onDoubleClick={resetSize} />}
      </div>
    </div>
  );
}
