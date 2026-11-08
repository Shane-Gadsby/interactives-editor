import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, type Artboard, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { appendStep, writeClickFlow } from '../src/lib/click-flow';
import { linkedPage, linkToPage, pageLinksOf, pageRoutes, pagesToLinkTo } from '../src/lib/page-link';
import { arrowPath, edgePoint, mergeRoutes, PageLinkLayer } from '../src/canvas/PageLinkLayer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Three pages side by side (A, B, C) and a button on A. */
function book(): Project {
  const p = createProject('Book');
  p.artboards = ['A', 'B', 'C'].map((name, i) => createArtboard({ id: name.toLowerCase(), name, width: 400, height: 300, canvasX: i * 500, canvasY: 0 }));
  p.artboards[0].children.push(createNode('button', { id: 'btn', name: 'Go button', x: 20, y: 20, width: 120, height: 40 }));
  return p;
}
const A = (p: Project): Artboard => p.artboards[0];

describe('click flow writer', () => {
  it('writes the click and a chain of steps as ordinary nodes, below what is there', () => {
    const p = book();
    A(p).logic.nodes.push({ id: 'old', kind: 'event.start', x: 40, y: 200, params: {} });
    const w = writeClickFlow(A(p), 'btn', [{ kind: 'action.artboard', params: { to: 'picked', artboard: 'b' } }, { kind: 'action.emit', params: { name: 'x' } }]);
    expect(w.event.kind).toBe('event.pointer');
    expect(w.event.params).toMatchObject({ target: 'btn', type: 'click' });
    expect(w.event.y).toBe(340);
    expect(w.steps.map((s) => s.kind)).toEqual(['action.artboard', 'action.emit']);
    expect(w.steps[0].params).toMatchObject({ to: 'picked', artboard: 'b', transition: 'fade' });
    expect(A(p).logic.edges.map((e) => [e.from, e.to])).toEqual([[w.event.id, w.steps[0].id], [w.steps[0].id, w.steps[1].id]]);
  });

  it('hangs a step off the end of a row', () => {
    const p = book();
    const w = writeClickFlow(A(p), 'btn', [{ kind: 'action.emit', params: { name: 'x' } }]);
    const n = appendStep(A(p), w.event, { kind: 'action.emit', params: { name: 'y' } });
    expect(n.y).toBe(w.event.y);
    expect(n.x).toBeGreaterThan(w.steps[0].x);
    expect(A(p).logic.edges.some((e) => e.from === w.event.id && e.to === n.id)).toBe(true);
  });
});

