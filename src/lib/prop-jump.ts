//Property keys: take the selected layer's Position, Scale, Rotation, Opacity or Anchor to hand. The Inspector's field is
//scrolled to and focused (its section opened first), and the Timeline's track for it, when the open timeline has one, is
//scrolled to and flashed so you can see where the keys are.
import { store } from '../store/store';
import { setDock, showPanel } from './dock';
import { setSectionOpen } from './section-fold';

export type JumpProp = 'position' | 'scale' | 'rotation' | 'opacity' | 'anchor';

/** The Inspector row to land on (by its data-prop key, the first that exists) and the layer properties the Timeline holds for it. */
export const JUMPS: Record<JumpProp, { label: string; rows: string[]; tracks: string[] }> = {
  position: { label: 'Position', rows: ['x-position', 'x'], tracks: ['x', 'y'] },
  scale: { label: 'Scale', rows: ['scale-w', 'scale'], tracks: ['scaleX', 'scaleY'] },
  rotation: { label: 'Rotation', rows: ['rotation'], tracks: ['rotation'] },
  opacity: { label: 'Opacity', rows: ['opacity'], tracks: ['opacity'] },
  anchor: { label: 'Anchor point', rows: ['pivot-x', 'pivot'], tracks: ['originX', 'originY'] },
};

const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(.key-btn):not(:disabled)';
const css = (v: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v);

let flashTimer: ReturnType<typeof setTimeout> | null = null;
function flash(els: Element[]) {
  for (const el of els) el.classList.add('prop-jumped');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => document.querySelectorAll('.prop-jumped').forEach((x) => x.classList.remove('prop-jumped')), 1600);
}

function land(prop: JumpProp, tries = 0) {
  const j = JUMPS[prop];
  const panel = document.querySelector<HTMLElement>('.inspector');
  //The Layer section's own rows (the shadow, fill and the rest have an opacity or an x of their own further down)
  const scope = panel?.querySelector<HTMLElement>('[data-section="layer-selection"]') ?? panel;
  const row = scope && j.rows.map((k) => scope.querySelector<HTMLElement>(`[data-prop="${css(k)}"]`)).find(Boolean);
  if (!row) {
    //The panel or the section is still drawing itself
    if (tries < 8) setTimeout(() => land(prop, tries + 1), 40);
    return;
  }
  row.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  const target = row.matches(FOCUSABLE) ? row : row.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus({ preventScroll: true });
  if (target instanceof HTMLInputElement) target.select();
  const labels = [...document.querySelectorAll<HTMLElement>('.timeline .track-label[data-track-prop]')].filter((el) => j.tracks.includes(el.dataset.trackProp ?? ''));
  const own = store().get().selection;
  const mine = labels.filter((el) => !el.dataset.trackNode || own.includes(el.dataset.trackNode));
  mine[0]?.scrollIntoView?.({ block: 'nearest' });
  flash([row, ...mine]);
}

/**
 * Go to a property of the selected layer. False (and a message) when nothing is selected. A page selected on its own has no
 * Position to go to, so that is a message too.
 */
export function jumpToProperty(prop: JumpProp): boolean {
  const s = store();
  const st = s.get();
  if (!st.selection.length) {
    s.toast(`Pick a layer first, then ${JUMPS[prop].label} takes you to its field`);
    return true;
  }
  if (!document.querySelector('.inspector')) setDock((l) => showPanel(l, 'inspector'));
  //Every one of these lives in the Layer section, which is open unless the person folded it
  setSectionOpen('layer-selection', true, true);
  setTimeout(() => land(prop), 0);
  return true;
}
