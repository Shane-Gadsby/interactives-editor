//The page looks (wipe, iris, zoom, push) reaching every place a page change is chosen: the Go to a page form, When clicked...,
//the page navigation bars, the link on a layer, Preview and the single file export.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG_BY_KIND, PAGE_TRANSITIONS, Player, createArtboard, createNode, createProject, defaultParams, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { RECIPE_BY_ID, THIS_LAYER, buildBehaviour, defaultAnswers, incomplete, type RecipeCtx } from '../src/lib/recipes';
import { addPageNavigation } from '../src/lib/page-nav';
import { linkDuration, linkToPage, linkTransition, setLinkDuration, setLinkTransition } from '../src/lib/page-link';
import { describeNode } from '../src/lib/flow-describe';
import { standaloneHtml } from '../src/lib/export';
import { PageLinkSection } from '../src/panels/PageLinkSection';
import { PageNavSection } from '../src/panels/PageNavSection';
import { ParamForm } from '../src/panels/LogicGraph';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOOKS = PAGE_TRANSITIONS.map((t) => t.value);
const NEW = ['wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'iris', 'zoom', 'pushLeft', 'pushRight', 'pushUp', 'pushDown', 'wipeDiagonal', 'barnDoors', 'star', 'diamond', 'heart', 'clock', 'blinds', 'grid', 'crosshatch', 'dots', 'dissolve', 'cube'];

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
    expect(from.showIf?.values).toEqual(['iris', 'zoom', 'star', 'diamond', 'heart', 'clock']);
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition: 'fade' } }, book().artboards[0], book())).toBe('go to the next page');
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition: 'wipeLeft' } }, book().artboards[0], book())).toBe('go to the next page (wipe left)');
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition: 'iris' } }, book().artboards[0], book())).toBe('go to the next page (iris)');
    //the newer looks in plain words, without the bracketed hint their label carries in the select
    const said = (transition: string) => describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), to: 'next', transition } }, book().artboards[0], book());
    expect(said('star')).toBe('go to the next page (star)');
    expect(said('barnDoors')).toBe('go to the next page (barn doors)');
    expect(said('grid')).toBe('go to the next page (grid of squares)');
    expect(said('dissolve')).toBe('go to the next page (dissolve)');
    expect(said('cube')).toBe('go to the next page (cube)');
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