describe('linking a layer to a page', () => {
  it('writes a click and a Go to artboard, and reads it back', () => {
    const p = book();
    expect(linkedPage(A(p), 'btn')).toBeNull();
    expect(linkToPage(A(p), 'btn', 'b')).toBe('added');
    expect(linkedPage(A(p), 'btn')).toBe('b');
    expect(A(p).logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.artboard']);
  });

  it('changes the page of the link it wrote instead of adding a second', () => {
    const p = book();
    linkToPage(A(p), 'btn', 'b');
    expect(linkToPage(A(p), 'btn', 'b')).toBe('same');
    expect(linkToPage(A(p), 'btn', 'c')).toBe('changed');
    expect(A(p).logic.nodes).toHaveLength(2);
    expect(pageLinksOf(A(p), 'btn').map((l) => l.to)).toEqual(['c']);
  });

  it('takes the link away, and the click that only did that', () => {
    const p = book();
    linkToPage(A(p), 'btn', 'b');
    expect(linkToPage(A(p), 'btn', null)).toBe('removed');
    expect(A(p).logic).toMatchObject({ nodes: [], edges: [] });
    expect(linkToPage(A(p), 'btn', null)).toBe('none');
  });

  it('hangs the page change off a click the layer already has, and keeps the click when the link goes', () => {
    const p = book();
    const w = writeClickFlow(A(p), 'btn', [{ kind: 'action.emit', params: { name: 'clicked' } }]);
    expect(linkToPage(A(p), 'btn', 'c')).toBe('added');
    expect(A(p).logic.nodes.filter((n) => n.kind === 'event.pointer')).toHaveLength(1);
    expect(pageLinksOf(A(p), 'btn')[0].event.id).toBe(w.event.id);
    linkToPage(A(p), 'btn', null);
    expect(A(p).logic.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.emit']);
  });

  it('never rewrites a click with an Only if', () => {
    const p = book();
    writeClickFlow(A(p), 'btn', [{ kind: 'action.artboard', params: { to: 'picked', artboard: 'b' } }]);
    A(p).logic.nodes[0].params.onlyIf = 'score > 3';
    expect(linkedPage(A(p), 'btn')).toBeNull();
    expect(linkToPage(A(p), 'btn', 'c')).toBe('added');
    expect(A(p).logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.onlyIf)).toBeTruthy();
    expect(linkedPage(A(p), 'btn')).toBe('c');
  });

  it('offers the other pages, leaving out masters and responsive versions', () => {
    const p = book();
    p.artboards.push(createArtboard({ id: 'bn', name: 'B narrow', variantOf: 'b' }), createArtboard({ id: 'm', name: 'Master', isMaster: true }));
    expect(pagesToLinkTo(p, A(p)).map((x) => x.name)).toEqual(['B', 'C']);
  });
});

describe('routes between pages', () => {
  it('lists chosen pages and Next / Previous, one per pair, with the layers that start them', () => {
    const p = book();
    linkToPage(A(p), 'btn', 'c');
    p.artboards[1].children.push(createNode('button', { id: 'nx', name: 'Next button', x: 0, y: 0, width: 50, height: 20 }));
    writeClickFlow(p.artboards[1], 'nx', [{ kind: 'action.artboard', params: { to: 'next' } }]);
    writeClickFlow(p.artboards[1], 'nx', [{ kind: 'action.artboard', params: { to: 'previous' } }]);
    const routes = pageRoutes(p);
    expect(routes.map((r) => `${r.from}>${r.to}`).sort()).toEqual(['a>c', 'b>a', 'b>c']);
    expect(routes.find((r) => r.from === 'a')).toMatchObject({ via: ['Go button'], order: false });
    expect(routes.find((r) => r.from === 'b' && r.to === 'c')).toMatchObject({ via: ['Next button'], order: true });
  });

  it('draws nothing for expressions, Back, or a jump to the same page', () => {
    const p = book();
    writeClickFlow(A(p), 'btn', [{ kind: 'action.artboard', params: { to: 'expression', expr: '"B"' } }]);
    writeClickFlow(A(p), 'btn', [{ kind: 'action.artboard', params: { to: 'back' } }]);
    writeClickFlow(A(p), 'btn', [{ kind: 'action.artboard', params: { to: 'picked', artboard: 'a' } }]);
    expect(pageRoutes(p)).toEqual([]);
  });

  it('draws Next one way and Previous back as one line with two heads, but keeps chosen pages apart', () => {
    const merged = mergeRoutes([
      { from: 'a', to: 'b', via: ['Next'], order: true },
      { from: 'b', to: 'a', via: ['Back'], order: true },
      { from: 'a', to: 'c', via: [], order: false },
      { from: 'c', to: 'a', via: [], order: false },
    ]);
    expect(merged.map((r) => `${r.from}>${r.to}${r.both ? '<>' : ''}`)).toEqual(['a>b<>', 'a>c', 'c>a']);
  });

  it('puts the arrow between the edges of the two boxes, bowing the other way for the way back', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 300, y: 0, w: 100, h: 100 };
    expect(edgePoint(a, { x: 350, y: 50 })).toEqual({ x: 100, y: 50 });
    const there = arrowPath(a, b);
    const back = arrowPath(b, a);
    expect(there.mid.y).not.toBeCloseTo(back.mid.y, 0);
    expect(there.d.startsWith('M')).toBe(true);
  });
});

