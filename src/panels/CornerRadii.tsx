import { useState } from 'react';
import { getPath, type Artboard, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { Icons } from '../components/icons';
import { NumberField, Row } from '../components/ui';
import { CORNER_NAMES, cornersOf, radiiLocked } from '../lib/corner-radii';
import { KeyButton, useSetter, useShown } from './Inspector';

/** Whether any timeline keys one corner of these layers on its own. */
function hasCornerTracks(ab: Artboard | undefined, ids: string[]): boolean {
  return !!ab?.timelines.some((t) => t.tracks.some((tr) => ids.includes(tr.nodeId) && tr.prop.startsWith('cornerRadii.')));
}

/**
 * The corner radii of a rect or frame: four fields (top-left, top-right, bottom-left, bottom-right on screen) and a
 * lock. Locked, editing any field sets all four and the layer keeps a single `cornerRadius`; unlocked, each corner has
 * its own value (`cornerRadii`) and its own keyframe button.
 */
export function CornerRadii({ nodes }: { nodes: SceneNode[] }) {
  const n = nodes[0];
  const ids = nodes.map((x) => x.id);
  // Chosen with the lock button; until then it follows the layer (all four the same = locked)
  const [choice, setChoice] = useState<boolean | null>(null);
  const locked = choice ?? nodes.every(radiiLocked);
  const shown = useShown(n);
  const set = useSetter(ids);
  const radius = (i: number) => Number(shown(`cornerRadii.${i}`) ?? shown('cornerRadius') ?? cornersOf(n)[i]) || 0;
  const values = [0, 1, 2, 3].map(radius);

  const setAll = (v: number) => {
    set({ cornerRadius: v }, 'corner-radii');
    // Back to a single radius: the per-corner list goes, unless a timeline keys a corner (then it would stop applying)
    const ab = store().artboard();
    const withList = nodes.filter((x) => Array.isArray(getPath(x, 'cornerRadii')));
    if (!withList.length) return;
    if (hasCornerTracks(ab, ids)) set({ cornerRadii: [v, v, v, v] }, 'corner-radii');
    else
      store().update((d) => {
        const dab = d.artboards.find((a) => a.id === ab?.id);
        const walk = (list: SceneNode[]) => {
          for (const c of list) {
            if (ids.includes(c.id)) delete (c as { cornerRadii?: unknown }).cornerRadii;
            if ('children' in c && Array.isArray(c.children)) walk(c.children as SceneNode[]);
          }
        };
        if (dab) walk(dab.children as SceneNode[]);
      }, { coalesce: 'corner-radii' });
  };
  const setOne = (i: number, v: number) => (locked ? setAll(v) : set({ [`cornerRadii.${i}`]: v }, `corner-radii-${i}`));
  const toggle = () => {
    // Locking with different radii takes the top-left one for all of them
    if (!locked) setAll(values[0]);
    setChoice(!locked);
  };
  const field = (i: number, label: string) => (
    <div className="keyed">
      <NumberField label={label} title={`${CORNER_NAMES[i]} corner radius in pixels${locked ? '. The corners are locked together, so this sets all four' : ''}`} value={values[i]} min={0} onChange={(v) => setOne(i, v)} onCommit={() => store().commit()} />
      {!locked && <KeyButton node={n} ids={ids} prop={`cornerRadii.${i}`} />}
    </div>
  );
  return (
    <div className="corner-radii labels-66">
      <div className="corner-head">
        <span className="field-label">Radius</span>
        <button
          className={`lock-toggle${locked ? ' on' : ''}`}
          title={locked ? 'Corners locked together: editing one sets all four. Click to set each corner on its own' : 'Each corner on its own. Click to lock them together (all take the top-left value)'}
          aria-label={locked ? 'Unlock the corners' : 'Lock the corners together'}
          aria-pressed={locked}
          onClick={toggle}
        >
          {locked ? <Icons.lock width={13} /> : <Icons.unlock width={13} />}
        </button>
        {locked && <KeyButton node={n} ids={ids} prop="cornerRadius" />}
      </div>
      <Row>
        {field(0, 'Top-left')}
        {field(1, 'Top-right')}
      </Row>
      <Row>
        {field(3, 'Bottom-left')}
        {field(2, 'Bottom-right')}
      </Row>
    </div>
  );
}
