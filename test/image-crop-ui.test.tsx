import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type ImageNode, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { CropOverlay } from '../src/canvas/CropOverlay';
import { locate } from '../src/store/doc';
import { assetUrls } from '../src/lib/assets';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // a 1200 x 600 picture in a 300 x 200 frame: 400 x 200 as cover draws it
  vi.spyOn(assetUrls, 'resolve').mockReturnValue('blob:pic');
  class Img {
    naturalWidth = 1200;
    naturalHeight = 600;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', Img);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function scene(extra: Record<string, unknown> = {}) {
  const p = createProject('T');
  p.assets.push({ id: 'as1', name: 'pic.jpg', mime: 'image/jpeg', size: 1 });
  const img = createNode('image', { name: 'pic', assetId: 'as1', x: 10, y: 20, width: 300, height: 200, ...extra } as never) as ImageNode;
  const rect = createNode('rect', { name: 'box' } as never) as SceneNode;
  p.artboards[0].children.push(img, rect);
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.select([img.id]);
  return { s, img, rect, ab: () => s.artboard()! };
}
const node = (x: ReturnType<typeof scene>) => locate(x.ab(), x.img.id)!.node as ImageNode;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const typeInto = (input: HTMLInputElement, v: string) =>
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });

describe('the Crop part of a picture\'s settings', () => {
  const render = () => act(() => root.render(<Inspector />));
  const field = (label: string) => [...host.querySelectorAll<HTMLLabelElement>('label.number-field')].find((l) => l.querySelector('.field-label')?.textContent === label)!.querySelector('input')!;

  it('is there for a picture with a file, with Reset off until it is cropped', async () => {
    const x = scene();
    render();
    await settle();
    expect(host.querySelector('[data-prop="crop"]')).toBeTruthy();
    const reset = [...host.querySelectorAll<HTMLButtonElement>('.crop-buttons button')].find((b) => b.textContent === 'Reset crop')!;
    expect(reset.disabled).toBe(true);
    expect(field('Zoom').value).toBe('100');
    expect(field('Picture X').value).toBe('0');
    expect(node(x).crop).toBeUndefined();
  });

  it('is not there for a 9-sliced picture, a picture with no file, or a layer that is not a picture', () => {
    const a = scene({ slice: { top: 4, right: 4, bottom: 4, left: 4 } });
    render();
    expect(host.querySelector('[data-prop="crop"]')).toBeNull();
    act(() => a.s.select([a.rect.id]));
    expect(host.querySelector('[data-prop="crop"]')).toBeNull();
    const b = scene({ assetId: null });
    render();
    expect(host.querySelector('[data-prop="crop"]')).toBeNull();
    void b;
  });

  it('Zoom writes the crop as a number from 1, and 100% takes it away again', async () => {
    const x = scene();
    render();
    await settle();
    typeInto(field('Zoom'), '250');
    expect(node(x).crop).toEqual({ x: 0, y: 0, zoom: 2.5 });
    typeInto(field('Zoom'), '100');
    expect(node(x).crop).toBeUndefined();
    typeInto(field('Zoom'), '50');
    expect(node(x).crop).toBeUndefined();
  });

  it('moving keeps the picture covering its frame', async () => {
    const x = scene();
    render();
    await settle();
    typeInto(field('Zoom'), '200');
    typeInto(field('Picture X'), '500');
    // 800 wide at 200% in a 300 frame: 250px each way
    expect(node(x).crop!.x).toBeCloseTo(250 / 300, 3);
    typeInto(field('Picture Y'), '-500');
    expect(node(x).crop!.y).toBeCloseTo(-100 / 200, 3);
  });

  it('Reset crop puts it back, and the Crop button starts crop mode', async () => {
    const x = scene({ crop: { x: 0.1, y: 0, zoom: 2 } });
    render();
    await settle();
    expect(field('Zoom').value).toBe('200');
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.crop-buttons button')].find((b) => b.textContent === 'Reset crop')!.click());
    expect(node(x).crop).toBeUndefined();
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.crop-buttons button')].find((b) => b.textContent === 'Crop picture…')!.click());
    expect(x.s.get().croppingId).toBe(x.img.id);
  });

  it('is found by the words people look for', () => {
    const x = scene();
    void x;
    render();
    const words = host.querySelector('[data-prop="crop"]');
    expect(words).toBeTruthy();
  });
});

