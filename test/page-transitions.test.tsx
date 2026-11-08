//The page looks (wipe, iris, zoom, push) reaching every place a page change is chosen: the Go to a page form, When clicked...,
//the page navigation bars, the link on a layer, Preview and the single file export.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG_BY_KIND, PAGE_TRANSITIONS, Player, createArtboard, createNode, createProject, defaultParams, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { RECIPE_BY_ID, THIS_LAYER, buildBehaviour, defaultAnswers, incomplete, type RecipeCtx } from '../src/lib/recipes';
import { addPageNavigation } from '../src/lib/page-nav';
import { linkToPage, linkTransition, setLinkTransition } from '../src/lib/page-link';
import { describeNode } from '../src/lib/flow-describe';
import { standaloneHtml } from '../src/lib/export';
import { PageLinkSection } from '../src/panels/PageLinkSection';
import { PageNavSection } from '../src/panels/PageNavSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOOKS = PAGE_TRANSITIONS.map((t) => t.value);
const NEW = ['wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'iris', 'zoom', 'pushLeft', 'pushRight', 'pushUp', 'pushDown'];

function book(): Project {
  const p = createProject('Book');
  p.artboards = ['A', 'B', 'C'].map((name, i) => createArtboard({ id: name.toLowerCase(), name, width: 400, height: 300, canvasX: i * 500 }));
  p.artboards[0].children.push(createNode('button', { id: 'btn', name: 'Door', x: 20, y: 20, width: 120, height: 40 }));
  return p;
}

describe('the Go to a page form', () => {
  it('offers every new look, the form asks where an iris or zoom opens from, and a missing look is a fade', () => {
    const def = CATALOG_BY_KIND['action.artboard'];
    const sel = def.params.find((p) => p.key === 'transition')!;
    expect(sel.options?.map((o) => o.value)).toEqual(expect.arrayContaining(['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', ...NEW]));
    expect(new Set(LOOKS).size).toBe(LOOKS.length);
    expect(defaultParams('action.artboard')).toMatchObject({ transition: 'fade', from: 'clicked' });
    const from = def.params.find((p) => p.key === 'from')!;
    expect(from.showIf?.values).toEqual(['iris', 'zoom']);
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition: 'fade' } }, book().artboards[0], book())).toBe('go to the next page');
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition: 'wipeLeft' } }, book().artboards[0], book())).toBe('go to the next page (wipe left)');
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition: 'iris' } }, book().artboards[0], book())).toBe('go to the next page (iris)');
  });
});

describe('When clicked... behaviours', () => {
  const ctxOf = (p: Project): RecipeCtx => ({ project: p, ab: p.artboards[0], layerId: 'btn' });
  let n = 0;
  const mk = (x: string) => `${x}${++n}`;

  it('the three page recipes ask how the page changes, and it is optional', () => {
    const p = book();
    for (const id of ['page-next', 'page-previous', 'page-pick']) {
      const r = RECIPE_BY_ID[id];
      expect(r.needs.some((x) => x.kind === 'transition'), id).toBe(true);
      expect(defaultAnswers(r, ctxOf(p)).transition, id).toBe('fade');
      expect(incomplete(r, { page: 'b' }), id).toBeNull();
    }
    expect(RECIPE_BY_ID['show'].needs.some((x) => x.kind === 'transition')).toBe(false);
    void THIS_LAYER;
  });

  it('writes the chosen look into the Go to a page node, and a fade when none is chosen', () => {
    const p = book();
    const go = (id: string, a: Record<string, string>) => buildBehaviour(ctxOf(p), id, 'click', a, mk).nodes[1].params;
    for (const look of NEW) expect(go('page-next', { transition: look }), look).toMatchObject({ to: 'next', transition: look });
    expect(go('page-previous', { transition: 'iris' })).toMatchObject({ to: 'previous', transition: 'iris', from: 'clicked' });
    expect(go('page-pick', { page: 'b', transition: 'zoom' })).toMatchObject({ to: 'picked', artboard: 'b', transition: 'zoom' });
    expect(go('page-next', {})).toMatchObject({ transition: 'fade' });
    //a name that is not a look is not written
    expect(go('page-next', { transition: 'flip' })).toMatchObject({ transition: 'fade' });
  });
});

