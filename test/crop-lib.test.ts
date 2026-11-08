import { describe, expect, it } from 'vitest';
import { REST, canCrop, clampCrop, cropOf, fittedSize, panBy, stored, zoomAt } from '../src/lib/crop';
import { createNode, type ImageNode } from 'interactives-player';

const frame = { w: 300, h: 200 };
const wide = { w: 1200, h: 600 }; // twice as wide as it is tall: wider than the frame (3:2)
const tall = { w: 600, h: 1200 };

describe('how a picture sits in its frame before any zoom', () => {
  it('cover fills the frame, contain fits inside it, fill stretches', () => {
    expect(fittedSize('cover', frame, wide)).toEqual({ w: 400, h: 200 });
    expect(fittedSize('contain', frame, wide)).toEqual({ w: 300, h: 150 });
    expect(fittedSize('cover', frame, tall)).toEqual({ w: 300, h: 600 });
    expect(fittedSize('fill', frame, tall)).toEqual({ w: 300, h: 200 });
  });
});

describe('keeping a crop in bounds', () => {
  it('a zoom is at least 1 and at most 20', () => {
    expect(clampCrop({ x: 0, y: 0, zoom: 0.3 }, 'cover', frame, wide).zoom).toBe(1);
    expect(clampCrop({ x: 0, y: 0, zoom: 99 }, 'cover', frame, wide).zoom).toBe(20);
  });
  it('at zoom 1 a wide picture can only move sideways, as far as it overhangs the frame', () => {
    // 400 wide in a 300 frame: 50px each way, a sixth of the frame
    const c = clampCrop({ x: 5, y: 5, zoom: 1 }, 'cover', frame, wide);
    expect(c.x).toBeCloseTo(50 / 300, 4);
    expect(c.y).toBe(0);
    expect(clampCrop({ x: -5, y: 0, zoom: 1 }, 'cover', frame, wide).x).toBeCloseTo(-50 / 300, 4);
  });
  it('zooming gives room in both directions', () => {
    const c = clampCrop({ x: 9, y: 9, zoom: 2 }, 'cover', frame, wide);
    // 800 x 400 in 300 x 200: 250px and 100px each way
    expect(c.x).toBeCloseTo(250 / 300, 4);
    expect(c.y).toBeCloseTo(100 / 200, 4);
  });
  it('a contain fit that is smaller than the frame does not move until it is zoomed past it', () => {
    expect(clampCrop({ x: 1, y: 1, zoom: 1 }, 'contain', frame, wide)).toEqual({ x: 0, y: 0, zoom: 1 });
    const z = clampCrop({ x: 9, y: 0, zoom: 4 }, 'contain', frame, wide);
    // 1200 wide at zoom 4 in a 300 frame: 450px each way
    expect(z.x).toBeCloseTo(450 / 300, 4);
  });
  it('without the size it only keeps the numbers sane', () => {
    expect(clampCrop({ x: 50, y: -50, zoom: 2 }, 'cover', frame, null)).toEqual({ x: 10, y: -10, zoom: 2 });
    expect(clampCrop({ x: NaN, y: Infinity, zoom: NaN }, 'cover', frame, null)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('moving and zooming', () => {
  it('a drag in pixels moves the picture by that share of the frame', () => {
    expect(panBy(REST, 30, -20, frame)).toEqual({ x: 0.1, y: -0.1, zoom: 1 });
  });
  it('zooming about the middle keeps a centred picture centred', () => {
    expect(zoomAt(REST, 2, { x: 0, y: 0 }, frame)).toEqual({ x: 0, y: 0, zoom: 2 });
  });
  it('zooming under the pointer keeps the point under it still', () => {
    const at = { x: 60, y: -40 };
    const c = zoomAt(REST, 2, at, frame);
    // the picture point under the pointer: (at - offset) / zoom, the same before and after
    const before = { x: at.x, y: at.y };
    const after = { x: (at.x - c.x * frame.w) / c.zoom, y: (at.y - c.y * frame.h) / c.zoom };
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // zooming back out from there lands where it started
    const back = zoomAt(c, 1, at, frame);
    expect(back.x).toBeCloseTo(0, 6);
    expect(back.y).toBeCloseTo(0, 6);
  });
  it('zoom stops at the limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 18 }, 40, { x: 0, y: 0 }, frame).zoom).toBe(20);
    expect(zoomAt({ x: 0, y: 0, zoom: 1.2 }, 0.1, { x: 0, y: 0 }, frame).zoom).toBe(1);
  });
});

describe('what is stored', () => {
  it('nothing for a crop at rest, the crop otherwise', () => {
    expect(stored(REST)).toBeUndefined();
    expect(stored({ x: 0.1, y: 0, zoom: 1 })).toEqual({ x: 0.1, y: 0, zoom: 1 });
    expect(cropOf({})).toEqual(REST);
    expect(cropOf({ crop: { x: 0, y: 0, zoom: 1 } })).toEqual(REST);
    expect(cropOf({ crop: { x: 0.2, y: 0, zoom: 2 } })).toEqual({ x: 0.2, y: 0, zoom: 2 });
  });
  it('only a picture that draws as one plain picture can be cropped', () => {
    const img = (extra: Record<string, unknown> = {}) => createNode('image', { assetId: 'a', ...extra } as never) as ImageNode;
    expect(canCrop(img())).toBe(true);
    expect(canCrop(img({ assetId: null }))).toBe(false);
    expect(canCrop(img({ slice: { top: 1, right: 1, bottom: 1, left: 1 } }))).toBe(false);
    expect(canCrop(img({ mesh: { vertices: [{ x: 0, y: 0, u: 0, v: 0 }], triangles: [0, 0, 0] } }))).toBe(false);
  });
});
