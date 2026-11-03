import { EASING_NAMES, type Easing, type LayoutAnimate, type LayoutTransition } from 'interactives-player';
import { CheckField, NumberField, Row, SelectField } from './ui';
import { CurveEditor, bezierFor } from './CurveEditor';

/** What turning "Animate changes" on starts with. */
export const DEFAULT_LAYOUT_ANIMATE: LayoutAnimate = { duration: 250, ease: 'easeOut' };

const TRANSITIONS: { value: LayoutTransition; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'scale', label: 'Scale' },
  { value: 'fade-scale', label: 'Fade and scale' },
];

/**
 * The auto layout section's "Animate changes": whether children glide to their new place at runtime (Preview and the
 * player; the canvas always snaps), for how long and with what easing, and how children enter and leave.
 */
export function LayoutAnimateFields({ value, onChange }: { value: LayoutAnimate | null | undefined; onChange: (next: LayoutAnimate | null) => void }) {
  const patch = (p: Partial<LayoutAnimate>) => {
    const next = { ...(value as LayoutAnimate), ...p };
    // 'none' is the default: leave it out of the document
    if (next.enter === 'none') delete next.enter;
    if (next.exit === 'none') delete next.exit;
    onChange(next);
  };
  return (
    <>
      <Row>
        <CheckField
          label="Animate changes"
          title="Children glide to their new place when layout moves them while it plays (a layer shown or hidden, text changing size, a list changing). The canvas does not animate while you edit."
          value={!!value}
          onChange={(v) => onChange(v ? { ...DEFAULT_LAYOUT_ANIMATE } : null)}
        />
      </Row>
      {value && (
        <>
          <Row>
            <NumberField label="Duration" title="How long a glide takes, in milliseconds" value={value.duration} min={0} step={10} suffix="ms" onChange={(v) => patch({ duration: v })} />
            <SelectField
              label="Easing"
              title="How a glide speeds up and slows down"
              value={Array.isArray(value.ease) ? 'custom' : value.ease}
              options={[...EASING_NAMES.map((e) => ({ value: e as string, label: e })), { value: 'custom', label: 'Custom (drag the handles)' }]}
              onChange={(v) => patch({ ease: v === 'custom' ? bezierFor(value.ease) : (v as Easing) })}
            />
          </Row>
          {Array.isArray(value.ease) && <CurveEditor ease={value.ease} onChange={(e) => patch({ ease: e })} />}
          <Row>
            <SelectField label="Enter" title="How a layer looks as it appears (shown, or added by a list)" value={value.enter ?? 'none'} options={TRANSITIONS} onChange={(v) => patch({ enter: v })} />
            <SelectField label="Exit" title="How a layer looks as it goes (hidden, or removed by a list); it fades where it was, then goes" value={value.exit ?? 'none'} options={TRANSITIONS} onChange={(v) => patch({ exit: v })} />
          </Row>
        </>
      )}
    </>
  );
}