describe('crop mode on the canvas', () => {
  const mount = (x: ReturnType<typeof scene>) => {
    x.s.set({ croppingId: x.img.id });
    act(() => root.render(<CropOverlay ab={x.ab()} id={x.img.id} zoom={1} panX={0} panY={0} />));
  };
  const layer = () => host.querySelector<HTMLElement>('.crop-layer')!;
  const key = (k: string, init: KeyboardEventInit = {}) => act(() => void layer().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init })));
  const ptr = (type: string, x: number, y: number, target: Element = layer()) =>
    act(() => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as MouseEvent & { pointerId: number };
      Object.defineProperty(e, 'pointerId', { value: 1 });
      target.dispatchEvent(e);
    });

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  });

  it('outlines the frame with four corner handles, labelled, and takes the keyboard', async () => {
    const x = scene();
    mount(x);
    await settle();
    expect(layer().getAttribute('aria-label')).toMatch(/Crop picture/);
    expect(host.querySelectorAll('.crop-frame rect')).toHaveLength(4);
    // the frame is the layer's box: x 10, y 20, 300 x 200
    const pts = host.querySelector('.crop-frame polygon')!.getAttribute('points');
    expect(pts).toBe('10,20 310,20 310,220 10,220');
    expect(document.activeElement).toBe(layer());
  });

  it('arrow keys move the picture, plus and minus zoom, zero resets, all as real edits', async () => {
    const x = scene();
    mount(x);
    await settle();
    key('+');
    expect(node(x).crop!.zoom).toBeCloseTo(1.1, 4);
    key('+');
    key('ArrowLeft', { shiftKey: true });
    expect(node(x).crop!.x).toBeCloseTo(-10 / 300, 4);
    key('ArrowDown');
    expect(node(x).crop!.y).toBeCloseTo(1 / 200, 4);
    key('-');
    key('-');
    key('-');
    expect(node(x).crop!.zoom).toBe(1);
    key('0');
    expect(node(x).crop).toBeUndefined();
  });

  it('dragging inside the frame moves the picture by the same share, and is one undo step', async () => {
    const x = scene();
    mount(x);
    await settle();
    act(() => x.s.setProps([x.img.id], { crop: { x: 0, y: 0, zoom: 2 } }));
    x.s.commit();
    const before = node(x).crop;
    ptr('pointerdown', 100, 100);
    ptr('pointermove', 130, 90);
    ptr('pointermove', 160, 80);
    ptr('pointerup', 160, 80);
    expect(before).toEqual({ x: 0, y: 0, zoom: 2 });
    expect(node(x).crop!.x).toBeCloseTo(60 / 300, 3);
    expect(node(x).crop!.y).toBeCloseTo(-20 / 200, 3);
    x.s.undo();
    expect(node(x).crop).toEqual({ x: 0, y: 0, zoom: 2 });
  });

  it('pulling a corner zooms about the middle', async () => {
    const x = scene();
    mount(x);
    await settle();
    const corner = host.querySelector('.crop-frame rect[data-corner="2"]')!;
    // the bottom right corner is 150, 100 from the middle (160, 120): 180 from it; pulling it out to twice that doubles the zoom
    ptr('pointerdown', 310, 220, corner);
    ptr('pointermove', 160 + 300, 120 + 200, corner);
    ptr('pointerup', 460, 320, corner);
    expect(node(x).crop!.zoom).toBeCloseTo(2, 2);
    expect(node(x).crop!.x).toBeCloseTo(0, 3);
  });

  it('clicking outside the frame, Done, Enter and Escape all finish', async () => {
    for (const how of ['outside', 'done', 'enter', 'escape'] as const) {
      const x = scene();
      mount(x);
      await settle();
      if (how === 'outside') ptr('pointerdown', 600, 500);
      if (how === 'done') act(() => host.querySelector<HTMLButtonElement>('.crop-done')!.click());
      if (how === 'enter') key('Enter');
      if (how === 'escape') key('Escape');
      expect(x.s.get().croppingId, how).toBeNull();
      act(() => root.render(<></>));
    }
  });

  it('Reset is off at rest and puts a crop back', async () => {
    const x = scene({ crop: { x: 0.2, y: 0, zoom: 3 } });
    mount(x);
    await settle();
    const reset = [...host.querySelectorAll<HTMLButtonElement>('.crop-bar button')].find((b) => b.textContent === 'Reset')!;
    expect(reset.disabled).toBe(false);
    act(() => reset.click());
    expect(node(x).crop).toBeUndefined();
    act(() => root.render(<CropOverlay ab={x.ab()} id={x.img.id} zoom={1} panX={0} panY={0} />));
    expect([...host.querySelectorAll<HTMLButtonElement>('.crop-bar button')].find((b) => b.textContent === 'Reset')!.disabled).toBe(true);
  });

  it('a turned layer still follows the pointer in its own space', async () => {
    const x = scene({ rotation: 90 });
    mount(x);
    await settle();
    act(() => x.s.setProps([x.img.id], { crop: { x: 0, y: 0, zoom: 2 } }));
    ptr('pointerdown', 150, 100);
    // dragging down the screen moves a picture on a layer turned a quarter turn along its own x
    ptr('pointermove', 150, 130);
    ptr('pointerup', 150, 130);
    expect(Math.abs(node(x).crop!.y)).toBeLessThan(0.01);
    expect(Math.abs(node(x).crop!.x)).toBeCloseTo(30 / 300, 2);
  });

  it('it ends when the layer goes', async () => {
    const x = scene();
    mount(x);
    await settle();
    act(() => x.s.deleteSelection());
    act(() => root.render(<CropOverlay ab={x.ab()} id={x.img.id} zoom={1} panX={0} panY={0} />));
    expect(x.s.get().croppingId).toBeNull();
  });
});