describe('the Go to page handle', () => {
  let root: Root;
  let host: HTMLElement;
  let store: EditorStore;
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    HTMLElement.prototype.setPointerCapture = () => undefined;
    store = new EditorStore(book());
    setCurrentStore(store);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  //Page A is at 0,0 on a zoom-1 canvas panned by (10, 10)
  const show = (selection = ['btn'], tool = 'select') => {
    const project = store.get().project;
    act(() => root.render(<PageLinkLayer project={project} zoom={1} panX={10} panY={10} active={project.artboards[0]} selection={selection} tool={tool} />));
  };
  const handle = () => host.querySelector<HTMLButtonElement>('.page-link-handle');
  const abA = () => store.get().project.artboards[0];

  it('shows on a single selected layer only, with the select tool', () => {
    show();
    expect(handle()).toBeTruthy();
    expect(handle()!.getAttribute('aria-label')).toMatch(/Go to page/);
    show(['btn', 'x']);
    expect(handle()).toBeNull();
    show(['btn'], 'rect');
    expect(handle()).toBeNull();
  });

  it('dragging it onto a page links the layer to that page, and lights the page on the way', () => {
    show();
    const h = handle()!;
    const fire = (type: string, x: number, y: number) => act(() => void h.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })));
    fire('pointerdown', 170, 40);
    //page B starts at x=500 (+10 pan)
    fire('pointermove', 700, 100);
    expect(host.querySelector('.page-link-target')?.textContent).toBe('Go to B');
    fire('pointerup', 700, 100);
    expect(linkedPage(abA(), 'btn')).toBe('b');
    expect(host.querySelector('.page-link-target')).toBeNull();
  });

  it('letting go over nothing, or over its own page, links nothing', () => {
    show();
    const h = handle()!;
    const fire = (type: string, x: number, y: number) => act(() => void h.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })));
    fire('pointerdown', 170, 40);
    fire('pointermove', 450, 400);
    fire('pointerup', 450, 400);
    fire('pointerdown', 170, 40);
    fire('pointermove', 300, 100);
    expect(host.querySelector('.page-link-target')).toBeNull();
    fire('pointerup', 300, 100);
    expect(abA().logic.nodes).toHaveLength(0);
  });

  it('Enter offers the pages as a list, and choosing one links it', () => {
    show();
    act(() => void handle()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    const items = [...document.querySelectorAll('.ctx-menu button, .ctx-menu [role="menuitem"]')];
    const c = items.find((i) => i.textContent === 'C') as HTMLElement;
    expect(c).toBeTruthy();
    act(() => c.click());
    expect(linkedPage(abA(), 'btn')).toBe('c');
  });

  it('draws the faint route arrows between pages, and not when they are switched off', async () => {
    store.update((d) => void linkToPage(d.artboards[0], 'btn', 'b'));
    show([]);
    expect(host.querySelectorAll('.page-routes .route').length).toBeGreaterThan(0);
    expect(host.querySelector('.sr-only')?.textContent).toMatch(/A goes to B/);
    //switched off, or a project of one page, nothing is drawn
    const { setShowRoutes } = await import('../src/lib/page-routes-pref');
    act(() => setShowRoutes(false));
    show([]);
    expect(host.querySelector('.page-routes')).toBeNull();
    act(() => setShowRoutes(true));
  });
});

describe('the Go to page section of the Inspector', () => {
  it('lists the other pages, and choosing one (or none) writes and removes the link', async () => {
    const { PageLinkSection } = await import('../src/panels/PageLinkSection');
    const store = new EditorStore(book());
    setCurrentStore(store);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = () => {
      const project = store.get().project;
      act(() => root.render(<PageLinkSection node={project.artboards[0].children[0]} ab={project.artboards[0]} project={project} />));
    };
    render();
    const select = () => host.querySelector('select') as HTMLSelectElement;
    expect([...select().options].map((o) => o.textContent)).toEqual(['No page', 'B', 'C']);
    const pick = (v: string) => {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      act(() => {
        set.call(select(), v);
        select().dispatchEvent(new Event('change', { bubbles: true }));
      });
      render();
    };
    pick('c');
    expect(linkedPage(store.get().project.artboards[0], 'btn')).toBe('c');
    expect(select().value).toBe('c');
    expect(host.textContent).toMatch(/Clicking it goes to C/);
    pick('');
    expect(linkedPage(store.get().project.artboards[0], 'btn')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });
});
