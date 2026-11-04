import { ease, type Easing } from 'interactives-player';
import { store } from '../store/store';

/** The nearest cubic-bezier to a preset, so dragging a handle starts from what was there. */
export function bezierFor(e: Easing): [number, number, number, number] {
  if (Array.isArray(e)) return [...e] as [number, number, number, number];
  const presets: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    easeIn: [0.42, 0, 1, 1],
    easeOut: [0, 0, 0.58, 1],
    easeInOut: [0.42, 0, 0.58, 1],
    backIn: [0.6, -0.28, 0.735, 0.045],
    backOut: [0.175, 0.885, 0.32, 1.275],
    elasticOut: [0.2, 1.6, 0.4, 1],
    bounceOut: [0.25, 1.3, 0.5, 1],
  };
  return presets[e] ?? [0.25, 0.1, 0.25, 1];
}

/**
 * The tween's easing as an editable graph: time runs left to right, the value bottom (start) to top (end).
 * The dashed lines are the start (0) and end (1) values; the range grows to show overshoot (back, elastic,
 * bounce). Dragging a handle makes the easing a custom curve.
 */
export function CurveEditor({ ease: e, onChange }: { ease: Easing; onChange: (e: Easing) => void }) {
  const W = 196;
  const H = 120;
  const pad = 10;
  const bez = Array.isArray(e) ? e : null;
  // Vertical range: at least 0..1, more when the curve or the handles go past
  const handles = bez ?? bezierFor(e);
  const samples: number[] = [];
  for (let i = 0; i <= 60; i++) samples.push(ease(e, i / 60));
  samples.push(handles[1], handles[3]);
  const lo = Math.min(0, ...samples) - 0.08;
  const hi = Math.max(1, ...samples) + 0.08;
  const sx = (t: number) => pad + t * (W - pad * 2);
  const sy = (v: number) => pad + ((hi - v) / (hi - lo)) * (H - pad * 2);
  const fromScreen = (px: number, py: number) => ({ t: Math.max(0, Math.min(1, (px - pad) / (W - pad * 2))), v: hi - ((py - pad) / (H - pad * 2)) * (hi - lo) });
  const pts = samples.slice(0, 61).map((v, i) => `${sx(i / 60).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const drag = (which: 0 | 1) => (ev: React.PointerEvent<SVGCircleElement>) => {
    ev.preventDefault();
    const svg = (ev.currentTarget as SVGCircleElement).ownerSVGElement!;
    const box = svg.getBoundingClientRect();
    const start = [...handles] as [number, number, number, number];
    const move = (m: PointerEvent) => {
      const p = fromScreen(((m.clientX - box.left) / box.width) * W, ((m.clientY - box.top) / box.height) * H);
      const next = [...start] as [number, number, number, number];
      const v = Math.round(Math.max(-2, Math.min(3, p.v)) * 100) / 100;
      const t = Math.round(p.t * 100) / 100;
      if (which === 0) [next[0], next[1]] = [t, v];
      else [next[2], next[3]] = [t, v];
      onChange(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      store().commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <svg className="curve-editor" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <line className="ce-guide" x1={sx(0)} x2={sx(1)} y1={sy(0)} y2={sy(0)} />
      <line className="ce-guide" x1={sx(0)} x2={sx(1)} y1={sy(1)} y2={sy(1)} />
      <text className="ce-label" x={2} y={sy(0) + 3}>
        0
      </text>
      <text className="ce-label" x={2} y={sy(1) + 3}>
        1
      </text>
      <polyline className="ce-curve" points={pts} />
      <line className="ce-arm" x1={sx(0)} y1={sy(0)} x2={sx(handles[0])} y2={sy(handles[1])} />
      <line className="ce-arm" x1={sx(1)} y1={sy(1)} x2={sx(handles[2])} y2={sy(handles[3])} />
      <circle className="ce-handle" cx={sx(handles[0])} cy={sy(handles[1])} r={5} onPointerDown={drag(0)}>
        <title>Drag to shape the start of the curve</title>
      </circle>
      <circle className="ce-handle" cx={sx(handles[2])} cy={sy(handles[3])} r={5} onPointerDown={drag(1)}>
        <title>Drag to shape the end of the curve</title>
      </circle>
    </svg>
  );
}
