import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Rulers } from '../src/canvas/Rulers';
import { setGuideScope } from '../src/lib/guides';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function draw() {
  act(() => root.render(<Rulers ab={s.get().project.artboards[0]} zoom={1} panX={0} panY={0} width={800} height={600} />));
}

function mouse(el: Element, type: string, x: number, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  });
  draw();
}

beforeEach(() => {
  // these first tests are about one page's own guides; the project ones are tested below
  setGuideScope('page');
  s = new EditorStore(createProject('T'));
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  draw();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const guides = () => s.get().project.artboards[0].guides ?? { x: [], y: [] };

describe('ruler guides', () => {
  it('the top ruler makes a horizontal guide (y), the left ruler a vertical one (x)', () => {
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(top, 'pointerup', 100, 150);
    expect(guides()).toEqual({ x: [], y: [150] });

    const left = host.querySelector('.canvas-ruler.left')!;
    mouse(left, 'pointerdown', 5, 100);
    mouse(left, 'pointerup', 220, 100);
    expect(guides()).toEqual({ x: [220], y: [150] });
  });

  it('tooltips name the guide each ruler makes', () => {
    expect(host.querySelector('.canvas-ruler.top')!.getAttribute('title')).toMatch(/horizontal guide/);
    expect(host.querySelector('.canvas-ruler.left')!.getAttribute('title')).toMatch(/vertical guide/);
  });

  it('dropping a guide back on its ruler removes it: horizontal on the top ruler, vertical on the left', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [150] })));
    draw();
    const lines = host.querySelectorAll('.guide-line');
    const vertical = host.querySelector('.guide-line.x')!;
    const horizontal = host.querySelector('.guide-line.y')!;
    expect(lines.length).toBe(2);
    mouse(horizontal, 'pointerdown', 300, 150);
    mouse(horizontal, 'pointerup', 300, 5);
    expect(guides()).toEqual({ x: [220], y: [] });
    mouse(vertical, 'pointerdown', 220, 300);
    mouse(vertical, 'pointerup', 5, 300);
    expect(guides()).toEqual({ x: [], y: [] });
  });
});

