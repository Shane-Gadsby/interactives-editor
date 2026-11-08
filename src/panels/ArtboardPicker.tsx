import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { store, useEditor } from '../store/store';
import { filterSections, pickerSections, showArtboard, stepTarget, type PickerRow } from '../lib/artboard-picker';
import { Icons } from '../components/icons';

/** Past this many artboards the list has a search box. */
export const SEARCH_FROM = 8;

/**
 * Which artboard's graph the Interactions panel shows. It is the store's active artboard, nothing more: picking one makes it the
 * active artboard (and brings the canvas to it), and anything else that changes the active artboard changes what this says.
 */
export function ArtboardPicker() {
  const project = useEditor((s) => s.project);
  const activeId = useEditor((s) => s.activeArtboardId);
  const sections = useMemo(() => pickerSections(project), [project]);
  const all = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const current = all.find((r) => r.id === activeId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const searchable = all.length >= SEARCH_FROM;
  const shown = useMemo(() => filterSections(sections, q), [sections, q]);
  const rows = useMemo(() => shown.flatMap((s) => s.rows), [shown]);

  useEffect(() => setSel(Math.max(0, rows.findIndex((r) => r.id === activeId && !q))), [q, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.max(240, r.width);
    const h = pop.current?.offsetHeight ?? 300;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    const below = r.bottom + 4;
    setPos({ left, width, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below });
  }, [open, rows.length]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  useEffect(() => {
    pop.current?.querySelector('.on')?.scrollIntoView?.({ block: 'nearest' });
  }, [sel, open]);

  const choose = (r: PickerRow | undefined) => {
    setOpen(false);
    setQ('');
    btn.current?.focus();
    if (r) showArtboard(r.id);
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(rows.length - 1, s + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
    else if (e.key === 'Home') (e.preventDefault(), setSel(0));
    else if (e.key === 'End') (e.preventDefault(), setSel(rows.length - 1));
    else if (e.key === 'Enter' && rows.length) (e.preventDefault(), choose(rows[Math.min(sel, rows.length - 1)]));
    else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  };

  let index = -1;
  return (
    <div className="artboard-picker">
      <button
        ref={btn}
        type="button"
        className={`ab-picker-btn${open ? ' open' : ''}`}
        aria-label={`Artboard: ${current?.label ?? 'none'}`}
        title="Which artboard's interactions to show. Alt+Up and Alt+Down step to the one before or after"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <span className="ab-picker-name">{current?.name ?? 'No artboard'}</span>
        {current && <span className="ab-picker-count">{current.count}</span>}
        <Icons.chevronDown />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="search-pop ab-picker-pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width }} onKeyDown={keys}>
            {searchable && <input autoFocus className="search-pop-input" placeholder="Find an artboard…" aria-label="Find an artboard" value={q} onChange={(e) => setQ(e.target.value)} />}
            <div className="ab-picker-list" role="listbox" aria-label="Artboards" tabIndex={searchable ? -1 : 0} ref={(el) => (!searchable && el && document.activeElement !== el && !el.contains(document.activeElement) ? el.focus() : undefined)}>
              {shown.map((s) => (
                <div key={s.heading ?? 'all'} role="group" aria-label={s.heading ?? 'Artboards'}>
                  {s.heading && <div className="ab-picker-heading">{s.heading}</div>}
                  {s.rows.map((r) => {
                    index++;
                    const i = index;
                    return (
                      <div key={r.id} role="option" aria-selected={r.id === activeId} className={`ab-picker-row${i === sel ? ' on' : ''}${r.id === activeId ? ' current' : ''}${r.nodes === 0 ? ' empty' : ''}`} onPointerEnter={() => setSel(i)} onClick={() => choose(r)}>
                        <span className="ab-picker-name">{r.name}</span>
                        <span className="ab-picker-count">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {!rows.length && <div className="muted empty ab-picker-none">No artboard called “{q}”</div>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Alt+Up and Alt+Down (or Ctrl+[ and Ctrl+]): the previous or next artboard's graph. Returns whether the key was one of them. */
export function stepKey(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): 1 | -1 | null {
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) return e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : null;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return e.key === ']' ? 1 : e.key === '[' ? -1 : null;
  return null;
}

export function stepArtboard(dir: 1 | -1): boolean {
  const st = store().get();
  const next = stepTarget(st.project, st.activeArtboardId, dir);
  if (!next) return false;
  showArtboard(next);
  return true;
}
