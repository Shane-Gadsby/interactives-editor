import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { locate } from '../src/store/doc';

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
});

/** Type into a NumberField the way a person does, then leave it. */
const typeInto = (input: HTMLInputElement, v: string) => {
  act(() => {
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
  });
};

describe('linked width and height', () => {
  it('keeps the ratio while linked, changes one alone when not, and saves the link on the layer', () => {
    const p = createProject('T');
    const r = createNode('rect', { name: 'Box', width: 200, height: 100 });
    p.artboards[0].children.push(r);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([r.id]);
    act(() => root.render(<Inspector />));
    const pair = host.querySelector('.linked-pair')!;
    const [w, h] = [...pair.querySelectorAll<HTMLInputElement>('input')];
    const chain = pair.querySelector<HTMLButtonElement>('.link-toggle')!;
    const node = () => locate(s.artboard()!, r.id)!.node;
    expect(chain.getAttribute('aria-pressed')).toBe('false');
    typeInto(w, '300');
    expect([node().width, node().height]).toEqual([300, 100]);
    act(() => chain.click());
    expect(node().lockRatio).toBe(true);
    typeInto(w, '600');
    expect([node().width, node().height]).toEqual([600, 200]);
    typeInto(h, '100');
    expect([node().width, node().height]).toEqual([300, 100]);
    act(() => chain.click());
    expect(node().lockRatio).toBeUndefined();
  });
});
