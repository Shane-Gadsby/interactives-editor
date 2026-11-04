import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './icons';

export interface PickerOption {
  value: string;
  label: string;
  /** Smaller text after the label (a type, a property path). */
  hint?: string;
}

export interface PickerAction {
  label: string;
  onSelect: () => void;
}

/**
 * A dropdown with a search box at the top: type to narrow the list, arrows to move, Enter to pick, Esc to close.
 * `actions` sit under the list (e.g. "+ New variable…") and are always shown.
 */
export function SearchPicker({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  searchPlaceholder = 'Search…',
  title,
  ariaLabel,
  actions = [],
  className,
  buttonLabel,
}: {
  value: string;
  options: PickerOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  title?: string;
  ariaLabel?: string;
  actions?: PickerAction[];
  className?: string;
  /** What the closed button shows instead of the chosen option (e.g. "+ Add binding"). */
  buttonLabel?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? options.filter((o) => words.every((w) => `${o.label} ${o.hint ?? ''} ${o.value}`.toLowerCase().includes(w))) : options;
  }, [q, options]);
  const total = shown.length + actions.length;

  useEffect(() => setSel(0), [q, open]);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.max(220, r.width);
    const h = pop.current?.offsetHeight ?? 300;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    const below = r.bottom + 4;
    setPos({ left, width, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below });
  }, [open, shown.length]);
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
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (i: number) => {
    setOpen(false);
    setQ('');
    btn.current?.focus();
    if (i < shown.length) onChange(shown[i].value);
    else actions[i - shown.length]?.onSelect();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`search-picker${open ? ' open' : ''}${className ? ' ' + className : ''}`}
        title={title}
        aria-label={ariaLabel ?? title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`search-picker-value${!buttonLabel && !current ? ' muted' : ''}`}>{buttonLabel ?? (current ? current.label : value || placeholder)}</span>
        {!buttonLabel && current?.hint && <span className="search-picker-hint">{current.hint}</span>}
        <Icons.chevronDown />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="search-pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width }} onKeyDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              className="search-pop-input"
              placeholder={searchPlaceholder}
              value={q}
              aria-label={searchPlaceholder}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(total - 1, s + 1)));
                else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
                else if (e.key === 'Enter' && total) (e.preventDefault(), choose(Math.min(sel, total - 1)));
                else if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                  btn.current?.focus();
                }
              }}
            />
            <ul ref={list} role="listbox" className="search-pop-list">
              {shown.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={`${i === sel ? 'on' : ''}${o.value === value ? ' current' : ''}`}
                  onPointerEnter={() => setSel(i)}
                  onClick={() => choose(i)}
                >
                  <span>{o.label}</span>
                  {o.hint && <span className="search-picker-hint">{o.hint}</span>}
                </li>
              ))}
              {!shown.length && <li className="muted empty">Nothing matches “{q}”</li>}
              {actions.map((a, j) => (
                <li key={a.label} className={`action${shown.length + j === sel ? ' on' : ''}`} onPointerEnter={() => setSel(shown.length + j)} onClick={() => choose(shown.length + j)}>
                  {a.label}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
