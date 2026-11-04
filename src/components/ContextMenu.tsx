import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem =
  | { label: string; onClick: () => void; hint?: string; danger?: boolean; disabled?: boolean; title?: string; color?: string }
  | { label: string; items: MenuItem[]; hint?: string; color?: string }
  | { separator: true }
  | { heading: string };

/** A right-click menu at a screen point, with nested submenus. Closes on pick, Escape or a click outside. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
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
  return <MenuList x={x} y={y} items={items} onClose={onClose} />;
}

function MenuList({ x, y, items, onClose, side }: { x: number; y: number; items: MenuItem[]; onClose: () => void; side?: { left: number } }) {
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