describe('exports and agents', () => {
  it('Lottie says a cropped picture shows whole, and an uncropped one says nothing of it', async () => {
    const { exportLottie } = await import('../src/lib/lottie-export');
    const { createArtboard } = await import('interactives-player');
    const run = (crop?: unknown) => {
      const p = createProject('L');
      const ab = createArtboard({ name: 'A', width: 300, height: 200 });
      ab.children.push(createNode('image', { name: 'Face', assetId: 'as1', width: 300, height: 200, fit: 'fill', ...(crop ? { crop } : {}) } as never));
      p.artboards = [ab];
      return exportLottie(p, ab, { bytesFor: () => new Uint8Array([1, 2, 3]), mimeFor: () => 'image/png' } as never).warnings;
    };
    expect(run({ x: 0.1, y: 0, zoom: 2 }).some((w) => /Face.*cropped in the player/.test(w))).toBe(true);
    expect(run({ x: 0, y: 0, zoom: 1 }).some((w) => /cropped/.test(w))).toBe(false);
    expect(run().some((w) => /cropped/.test(w))).toBe(false);
  });

  it('an agent can write a crop, and a bad one is cleaned by the sanitiser it goes through', async () => {
    const { sanitizeLayerInPlace } = await import('../../interactives-player/src/sanitize');
    const good = createNode('image', { assetId: 'as1', crop: { x: 0.2, y: 0, zoom: 3 } } as never) as ImageNode;
    expect(sanitizeLayerInPlace(good)).toBe(true);
    expect(good.crop).toEqual({ x: 0.2, y: 0, zoom: 3 });
    const bad = createNode('image', { assetId: 'as1', crop: { x: 'left', zoom: 3 } } as never) as ImageNode;
    sanitizeLayerInPlace(bad);
    expect('crop' in bad).toBe(false);
  });
});
