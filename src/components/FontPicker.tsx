import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { FontRef } from 'interactives-player';
import { Icons } from './icons';
import { tipFor } from './ui';
import { useRowSearch } from '../lib/prop-search';
import { CATEGORIES, filterOptions, firstFamily, fontOptions, fontStack, catalogNow, loadCatalog, previewFonts, type CatalogFont, type FontCategory, type FontOption } from '../lib/font-catalog';

export type FontPick = FontOption;

const ROW = 28;
const LIST_H = 252;
const OVERSCAN = 4;
const POP_W = 280;

const KIND_TAG: Record<FontOption['kind'], string> = { project: 'In project', upload: 'Uploaded', system: 'System', google: '', typed: '' };

/**
 * A combobox for choosing a font family. Type to filter every Google Fonts family (plus the project's own fonts and a few
 * system ones, which come first); each row is drawn in its own font, loaded only for the rows on screen. The Sans / Serif /
 * Display / Handwriting / Mono chips narrow the list. Up and Down move, Enter picks, Esc closes.
 * `onPick` gets the row; the caller decides what picking means (set a layer's font, add a font to the project, save a preference).
 */
export function FontPicker({
  value = '',
  project = [],
  onPick,
  ariaLabel,
  title,
  placeholder = 'Search fonts…',
  system = true,
  clearOnPick,
  typedLabel = (name) => `Use “${name}” as typed`,
  mixed,
  disabled,
  className,
}: {
  /** What is chosen now: a font-family value (`"Open Sans", sans-serif`) or just a family name */
  value?: string;
  /** The project's fonts, which show first */
  project?: FontRef[];
  onPick: (pick: FontPick) => void;
  ariaLabel: string;
  title?: string;
  placeholder?: string;
  /** Offer the system fonts (Georgia, Arial...) */
  system?: boolean;
  /** Clear the box after a pick (for "add a font") */
  clearOnPick?: boolean;
  /** The last row, offered for a name that isn't in the list */
  typedLabel?: (name: string) => string;
  /** Several things are selected and they differ */
  mixed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const listId = `fp-${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [category, setCategory] = useState<FontCategory | ''>('');
  const [active, setActive] = useState(0);
  const [top, setTop] = useState(0);
  const [list, setList] = useState<CatalogFont[]>(() => catalogNow() ?? []);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const current = firstFamily(value);

  useEffect(() => {
    if (open && !list.length) void loadCatalog().then(setList);
  }, [open, list.length]);

  const all = useMemo(() => fontOptions(project, list, { system }), [project, list, system]);
  const shown = useMemo(() => {
    const rows = filterOptions(all, query ?? '', category);
    const typed = (query ?? '').trim();
    // A name the list doesn't have can still be used
    if (typed && !rows.some((r) => r.family.toLowerCase() === typed.toLowerCase())) return [...rows, { family: typed, stack: fontStack(typed), kind: 'typed' as const }];
    return rows;
  }, [all, query, category]);

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  // Put the box under the field, or above it when the screen ends first
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const h = LIST_H + 44;
      const above = window.innerHeight - r.bottom < h + 8 && r.top > window.innerHeight - r.bottom;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
      setPos({ left, top: above ? r.top - 4 : r.bottom + 4, above });
    };
    place();
    const onScroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // Opening shows the current font; typing or a new category starts at the top
  useEffect(() => {
    if (!open) return;
    const i = query === null && !category ? shown.findIndex((o) => o.family.toLowerCase() === current.toLowerCase()) : -1;
    setActive(Math.max(0, i));
    const sc = scroller.current;
    const y = Math.max(0, i * ROW - LIST_H / 2);
    if (sc) sc.scrollTop = y;
    setTop(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, category, list.length]);

  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(shown.length, Math.ceil((top + LIST_H) / ROW) + OVERSCAN);

  // The families on screen get drawn in their own font, once scrolling settles
  const names = shown.slice(first, last).filter((o) => o.kind === 'google' || o.kind === 'project').map((o) => o.family);
  const namesKey = names.join('|');
  useEffect(() => {
    if (!open || !names.length) return;
    const t = setTimeout(() => previewFonts(names, project.filter((f) => f.source === 'google').map((f) => f.family)), 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, namesKey]);

  const reveal = (i: number) => {
    const sc = scroller.current;
    if (!sc) return;
    const y = sc.scrollTop;
    const h = sc.clientHeight || LIST_H;
    if (i * ROW < y) sc.scrollTop = i * ROW;
    else if ((i + 1) * ROW > y + h) sc.scrollTop = (i + 1) * ROW - h;
    setTop(sc.scrollTop);
  };
  const move = (to: number) => {
    const i = Math.max(0, Math.min(shown.length - 1, to));
    setActive(i);
    reveal(i);
  };

  const pick = (o: FontOption) => {
    close();
    onPick(o);
    if (clearOnPick) setQuery(null);
    input.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Esc closes the list first; with it already closed, it goes on to whatever it would close (a dialog, text editing)
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') return;
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else move(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else move(active - 1);
    } else if (e.key === 'PageDown' && open) {
      e.preventDefault();
      move(active + Math.floor(LIST_H / ROW) - 1);
    } else if (e.key === 'PageUp' && open) {
      e.preventDefault();
      move(active - Math.floor(LIST_H / ROW) + 1);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    }
  };

  const text = open && query !== null ? query : mixed || clearOnPick ? '' : current;
  const activeId = open && shown[active] ? `fp-${uid}-opt-${active}` : undefined;

  return (
    <div
      ref={wrap}
      className={`font-picker${open ? ' open' : ''}${className ? ' ' + className : ''}`}
      onBlur={(e) => {
        // Moving between the field and its own box (the category chips) is not leaving
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <div className="font-input-wrap">
        <input
          ref={input}
          type="text"
          role="combobox"
          className="font-input"
          aria-label={ariaLabel}
          title={title}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={mixed ? 'Mixed' : placeholder}
          value={text}
          style={!open && !clearOnPick && !mixed && current ? { fontFamily: value } : undefined}
          onFocus={(e) => {
            e.currentTarget.select();
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <Icons.chevronDown />
      </div>
      {open && (
        <div ref={box} className="font-pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: POP_W, transform: pos?.above ? 'translateY(-100%)' : undefined }} onKeyDown={(e) => e.stopPropagation()}>
          <div className="font-cats" role="group" aria-label="Font style">
            <button type="button" className={category === '' ? 'on' : ''} aria-pressed={category === ''} onClick={() => (setCategory(''), input.current?.focus())}>
              All
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={category === c.id ? 'on' : ''} aria-pressed={category === c.id} onClick={() => (setCategory(category === c.id ? '' : c.id), input.current?.focus())}>
                {c.label}
              </button>
            ))}
          </div>
          <div
            ref={scroller}
            id={listId}
            role="listbox"
            aria-label={`${ariaLabel}, ${shown.length} fonts`}
            className="font-list"
            style={{ height: Math.min(LIST_H, Math.max(shown.length, 1) * ROW) }}
            onScroll={(e) => setTop(e.currentTarget.scrollTop)}
            // keep the focus in the box when the list is pressed (its scrollbar included)
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="font-spacer" style={{ height: shown.length * ROW }}>
              {shown.slice(first, last).map((o, k) => {
                const i = first + k;
                return (
                  <FontRow key={`${o.kind}:${o.family}`} id={`fp-${uid}-opt-${i}`} o={o} i={i} count={shown.length} on={i === active} chosen={o.family.toLowerCase() === current.toLowerCase()} label={o.kind === 'typed' ? typedLabel(o.family) : null} onHover={() => setActive(i)} onPick={() => pick(o)} />
                );
              })}
            </div>
            {!shown.length && (
              <div className="font-empty" role="status">
                {list.length ? 'No font matches' : 'Loading fonts…'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FontRow({ id, o, i, count, on, chosen, label, onHover, onPick }: { id: string; o: FontOption; i: number; count: number; on: boolean; chosen: boolean; label: ReactNode; onHover: () => void; onPick: () => void }) {
  const tag = KIND_TAG[o.kind] || (o.category ? CATEGORIES.find((c) => c.id === o.category)?.label : '');
  return (
    <div id={id} role="option" aria-selected={chosen} aria-posinset={i + 1} aria-setsize={count} className={`font-opt${on ? ' on' : ''}${chosen ? ' current' : ''}`} style={{ top: i * ROW, height: ROW }} onPointerMove={onHover} onClick={onPick}>
      {label ? (
        <span className="font-opt-name typed">{label}</span>
      ) : (
        <span className="font-opt-name" style={{ fontFamily: o.stack }}>
          {o.family}
        </span>
      )}
      {tag && <span className="font-opt-tag">{tag}</span>}
    </div>
  );
}

/** A labelled font field for the inspector: the label, then the combobox. */
export function FontField({ label, title, ...rest }: { label: string; title?: string } & Omit<Parameters<typeof FontPicker>[0], 'ariaLabel' | 'title'>) {
  const ps = useRowSearch(label, tipFor(label, title));
  return (
    <div className={`field select-field font-field-row${ps.hide ? ' ps-hide' : ''}`} data-prop={ps.prop} title={tipFor(label, title)}>
      <span className="field-label">{label}</span>
      <FontPicker ariaLabel={label} {...rest} />
    </div>
  );
}
