import { useEffect, useRef } from 'react';
import { usePrefs, setPrefs } from '../lib/prefs';
import { GRID_PRESETS } from '../lib/grid';
import { SNAP_DISTANCES, SNAP_ITEMS, toggleSnap } from '../lib/snapping';

/**
 * The dropdown on the tool bar's Snap button: the master switch and a tick for each target. It stays open while you tick
 * several, and closes on Escape or a click outside. Shift+F10 / the menu key reaches it from the keyboard like any menu.
 */
export function SnapMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const p = usePrefs();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role^=menuitem]')?.focus();
    const down = (e: PointerEvent) => {
      //the tool bar's own button is left to close it (its click), or it would close here and open again there
      if (!(e.target as Element).closest?.('.snap-menu, [aria-label^="Snapping is"]')) onClose();
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
  const arrows = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };
  const row = (checked: boolean, label: string, tip: string, onClick: () => void, hint?: string, disabled = false) => (
    <button key={label} type="button" role="menuitemcheckbox" aria-checked={checked} className={`ctx-item snap-item${checked ? ' on' : ''}`} title={tip} disabled={disabled} onClick={onClick}>
      <span className="snap-tick" aria-hidden="true">{checked ? '✓' : ''}</span>
      <span className="ctx-label">{label}</span>
      {hint && <span className="ctx-hint">{hint}</span>}
    </button>
  );
  return (
    <div ref={ref} className="ctx-menu snap-menu" role="menu" aria-label="Snapping" style={{ left: Math.max(4, Math.min(x, innerWidth - 250)), top: Math.max(4, Math.min(y, innerHeight - 380)) }} onKeyDown={arrows} onContextMenu={(e) => e.preventDefault()}>
      {row(p.snapOn, 'Snapping', 'Switch every snap target on or off together. Your ticks below are kept while it is off. Hold Ctrl while dragging to skip snapping for that drag', () => toggleSnap('on'))}
      <div className="ctx-sep" />
      {SNAP_ITEMS.map((i) => row(!!p[i.pref], i.label, i.tip, () => toggleSnap(i.kind), i.kind === 'grid' ? "Ctrl+'" : undefined, !p.snapOn))}
      <div className="ctx-sep" />
      {row(p.snapLayersAll, 'Layers: all, not just siblings', 'Layers snap to every layer on the artboard, not only the ones beside the layer you drag', () => toggleSnap('layersAll'), undefined, !p.snapOn || !p.snapLayers)}
      <div className="ctx-sep" />
      <label className="snap-field">
        <span>Snap distance</span>
        <select value={p.snapDistance} onChange={(e) => setPrefs({ snapDistance: Number(e.target.value) })} title="How close (screen pixels) something has to be to snap">
          {[...new Set([...SNAP_DISTANCES, p.snapDistance])].sort((a, b) => a - b).map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </label>
      <label className="snap-field">
        <span>Grid size</span>
        <select value={p.gridSize} onChange={(e) => setPrefs({ gridSize: Number(e.target.value) })} title="Width of one grid cell in pixels (Preferences has the stronger line, and an artboard can have its own grid)">
          {[...new Set([...GRID_PRESETS, p.gridSize])].sort((a, b) => a - b).map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
