//Snap to grid on the real canvas: drawing, moving and resizing land on the grid, Ctrl skips it, and the grid only draws while shown
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, type Tool } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the grid on the canvas', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  beforeEach(() => setPrefs({ showGrid: false, snapGrid: true, gridSize: 8, gridSubdivisions: 4 }));
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });
  const mount = (tool: Tool, nodes: SceneNode[], grid?: { size: number; subdivisions: number }) => {
    const p = createProject('T');
    p.artboards[0].children.push(...nodes);
    if (grid) p.artboards[0].grid = grid;
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ tool, selection: nodes.length ? [nodes[0].id] : [], activeArtboardId: p.artboards[0].id, zoom: 1, panX: 0, panY: 0 });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Canvas />));
    const ab = p.artboards[0];
    const at = (x: number, y: number) => [x + ab.canvasX, y + ab.canvasY] as const;
    return { s, vp: host.querySelector<HTMLElement>('.canvas')!, at };
  };
  const fire = (vp: HTMLElement | Element, type: string, [x, y]: readonly [number, number], extra: MouseEventInit = {}) =>
    act(async () => {
      vp.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra }));
    });
  // `extra` is held for the move and the release only: Ctrl at the press would add to the selection instead
  const drag = async (vp: HTMLElement, from: readonly [number, number], to: readonly [number, number], extra: MouseEventInit = {}, target: Element = vp) => {
    await fire(target, 'pointerdown', from);
    await fire(vp, 'pointermove', to, extra);
    await fire(vp, 'pointerup', to, extra);
  };
  const last = (s: EditorStore) => s.get().project.artboards[0].children.at(-1)!;

  it('draws a shape with its corners on the grid, and Ctrl while dragging frees the far corner', async () => {
    const { s, vp, at } = mount('rect', []);
    await drag(vp, at(13, 13), at(101, 77));
    expect(last(s)).toMatchObject({ type: 'rect', x: 16, y: 16, width: 88, height: 64 });
    act(() => root!.unmount());
    host!.remove();
    const b = mount('rect', []);
    await drag(b.vp, b.at(13, 13), b.at(101, 77), { ctrlKey: true });
    // the press was on the grid (16), the release is free (101, 77)
    expect(last(b.s)).toMatchObject({ x: 16, y: 16, width: 85, height: 61 });
  });

  it('moves a layer so its edge lands on a grid line', async () => {
    const r = createNode('rect', { x: 50, y: 50, width: 100, height: 40 });
    const { s, vp, at } = mount('select', [r]);
    await drag(vp, at(100, 70), at(100 + 33, 70 + 21));
    const n = last(s) as { x: number; y: number; width: number; height: number };
    // left edge 83 (the right edge is 183, which is 1 from 184 but the left is 3 from 80, so the right edge wins)
    expect(n.x + n.width).toBe(184);
    expect((n.y) % 8 === 0 || (n.y + n.height) % 8 === 0).toBe(true);
    expect(n.width).toBe(100);
  });

  it('moves freely with Ctrl and with snapping off', async () => {
    const r = createNode('rect', { x: 50, y: 50, width: 100, height: 40 });
    const a = mount('select', [r]);
    await drag(a.vp, a.at(100, 70), a.at(133, 91), { ctrlKey: true });
    expect(last(a.s)).toMatchObject({ x: 83, y: 71 });
    act(() => root!.unmount());
    host!.remove();
    setPrefs({ snapGrid: false });
    const b = mount('select', [createNode('rect', { x: 50, y: 50, width: 100, height: 40 })]);
    await drag(b.vp, b.at(100, 70), b.at(133, 91));
    expect(last(b.s)).toMatchObject({ x: 83, y: 71 });
  });

  it('resizes by a handle so the dragged edge lands on the grid', async () => {
    const r = createNode('rect', { x: 64, y: 64, width: 100, height: 40 });
    const { s, vp, at } = mount('select', [r]);
    const handle = host!.querySelector('[data-handle="resize:se"]')!;
    await drag(vp, at(164, 104), at(203, 121), {}, handle);
    expect(last(s)).toMatchObject({ x: 64, y: 64, width: 136, height: 56 });
  });

  it('uses an artboard\'s own grid over the default', async () => {
    const { s, vp, at } = mount('rect', [], { size: 10, subdivisions: 2 });
    await drag(vp, at(13, 13), at(101, 77));
    expect(last(s)).toMatchObject({ x: 10, y: 10, width: 90, height: 70 });
  });

  it('draws the grid only while Show grid is on, and never while previewing', () => {
    setPrefs({ showGrid: false });
    const a = mount('select', []);
    expect(host!.querySelector('.canvas-grid')).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    setPrefs({ showGrid: true });
    const b = mount('select', []);
    expect(host!.querySelectorAll('.canvas-grid').length).toBeGreaterThan(0);
    act(() => b.s.set({ previewPlaying: true }));
    expect(host!.querySelector('.canvas-grid')).toBeNull();
    void a;
  });

  it('says in the corner that snapping is on and what the size is', () => {
    mount('select', []);
    expect(host!.querySelector('.canvas-status')?.textContent).toContain('Snap 8 px (every 4)');
    act(() => setPrefs({ snapGrid: false }));
    expect(host!.querySelector('.canvas-status')).toBeNull();
  });
});
