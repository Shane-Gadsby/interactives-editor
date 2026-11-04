import { describe, expect, it } from 'vitest';
import { importSvg, parsePathData } from '../src/lib/svg-import';

describe('SVG import', () => {
  it('parses path data with relative commands, curves, arcs and close', () => {
    const [sp] = parsePathData('M10 10 h20 v20 q-10 10 -20 0 z');
    expect(sp.closed).toBe(true);
    expect(sp.points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30],
    ]);
    expect(sp.points[2].out).toBeTruthy();
    const arc = parsePathData('M0 0 A10 10 0 0 1 20 0');
    const end = arc[0].points.at(-1)!;
    expect(end.x).toBeCloseTo(20);
    expect(end.y).toBeCloseTo(0);
  });

  it('turns shapes into path layers with transforms baked in, groups and gradients', () => {
    const r = importSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="400" height="200">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
      <style>.blue{fill:#00f}</style>
      <g id="Shapes" transform="translate(10 10)">
        <rect x="0" y="0" width="20" height="10" fill="url(#g)"/>
        <circle class="blue" cx="50" cy="50" r="10" stroke="#000" stroke-width="2"/>
      </g>
      <text x="100" y="50" font-size="10" fill="#333">Hello</text>
    </svg>`);
    expect([r.width, r.height]).toEqual([400, 200]);
    const g = r.nodes[0];
    expect(g.type).toBe('group');
    expect(g.name).toBe('Shapes');
    const [rect, circle] = (g as { children: { x: number; y: number; width: number; fill: unknown; stroke: unknown }[] }).children;
    // viewBox scale 2 and translate 10 => rect at 20,20 size 40 (relative to the group)
    expect(rect.width).toBe(40);
    expect(rect.fill).toMatchObject({ type: 'linear', angle: 180 });
    expect(circle.fill).toEqual({ type: 'solid', color: '#00f' });
    expect(circle.stroke).toMatchObject({ width: 4 });
    expect(r.nodes[1].type).toBe('text');
  });
});
