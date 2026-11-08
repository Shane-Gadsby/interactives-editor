import type { MenuItem } from './ContextMenu';
import { promptDialog } from './dialogs';
import { prefs, setPrefs } from '../lib/prefs';
import { cleanGrid, GRID_PRESETS, GRID_SIZE_RANGE, gridFor, gridLabel, type GridSpec } from '../lib/grid';
import { store } from '../store/store';
import { SNAP_DISTANCES, SNAP_ITEMS, toggleSnap } from '../lib/snapping';
import type { Artboard } from 'interactives-player';

const SUBDIVISIONS = [1, 2, 4, 5, 8, 10];
const tick = (on: boolean, label: string) => `${on ? '✓ ' : '   '}${label}`;

/** Ask for a cell size; null when cancelled. */
async function askSize(initial: number): Promise<number | null> {
  const v = await promptDialog({
    title: 'Grid size',
    label: `Cell size in pixels (${GRID_SIZE_RANGE.min} to ${GRID_SIZE_RANGE.max})`,
    initial: String(initial),
    confirmLabel: 'Use',
    validate: (t) => (Number.isFinite(Number(t)) && Number(t) >= GRID_SIZE_RANGE.min && Number(t) <= GRID_SIZE_RANGE.max ? null : `A number from ${GRID_SIZE_RANGE.min} to ${GRID_SIZE_RANGE.max}`),
  });
  return v === null ? null : cleanGrid({ size: Number(v) }).size;
}

const sizeItems = (current: GridSpec, set: (g: Partial<GridSpec>) => void, marked = true): MenuItem[] => [
  ...GRID_PRESETS.map((n) => ({ label: tick(marked && current.size === n, `${n} px`), onClick: () => set({ size: n }) })),
  {
    label: !marked || GRID_PRESETS.includes(current.size) ? 'Custom…' : tick(true, `Custom (${current.size} px)…`),
    onClick: async () => {
      const n = await askSize(current.size);
      if (n !== null) set({ size: n });
    },
  },
];
const subdivisionItems = (current: GridSpec, set: (g: Partial<GridSpec>) => void, marked = true): MenuItem[] =>
  SUBDIVISIONS.map((n) => ({ label: tick(marked && current.subdivisions === n, n === 1 ? 'No stronger lines' : `Every ${n} cells`), onClick: () => set({ subdivisions: n }) }));

const setDefault = (g: Partial<GridSpec>) => {
  const next = cleanGrid({ ...gridFor(null, prefs()), ...g });
  setPrefs({ gridSize: next.size, gridSubdivisions: next.subdivisions });
};

/** The snapping choices as menu items (the canvas menu; the tool bar's own dropdown is `SnapMenu`). */
export function snapItems(): MenuItem[] {
  const p = prefs();
  return [
    { label: tick(p.snapOn, 'Snapping'), title: 'Every snap target on or off together; your ticks are kept. Hold Ctrl while dragging to skip snapping', onClick: () => toggleSnap('on') },
    { separator: true },
    ...SNAP_ITEMS.map((i) => ({ label: tick(!!p[i.pref], i.label), hint: i.kind === 'grid' ? "Ctrl+'" : undefined, title: i.tip, onClick: () => toggleSnap(i.kind) })),
    { separator: true },
    { label: tick(p.snapLayersAll, 'Layers: all, not just siblings'), title: 'Layers snap to every layer on the artboard, not only the ones beside the layer you drag', onClick: () => toggleSnap('layersAll') },
    { label: `Snap distance (${p.snapDistance} px)`, items: SNAP_DISTANCES.map((n) => ({ label: tick(p.snapDistance === n, `${n} px`), onClick: () => setPrefs({ snapDistance: n }) })) },
  ];
}

/** Show grid, the snapping choices and the default grid size, for a right-click menu. */
export function gridMenu(): MenuItem[] {
  const p = prefs();
  const g = gridFor(null, p);
  return [
    { label: p.showGrid ? 'Hide grid' : 'Show grid', hint: 'Shift+G', onClick: () => setPrefs({ showGrid: !p.showGrid }) },
    { label: p.snapOn ? 'Snapping' : 'Snapping: off', items: snapItems() },
    { label: `Grid size (${gridLabel(g)})`, items: [...sizeItems(g, setDefault), { separator: true }, { heading: 'Stronger line' }, ...subdivisionItems(g, setDefault)] },
  ];
}

/** An artboard's own grid, over the default (kept in the document, so collaborators share it, and never exported). */
export function artboardGridMenu(ab: Artboard): MenuItem {
  const own = ab.grid ? cleanGrid(ab.grid) : null;
  const g = gridFor(ab, prefs());
  const set = (patch: Partial<GridSpec>) => {
    const next = cleanGrid({ ...g, ...patch });
    store().update((d) => {
      const a = d.artboards.find((x) => x.id === ab.id);
      if (a) a.grid = next;
    });
  };
  return {
    label: own ? `Grid for this artboard (${gridLabel(own)})` : 'Grid for this artboard',
    items: [
      { label: tick(!own, `My default (${gridLabel(gridFor(null, prefs()))})`), onClick: () => store().update((d) => void delete d.artboards.find((x) => x.id === ab.id)!.grid) },
      { separator: true },
      ...sizeItems(g, set, !!own),
      { separator: true },
      { heading: 'Stronger line' },
      ...subdivisionItems(g, set, !!own),
    ],
  };
}
