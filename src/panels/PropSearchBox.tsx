import { useRef, type KeyboardEvent } from 'react';
import { usePropSearchVersion, type PropSearchStore } from '../lib/prop-search';
import { allSectionsFolded, setAllSections, useSectionFoldVersion } from '../lib/section-fold';
import { Icons } from '../components/icons';
import { keyHint, keyHints } from '../lib/keymap';
import { usePrefs } from '../lib/prefs';

const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(.key-btn):not(:disabled)';

/** Moves focus to the first thing the search found: the best-ranked section's first visible row. */
function focusFirstMatch(panel: HTMLElement | null): boolean {
  if (!panel) return false;
  const sections = [...panel.querySelectorAll<HTMLElement>('.section:not(.ps-hide)')].sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
  for (const sec of sections) {
    for (const row of sec.querySelectorAll<HTMLElement>('.section-body [data-prop]:not(.ps-hide)')) {
      const target = row.matches(FOCUSABLE) ? row : row.querySelector<HTMLElement>(FOCUSABLE);
      if (target) {
        target.focus();
        return true;
      }
    }
  }
  return false;
}

/** The search box pinned at the top of the properties panel. */
export function PropSearchBox({ store, query, setQuery, inputRef }: { store: PropSearchStore; query: string; setQuery: (q: string) => void; inputRef: React.RefObject<HTMLInputElement> }) {
  usePropSearchVersion();
  usePrefs();
  const wrap = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // the panel's own shortcuts and the editor's (V, H, Delete...) must not fire while typing a name
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
    } else if (e.key === 'ArrowDown' || (e.key === 'Enter' && query)) {
      if (focusFirstMatch(wrap.current?.closest('.inspector') as HTMLElement | null)) e.preventDefault();
    }
  };
  const found = store.count;
  useSectionFoldVersion();
  const folded = allSectionsFolded();
  return (
    <div className="prop-search" ref={wrap} role="search">
      <div className="prop-search-box">
        <input
          ref={inputRef}
          type="text"
          className="prop-search-input"
          value={query}
          placeholder="Search properties"
          aria-label="Search properties"
          title={`Find a property by what it does or what it's called: opacity, round, alt, colour, z-order. Press ${keyHints('inspector-search') || 'the search key'} to come here, Esc to clear, the down arrow to go to the first match`}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        {query ? (
          <button type="button" className="prop-search-clear" aria-label="Clear the search" title="Clear the search (Esc)" onClick={() => (setQuery(''), inputRef.current?.focus())}>
            ×
          </button>
        ) : (
          keyHint('inspector-search') && (
            <kbd className="prop-search-key" aria-hidden="true">
              {keyHint('inspector-search')}
            </kbd>
          )
        )}
        <button type="button" className="icon-btn prop-fold-all" title={folded ? 'Unfold all sections' : 'Fold all sections'} aria-label={folded ? 'Unfold all sections' : 'Fold all sections'} onClick={() => setAllSections(folded)}>
          {folded ? <Icons.chevronRight /> : <Icons.chevronDown />}
        </button>
      </div>
      {query.trim() && (
        <div className="prop-search-status muted small" role="status" aria-live="polite">
          {found > 0 ? (
            `${found} ${found === 1 ? 'property' : 'properties'}`
          ) : (
            <>
              No property called “{query.trim()}”.
              {store.suggestion && (
                <>
                  {' '}
                  Did you mean{' '}
                  <button type="button" className="link-btn" onClick={() => (setQuery(store.suggestion ?? ''), inputRef.current?.focus())}>
                    {store.suggestion}
                  </button>
                  ?
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
