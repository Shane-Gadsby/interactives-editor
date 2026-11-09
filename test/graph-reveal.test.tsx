import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, onPanelRequest, setCurrentStore } from '../src/store/store';
import { buildBehaviour, applyBehaviour } from '../src/lib/recipes';
import { finishReveal, frameRects, pendingReveal, revealAdded, revealedWithin } from '../src/lib/graph-reveal';
import { defaultLayout, getDock, isShown, setDock, showPanel } from '../src/lib/dock';
import { lastKeyArea, setLastKeyArea } from '../src/lib/key-area';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function scene(far = false) {
  const p = createProject('T');
  if (far) p.artboards[0].logic.nodes.push({ id: 'old1', kind: 'event.start', x: 3000, y: 3000, params: {} });
  const b = createNode('rect', { name: 'Next button' });
  p.artboards[0].children.push(b);
  p.artboards.push({ ...p.artboards[0], id: 'ab2', name: 'Two', children: [], logic: { nodes: [], edges: [] }, timelines: [] } as never);
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, ab: p.artboards[0], layer: b };
}
const addFlow = (s: EditorStore, ab: { id: string }, layerId: string) => {
  const st = s.get();
  const b = buildBehaviour({ project: st.project, ab: st.project.artboards.find((a) => a.id === ab.id)!, layerId }, 'page-next', 'click', {});
  return { b, made: applyBehaviour((r) => s.update(r), ab.id, b) };
};

afterEach(() => {
  setPrefs({ showNewInteractions: true });
  setLastKeyArea('other');
  onPanelRequest(null);
  const p = pendingReveal();
  if (p) finishReveal(p);
});

describe('frameRects', () => {
  const size = { width: 800, height: 400 };
  it('centres what it frames', () => {
    const v = frameRects([{ x: 100, y: 100, width: 200, height: 100 }], size)!;
    expect(v.zoom).toBe(1);
    //the middle of the rectangle (200, 150) lands on the middle of the view (400, 200)
    expect(200 * v.zoom + v.x).toBeCloseTo(400);
    expect(150 * v.zoom + v.y).toBeCloseTo(200);
  });
  it('never zooms in past 100%, however small the nodes are', () => {
    expect(frameRects([{ x: 0, y: 0, width: 10, height: 10 }], size)!.zoom).toBe(1);
  });
  it('zooms out until everything fits with padding', () => {
    const rects = [{ x: 0, y: 0, width: 1600, height: 100 }];
    const v = frameRects(rects, size, { padding: 0.1 })!;
    expect(v.zoom).toBeLessThan(1);
    //1600 wide at that zoom plus the padding on each side fits the view exactly
    expect(1600 * v.zoom + 2 * 80).toBeCloseTo(800);
    expect(v.x).toBeGreaterThan(0);
  });
  it('frames the whole box round several nodes, wherever they are', () => {
    const rects = [
      { x: -500, y: 40, width: 200, height: 80 },
      { x: 300, y: 600, width: 200, height: 80 },
    ];
    const v = frameRects(rects, size)!;
    for (const r of rects) {
      expect(r.x * v.zoom + v.x).toBeGreaterThanOrEqual(0);
      expect((r.x + r.width) * v.zoom + v.x).toBeLessThanOrEqual(size.width);
      expect(r.y * v.zoom + v.y).toBeGreaterThanOrEqual(0);
      expect((r.y + r.height) * v.zoom + v.y).toBeLessThanOrEqual(size.height);
    }
  });
  it('stops at the furthest zoom out, and gives nothing for no nodes or no room', () => {
    expect(frameRects([{ x: 0, y: 0, width: 100000, height: 10 }], size, { minZoom: 0.2 })!.zoom).toBe(0.2);
    expect(frameRects([], size)).toBeNull();
    expect(frameRects([{ x: 0, y: 0, width: 10, height: 10 }], { width: 0, height: 0 })).toBeNull();
  });
});

describe('what a recipe says it made', () => {
  it('applyBehaviour returns the ids of the nodes it wrote, event first, and of any new variable', () => {
    const { s, ab, layer } = scene();
    const st = s.get();
    const b = buildBehaviour({ project: st.project, ab, layerId: layer.id }, 'counter', 'click', { counter: 'new:Taps' });
    const made = applyBehaviour((r) => s.update(r), ab.id, b);
    const nodes = s.get().project.artboards[0].logic.nodes;
    expect(made.nodeIds).toEqual(nodes.map((n) => n.id));
    expect(made.nodeIds[0]).toBe(made.eventId);
    expect(made.nodeIds[1]).toBe(made.actionId);
    expect(made.variableIds).toEqual([s.get().project.variables[0].id]);
  });
  it('says nothing was written when the page is gone', () => {
    const { s, ab, layer } = scene();
    const b = buildBehaviour({ project: s.get().project, ab, layerId: layer.id }, 'page-next', 'click', {});
    const made = applyBehaviour((r) => s.update(r), 'nope', b);
    expect(made.nodeIds).toEqual([]);
    expect(made.variableIds).toEqual([]);
  });
});

