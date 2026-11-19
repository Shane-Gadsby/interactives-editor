//A picture's focal spot and zoom slider (the crop, said the way a person thinks of it), and the crop corners' arrows
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNode, createProject, type ImageNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { REST, clampCrop, focalOf, shownPart, withFocal, zoomAt } from '../src/lib/crop';
import { resizeCursorForAngle } from '../src/canvas/cursors';

vi.mock('../src/lib/natural-size', () => ({ useNaturalSize: () => ({ w: 1200, h: 600 }) }));
vi.mock('../src/lib/assets', async (orig) => ({ ...(await orig<typeof import('../src/lib/assets')>()), assetUrls: { ...(await orig<typeof import('../src/lib/assets')>()).assetUrls, resolve: () => 'blob:pic' } }));

import { CropFields } from '../src/components/CropFields';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//a wide picture (2:1) covering a square frame: it overflows left and right only
const frame = { w: 300, h: 300 };
const natural = { w: 1200, h: 600 };

describe('the focal spot', () => {
  it('is the middle of the picture until it is moved', () => {
    expect(focalOf(REST, 'cover', frame, natural)).toEqual({ u: 0.5, v: 0.5 });
  });

  it('putting it somewhere moves the picture so that spot is in the middle of the frame, and reads back', () => {
    const c = withFocal(REST, { u: 0.4, v: 0.5 }, 'cover', frame, natural);
    expect(c.zoom).toBe(1);
    expect(c.x).toBeCloseTo(0.2);
    expect(focalOf(c, 'cover', frame, natural).u).toBeCloseTo(0.4);
  });

  it('comes as close as it can when the frame would be uncovered: an edge of the picture stays at the edge of the frame', () => {
    const c = withFocal(REST, { u: 0, v: 0 }, 'cover', frame, natural);
    //the picture is twice the frame's width, so the furthest left the middle of the frame can see is a quarter in
    expect(focalOf(c, 'cover', frame, natural).u).toBeCloseTo(0.25);
    //and it can't move up or down at all without zoom
    expect(c.y).toBe(0);
  });

  it('zooming in gives it room in both directions, and zooming about the middle keeps the spot where it is', () => {
    const at = withFocal(REST, { u: 0.4, v: 0.5 }, 'cover', frame, natural);
    const closer = clampCrop(zoomAt(at, 2, { x: 0, y: 0 }, frame), 'cover', frame, natural);
    expect(focalOf(closer, 'cover', frame, natural).u).toBeCloseTo(0.4);
    const up = withFocal(closer, { u: 0.4, v: 0.3 }, 'cover', frame, natural);
    expect(focalOf(up, 'cover', frame, natural).v).toBeCloseTo(0.3);
  });

  it('the part the frame shows is half the picture across and all of it down, and shrinks as it zooms', () => {
    expect(shownPart(REST, 'cover', frame, natural)).toMatchObject({ u: 0.25, v: 0, w: 0.5, h: 1 });
    const z = shownPart({ x: 0, y: 0, zoom: 2 }, 'cover', frame, natural);
    expect(z.w).toBeCloseTo(0.25);
    expect(z.h).toBeCloseTo(0.5);
  });
});

describe('in the picture\'s settings', () => {
  let s: EditorStore;
  let host: HTMLElement;
  let root: Root;
  const node = () => s.get().project.artboards[0].children[0] as ImageNode;
  beforeEach(async () => {
    document.body.innerHTML = '';
    const p = createProject('T');
    p.assets.push({ id: 'a1', name: 'wide.png', mime: 'image/png', size: 1 });
    p.artboards[0].children.push(createNode('image', { id: 'pic', assetId: 'a1', width: 300, height: 300, fit: 'cover' } as never));
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => <CropFields node={useEditor((st) => st.project.artboards[0].children[0]) as ImageNode} />;
    await act(async () => root.render(<Harness />));
  });

  it('has a map of the picture with a dot in its middle and the shown part outlined', () => {
    const map = host.querySelector<HTMLElement>('.focal-map')!;
    expect(map.getAttribute('role')).toBe('slider');
    expect(map.getAttribute('aria-valuetext')).toBe('50% across, 50% down');
    expect(host.querySelector<HTMLElement>('.focal-dot')!.style.left).toBe('50%');
    expect(host.querySelector<HTMLElement>('.focal-part')!.style.width).toBe('50%');
  });

  it('the arrow keys nudge the spot, and the picture moves the other way to bring it to the middle', async () => {
    const map = host.querySelector<HTMLElement>('.focal-map')!;
    await act(async () => map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })));
    expect(node().crop!.x).toBeCloseTo(0.2);
    expect(host.querySelector<HTMLElement>('.focal-map')!.getAttribute('aria-valuetext')).toBe('40% across, 50% down');
  });

  it('the zoom slider zooms about the focal spot', async () => {
    const map = host.querySelector<HTMLElement>('.focal-map')!;
    await act(async () => map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })));
    const slider = host.querySelector<HTMLInputElement>('.crop-zoom-slider')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '200');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(node().crop!.zoom).toBe(2);
    expect(host.querySelector<HTMLElement>('.focal-map')!.getAttribute('aria-valuetext')).toBe('40% across, 50% down');
  });
});

describe('the arrows on the crop corners', () => {
  it('follow the line from the middle to each corner, so the two diagonals differ', () => {
    //top left and bottom right pull along one diagonal, top right and bottom left along the other
    const at = (dx: number, dy: number) => resizeCursorForAngle((Math.atan2(dy, dx) * 180) / Math.PI);
    expect(at(-1, -1)).toBe('nwse-resize');
    expect(at(1, 1)).toBe('nwse-resize');
    expect(at(1, -1)).toBe('nesw-resize');
    expect(at(-1, 1)).toBe('nesw-resize');
  });

  it('are worked out per corner in crop mode, not one arrow for all four in the stylesheet', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const overlay = readFileSync(path.join(here, '..', 'src', 'canvas', 'CropOverlay.tsx'), 'utf8');
    expect(overlay).toMatch(/data-corner=\{i\} style=\{\{ cursor: resizeCursorForAngle\(/);
    const css = readFileSync(path.join(here, '..', 'src', 'styles.css'), 'utf8');
    expect(/\.crop-frame rect \{[^}]*cursor:/.test(css)).toBe(false);
  });
});
