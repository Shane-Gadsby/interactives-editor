import { describe, expect, it } from 'vitest';
import { cleanGrid, DEFAULT_GRID, GRID_PRESETS, gridDelta, gridFor, gridLabel, gridLook, nudgeDelta, pickSnap, shiftSteps, snapAxis, snapPoint, snapScalar } from '../src/lib/grid';
import { withoutLinks } from '../src/lib/export';
import { createProject } from 'interactives-player';

describe('grid size and subdivisions', () => {
  it('cleans values into whole numbers inside the range, falling back to the default', () => {
    expect(cleanGrid({ size: 12.4, subdivisions: 3.6 })).toEqual({ size: 12, subdivisions: 4 });
    expect(cleanGrid({ size: 0, subdivisions: 999 })).toEqual({ size: 1, subdivisions: 32 });
    expect(cleanGrid({ size: 9999 }).size).toBe(512);
    expect(cleanGrid({ size: NaN, subdivisions: undefined })).toEqual(DEFAULT_GRID);
    expect(cleanGrid(null, { size: 16, subdivisions: 2 })).toEqual({ size: 16, subdivisions: 2 });
  });
  it('has the presets from the brief', () => {
    expect(GRID_PRESETS).toEqual([1, 2, 4, 5, 8, 10, 12, 16, 20, 24, 32, 48, 50, 64]);
  });
  it('uses the artboard override over the person default', () => {
    const p = { gridSize: 10, gridSubdivisions: 5 };
    expect(gridFor({}, p)).toEqual({ size: 10, subdivisions: 5 });
    expect(gridFor(undefined, p)).toEqual({ size: 10, subdivisions: 5 });
    expect(gridFor({ grid: { size: 24, subdivisions: 2 } }, p)).toEqual({ size: 24, subdivisions: 2 });
    // a half-made override takes the rest from the default
    expect(gridFor({ grid: { size: 24 } }, p)).toEqual({ size: 24, subdivisions: 5 });
    // a bad stored default is repaired
    expect(gridFor(null, { gridSize: -3, gridSubdivisions: 0 })).toEqual({ size: 1, subdivisions: 1 });
  });
  it('labels it for the status area', () => {
    expect(gridLabel({ size: 8, subdivisions: 4 })).toBe('8 px (every 4)');
    expect(gridLabel({ size: 8, subdivisions: 1 })).toBe('8 px');
  });
});

describe('snapping to the grid', () => {
  it('snaps a value and a point to the nearest line, measured from the origin', () => {
    expect(snapScalar(13, 8)).toBe(16);
    expect(snapScalar(11, 8)).toBe(8);
    expect(snapScalar(-5, 8)).toBe(-8);
    expect(snapPoint({ x: 3, y: 21 }, { size: 8, subdivisions: 4 })).toEqual({ x: 0, y: 24 });
  });
  it('moves by the smallest amount that puts one edge on a line', () => {
    // right edge 103 needs 1 to reach 104, the left edge 3 needs 3 to reach 0
    expect(gridDelta([3, 103], 8)).toBe(1);
    expect(gridDelta([5, 100], 8)).toBe(3);
    expect(gridDelta([5, 98], 8)).toBe(-2);
    expect(gridDelta([16, 70], 8)).toBe(0);
    expect(gridDelta([], 8)).toBe(0);
  });
  it('lets a smart guide win when it is as close or closer, else the grid takes it', () => {
    expect(pickSnap(2, 3)).toEqual({ d: 2, smart: true });
    expect(pickSnap(3, 3)).toEqual({ d: 3, smart: true });
    expect(pickSnap(4, 3)).toEqual({ d: 3, smart: false });
    expect(pickSnap(null, -2)).toEqual({ d: -2, smart: false });
    expect(pickSnap(5, null)).toEqual({ d: 5, smart: true });
    expect(pickSnap(null, null)).toEqual({ d: 0, smart: false });
  });
  it('combines them per axis: no grid is the old smart snap, with grid it always lands on something', () => {
    const th = 6;
    // a layer edge at 100 is 2 away from a guide at 102 and 4 from the grid line at 104 (size 8)
    expect(snapAxis([100], [102], th, 8)).toEqual({ d: 2, at: 102 });
    // the guide is 5 away but the grid line is 1 away: grid wins, no guide drawn
    expect(snapAxis([103], [108], th, 8)).toEqual({ d: 1, at: null });
    // nothing within the threshold: the old behaviour does not move, the grid does
    expect(snapAxis([13], [100], th, null)).toEqual({ d: 0, at: null });
    expect(snapAxis([13], [100], th, 8)).toEqual({ d: 3, at: null });
    // grid candidates can be fewer than the smart ones (the centre is not put on a line)
    expect(snapAxis([10, 50, 90], [], th, 8, [10, 90])).toEqual({ d: -2, at: null });
  });
  it('rotated layers snap their bounds: the bounds are what is passed in', () => {
    // a 45 degree square of side 100 has bounds of about 141.42; its left edge at 7.3 snaps to 8
    expect(gridDelta([7.3, 7.3 + 141.42], 8)).toBeCloseTo(0.7, 5);
  });
});

describe('nudging with the grid on', () => {
  it('steps from a line to the next line', () => {
    expect(nudgeDelta(16, 1, 8)).toBe(8);
    expect(nudgeDelta(16, -1, 8)).toBe(-8);
    expect(nudgeDelta(0, -1, 8)).toBe(-8);
  });
  it('goes to the nearest line first when the edge is off the grid', () => {
    expect(nudgeDelta(13, 1, 8)).toBe(3);
    expect(nudgeDelta(13, -1, 8)).toBe(-5);
    expect(nudgeDelta(-3, -1, 8)).toBe(-5);
  });
  it('a Shift nudge goes several cells and stays on the grid', () => {
    expect(nudgeDelta(16, 1, 8, 4)).toBe(32);
    expect(nudgeDelta(13, 1, 8, 4)).toBe(27);
    expect(nudgeDelta(13, -1, 8, 4)).toBe(-29);
    expect(shiftSteps({ size: 8, subdivisions: 4 })).toBe(4);
    expect(shiftSteps({ size: 8, subdivisions: 1 })).toBe(10);
  });
});

describe('what the grid looks like', () => {
  it('fades the minor lines when zoomed far out, then the major ones', () => {
    const g = { size: 8, subdivisions: 4 };
    expect(gridLook(g, 2)).toEqual({ minor: 1, major: 1 });
    expect(gridLook(g, 0.5).minor).toBe(0);
    expect(gridLook(g, 0.5).major).toBeGreaterThan(0);
    expect(gridLook(g, 0.1)).toEqual({ minor: 0, major: 0 });
    const mid = gridLook(g, 0.6);
    expect(mid.minor).toBeGreaterThan(0);
    expect(mid.minor).toBeLessThan(1);
  });
});

describe('the artboard override stays out of exports', () => {
  it('is dropped from the project that leaves the editor', () => {
    const p = createProject('t');
    p.artboards[0].grid = { size: 24, subdivisions: 2 };
    const out = withoutLinks(p);
    expect(out.artboards[0].grid).toBeUndefined();
    // the project in the editor still has it
    expect(p.artboards[0].grid).toEqual({ size: 24, subdivisions: 2 });
  });
});
