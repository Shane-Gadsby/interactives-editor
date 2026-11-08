import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Renderer, createArtboard, createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { DepthSection } from '../src/panels/Inspector';

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
    const project = useEditor((st) => st.project);
    return <DepthSection nodes={[n]} project={project} />;
  };
  act(() => root.render(<Harness />));
  //the section starts folded until a depth is set
  if (!host.querySelector('select')) act(() => (host.querySelector('.section-title') as HTMLElement).click());
}
const cur = () => s.get().project.artboards[0].children[0] as SceneNode;
const select = () => host.querySelector('select') as HTMLSelectElement;
const pick = (v: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    set.call(select(), v);
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
const amount = () => host.querySelector('input') as HTMLInputElement;
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

describe('Depth section in the inspector', () => {
  it('starts at None, and Small, Medium and Large write the percent', () => {
    mount(createNode('rect'));
    expect(select().value).toBe('none');
    expect(cur().depth).toBeUndefined();
    pick('small');
    expect(cur().depth).toBe(20);
    pick('medium');
    expect(cur().depth).toBe(50);
    pick('large');
    expect(cur().depth).toBe(100);
    expect(amount().value).toBe('100');
    pick('none');
    expect(cur().depth).toBeUndefined();
  });

  it('takes any percent, shows it as Custom, and 0 clears it', () => {
    mount(createNode('rect'));
    type(amount(), '35');
    expect(cur().depth).toBe(35);
    expect(select().value).toBe('custom');
    type(amount(), '-60');
    expect(cur().depth).toBe(-60);
    expect(host.textContent).toContain('with the pointer');
    type(amount(), '0');
    expect(cur().depth).toBeUndefined();
    expect(select().value).toBe('none');
  });

  it('says a draggable layer holds still', () => {
    mount(createNode('rect', { depth: 50, draggable: { tags: [] } } as never));
    expect(host.textContent).toContain('holds still');
  });
});

describe('the canvas', () => {
  it('draws a layer with a depth where it is, whatever the pointer does', () => {
    const r = new Renderer({ mode: 'edit', resolveAsset: () => undefined });
    r.render(createArtboard(), [createNode('rect', { id: 'a', width: 20, height: 20, depth: 100 })], { vars: {} });
    r.setLook(1, 1, 40);
    expect(r.element('a')!.style.translate).toBe('');
  });
});