describe('revealAdded', () => {
  it('opens the Interactions tab (unfolding a closed dock), picks the new nodes and focuses the event', () => {
    const { s, ab, layer } = scene();
    setDock({ ...defaultLayout(), bottomFolded: true });
    onPanelRequest((id) => setDock((l) => (id ? showPanel(l, id) : l)));
    s.set({ bottomTab: 'timeline', logicView: 'sentences' });
    setDock((l) => showPanel(l, 'timeline'));
    expect(isShown(getDock(), 'logic')).toBe(false);
    const { made } = addFlow(s, ab, layer.id);
    const shown = revealAdded({ abId: ab.id, ids: made.nodeIds, focusId: made.eventId, say: 'Added When clicked: go to the next page' });
    expect(shown).toBe(true);
    const st = s.get();
    expect(st.bottomTab).toBe('logic');
    expect(st.logicView).toBe('graph');
    expect(st.logicSelection).toBe(made.eventId);
    expect(st.logicPicked).toEqual(made.nodeIds);
    expect(st.toast?.text).toBe('Added When clicked: go to the next page');
    expect(isShown(getDock(), 'logic')).toBe(true);
    expect(getDock().bottomFolded).toBe(false);
    expect(lastKeyArea()).toBe('graph');
    expect(pendingReveal()?.focusId).toBe(made.eventId);
    expect(revealedWithin(1000)).toBe(true);
  });

  it('switches the tab when another is showing in the bottom dock', () => {
    const { s, ab, layer } = scene();
    s.set({ bottomTab: 'variables' });
    const { made } = addFlow(s, ab, layer.id);
    revealAdded({ abId: ab.id, ids: made.nodeIds, focusId: made.eventId });
    expect(s.get().bottomTab).toBe('logic');
  });

  it('goes to the page the nodes are on', () => {
    const { s } = scene();
    s.set({ activeArtboardId: 'ab2' });
    const ab = s.get().project.artboards[0];
    const layer = ab.children[0];
    const { made } = addFlow(s, ab, layer.id);
    revealAdded({ abId: ab.id, ids: made.nodeIds, focusId: made.eventId });
    expect(s.get().activeArtboardId).toBe(ab.id);
  });

  it('with the preference off the view is left alone and the quiet thing runs instead', () => {
    const { s, ab, layer } = scene();
    s.set({ bottomTab: 'timeline' });
    setPrefs({ showNewInteractions: false });
    const { made } = addFlow(s, ab, layer.id);
    const quiet = vi.fn();
    expect(revealAdded({ abId: ab.id, ids: made.nodeIds, focusId: made.eventId, say: 'Added x', quiet })).toBe(false);
    expect(quiet).toHaveBeenCalledOnce();
    expect(s.get().bottomTab).toBe('timeline');
    expect(s.get().toast).toBeNull();
    expect(pendingReveal()).toBeNull();
    expect(lastKeyArea()).toBe('other');
  });

  it('does nothing when the edit was refused and no nodes are there', () => {
    const { s, ab } = scene();
    s.set({ bottomTab: 'timeline' });
    expect(revealAdded({ abId: ab.id, ids: ['gone1', 'gone2'], focusId: 'gone1' })).toBe(false);
    expect(s.get().bottomTab).toBe('timeline');
    expect(pendingReveal()).toBeNull();
  });
});

describe('changes that are not the person adding something never move the view', () => {
  it('undo, redo and a live edit from someone else leave the tab, the selection and the pending reveal alone', () => {
    const { s, ab, layer } = scene();
    s.set({ bottomTab: 'timeline', logicSelection: null, logicPicked: [] });
    addFlow(s, ab, layer.id);
    s.undo();
    s.redo();
    s.applyRemote([{ t: 'insert', p: ['artboards', { i: ab.id }, 'logic', 'nodes'], v: { id: 'remote1', kind: 'event.start', x: 0, y: 0, params: {} }, i: 0 } as never]);
    const st = s.get();
    expect(st.bottomTab).toBe('timeline');
    expect(pendingReveal()).toBeNull();
    expect(lastKeyArea()).toBe('other');
  });
});

describe('the graph frames and focuses what was added', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(mql = false) {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    if (mql) vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 500, width: 900, height: 500, toJSON() {} });
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const sc = scene(true);
    sc.s.set({ bottomTab: 'logic', logicView: 'graph' });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
    return sc;
  }
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 900))));
  const viewport = () => host!.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform;

  it('moves the view to the new nodes, focuses the event, and lets the reveal go', async () => {
    const sc = await mount();
    const before = viewport();
    const { made } = addFlow(sc.s, sc.ab, sc.layer.id);
    act(() => void revealAdded({ abId: sc.ab.id, ids: made.nodeIds, focusId: made.eventId }));
    await settle();
    expect(pendingReveal()).toBeNull();
    const after = viewport();
    expect(after).not.toBe(before);
    //the new nodes are near the old one at 3000,3000 in a 900x500 view: it has zoomed out to a corner and not past 100%
    const zoom = Number(/scale\(([\d.]+)\)/.exec(after)![1]);
    expect(zoom).toBeLessThanOrEqual(1);
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute('data-id')).toBe(made.eventId);
    expect(host!.contains(focused)).toBe(true);
    expect(host!.querySelectorAll('.ix-graph-node.revealed').length).toBe(2);
  });

  it('glows nothing with reduced motion, but still frames and focuses', async () => {
    const sc = await mount(true);
    const { made } = addFlow(sc.s, sc.ab, sc.layer.id);
    act(() => void revealAdded({ abId: sc.ab.id, ids: made.nodeIds, focusId: made.eventId }));
    await settle();
    expect(host!.querySelectorAll('.ix-graph-node.revealed').length).toBe(0);
    expect((document.activeElement as HTMLElement).getAttribute('data-id')).toBe(made.eventId);
  });

  it('does not move the view for an undo or a live edit', async () => {
    const sc = await mount();
    const { made } = addFlow(sc.s, sc.ab, sc.layer.id);
    await settle();
    const before = viewport();
    act(() => sc.s.undo());
    act(() => sc.s.redo());
    await settle();
    expect(viewport()).toBe(before);
    expect(pendingReveal()).toBeNull();
    expect(made.nodeIds.length).toBe(2);
  });
});