describe('the speed of a page change', () => {
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
  const field = (label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(label));
  const choose = (label: string, value: string) => {
    const sel = field(label)?.querySelector('select');
    expect(sel, label).toBeTruthy();
    act(() => {
      sel!.value = value;
      sel!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const type = (label: string, text: string) => {
    const input = field(label)?.querySelector('input');
    expect(input, label).toBeTruthy();
    act(() => {
      input!.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, text);
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.blur();
    });
  };
  const goNode = (params: Record<string, unknown>) => ({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { ...defaultParams('action.artboard'), ...params } });

  it('the Go to a page form offers Slow, Medium, Fast and Custom, and the number only under Custom', () => {
    const p = book();
    let params: Record<string, unknown> = goNode({ to: 'next', transition: 'iris' }).params;
    const render = () => act(() => root.render(<ParamForm node={{ ...goNode({}), params }} ab={p.artboards[0]} project={p} onChange={(x) => { params = x; render(); }} onNote={() => {}} />));
    setCurrentStore(new EditorStore(p));
    render();
    const sel = field('Speed')!.querySelector('select')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Fast', 'Medium', 'Slow', 'Custom']);
    expect(sel.value).toBe('medium');
    expect(field('Milliseconds')).toBeUndefined();
    choose('Speed', 'slow');
    expect(params.duration).toBe(600);
    choose('Speed', 'fast');
    expect(params.duration).toBe(150);
    //Custom keeps the number it had and reveals it
    choose('Speed', 'custom');
    expect(params.duration).toBe(150);
    expect(field('Milliseconds')).toBeTruthy();
    type('Milliseconds', '1200');
    expect(params.duration).toBe(1200);
    expect(field('Speed')!.querySelector('select')!.value).toBe('custom');
    //an instant change has no speed to ask for, a fade does
    params = { ...params, transition: 'none' };
    render();
    expect(field('Speed')).toBeUndefined();
    params = { ...params, transition: 'fade' };
    render();
    expect(field('Speed')).toBeTruthy();
  });

  it('a number that is not a preset opens as Custom, and a preset number as that preset (existing projects)', () => {
    const p = book();
    setCurrentStore(new EditorStore(p));
    const show = (duration: number) => {
      act(() => root.render(<ParamForm node={goNode({ transition: 'wipeLeft', duration })} ab={p.artboards[0]} project={p} onChange={() => {}} onNote={() => {}} />));
      return field('Speed')!.querySelector('select')!.value;
    };
    expect(show(300)).toBe('medium');
    expect(show(600)).toBe('slow');
    expect(show(150)).toBe('fast');
    expect(show(250)).toBe('custom');
    expect(field('Milliseconds')!.querySelector('input')!.value).toBe('250');
  });

  it('the layer link reads and sets the speed of every link, and only shows it for a look with a length', () => {
    const st = new EditorStore(book());
    setCurrentStore(st);
    st.update((d) => {
      linkToPage(d.artboards[0], 'btn', 'b');
    });
    expect(linkDuration(st.get().project.artboards[0], 'btn')).toBe(300);
    const render = () => {
      const pr = st.get().project;
      act(() => root.render(<PageLinkSection node={pr.artboards[0].children[0]} ab={pr.artboards[0]} project={pr} />));
    };
    render();
    choose('Speed', 'slow');
    expect(linkDuration(st.get().project.artboards[0], 'btn')).toBe(600);
    //still the page it was
    expect(st.get().project.artboards[0].logic.nodes.find((x) => x.kind === 'action.artboard')?.params).toMatchObject({ artboard: 'b', duration: 600 });
    choose('How the page changes', 'none');
    render();
    expect(field('Speed')).toBeUndefined();
    choose('How the page changes', 'iris');
    render();
    expect(field('Speed')).toBeTruthy();
    expect(setLinkDuration(book().artboards[0], 'btn', 200)).toBe(false);
  });

  it('page navigation writes the chosen speed, Medium by default', () => {
    const st = new EditorStore(book());
    setCurrentStore(st);
    act(() => root.render(<PageNavSection ids={['a']} project={st.get().project} />));
    const gos = () => st.get().project.artboards[0].logic.nodes.filter((x) => x.kind === 'action.artboard');
    const add = () => act(() => [...host.querySelectorAll('button')].find((b) => /Add to this page/.test(b.textContent ?? ''))!.click());
    add();
    expect(gos().every((g) => g.params.duration === 300)).toBe(true);
    choose('Speed', 'slow');
    add();
    expect(gos().length).toBeGreaterThan(0);
    expect(gos().every((g) => g.params.duration === 600)).toBe(true);
    choose('How the page changes', 'none');
    expect(field('Speed')).toBeUndefined();
  });

  it('When clicked... asks for a speed with the look, writes it, and leaves it out for Instant', () => {
    const p = book();
    const ctx: RecipeCtx = { project: p, ab: p.artboards[0], layerId: 'btn' };
    let n = 0;
    const mk = (x: string) => `${x}${++n}`;
    for (const id of ['page-next', 'page-previous', 'page-pick']) {
      const r = RECIPE_BY_ID[id];
      expect(r.needs.some((x) => x.kind === 'speed'), id).toBe(true);
      expect(defaultAnswers(r, ctx).speed, id).toBe('300');
      expect(incomplete(r, { page: 'b' }), id).toBeNull();
    }
    const go = (a: Record<string, string>) => buildBehaviour(ctx, 'page-next', 'click', a, mk).nodes[1].params;
    expect(go({ transition: 'iris', speed: '600' })).toMatchObject({ transition: 'iris', duration: 600 });
    expect(go({ transition: 'wipeUp', speed: '1200' })).toMatchObject({ duration: 1200 });
    expect(go({})).toMatchObject({ duration: 300 });
    expect(go({ speed: '' })).toMatchObject({ duration: 300 });
    expect(go({ speed: 'quick' })).toMatchObject({ duration: 300 });
    expect(buildBehaviour(ctx, 'page-next', 'click', { transition: 'fade', speed: '150' }, mk).sentence).toContain('fade, fast');
  });

  it('the sentences name the speed in plain words, except Medium', () => {
    const p = book();
    const say = (params: Record<string, unknown>) => describeNode(goNode({ to: 'next', ...params }), p.artboards[0], p);
    expect(say({ transition: 'iris', duration: 600 })).toBe('go to the next page (iris, slow)');
    expect(say({ transition: 'wipeLeft', duration: 150 })).toBe('go to the next page (wipe left, fast)');
    expect(say({ transition: 'iris', duration: 300 })).toBe('go to the next page (iris)');
    expect(say({ transition: 'pushUp', duration: 1200 })).toBe('go to the next page (push up, 1.2 s)');
    //a fade is only mentioned when its speed is not the usual
    expect(say({ transition: 'fade', duration: 300 })).toBe('go to the next page');
    expect(say({ transition: 'fade', duration: 600 })).toBe('go to the next page (fade, slow)');
    //Instant has no speed to say
    expect(say({ transition: 'none', duration: 600 })).toBe('go to the next page (instant)');
    //a node saved without a duration is Medium
    expect(describeNode({ id: 'g', kind: 'action.artboard', x: 0, y: 0, params: { to: 'next', transition: 'zoom' } }, p.artboards[0], p)).toBe('go to the next page (zoom in)');
  });
});
