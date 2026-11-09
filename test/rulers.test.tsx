import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Rulers } from '../src/canvas/Rulers';

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

describe('a guide is one endless line', () => {
  const project = () => s.get().project;

  it('there is no every-page kind: no Alt kind, no project list, one colour class', () => {
    const left = host.querySelector('.canvas-ruler.left')!;
    act(() => void left.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 100, altKey: true })));
    mouse(left, 'pointerup', 300, 100);
    expect(guides()).toEqual({ x: [300], y: [] });
    expect(project().guides).toBeUndefined();
    expect(host.querySelector('.guide-line.project, .guide-line.page')).toBeNull();
    expect(host.querySelector('.canvas-ruler.top')!.getAttribute('title')).not.toMatch(/every page|Alt/);
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

  it('the corner menu has lock and the two clears, and nothing about every page', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [] })));
    draw();
    act(() => void (host.querySelector('.ruler-corner') as HTMLElement).click());
    const labels = [...document.querySelectorAll('.ctx-menu *')].filter((n) => n.children.length === 0 && n.textContent).map((n) => n.textContent);
    expect(labels).toEqual(['Lock guides', 'Clear this page’s guides', 'Clear all guides']);
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

  it('right-click on a guide offers remove and the guides menu, not a kind', () => {
    act(() => s.update((d) => void (d.artboards[0].guides = { x: [220], y: [] })));
    draw();
    act(() => void host.querySelector('.guide-line.x')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 300 })));
    const labels = [...document.querySelectorAll('.ctx-menu *')].filter((n) => n.children.length === 0).map((n) => n.textContent);
    expect(labels).toContain('Remove guide');
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
