import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Renderer, createNode, createProject, type Artboard, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { produce } from 'immer';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function make(extra: (kids: SceneNode[]) => void = () => undefined): Project {
  const p = createProject('T');
  const kids = Array.from({ length: 30 }, (_, i) => createNode('rect', { name: 'r' + i, x: i, width: 10, height: 10 }) as SceneNode);
  p.artboards[0].children.push(...kids);
  extra(p.artboards[0].children);
  setCurrentStore(new EditorStore(p));
  return p;
}

function show(project: Project, ab: Artboard, timeline: Timeline | null = null, time = 0) {
  act(() =>
    root.render(<ArtboardView artboard={ab} project={project} timeline={timeline} time={time} active live assetVersion={0} dataVersion={0} />),
  );
}

describe('ArtboardView redraws only what changed', () => {
  it('a change to one layer updates that layer, not the whole artboard, and matches a full redraw', () => {
    const p0 = make();
    show(p0, p0.artboards[0]);
    const render = vi.spyOn(Renderer.prototype, 'render');
    const orig = Renderer.prototype.updateNodes;
    let seen: string[] = [];
    const update = vi.spyOn(Renderer.prototype, 'updateNodes').mockImplementation(function (this: Renderer, ids, byId, resolve) {
      seen = [...ids];
      return orig.call(this, seen, byId, resolve);
    });
    const id = p0.artboards[0].children[4].id;
    const p1 = produce(p0, (d) => void (d.artboards[0].children[4].x = 123));
    show(p1, p1.artboards[0]);
    expect(render).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([id]);
    const incremental = host.innerHTML;
    // a fresh view of the same document (a full draw) looks the same
    act(() => root.unmount());
    root = createRoot(host);
    show(p1, p1.artboards[0]);
    expect(host.innerHTML).toBe(incremental);
  });

  it('draws everything again when a layer is added or the order changes', () => {
    const p0 = make();
    show(p0, p0.artboards[0]);
    const render = vi.spyOn(Renderer.prototype, 'render');
    const p1 = produce(p0, (d) => void d.artboards[0].children.push(createNode('ellipse', { name: 'new' }) as never));
    show(p1, p1.artboards[0]);
    expect(render).toHaveBeenCalledTimes(1);
    const p2 = produce(p1, (d) => void d.artboards[0].children.reverse());
    show(p2, p2.artboards[0]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('draws everything again when a changed layer gets a binding', () => {
    const p0 = make();
    show(p0, p0.artboards[0]);
    const render = vi.spyOn(Renderer.prototype, 'render');
    const p1 = produce(p0, (d) => void (d.artboards[0].children[2].bindings = { opacity: '0.5' }));
    show(p1, p1.artboards[0]);
    expect(render).toHaveBeenCalledTimes(1);
    // and from then on every change does the same, as the artboard has a binding in it
    const p2 = produce(p1, (d) => void (d.artboards[0].children[3].x = 9));
    show(p2, p2.artboards[0]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('scrubbing a timeline redraws just the layers it drives', () => {
    const p0 = make();
    const ab = p0.artboards[0];
    const tl: Timeline = { id: 't', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'k', nodeId: ab.children[1].id, prop: 'x', keys: [{ id: 'a', t: 0, value: 0, ease: 'linear' }, { id: 'b', t: 1000, value: 100, ease: 'linear' }] }] };
    show(p0, ab, tl, 0);
    const render = vi.spyOn(Renderer.prototype, 'render');
    const update = vi.spyOn(Renderer.prototype, 'updateNodes');
    show(p0, ab, tl, 500);
    show(p0, ab, tl, 750);
    expect(render).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    const el = host.querySelector(`[data-ix-id="${ab.children[1].id}"]`) as HTMLElement;
    expect(el.style.transform).toContain('translate(75px');
  });
});
