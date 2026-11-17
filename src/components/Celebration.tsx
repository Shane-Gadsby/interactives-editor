import { useEffect } from 'react';
import { dismissCheer, useCheer } from '../lib/celebrate';
import { Badge } from './Badge';

//Confetti bits: where each flies to, how far it spins and its colour. Fixed, so a tutorial finished twice looks the same twice
const BITS = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
  const r = 90 + ((i * 37) % 70);
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r * 0.8 - 40), rot: ((i * 53) % 360) - 180, hue: ['var(--primary-bg)', '#e0457b', '#3fb68b', '#4a90d9', '#f2c14e'][i % 5], delay: (i % 7) * 18 };
});

/** Mounted once by the app: the step line and the badge card, in a corner. Never takes the focus, never blocks; Esc or Close puts it away. */
export function CelebrationHost() {
  const c = useCheer();
  useEffect(() => {
    if (!c) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && dismissCheer();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [c]);
  if (!c) return null;
  if (c.kind === 'step') {
    return (
      <div className="cheer-line" role="status" key={c.key}>
        <span className="cheer-tick" aria-hidden="true">✓</span> {c.text}
      </div>
    );
  }
  return (
    <div className={`cheer-badge${c.still ? ' still' : ''}`} role="status" key={c.key}>
      {!c.still && (
        <div className="cheer-confetti" aria-hidden="true">
          {BITS.map((b, i) => (
            <i key={i} style={{ '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--rot': `${b.rot}deg`, background: b.hue, animationDelay: `${b.delay}ms` } as React.CSSProperties} />
          ))}
        </div>
      )}
      <Badge size={56} />
      <div className="cheer-text">
        <strong>{c.title}</strong>
        {c.lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={dismissCheer}>
        ×
      </button>
    </div>
  );
}
