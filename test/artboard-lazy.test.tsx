import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Renderer, createNode, createProject, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { viewPlan } from '../src/canvas/viewPlan';
import { hitTest } from '../src/store/doc';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = vi.fn(async () => 'blob:still');
vi.mock('../src/lib/image-export', () => ({ snapshotFromDom: (...a: unknown[]) => (snapshot as (...x: unknown[]) => Promise<string>)(...a) }));

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  snapshot.mockClear();
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function make(count: number): Project {
  const p = createProject('Lazy');
  p.artboards[0].canvasX = 0;
  for (let i = 1; i < count; i++) p.artboards.push({ ...structuredClone(p.artboards[0]), id: 'ab' + i, name: 'AB' + i, canvasX: i * 2000, children: [] });
  p.artboards.forEach((ab, i) => {
    ab.children = [createNode('rect', { name: 'r' + i, x: 10, y: 10, width: 100, height: 80 }) as SceneNode];
  });
  setCurrentStore(new EditorStore(p));
  return p;
}

const wait = (ms = 80) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const nodesIn = (id: string) => host.querySelectorAll(`[data-artboard="${id}"] .ix-node`).length;

function views(p: Project, opts: { deferred?: Record<string, boolean>; rank?: Record<string, number>; active?: string; live?: boolean } = {}) {
  act(() =>
    root.render(
      <>
        {p.artboards.map((ab) => (
          <ArtboardView
            key={ab.id}
            artboard={ab}
            project={p}
            timeline={null}
            time={0}
            active={ab.id === (opts.active ?? p.artboards[0].id)}
            live={opts.live ?? ab.id === (opts.active ?? p.artboards[0].id)}
            assetVersion={0}
            dataVersion={0}
            deferred={opts.deferred?.[ab.id]}
            rank={opts.rank?.[ab.id]}
          />
        ))}
      </>,
    ),
  );
}

describe('deferred artboards', () => {
  it('draw the active one at once, the rest later nearest first, and never twice', async () => {
    const p = make(4);
    const order: string[] = [];
    const orig = Renderer.prototype.render;
    vi.spyOn(Renderer.prototype, 'render').mockImplementation(function (this: Renderer, ab, nodes, scope) {
      order.push((ab as Artboard).id);
      return orig.call(this, ab, nodes, scope);
    });
    views(p, { deferred: { ab1: true, ab2: true, ab3: true }, rank: { ab1: 9, ab2: 1, ab3: 4 } });
    expect(order).toEqual([p.artboards[0].id]);
    expect(nodesIn(p.artboards[0].id)).toBe(1);
    for (const id of ['ab1', 'ab2', 'ab3']) {
      expect(nodesIn(id)).toBe(0);
      // the box is there, in the artboard's own background, so nothing jumps when it is drawn
      expect(host.querySelector(`[data-artboard="${id}"] .artboard-pending`)).toBeTruthy();
    }
    await wait();
    expect(order).toEqual([p.artboards[0].id, 'ab2', 'ab3', 'ab1']);
    for (const ab of p.artboards) expect(nodesIn(ab.id)).toBe(1);
    expect(host.querySelector('.artboard-pending')).toBeNull();
    // redrawing with the same document does not draw them again
    views(p, { deferred: { ab1: true, ab2: true, ab3: true } });
    await wait();
    expect(order).toHaveLength(4);
  });

  it('look the same as ones drawn at once', async () => {
    const p = make(2);
    views(p, { deferred: { ab1: true } });
    await wait();
    const drawn = () => host.querySelector('[data-artboard="ab1"] .artboard-host')!.innerHTML;
    const lazy = drawn();
    expect(lazy).toContain('ix-node');
    act(() => root.unmount());
    root = createRoot(host);
    views(p);
    expect(drawn()).toBe(lazy);
  });

  it('are drawn right away when they become the active artboard, or no longer deferred', async () => {
    const p = make(3);
    views(p, { deferred: { ab1: true, ab2: true } });
    expect(nodesIn('ab1')).toBe(0);
    views(p, { deferred: { ab1: true, ab2: true }, active: 'ab1' });
    expect(nodesIn('ab1')).toBe(1);
    expect(nodesIn('ab2')).toBe(0);
    views(p, { deferred: { ab1: true, ab2: false }, active: 'ab1' });
    expect(nodesIn('ab2')).toBe(1);
  });

  it('keep up with edits made before they were drawn, and one that goes away is not drawn', async () => {
    const p = make(3);
    views(p, { deferred: { ab1: true, ab2: true } });
    const p2 = structuredClone(p);
    p2.artboards[1].children[0].x = 55;
    p2.artboards.length = 2; // ab2 is gone before its turn
    setCurrentStore(new EditorStore(p2));
    views(p2, { deferred: { ab1: true } });
    await wait();
    const el = host.querySelector(`[data-ix-id="${p2.artboards[1].children[0].id}"]`) as HTMLElement;
    expect(el.style.transform).toContain('translate(55px');
    expect(host.querySelector('[data-artboard="ab2"]')).toBeNull();
  });

  it('wait for the live DOM before making their stills, then make them', async () => {
    const p = make(2);
    views(p, { deferred: { ab1: true }, live: false });
    // not drawn yet: nothing to take a picture of (the active one is live, and is never pictured)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(snapshot).not.toHaveBeenCalled();
    await wait(300);
    expect(nodesIn('ab1')).toBe(1);
    expect(snapshot).toHaveBeenCalled();
    expect(host.querySelector('[data-artboard="ab1"] img.artboard-still')).toBeTruthy();
  });

  it('do not stop the editor finding, hit-testing and selecting their layers', async () => {
    const p = make(3);
    const store = new EditorStore(p);
    setCurrentStore(store);
    views(p, { deferred: { ab1: true, ab2: true } });
    expect(nodesIn('ab2')).toBe(0);
    const ab2 = p.artboards[2];
    const hit = hitTest(ab2, 20, 20);
    expect(hit.map((n) => n.id)).toEqual([ab2.children[0].id]);
    store.select([ab2.children[0].id], { artboardId: ab2.id });
    expect(store.get().activeArtboardId).toBe(ab2.id);
    expect(store.get().selection).toEqual([ab2.children[0].id]);
    // selecting it makes it the active artboard, which draws it
    views(p, { deferred: { ab1: true, ab2: true }, active: store.get().activeArtboardId! });
    expect(nodesIn('ab2')).toBe(1);
  });
});

