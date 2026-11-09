import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { rankEntries } from '../lib/prop-search';

export type MenuItem =
  | { label: string; onClick: () => void; hint?: string; danger?: boolean; disabled?: boolean; title?: string; color?: string; /** Other names it is searched by. */ find?: string[]; /** What the search treats as its topic, when the submenu it is in is not one. */ group?: string }
  | { label: string; items: MenuItem[]; hint?: string; color?: string }
  | { separator: true }
  | { heading: string };

type Leaf = Extract<MenuItem, { onClick: () => void }>;

/** Every pickable item, through the submenus, with the submenu it came from (for its colour and as a hint). */
function leaves(items: MenuItem[], parent?: { label: string; color?: string }): { item: Leaf; parent?: { label: string; color?: string } }[] {
  return items.flatMap((it) => ('items' in it ? leaves(it.items, { label: it.label, color: it.color }) : 'onClick' in it && !it.disabled ? [{ item: it, parent }] : []));
}

/**
 * A right-click menu at a screen point, with nested submenus. Closes on pick, Escape or a click outside.
 * `search` puts a filter box at the top (its placeholder): typing flattens every submenu into one list of matches.
 */
export function ContextMenu({ x, y, items, onClose, search }: { x: number; y: number; items: MenuItem[]; onClose: () => void; search?: string }) {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.ctx-menu')) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  // Drawn on the page itself, never inside whatever opened it: a menu opened from a strip that scrolls sideways (the dock
  // tabs) or a layer that lets the pointer through (the rulers) was clipped or couldn't be clicked
  const menu = search ? <SearchMenu x={x} y={y} items={items} onClose={onClose} placeholder={search} /> : <MenuList x={x} y={y} items={items} onClose={onClose} />;
  return createPortal(menu, document.body);
}

function SearchMenu({ x, y, items, onClose, placeholder }: { x: number; y: number; items: MenuItem[]; onClose: () => void; placeholder: string }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const term = q.trim();
  //Ranked by the same scorer as the properties panel and the node palette (label, other names, topic, then the description)
  const all = leaves(items);
  const matches = term ? rankEntries(term, all, (l) => ({ key: l.item.label, label: l.item.label, tip: l.item.title, extra: l.item.find, section: l.item.group ?? l.parent?.label, plain: true })) : [];
  const pick = (l: Leaf) => {
    onClose();
    l.onClick();
  };
  useEffect(() => {
    listRef.current?.querySelector('.ctx-item.open')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const box = (
    <input
      ref={input}
      className="ctx-search"
      type="search"
      value={q}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => {
        setQ(e.target.value);
        setActive(0);
      }}
      onKeyDown={(e) => {
        if (!term) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const n = matches.length;
          if (n) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
        } else if (e.key === 'Enter' && matches[active]) {
          e.preventDefault();
          pick(matches[active].item);
        }
      }}
    />
  );
  //The box has to stay at the same spot in the tree whether or not there's a filter, or it remounts and loses focus
  return (
    <MenuList
      x={x}
      y={y}
      items={term ? [] : items}
      onClose={onClose}
      top={
        <>
          {box}
          {term && <div ref={listRef} role="presentation">
            {matches.length ? (
              matches.map((l, i) => (
                <button
                  key={i}
                  role="menuitem"
                  className={`ctx-item${i === active ? ' open' : ''}`}
                  title={l.item.title}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(l.item)}
                >
                  {(l.item.color ?? l.parent?.color) && <span className="ctx-dot" style={{ background: l.item.color ?? l.parent?.color }} />}
                  <span className="ctx-label">{l.item.label}</span>
                  {(l.item.hint ?? l.parent?.label) && <span className="ctx-hint">{l.item.hint ?? l.parent?.label}</span>}
                </button>
              ))
            ) : (
              <div className="ctx-empty">Nothing matches</div>
            )}
          </div>}
        </>
      }
    />
  );
}

function MenuList({ x, y, items, onClose, side, top }: { x: number; y: number; items: MenuItem[]; onClose: () => void; side?: { left: number }; top?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<{ i: number; x: number; y: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    // Keep on screen: flip to the other side of the parent menu, or nudge up
    if (nx + r.width > innerWidth - 4) nx = side ? side.left - r.width : innerWidth - r.width - 4;
    if (ny + r.height > innerHeight - 4) ny = Math.max(4, innerHeight - r.height - 4);
    setPos({ x: Math.max(4, nx), y: ny });
  }, [x, y, side]);
  return (
    <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {top}
      {items.map((it, i) => {
        if ('separator' in it) return <div key={i} className="ctx-sep" />;
        if ('heading' in it) return <div key={i} className="ctx-heading">{it.heading}</div>;
        const sub = 'items' in it;
        const label: ReactNode = (
          <>
            {it.color && <span className="ctx-dot" style={{ background: it.color }} />}
            <span className="ctx-label">{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
            {sub && <span className="ctx-arrow">›</span>}
          </>
        );
        return (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item${'danger' in it && it.danger ? ' danger' : ''}${open?.i === i ? ' open' : ''}`}
            disabled={'disabled' in it && it.disabled}
            title={'title' in it ? it.title : undefined}
            onPointerEnter={(e) => {
              if (sub) {
                const r = e.currentTarget.getBoundingClientRect();
                const pr = ref.current!.getBoundingClientRect();
                setOpen({ i, x: pr.right - 2, y: r.top - 4, left: pr.left + 2 });
              } else setOpen(null);
            }}
            onClick={() => {
              if (sub) return;
              onClose();
              it.onClick();
            }}
          >
            {label}
          </button>
        );
      })}
      {open && 'items' in items[open.i] && <MenuList x={open.x} y={open.y} side={{ left: open.left }} items={(items[open.i] as { items: MenuItem[] }).items} onClose={onClose} />}
    </div>
  );
}
