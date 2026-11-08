import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { locate } from '../src/store/doc';
import { scoreEntry, type PropEntry } from '../src/lib/prop-search';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

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
});

function scene() {
  const p = createProject('T');
  const ab = p.artboards[0];
  const r = createNode('rect', { name: 'r', width: 100, height: 50, opacity: 0.35, scaleX: 1, scaleY: 1 } as never) as SceneNode;
  ab.children.push(r);
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.select([r.id]);
  return { s, id: r.id };
}
const node = (x: ReturnType<typeof scene>) => locate(x.s.artboard()!, x.id)!.node as unknown as Record<string, number | boolean | undefined>;
const render = () => act(() => root.render(<Inspector />));
const field = (prop: string) => host.querySelector<HTMLInputElement>(`[data-prop="${prop}"] input`)!;
const typeInto = (input: HTMLInputElement, v: string) =>
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });

describe('inspector fields in author words and units', () => {
  it('shows opacity as a percent and stores 0 to 1', () => {
    const x = scene();
    render();
    expect(field('opacity').value).toBe('35');
    expect(host.querySelector('[data-prop="opacity"] .field-suffix')!.textContent).toBe('%');
    typeInto(field('opacity'), '50');
    expect(node(x).opacity).toBe(0.5);
    typeInto(field('opacity'), '100');
    expect(node(x).opacity).toBe(1);
    typeInto(field('opacity'), '250');
    expect(node(x).opacity).toBe(1);
  });

  it('shows scale as a percent, keeps the lock, and stores 1 = 100%', () => {
    const x = scene();
    render();
    expect(field('scale-w').value).toBe('100');
    typeInto(field('scale-w'), '200');
    expect(node(x).scaleX).toBe(2);
    expect(node(x).scaleY).toBe(1);
    // lock the pair: changing one now carries the other along
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Link width and height scale"]')!.click());
    typeInto(field('scale-h'), '50');
    expect(node(x).scaleY).toBe(0.5);
    expect(node(x).scaleX).toBe(1);
    expect(node(x).lockScale).toBe(true);
  });

  it('writes a flipped scale as a negative percent', () => {
    const x = scene();
    render();
    typeInto(field('scale-w'), '-100');
    expect(node(x).scaleX).toBe(-1);
    expect(field('scale-w').value).toBe('-100');
  });

  it('rotation keeps its degrees and says Rotation', () => {
    const x = scene();
    render();
    expect(host.querySelector('[data-prop="rotation"] .field-label')!.textContent).toBe('Rotation');
    expect(host.querySelector('[data-prop="rotation"] .field-suffix')!.textContent).toBe('°');
    typeInto(field('rotation'), '45');
    expect(node(x).rotation).toBe(45);
  });

  it('the pivot is a 3x3 picker over the same originX and originY', () => {
    const x = scene();
    render();
    const dots = [...host.querySelectorAll<HTMLButtonElement>('.pivot-row [role="radio"]')];
    expect(dots).toHaveLength(9);
    expect(dots.map((d) => d.getAttribute('aria-label'))).toContain('Top left');
    // the default pivot is the middle
    expect(dots.filter((d) => d.getAttribute('aria-checked') === 'true').map((d) => d.getAttribute('aria-label'))).toEqual(['Middle centre']);
    act(() => dots.find((d) => d.getAttribute('aria-label') === 'Bottom right')!.click());
    expect([node(x).originX, node(x).originY]).toEqual([1, 1]);
    act(() => dots.find((d) => d.getAttribute('aria-label') === 'Top left')!.click());
    expect([node(x).originX, node(x).originY]).toEqual([0, 0]);
  });

  it('a custom pivot lights no dot, and its percents show and write 0 to 1', () => {
    const x = scene();
    render();
    typeInto(field('pivot-x'), '25');
    expect(node(x).originX).toBe(0.25);
    expect(node(x).originY).toBe(0.5);
    const lit = () => [...host.querySelectorAll('.pivot-row [role="radio"][aria-checked="true"]')];
    expect(lit()).toHaveLength(0);
    expect(field('pivot-x').value).toBe('25');
    typeInto(field('pivot-x'), '50');
    expect(lit()).toHaveLength(1);
  });

  it('every one of them is labelled for a screen reader and carries a tip with the file name', () => {
    scene();
    render();
    for (const prop of ['opacity', 'scale-w', 'scale-h', 'rotation', 'pivot-x', 'pivot-y']) {
      const el = host.querySelector(`[data-prop="${prop}"]`)!;
      expect(el, prop).toBeTruthy();
      expect(el.querySelector('input')!.getAttribute('aria-description') || el.getAttribute('title') || el.querySelector('label')?.getAttribute('data-tip') || el.querySelector('label')?.getAttribute('title'), prop).toBeTruthy();
    }
    expect(host.querySelector('[data-prop="scale-w"]')!.getAttribute('title') ?? host.querySelector('[data-prop="scale-w"] label')?.getAttribute('title')).toMatch(/scaleX/);
  });
});

describe('the old names still find the new rows', () => {
  const E = (label: string, section = 'Layer'): PropEntry => ({ key: label.toLowerCase().replace(/\s+/g, '-'), label, section });
  const hit = (q: string, label: string) => scoreEntry(q, E(label)) > 0;
  it('opacity by alpha and the symbol words', () => {
    expect(hit('alpha', 'Opacity')).toBe(true);
    expect(hit('transparency', 'Opacity')).toBe(true);
    expect(hit('opacity', 'Opacity')).toBe(true);
  });
  it('scale by sx, sy and the plain words', () => {
    expect(hit('sx', 'Scale W')).toBe(true);
    expect(hit('scale x', 'Scale W')).toBe(true);
    expect(hit('sy', 'Scale H')).toBe(true);
    expect(hit('flip', 'Scale W')).toBe(true);
    expect(hit('zoom', 'Scale H')).toBe(true);
  });
  it('the pivot by origin, anchor and ox', () => {
    for (const q of ['pivot', 'origin', 'anchor', 'transform origin', 'ox']) expect(hit(q, 'Pivot'), q).toBe(true);
    expect(hit('origin x', 'Pivot X')).toBe(true);
  });
  it('rotation by rotate, angle and degrees', () => {
    for (const q of ['rotate', 'angle', 'degrees', 'spin']) expect(hit(q, 'Rotation'), q).toBe(true);
  });
  it('the real panel shows the pivot row for an origin search', () => {
    scene();
    render();
    expect(host.querySelector('[data-prop="pivot"]')).toBeTruthy();
  });
});
