import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Rulers } from '../src/canvas/Rulers';
import { setPrefs } from '../src/lib/prefs';

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
  //jsdom has no layout: give the rulers layer a size so "off the edge of the canvas" means something
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 2000, bottom: 700, width: 2000, height: 700, x: 0, y: 0, toJSON() {} });
  //the tests below are about attached guides, so the preference is on (it is off by default: new guides are universal, see the end)
  setPrefs({ attachGuides: true });
  s = new EditorStore(createProject('T'));
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  draw();
});
afterEach(() => {
  vi.restoreAllMocks();
  setPrefs({ attachGuides: false });
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

describe('a guide is one endless line', () => {
  const project = () => s.get().project;

  it('there is no every-page kind: the preference is attach, Alt gives a universal guide, no project list', () => {
    const left = host.querySelector('.canvas-ruler.left')!;
    act(() => void left.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 100, altKey: true })));
    act(() => void window.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 100, altKey: true })));
    expect(guides()).toEqual({ x: [], y: [] });
    expect(project().canvasGuides).toEqual({ x: [300], y: [] });
    expect(project().guides).toBeUndefined();
    expect(host.querySelector('.canvas-ruler.top')!.getAttribute('title')).toMatch(/Attached to the page \(Alt: universal\)/);
    expect(host.querySelector('.canvas-ruler.top')!.getAttribute('title')).toMatch(/Alt/);
  });

  it('is drawn the whole way across (no length of its own, so the css stretches it over the canvas)', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [150] })));
    draw();
    for (const el of host.querySelectorAll<HTMLElement>('.guide-line')) {
      expect(el.style.height).toBe('');
      expect(el.style.width).toBe('');
      expect(el.style.top === '' || el.style.left === '').toBe(true);
    }
  });

  it('the corner menu has lock and the three clears, and nothing about every page', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [] })));
    draw();
    act(() => void (host.querySelector('.ruler-corner') as HTMLElement).click());
    const labels = [...document.querySelectorAll('.ctx-menu *')].filter((n) => n.children.length === 0 && n.textContent).map((n) => n.textContent);
    expect(labels).toEqual(['Lock guides', 'Clear this page’s guides', 'Clear universal guides', 'Clear all guides']);
  });

  it('a guide can be moved and dropped back on the ruler to remove it', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [] })));
    draw();
    const line = host.querySelector('.guide-line.x')!;
    mouse(line, 'pointerdown', 220, 300);
    mouse(line, 'pointermove', 260, 300);
    mouse(line, 'pointerup', 260, 300);
    expect(guides()).toEqual({ x: [260], y: [] });
    mouse(host.querySelector('.guide-line.x')!, 'pointerdown', 260, 300);
    mouse(host.querySelector('.guide-line.x')!, 'pointerup', 5, 300);
    expect(s.get().project.artboards[0].guides).toBeUndefined();
  });

  it('right-click on an attached guide offers remove, make it universal and the guides menu', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [] })));
    draw();
    act(() => void host.querySelector('.guide-line.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 300 })));
    const labels = [...document.querySelectorAll('.ctx-menu *')].filter((n) => n.children.length === 0).map((n) => n.textContent);
    expect(labels).toContain('Remove guide');
    expect(labels).toContain('Make it universal');
    expect(labels).toContain('Lock guides');
    expect(labels.join('|')).not.toMatch(/every page|this page only/i);
    act(() => void [...document.querySelectorAll<HTMLElement>('.ctx-menu *')].find((n) => n.textContent === 'Remove guide')!.click());
    expect(s.get().project.artboards[0].guides).toBeUndefined();
  });

  it('locked guides cannot be moved, removed or added to', () => {
    act(() => s.update((d) => void ((d.artboards[0].guides = { x: [220], y: [] }), (d.guidesLocked = true))));
    draw();
    const line = host.querySelector('.guide-line.x')!;
    expect(line.classList.contains('locked')).toBe(true);
    mouse(line, 'pointerdown', 220, 300);
    mouse(line, 'pointermove', 260, 300);
    mouse(line, 'pointerup', 5, 300);
    expect(guides()).toEqual({ x: [220], y: [] });
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(top, 'pointerup', 100, 150);
    expect(guides()).toEqual({ x: [220], y: [] });
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

describe('a new guide goes on the page it is dragged over', () => {
  it('lands on the second page, measured from that page, and that page becomes the open one', () => {
    act(() => {
      s.update((d) => {
        const first = d.artboards[0];
        d.artboards.push({ ...JSON.parse(JSON.stringify(first)), id: 'ab2', name: 'Second', canvasX: first.canvasX + first.width + 100, canvasY: 0, children: [], guides: undefined });
      });
    });
    draw();
    const first = s.get().project.artboards[0];
    const second = s.get().project.artboards[1];
    const top = host.querySelector('.canvas-ruler.top')!;
    const x = second.canvasX + 50;
    mouse(top, 'pointerdown', x, 5);
    mouse(window as unknown as Element, 'pointermove', x, 140);
    // the preview line is the endless kind, at the place on the second page
    const pv = host.querySelector('.guide-line.y.preview') as HTMLElement;
    expect(pv.style.top).toBe(`${second.canvasY + 140 - 3}px`);
    expect(pv.style.width).toBe('');
    mouse(window as unknown as Element, 'pointerup', x, 140);
    expect(s.get().project.artboards.find((a) => a.id === 'ab2')!.guides?.y).toEqual([140]);
    expect(first.guides?.y ?? []).toEqual([]);
    expect(s.get().activeArtboardId).toBe('ab2');
  });
});

describe('universal guides (the default)', () => {
  const project = () => s.get().project;
  const win = window as unknown as Element;
  const click = (label: string) => act(() => void [...document.querySelectorAll<HTMLElement>('.ctx-menu *')].find((n) => n.children.length === 0 && n.textContent === label)!.click());
  const labels = () => [...document.querySelectorAll('.ctx-menu *')].filter((n) => n.children.length === 0 && n.textContent).map((n) => n.textContent);
  beforeEach(() => {
    setPrefs({ attachGuides: false });
    act(() => {
      s.update((d) => {
        d.artboards[0].canvasX = 0;
        d.artboards[0].canvasY = 0;
        d.artboards.push({ ...JSON.parse(JSON.stringify(d.artboards[0])), id: 'ab2', name: 'Second', canvasX: d.artboards[0].width + 100, canvasY: 0, children: [], guides: undefined });
      });
    });
    draw();
  });

  it('dragging out of a ruler makes a universal guide at the canvas position, not on a page', () => {
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(top, 'pointerup', 100, 150);
    expect(project().canvasGuides).toEqual({ x: [], y: [150] });
    expect(project().artboards.some((a) => a.guides)).toBe(false);
    const left = host.querySelector('.canvas-ruler.left')!;
    //over the second page, still canvas pixels
    const x = project().artboards[1].canvasX + 40;
    mouse(left, 'pointerdown', 5, 100);
    mouse(left, 'pointerup', x, 100);
    expect(project().canvasGuides).toEqual({ x: [x], y: [150] });
    expect(s.get().activeArtboardId).not.toBe('ab2');
  });

  it('Alt while dragging gives an attached guide on the page under the pointer, and the label says which it is', () => {
    const top = host.querySelector('.canvas-ruler.top')!;
    const x = project().artboards[1].canvasX + 50;
    mouse(top, 'pointerdown', x, 5);
    mouse(win, 'pointermove', x, 140);
    expect(host.querySelector('.guide-pos')?.textContent).toMatch(/ px · Universal$/);
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })));
    expect(host.querySelector('.guide-pos')?.textContent).toMatch(/^140 px · Second$/);
    act(() => void window.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: 140, altKey: true })));
    expect(project().artboards[1].guides?.y).toEqual([140]);
    expect(project().canvasGuides).toBeUndefined();
    expect(s.get().activeArtboardId).toBe('ab2');
  });

  it('the rulers say what a new guide is', () => {
    expect(host.querySelector('.canvas-ruler.top')!.getAttribute('title')).toMatch(/Universal \(Alt: attached to the page\)/);
    expect(host.querySelector('.canvas-ruler.left')!.getAttribute('title')).toMatch(/Alt: attached to the page/);
  });

  it('is drawn the whole way, grabbable along all of it, whichever page is open, and labelled on the open page', () => {
    act(() => s.update((d) => void (d.canvasGuides = { x: [1000], y: [150] })));
    act(() => s.set({ activeArtboardId: 'ab2' }));
    act(() => root.render(<Rulers ab={s.get().project.artboards[1]} zoom={1} panX={0} panY={0} width={800} height={600} />));
    const lines = [...host.querySelectorAll<HTMLElement>('.guide-line.universal')];
    expect(lines).toHaveLength(2);
    for (const l of lines) expect((l.querySelector('.guide-grab') as HTMLElement).getAttribute('style')).toBeNull();
    //second page starts at 900: the vertical line at canvas 1000 is 100 into it
    expect(host.querySelector('.guide-line.universal.x')!.getAttribute('title')).toBe('100 px · Universal guide');
  });

  it('can be moved, and removed by letting go on the ruler or off the edge of the canvas', () => {
    act(() => s.update((d) => void (d.canvasGuides = { x: [], y: [150, 300] })));
    draw();
    const [a] = host.querySelectorAll('.guide-line.universal.y');
    mouse(a, 'pointerdown', 300, 150);
    mouse(win, 'pointermove', 300, 200);
    mouse(win, 'pointerup', 300, 200);
    expect(project().canvasGuides!.y).toEqual([200, 300]);
    //letting go on the ruler
    mouse(host.querySelector('.guide-line.universal.y')!, 'pointerdown', 300, 200);
    mouse(win, 'pointermove', 300, 5);
    expect(host.querySelector('.guide-line.universal.y.removing')).not.toBeNull();
    expect(host.querySelector('.guide-remove-hint')?.textContent).toBe('Let go to remove this guide');
    expect(project().canvasGuides!.y).toEqual([200, 300]);
    mouse(win, 'pointerup', 300, 5);
    expect(project().canvasGuides!.y).toEqual([300]);
    //letting go past the edge of the canvas
    mouse(host.querySelector('.guide-line.universal.y')!, 'pointerdown', 300, 300);
    mouse(win, 'pointerup', 300, 800);
    expect(project().canvasGuides).toBeUndefined();
  });

  it('a new one let go off the canvas is not made', () => {
    const top = host.querySelector('.canvas-ruler.top')!;
    mouse(top, 'pointerdown', 100, 5);
    mouse(win, 'pointermove', 100, 900);
    expect(host.querySelector('.guide-remove-hint')?.textContent).toBe('Let go here and no guide is made');
    mouse(win, 'pointerup', 100, 900);
    expect(project().canvasGuides).toBeUndefined();
  });

  it('right-click offers Attach to the page it crosses, and an attached one offers Make it universal, both keeping their place on the canvas', () => {
    act(() => s.update((d) => void (d.canvasGuides = { x: [1000], y: [] })));
    draw();
    act(() => void host.querySelector('.guide-line.universal.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1000, clientY: 300 })));
    expect(labels()).toContain('Remove guide');
    //the line is past the open page (0..800), so the page it crosses is the second one
    expect(labels()).toContain('Attach to Second');
    click('Attach to Second');
    expect(project().canvasGuides).toBeUndefined();
    expect(project().artboards[1].guides).toEqual({ x: [100], y: [] });
    //and back
    act(() => s.set({ activeArtboardId: 'ab2' }));
    act(() => root.render(<Rulers ab={s.get().project.artboards[1]} zoom={1} panX={0} panY={0} width={800} height={600} />));
    act(() => void host.querySelector('.guide-line.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1000, clientY: 300 })));
    click('Make it universal');
    expect(project().artboards[1].guides).toBeUndefined();
    expect(project().canvasGuides).toEqual({ x: [1000], y: [] });
  });

  it('a universal guide that crosses no page cannot be attached', () => {
    act(() => s.update((d) => void (d.canvasGuides = { x: [850], y: [] })));
    draw();
    act(() => void host.querySelector('.guide-line.universal.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 850, clientY: 300 })));
    expect(labels()).toContain('Attach to a page');
  });

  it('locked: not grabbed, not added', () => {
    act(() => s.update((d) => void ((d.canvasGuides = { x: [], y: [150] }), (d.guidesLocked = true))));
    draw();
    const line = host.querySelector('.guide-line.universal.y')!;
    expect(line.classList.contains('locked')).toBe(true);
    mouse(line, 'pointerdown', 300, 150);
    mouse(win, 'pointerup', 300, 5);
    expect(project().canvasGuides).toEqual({ x: [], y: [150] });
  });
});