describe('project guides (for every page)', () => {
  const project = () => s.get().project;
  beforeEach(() => setGuideScope('project'));
  afterEach(() => setGuideScope('project'));

  it('a guide dragged out of a ruler is for every page by default, and Alt makes this one a page guide', () => {
    const left = host.querySelector('.canvas-ruler.left')!;
    mouse(left, 'pointerdown', 5, 100);
    mouse(left, 'pointerup', 220, 100);
    expect(project().guides).toEqual({ x: [220], y: [] });
    expect(guides()).toEqual({ x: [], y: [] });
    act(() => void left.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 100, altKey: true })));
    mouse(left, 'pointerup', 300, 100);
    expect(guides()).toEqual({ x: [300], y: [] });
    expect(project().guides).toEqual({ x: [220], y: [] });
  });

  it('the corner menu says which kind new guides are and flips it', () => {
    const corner = host.querySelector('.ruler-corner') as HTMLElement;
    act(() => void corner.click());
    const labels = () => [...document.querySelectorAll('.ctx-menu *')].filter((n) => n.children.length === 0).map((n) => n.textContent);
    expect(labels()).toContain('✓ Every page');
    act(() => void ([...document.querySelectorAll<HTMLElement>('.ctx-menu *')].find((n) => n.textContent === '   This page only') as HTMLElement).click());
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(top, 'pointerup', 100, 150);
    expect(guides()).toEqual({ x: [], y: [150] });
    expect(project().guides).toBeUndefined();
  });

  it('draws project and page guides on the open page, dashed for the project ones', () => {
    act(() => s.update((d) => void ((d.guides = { x: [220], y: [] }), (d.artboards[0].guides = { x: [], y: [150] }))));
    draw();
    expect(host.querySelector('.guide-line.x.project')).toBeTruthy();
    expect(host.querySelector('.guide-line.y.page')).toBeTruthy();
  });

  it('a project guide off the page is not shown there', () => {
    act(() => s.update((d) => void (d.guides = { x: [5000], y: [100] })));
    draw();
    expect(host.querySelectorAll('.guide-line')).toHaveLength(1);
    expect(host.querySelector('.guide-line.y.project')).toBeTruthy();
  });

  it('a project guide can be moved and dropped back on the ruler to remove it', () => {
    act(() => s.update((d) => void (d.guides = { x: [220], y: [] })));
    draw();
    const line = host.querySelector('.guide-line.x')!;
    mouse(line, 'pointerdown', 220, 300);
    mouse(line, 'pointermove', 260, 300);
    mouse(line, 'pointerup', 260, 300);
    expect(project().guides).toEqual({ x: [260], y: [] });
    mouse(host.querySelector('.guide-line.x')!, 'pointerdown', 260, 300);
    mouse(host.querySelector('.guide-line.x')!, 'pointerup', 5, 300);
    expect(project().guides).toBeUndefined();
  });

  it('right-click on a guide switches it between every page and this page', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [] })));
    draw();
    act(() => void host.querySelector('.guide-line.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 300 })));
    const item = (t: string) => [...document.querySelectorAll<HTMLElement>('.ctx-menu *')].find((n) => n.textContent === t && n.children.length === 0)!;
    act(() => void item('Show on every page').click());
    expect(project().guides).toEqual({ x: [220], y: [] });
    expect(guides()).toEqual({ x: [], y: [] });
    draw();
    act(() => void host.querySelector('.guide-line.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 300 })));
    act(() => void item('Keep on this page only').click());
    expect(project().guides).toBeUndefined();
    expect(guides()).toEqual({ x: [220], y: [] });
  });

  it('locked guides cannot be moved, removed or added to', () => {
    act(() => s.update((d) => void ((d.guides = { x: [220], y: [] }), (d.guidesLocked = true))));
    draw();
    const line = host.querySelector('.guide-line.x')!;
    expect(line.classList.contains('locked')).toBe(true);
    mouse(line, 'pointerdown', 220, 300);
    mouse(line, 'pointermove', 260, 300);
    mouse(line, 'pointerup', 5, 300);
    expect(project().guides).toEqual({ x: [220], y: [] });
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(top, 'pointerup', 100, 150);
    expect(project().guides).toEqual({ x: [220], y: [] });
    expect(guides()).toEqual({ x: [], y: [] });
  });
});

describe('dragging a guide off its page', () => {
  const makeGuide = () => {
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(top, 'pointerup', 100, 150);
    expect(guides().y).toEqual([150]);
    return host.querySelector('.guide-line.y')!;
  };
  const below = () => s.get().project.artboards[0].height + 120;

  it('keeps the guide until you let go, with a note by the pointer, and removes it on release out there', () => {
    const line = makeGuide();
    mouse(line, 'pointerdown', 300, 150);
    mouse(window as unknown as Element, 'pointermove', 300, below());
    // nothing has gone yet: the guide is where it last was on the page, faded, and the note says what letting go does
    expect(guides().y).toEqual([150]);
    expect(host.querySelector('.guide-line.y.removing')).not.toBeNull();
    expect(host.querySelector('.guide-remove-hint')?.textContent).toBe('Let go to remove this guide');
    mouse(window as unknown as Element, 'pointerup', 300, below());
    expect(guides().y).toEqual([]);
    expect(host.querySelector('.guide-remove-hint')).toBeNull();
  });

  it('coming back onto the page and letting go there keeps it, at the new place', () => {
    const line = makeGuide();
    mouse(line, 'pointerdown', 300, 150);
    mouse(window as unknown as Element, 'pointermove', 300, below());
    mouse(window as unknown as Element, 'pointermove', 300, 220);
    expect(host.querySelector('.guide-remove-hint')).toBeNull();
    mouse(window as unknown as Element, 'pointerup', 300, 220);
    expect(guides().y).toEqual([220]);
  });

  it('a new guide let go off the page is not made', () => {
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(window as unknown as Element, 'pointermove', 100, below());
    expect(host.querySelector('.guide-remove-hint')?.textContent).toBe('Let go here and no guide is made');
    mouse(window as unknown as Element, 'pointerup', 100, below());
    expect(guides().y).toEqual([]);
  });
});
