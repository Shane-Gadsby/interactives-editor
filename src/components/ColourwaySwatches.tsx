import type { Colourway } from '../lib/branded/looks';

/** A colourway's gradient as a CSS background, the same pair the hero pages use. */
export const colourwayGradient = (w: Colourway): string => `linear-gradient(135deg, ${w.brand.gradientStart}, ${w.brand.gradientEnd})`;

/**
 * Round swatches drawn from each colourway's gradient, one of them chosen. A radio group: arrow keys move between them, the name
 * is the tooltip and the accessible name. Used by the Templates page and by a branded project's settings.
 */
export function ColourwaySwatches({ ways, value, onPick, label = 'Colourway' }: { ways: Colourway[]; value: string; onPick: (id: string) => void; label?: string }) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const next = ways[(i + step + ways.length) % ways.length];
    onPick(next.id);
    //(the event is gone by the next frame, so keep the group)
    const group = e.currentTarget.parentElement;
    requestAnimationFrame(() => group?.querySelector<HTMLElement>(`[data-way="${next.id}"]`)?.focus());
  };
  return (
    <div className="colourway-swatches" role="radiogroup" aria-label={label}>
      {ways.map((w, i) => (
        <button
          key={w.id}
          type="button"
          role="radio"
          aria-checked={w.id === value}
          aria-label={w.name}
          data-way={w.id}
          tabIndex={w.id === value || (!ways.some((x) => x.id === value) && i === 0) ? 0 : -1}
          className={`colourway-swatch${w.id === value ? ' on' : ''}`}
          style={{ background: colourwayGradient(w) }}
          title={`${w.name}: ${w.description}`}
          onClick={() => onPick(w.id)}
          onKeyDown={(e) => move(e, i)}
        />
      ))}
    </div>
  );
}
