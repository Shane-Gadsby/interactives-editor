import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { FitTextFields } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount(node: SceneNode) {
  const p = createProject('T');
  p.artboards[0].children.push(node);
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const Harness = () => {
    const n = useEditor((st) => st.project.artboards[0].children[0]);
    return <FitTextFields nodes={[n as SceneNode & { fitText?: null }]} />;
  };
  act(() => root.render(<Harness />));
}
const cur = () => s.get().project.artboards[0].children[0] as SceneNode & { fitText?: { min?: number; max?: number } | null; autoSize?: string };
const tick = () => host.querySelector('input[type="checkbox"]') as HTMLInputElement;
const limitInput = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.textContent === label)!.querySelector('input') as HTMLInputElement;
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Fit text to box in the inspector', () => {
  it('turns on with any sizes, makes a text layer Fixed, and turns off again', () => {
    mount(createNode('text', { autoSize: 'height' }));
    expect(host.textContent).not.toContain('Smallest');
    act(() => tick().click());
    expect(cur().fitText).toEqual({});
    expect(cur().autoSize).toBe('none');
    expect(host.textContent).toContain('Smallest');
    expect(host.textContent).toContain('Largest');
    act(() => tick().click());
    expect(cur().fitText).toBeNull();
    expect(host.textContent).not.toContain('Smallest');
  });

  it('leaves a button without a Sizing alone', () => {
    mount(createNode('button', {}));
    act(() => tick().click());
    expect(cur().fitText).toEqual({});
    expect('autoSize' in cur()).toBe(false);
  });

  it('takes a number, or blank (any) for each limit', () => {
    mount(createNode('text', {}));
    act(() => tick().click());
    type(limitInput('Smallest'), '12');
    type(limitInput('Largest'), '48.555');
    expect(cur().fitText).toEqual({ min: 12, max: 48.56 });
    type(limitInput('Smallest'), 'any');
    expect(cur().fitText).toEqual({ max: 48.56 });
    type(limitInput('Largest'), '');
    expect(cur().fitText).toEqual({});
    type(limitInput('Largest'), '-4');
    expect(cur().fitText).toEqual({});
  });
});
