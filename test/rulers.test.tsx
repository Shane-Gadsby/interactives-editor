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