describe('page navigation bars', () => {
  it('Back and Next use the chosen look, a fade by default', () => {
    const p = book();
    addPageNavigation(p, ['a', 'b', 'c'], 'back-next');
    const gos = (pr: Project) => pr.artboards.flatMap((a) => a.logic.nodes.filter((x) => x.kind === 'action.artboard'));
    expect(gos(p).length).toBeGreaterThan(0);
    expect(gos(p).every((g) => g.params.transition === 'fade')).toBe(true);
    const q = book();
    addPageNavigation(q, ['a', 'b', 'c'], 'back-next', 'wipeLeft');
    expect(gos(q).length).toBeGreaterThan(0);
    expect(gos(q).every((g) => g.params.transition === 'wipeLeft')).toBe(true);
  });
});

describe('the link on a layer', () => {
  it('reads and sets how the page changes on every link it has', () => {
    const p = book();
    const a = p.artboards[0];
    expect(setLinkTransition(a, 'btn', 'iris')).toBe(false);
    linkToPage(a, 'btn', 'b');
    expect(linkTransition(a, 'btn')).toBe('fade');
    expect(setLinkTransition(a, 'btn', 'iris')).toBe(true);
    expect(linkTransition(a, 'btn')).toBe('iris');
    //pointing it at another page keeps the look
    linkToPage(a, 'btn', 'c');
    expect(linkTransition(a, 'btn')).toBe('iris');
  });
});

describe('the panels', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const pick = (label: string, value: string) => {
    const sel = [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(label))?.querySelector('select');
    expect(sel, label).toBeTruthy();
    expect([...sel!.options].map((o) => o.value)).toEqual(expect.arrayContaining(NEW));
    act(() => {
      sel!.value = value;
      sel!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  it('the Go to page section on a layer changes the look of its link', () => {
    const st = new EditorStore(book());
    setCurrentStore(st);
    st.update((d) => {
      linkToPage(d.artboards[0], 'btn', 'b');
    });
    const render = () => {
      const pr = st.get().project;
      act(() => root.render(<PageLinkSection node={pr.artboards[0].children[0]} ab={pr.artboards[0]} project={pr} />));
    };
    render();
    pick('How the page changes', 'wipeUp');
    expect(linkTransition(st.get().project.artboards[0], 'btn')).toBe('wipeUp');
    expect(st.get().project.artboards[0].logic.nodes.find((x) => x.kind === 'action.artboard')?.params.artboard).toBe('b');
  });

  it('the page navigation section picks the look the bars use', () => {
    const st = new EditorStore(book());
    setCurrentStore(st);
    act(() => root.render(<PageNavSection ids={['a']} project={st.get().project} />));
    pick('How the page changes', 'pushLeft');
    const add = [...host.querySelectorAll('button')].find((b) => /Add to this page/.test(b.textContent ?? ''))!;
    act(() => add.click());
    const gos = st.get().project.artboards[0].logic.nodes.filter((x) => x.kind === 'action.artboard');
    expect(gos.length).toBeGreaterThan(0);
    expect(gos.every((g) => g.params.transition === 'pushLeft')).toBe(true);
  });
});

describe('Preview and the single file export', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('Preview (the player) runs a wipe set on a Go to a page node', () => {
    const frames: Keyframe[][] = [];
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (f: Keyframe[]) {
      frames.push(f);
      return {};
    };
    const p = book();
    p.artboards[0].logic.nodes.push({ id: 'go', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), artboard: 'b', transition: 'wipeDown' } });
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.goTo('b', 'wipeDown', 300);
    expect(frames.some((f) => f.some((k) => k.clipPath === 'inset(0% 0% 100% 0%)'))).toBe(true);
    player.destroy();
  });

  it('the exported file carries the player that knows every look', async () => {
    const p = book();
    const html = await standaloneHtml(p);
    for (const look of NEW) expect(html, look).toContain(look);
  });
});
