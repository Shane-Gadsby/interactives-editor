import { useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { nodeLabel, nodeTip, useTechnicalWording } from '../lib/plain-words';
import { NODE_GROUPS, type Category, type NodeGroup } from 'interactives-player';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { ArtboardPicker } from './ArtboardPicker';
import { CATEGORIES, allSet, filterPalette, isFiltering, isOpen, loadFolds, onlyOpen, paletteGroups, saveFolds, toggled, type Folds } from '../lib/graph-palette';
import { suggestNode } from '../lib/node-search';

const CAT_COLOR: Record<string, string> = { event: 'var(--event)', action: 'var(--action)', logic: 'var(--logic)' };

/**
 * The Interactions panel's left column: the artboard picker, a search box with filter chips, and the nodes under Events, Actions
 * and Logic, each topic a fold. Typing (or choosing a chip) opens every topic that has a hit and puts the person's folds back when
 * it is cleared. `onAdd` puts a node on the graph.
 */
export function GraphPalette({ onAdd, inputRef }: { onAdd: (kind: string) => void; inputRef: RefObject<HTMLInputElement> }) {
  const technical = useTechnicalWording();
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<NodeGroup[]>([]);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [folds, setFoldsState] = useState<Folds>(loadFolds);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const setFolds = (f: Folds) => {
    setFoldsState(f);
    saveFolds(f);
  };
  const filter = { query, categories, topics };
  const filtering = isFiltering(filter);
  const { groups, count } = useMemo(() => filterPalette(filter), [query, categories, topics, technical]); // eslint-disable-line react-hooks/exhaustive-deps
  const allKeys = useMemo(() => paletteGroups().map((g) => g.key), []);
  const first = groups[0]?.defs[0];
  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // the panel's own keys and the editor's (V, Delete...) must not fire while typing a name
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
    } else if (e.key === 'Enter' && first && filtering) {
      e.preventDefault();
      onAdd(first.kind);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      (e.currentTarget.closest('.logic-palette')?.querySelector('.palette-item') as HTMLElement | null)?.focus();
    }
  };
  const onItemKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(e.currentTarget.closest('.logic-palette')?.querySelectorAll<HTMLElement>('.palette-item') ?? [])];
    const at = items.indexOf(e.currentTarget);
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'ArrowUp' && at <= 0) inputRef.current?.focus();
    else items[Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };

  const headMenu = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    if (filtering) return;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Fold all', onClick: () => setFolds(allSet(allKeys, false)) },
        { label: 'Open all', onClick: () => setFolds(allSet(allKeys, true)) },
        { label: 'Only this one open', title: 'Alt+click on the heading does the same', onClick: () => setFolds(onlyOpen(allKeys, key)) },
      ],
    });
  };
  const headClick = (e: React.MouseEvent, key: string) => setFolds(e.altKey ? onlyOpen(allKeys, key) : toggled(folds, key));

  const typed = query.trim();
  const status = !filtering ? '' : count ? `${count} ${count === 1 ? 'node' : 'nodes'}` : '';
  const sug = filtering && !count && typed ? suggestNode(typed) : null;
  let lastCat: string | null = null;

  return (
    <div className="logic-palette" role="region" aria-label="Nodes">
      <div className="palette-head">
        <ArtboardPicker />
        <div className="palette-search" role="search">
          <div className="palette-search-box">
            <input
              ref={inputRef}
              type="text"
              className="palette-search-input"
              value={query}
              placeholder="Search nodes"
              aria-label="Search nodes"
              title="Find a node by what it does or what it is called: wait, goto, click, sound, if. Press / or Ctrl+F to come here, Esc to clear, Enter to add the first match, the down arrow to pick one"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
            />
            {query ? (
              <button type="button" className="prop-search-clear" aria-label="Clear the search" title="Clear the search (Esc)" onClick={clear}>
                ×
              </button>
            ) : (
              <kbd className="prop-search-key" aria-hidden="true">
                /
              </kbd>
            )}
          </div>
          <div className="palette-chips" role="group" aria-label="Show only">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={`palette-chip${categories.includes(c.id) ? ' on' : ''}`} aria-pressed={categories.includes(c.id)} onClick={() => setCategories(flip(categories, c.id))}>
                {c.title}
              </button>
            ))}
            <button type="button" className={`palette-chip topics-toggle${topicsOpen ? ' open' : ''}${topics.length ? ' on' : ''}`} aria-expanded={topicsOpen} aria-controls="palette-topics" onClick={() => setTopicsOpen(!topicsOpen)}>
              Topics{topics.length ? ` (${topics.length})` : ''}
            </button>
          </div>
          {topicsOpen && (
            <div className="palette-chips" id="palette-topics" role="group" aria-label="Topics">
              {NODE_GROUPS.map((g) => (
                <button key={g} type="button" className={`palette-chip${topics.includes(g) ? ' on' : ''}`} aria-pressed={topics.includes(g)} onClick={() => setTopics(flip(topics, g))}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="palette-status muted small" role="status" aria-live="polite">
            {status}
            {filtering && !count && (
              <>
                No node {typed ? `called “${typed}”` : 'in that filter'}.
                {sug && (
                  <>
                    {' '}
                    Did you mean{' '}
                    <button type="button" className="link-btn" onClick={() => (setQuery(sug), inputRef.current?.focus())}>
                      {sug}
                    </button>
                    ?
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="palette-list">
        {groups.map((g) => {
          const open = filtering || isOpen(folds, g.key);
          const head = lastCat !== g.category;
          lastCat = g.category;
          const id = `pal-${g.key.replace(/[^\w]/g, '-')}`;
          return (
            <div key={g.key} className="palette-group">
              {head && (
                <div className="palette-title" style={{ color: CAT_COLOR[g.category] }}>
                  {CATEGORIES.find((c) => c.id === g.category)!.title}
                </div>
              )}
              {filtering ? (
                <div className="palette-fold static">
                  <span>{g.group}</span>
                  <span className="palette-count">· {g.defs.length}</span>
                </div>
              ) : (
                <button type="button" className={`palette-fold${open ? ' open' : ''}`} aria-expanded={open} aria-controls={id} title={`${open ? 'Fold' : 'Open'} ${g.group}. Alt+click leaves just this one open, right-click for Fold all and Open all`} onClick={(e) => headClick(e, g.key)} onContextMenu={(e) => headMenu(e, g.key)}>
                  <span className="section-chev" aria-hidden="true" />
                  <span>{g.group}</span>
                  <span className="palette-count">· {g.defs.length}</span>
                </button>
              )}
              {open && (
                <div id={id} role="group" aria-label={g.group}>
                  {g.defs.map((d) => (
                    <button
                      key={d.kind}
                      type="button"
                      className="palette-item"
                      title={nodeTip(d, technical)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('application/x-ix-logic', d.kind);
                      }}
                      onClick={() => onAdd(d.kind)}
                      onKeyDown={onItemKey}
                    >
                      {nodeLabel(d, technical)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
