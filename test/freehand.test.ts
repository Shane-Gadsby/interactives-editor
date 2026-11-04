import { describe, expect, it } from 'vitest';
import { freehandToPath, simplify } from '../src/canvas/freehand';

describe('freehand', () => {
  it('drops points on a straight line', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 2 }));
    expect(simplify(line, 1)).toEqual([line[0], line[49]]);
  });
  it('keeps corners and gives inner points smooth handles', () => {
    const pts = [...Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 95, y: i * 5 }))];
    const out = freehandToPath(pts, 0.5);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0].in).toBeNull();
    const mid = out[1];
    expect(mid.out!.x).toBeCloseTo(-mid.in!.x);
  });
});
