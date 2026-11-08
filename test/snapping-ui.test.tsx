//Snapping in the interface: the tool bar's Snap dropdown, Preferences, the canvas menu, and the canvas honouring each switch
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { Toolbar } from '../src/Editor';
import { SnapMenu } from '../src/components/SnapMenu';
import { PrefsModal } from '../src/components/PrefsModal';
import { gridMenu } from '../src/components/grid-menu';
import { prefs, setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  setPrefs({ snapOn: true, snapGrid: false, snapArtboard: true, snapLayers: true, snapLayersAll: false, snapGuides: true, snapSpacing: false, snapPixels: true, snapPoints: false, snapDistance: 6, showGrid: false, gridSize: 8 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = host = null;
});
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());

describe('the Snap dropdown', () => {
  it('lists the switch and the seven targets as menu checkboxes, and ticking one changes its preference', () => {
    act(() => root!.render(<SnapMenu x={10} y={10} onClose={() => undefined} />));
    const items = [...document.querySelectorAll<HTMLElement>('[role=menuitemcheckbox]')];
    expect(items.map((i) => i.querySelector('.ctx-label')!.textContent)).toEqual(['Snapping', 'Grid', 'Artboard', 'Layers', 'Guides', 'Spacing', 'Pixels', 'Points', 'Layers: all, not just siblings']);
    const state = () => items.map((i) => i.getAttribute('aria-checked'));
    expect(state()).toEqual(['true', 'false', 'true', 'true', 'true', 'false', 'true', 'false', 'false']);
    click(items[4]);
    expect(prefs().snapGuides).toBe(false);
    click(items[1]);
    expect(prefs().snapGrid).toBe(true);
    expect(items[1].getAttribute('aria-checked')).toBe('true');
    click(items[0]);
    expect(prefs().snapOn).toBe(false);
    //the targets are kept but cannot be changed while the switch is off
    expect(items[2].hasAttribute('disabled')).toBe(true);
    expect(prefs().snapArtboard).toBe(true);
  });

  it('has the snap distance and grid size, and stays open until Escape', () => {
    let closed = 0;
    act(() => root!.render(<SnapMenu x={10} y={10} onClose={() => closed++} />));
    const [distance, grid] = [...document.querySelectorAll<HTMLSelectElement>('.snap-field select')];
    act(() => {
      distance.value = '12';
      distance.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(prefs().snapDistance).toBe(12);
    expect(grid.value).toBe('8');
    click(document.querySelector('[role=menuitemcheckbox]'));
    expect(closed).toBe(0);
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(closed).toBe(1);
  });

  it('opens from the Snap button on the tool bar, which says it opens a menu', () => {
    setCurrentStore(new EditorStore(createProject('T')));
    act(() => root!.render(<Toolbar />));
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Snapping is'))!;
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    click(btn);
    expect(document.querySelector('.snap-menu')).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    click(btn);
    expect(document.querySelector('.snap-menu')).toBeNull();
  });

  it('there is one Snap to grid, not a second button beside it', () => {
    setCurrentStore(new EditorStore(createProject('T')));
    act(() => root!.render(<Toolbar />));
    expect([...document.querySelectorAll('button')].filter((b) => /snap/i.test(b.getAttribute('aria-label') ?? '')).length).toBe(1);
  });
});

describe('Preferences and the canvas menu', () => {
  it('Preferences has Snapping, a switch per target, the reach of Layers and the distance', () => {
    act(() => root!.render(<PrefsModal onClose={() => undefined} />));
    const block = document.querySelector('[aria-label="Canvas"]')!;
    const labels = [...block.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Snapping', 'Snap to grid', 'Snap to artboard', 'Snap to layers', 'Snap to guides', 'Snap to spacing', 'Snap to pixels', 'Snap to points', 'Layers: all, not just siblings']));
    const box = (name: string) => [...block.querySelectorAll('label')].find((l) => l.textContent === name)!.querySelector('input') as HTMLInputElement;
    click(box('Snap to spacing'));
    expect(prefs().snapSpacing).toBe(true);
    click(box('Snapping'));
    expect(prefs().snapOn).toBe(false);
    expect(box('Snap to layers').disabled).toBe(true);
  });

  it('the canvas menu has a Snapping submenu with the same items', () => {
    const snapping = gridMenu().find((i) => 'label' in i && /^Snapping/.test(i.label)) as { items: { label?: string }[] };
    const labels = snapping.items.map((i) => i.label).filter(Boolean);
    expect(labels).toEqual(['✓ Snapping', '   Grid', '✓ Artboard', '✓ Layers', '✓ Guides', '   Spacing', '✓ Pixels', '   Points', '   Layers: all, not just siblings', 'Snap distance (6 px)']);
  });
});

describe('the canvas honours each switch', () => {
  const mount = () => {
    const p = createProject('T');
    const r = createNode('rect', { x: 50, y: 200, width: 100, height: 40 }) as SceneNode;
    p.artboards[0].children.push(r);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ tool: 'select', selection: [r.id], activeArtboardId: p.artboards[0].id, zoom: 1, panX: 0, panY: 0 });
    act(() => root!.render(<Canvas />));
    const ab = p.artboards[0];
    return { s, vp: host!.querySelector<HTMLElement>('.canvas')!, at: (x: number, y: number) => [x + ab.canvasX, y + ab.canvasY] as const };
  };
  const fire = (el: Element, type: string, [x, y]: readonly [number, number], extra: MouseEventInit = {}) =>
    act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra })));
  const node = (s: EditorStore) => s.get().project.artboards[0].children[0] as { x: number; y: number };
  // drag the layer 47 to the left so its left edge is 3 from the artboard's edge
  const dragLeft = async (extra: MouseEventInit = {}) => {
    const { s, vp, at } = mount();
    await fire(vp, 'pointerdown', at(100, 220));
    await fire(vp, 'pointermove', at(53, 220), extra);
    const during = { guide: !!host!.querySelector('.guide.guide-artboard'), chip: host!.querySelector('.snap-now')?.textContent ?? '' };
    await fire(vp, 'pointerup', at(53, 220), extra);
    return { x: node(s).x, during };
  };

  it('Artboard on: the edge goes to the artboard, the line is drawn in its colour and the chip names it', async () => {
    const r = await dragLeft();
    expect(r.x).toBe(0);
    expect(r.during.guide).toBe(true);
    expect(r.during.chip).toBe('Snapped to Artboard');
  });

  it('Artboard off: it stays where it was put', async () => {
    setPrefs({ snapArtboard: false });
    expect((await dragLeft()).x).toBe(3);
  });

  it('snapping off, or Ctrl held: free', async () => {
    setPrefs({ snapOn: false });
    expect((await dragLeft()).x).toBe(3);
    setPrefs({ snapOn: true });
    expect((await dragLeft({ ctrlKey: true })).x).toBe(3);
  });

  it('a smaller snap distance lets go of it', async () => {
    setPrefs({ snapDistance: 2 });
    expect((await dragLeft()).x).toBe(3);
  });
});
