import { useState } from 'react';
import type { SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { Row, Section, SelectField, NumberField } from '../components/ui';
import { ANIM_PRESETS, animChoices, animOptions, setAnimChoices, type AnimPresetId, type AnimSide, type AnimWhen } from '../lib/animate-presets';

const WHEN: { value: AnimWhen; label: string }[] = [
  { value: 'start', label: 'The page opens' },
  { value: 'click', label: 'This layer is clicked' },
];
const SIDES: { value: AnimSide; label: string }[] = [
  { value: 'left', label: 'The left' },
  { value: 'right', label: 'The right' },
  { value: 'top', label: 'The top' },
  { value: 'bottom', label: 'The bottom' },
];

/** Animate any layer with a named preset. What it writes is an ordinary timeline and ordinary Interactions nodes. */
export function AnimateSection({ nodes }: { nodes: SceneNode[] }) {
  const [c, setC] = useState(animChoices());
  const [said, setSaid] = useState('');
  const pick = (patch: Partial<typeof c>) => {
    setAnimChoices(patch);
    setC(animChoices());
  };
  const run = (id: AnimPresetId) => {
    const made = store().applyAnimation(
      nodes.map((n) => n.id),
      id,
      animOptions(),
    );
    if (!made.length) return setSaid('Nothing to animate here.');
    const names = made.map((m) => `"${m.timelineName}"`).join(', ');
    setSaid(`Added ${names}. It is an ordinary timeline, so you can change it in the Timeline tab.${made.some((m) => m.plainer) ? ' Auto layout places this layer, so it uses a gentler move instead of sliding or shaking sideways.' : ''}`);
  };
  return (
    <Section help="animation-presets" title="Animate" defaultOpen={false}>
      <Row k="Animation presets" words={['animate', 'fade in', 'slide in', 'pop', 'pulse', 'shake', 'fade out', 'entrance', 'appear', 'bounce']}>
        <span className="field-label" title="Ready-made animations: each adds a timeline named for the layer, and what starts it">
          Presets
        </span>
        <span className="anim-presets" role="group" aria-label="Animation presets">
          {ANIM_PRESETS.map((p) => (
            <button key={p.id} className="btn" title={p.tip} onClick={() => run(p.id)}>
              {p.label}
            </button>
          ))}
        </span>
      </Row>
      <SelectField<AnimWhen> label="When" title="What starts the animation: the page opening, or a click on this layer" value={c.when} options={WHEN} onChange={(v) => pick({ when: v })} />
      <SelectField<AnimSide> label="Slide in from" title="The side Slide in arrives from" value={c.from} options={SIDES} onChange={(v) => pick({ from: v })} />
      <NumberField label="Delay (ms)" title="How long to wait before it starts" value={c.delay} min={0} step={50} onChange={(v) => pick({ delay: v })} />
      <NumberField label="Length (ms)" title="How long the animation takes. 0 uses each preset's own length" value={c.duration ?? 0} min={0} step={50} onChange={(v) => pick({ duration: v > 0 ? v : null })} />
      {said ? (
        <p className="hint" role="status">
          {said}
        </p>
      ) : (
        <p className="hint">Pick one and it is added as a timeline you can open and change. Running it again on the same layer replaces it. People whose device asks for less motion see the end pose instead.</p>
      )}
    </Section>
  );
}
