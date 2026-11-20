import { PARTICLE_DEFAULTS, PARTICLE_LOOKS, PARTICLE_PRESETS, type ParticlePreset, type Particles, type Project, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { ColorField, IconButton, NumberField, Section, SelectField } from '../components/ui';
import { Icons } from '../components/icons';

const PRESET_LABELS: Record<ParticlePreset, string> = {
  rain: 'Rain',
  snow: 'Snow',
  petals: 'Petals',
  leaves: 'Falling leaves',
  dust: 'Dust motes',
  sparks: 'Sparks',
  bubbles: 'Bubbles',
};

/** A rectangle filled with drifting things as it plays: what they are, how many, how fast, the wind, their size and colour. */
export function ParticlesSection({ node, project }: { node: Extract<SceneNode, { type: 'rect' }>; project: Project }) {
  const k = node.particles;
  const on = !!k;
  const set = (patch: Partial<Particles>, coalesce?: string) => {
    const next: Record<string, unknown> = { ...(k ?? { preset: 'snow' }), ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === '') delete next[key];
    store().setProps([node.id], { particles: next as unknown as Particles }, coalesce ?? `particles-${Object.keys(patch).join(',')}-${node.id}`);
  };
  const pictures = project.assets.filter((a) => a.mime.startsWith('image/'));
  return (
    <Section
      help="particles"
      title="Particles"
      defaultOpen={on}
      actions={
        on ? (
          <IconButton icon={<Icons.trash />} title="Take the particles off this rectangle" onClick={() => store().setProps([node.id], { particles: undefined })} />
        ) : (
          <IconButton icon={<Icons.plus />} title="Fill this rectangle with rain, snow, petals and the like as it plays" onClick={() => store().setProps([node.id], { particles: { preset: 'snow' } })} />
        )
      }
    >
      {!on && <div className="muted small">No particles. The + fills this rectangle with rain, snow, petals and the like as it plays.</div>}
      {on && (
        <>
          <SelectField
            label="Kind"
            title="What drifts across the rectangle, and how it moves. They hold still on the canvas: press Preview to see them move"
            value={k!.preset}
            options={PARTICLE_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
            onChange={(v) => set({ preset: v as ParticlePreset })}
          />
          <NumberField label="Amount" title="How many, from 0 to 100, for the rectangle's size. A slow device draws fewer on its own" value={k!.amount ?? PARTICLE_DEFAULTS.amount} min={0} max={100} onChange={(v) => set({ amount: Math.min(100, Math.max(0, v)) }, `particles-amount-${node.id}`)} />
          <NumberField label="Speed" suffix="x" title="How fast, as a multiple of the kind's own speed (0.1 to 3)" value={k!.speed ?? PARTICLE_DEFAULTS.speed} min={0.1} max={3} step={0.1} onChange={(v) => set({ speed: Math.min(3, Math.max(0.1, v)) }, `particles-speed-${node.id}`)} />
          <NumberField label="Wind" title="A sideways push: below 0 blows to the left, above 0 to the right (-100 to 100)" value={k!.wind ?? PARTICLE_DEFAULTS.wind} min={-100} max={100} onChange={(v) => set({ wind: Math.min(100, Math.max(-100, v)) }, `particles-wind-${node.id}`)} />
          <NumberField label="Size" suffix="x" title="How big, as a multiple of the kind's own size (0.25 to 4)" value={k!.size ?? PARTICLE_DEFAULTS.size} min={0.25} max={4} step={0.25} onChange={(v) => set({ size: Math.min(4, Math.max(0.25, v)) }, `particles-size-${node.id}`)} />
          <SelectField
            label="Colours"
            title="The kind's own colours (a mix for petals, leaves and sparks), or one colour you pick for all of them"
            value={k!.colour ? 'one' : 'own'}
            options={[
              { value: 'own', label: 'The kind’s own' },
              { value: 'one', label: 'One colour' },
            ]}
            onChange={(v) => set({ colour: v === 'one' ? PARTICLE_LOOKS[k!.preset].colours[0] : undefined })}
          />
          {k!.colour && <ColorField label="Colour" title="The colour all of them are drawn in" value={k!.colour} onChange={(v) => set({ colour: v }, `particles-colour-${node.id}`)} />}
          <SelectField
            label="Picture"
            title="Your own picture drawn as each particle (a petal, a leaf, a logo). It still moves the way the kind does"
            value={k!.asset ?? ''}
            options={[{ value: '', label: 'The kind’s own shape' }, ...pictures.map((a) => ({ value: a.id, label: a.name }))]}
            onChange={(v) => set({ asset: v || undefined })}
          />
        </>
      )}
    </Section>
  );
}
