import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { areaOf, lastKeyArea, routeToGraph, setLastKeyArea, watchKeyArea } from '../src/lib/key-area';
import { deleteSelectionCommand } from '../src/lib/artboard-commands';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Delete goes to the panel you last pressed in', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  let unwatch: (() => void) | null = null;
  afterEach(() => {
    unwatch?.();
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = unwatch = null;
    setLastKeyArea('other');
    vi.unstubAllGlobals();
  });

  async function mount() {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    const layer = createNode('rect', { name: 'Blend ball' });
    p.artboards[0].children.push(layer);
    p.artboards[0].logic.nodes.push({ id: 'n0', kind: 'event.start', x: 50, y: 50, params: {} });
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([layer.id]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    unwatch = watchKeyArea();
    return { s, layerId: layer.id };
  }
  const press = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10 })));
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

  it('knows the graph and the timeline lanes when asked', async () => {
    await mount();
    expect(areaOf(host!.querySelector('.react-flow__node'))).toBe('graph');
    expect(areaOf(document.body)).toBe('other');
    const lane = document.createElement('div');
    lane.className = 'timeline-lanes';
    expect(areaOf(lane.appendChild(document.createElement('span')))).toBe('other');
    lane.className = 'timeline';
    expect(areaOf(lane.firstChild)).toBe('timeline');
  });

  it('a press on a node puts focus in the graph, so Delete is the graph\'s', async () => {
    await mount();
    (document.activeElement as HTMLElement | null)?.blur();
    press(host!.querySelector('.react-flow__node')!);
    expect(lastKeyArea()).toBe('graph');
    expect(host!.querySelector('.logic-canvas')!.contains(document.activeElement)).toBe(true);
  });

  it('Delete with the page focused after a graph press deletes the node and keeps the layer', async () => {
    const { s, layerId } = await mount();
    press(host!.querySelector('.react-flow__node')!);
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    s.set({ logicSelection: 'n0', logicPicked: ['n0'] });
    //Focus fell back to the page (a menu closed, say) and Delete now reaches the window handler
    (document.activeElement as HTMLElement).blur();
    const e = key({ key: 'Delete' });
    document.body.dispatchEvent(e);
    expect(routeToGraph(e)).toBe(true);
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    expect(s.get().project.artboards[0].logic.nodes.map((n) => n.id)).not.toContain('n0');
    expect(s.get().project.artboards[0].children.map((n) => n.id)).toContain(layerId);
  });

  it('with the last press outside the graph the window handler keeps its keys', async () => {
    await mount();
    setLastKeyArea('other');
    expect(routeToGraph(key({ key: 'Delete' }))).toBe(false);
  });

  it('a stale graph press (graph closed) does not swallow Delete', async () => {
    await mount();
    press(host!.querySelector('.react-flow__node')!);
    act(() => root!.unmount());
    host!.remove();
    root = host = null;
    expect(routeToGraph(key({ key: 'Delete' }))).toBe(false);
    expect(lastKeyArea()).toBe('other');
  });

  it('letters and tool keys are not routed', async () => {
    await mount();
    setLastKeyArea('graph');
    expect(routeToGraph(key({ key: 'v' }))).toBe(false);
  });
});

describe('Delete from the keyboard says what happened', () => {
  it('layers: an Undo message that names them, and Undo brings them back', () => {
    const p = createProject('T');
    const a = createNode('rect', { name: 'Blend ball' });
    p.artboards[0].children.push(a);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([a.id]);
    void deleteSelectionCommand({ keyboard: true });
    expect(s.get().project.artboards[0].children).toHaveLength(0);
    expect(s.get().toast?.text).toBe('Deleted Blend ball.');
    expect(s.get().toast?.action?.kind).toBe('undo');
    s.runToastAction();
    expect(s.get().project.artboards[0].children).toHaveLength(1);
  });

  it('a page asks first from the keyboard, and stays if the answer is no', async () => {
    const { DialogHost } = await import('../src/components/dialogs');
    const p = createProject('T');
    const s = new EditorStore(p);
    s.addArtboard({ name: 'Two' });
    setCurrentStore(s);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<DialogHost />));
    const before = s.get().project.artboards.length;
    s.set({ artboardSelected: true });
    act(() => void deleteSelectionCommand({ keyboard: true }));
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Delete the page');
    expect(s.get().project.artboards).toHaveLength(before);
    await act(async () => {
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === 'Cancel')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(s.get().project.artboards).toHaveLength(before);
    act(() => root.unmount());
    host.remove();
  });
});