describe('viewPlan', () => {
  const abs = (n: number, w = 1000, gap = 100) => Array.from({ length: n }, (_, i) => ({ id: 'a' + i, canvasX: i * (w + gap), canvasY: 0, width: w, height: 800 }) as Artboard);

  it('draws the active one and the few in view at once, the others later nearest first', () => {
    const list = abs(10);
    const plan = viewPlan(list, 'a0', 1, 0, 0, 1500, 900);
    expect(plan.get('a0')!.deferred).toBe(false);
    expect(plan.get('a1')!.deferred).toBe(false); // in view (a0 and a1 are, a2 starts at 2200)
    for (const id of ['a2', 'a3', 'a9']) expect(plan.get(id)!.deferred).toBe(true);
    expect(plan.get('a2')!.rank).toBeLessThan(plan.get('a3')!.rank);
    expect(plan.get('a3')!.rank).toBeLessThan(plan.get('a9')!.rank);
  });

  it('fills in a zoomed out view one artboard at a time, the active one first', () => {
    const list = abs(10);
    const plan = viewPlan(list, 'a4', 0.05, 0, 0, 1500, 900);
    expect(plan.get('a4')!.deferred).toBe(false);
    for (const ab of list.filter((a) => a.id !== 'a4')) expect(plan.get(ab.id)!.deferred).toBe(true);
    // in view: ranked by distance from the middle of the view
    expect(plan.get('a5')!.rank).toBeGreaterThan(0);
    expect(Math.max(...[...plan.values()].map((v) => v.rank))).toBeLessThan(1);
  });

  it('keeps off-screen artboards deferred, ranking out of view ones after any in view', () => {
    const list = abs(40);
    const plan = viewPlan(list, 'a0', 0.3, 0, 0, 1500, 900);
    expect(plan.get('a39')!.deferred).toBe(true);
    expect(plan.get('a39')!.rank).toBeGreaterThan(plan.get('a3')!.rank);
    expect(plan.get('a39')!.rank).toBeGreaterThan(1);
  });

  it('draws a lone artboard at once however it is placed', () => {
    const plan = viewPlan(abs(1), 'a0', 1, -5000, -5000, 1500, 900);
    expect(plan.get('a0')!.deferred).toBe(false);
  });
});
