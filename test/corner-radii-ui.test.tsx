import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type FrameNode, type RectNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { CornerRadii } from '../src/panels/CornerRadii';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let id: string;

function Harness() {
  const node = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === id)!);
  return <CornerRadii nodes={[node]} />;
}
const rect = () => s.get().project.artboards[0].children.find((c) => c.id === id) as RectNode;
function mount(props: Record<string, unknown> = {}, type: 'rect' | 'frame' = 'rect') {
  const p = createProject('T');
  const r = createNode(type, { name: 'Card', cornerRadius: 8, ...props } as never);
  id = r.id;
  p.artboards[0].children.push(r);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const field = (label: string) => [...host.querySelectorAll<HTMLLabelElement>('label.number-field')].find((l) => l.textContent?.replace(/\u2011/g, '-') === label)!.querySelector('input')!;
const values = () => ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'].map((l) => field(l).value);
const enter = (label: string, text: string) =>
  act(() => {
    const i = field(label);
    i.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, text);
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.blur();
  });
const lock = () => host.querySelector<HTMLButtonElement>('.lock-toggle')!;

describe('corner radii in the inspector', () => {
  beforeEach(() => mount());

  it('shows four fields, locked while every corner is the same', () => {
    expect(host.querySelectorAll('label.number-field')).toHaveLength(4);
    expect(values()).toEqual(['8', '8', '8', '8']);
    expect(lock().getAttribute('aria-pressed')).toBe('true');
  });

  it('locked: editing one corner sets all four, with a single radius', () => {
    enter('Bottom-left', '20');
    expect(rect().cornerRadius).toBe(20);
    expect(rect().cornerRadii).toBeUndefined();
    expect(values()).toEqual(['20', '20', '20', '20']);
  });

  it('unlocked: each corner is its own, and the single radius is left alone', () => {
    act(() => lock().click());
    expect(lock().getAttribute('aria-pressed')).toBe('false');
    enter('Top-right', '30');
    expect(rect().cornerRadii).toEqual([8, 30, 8, 8]);
    enter('Bottom-right', '4');
    expect(rect().cornerRadii).toEqual([8, 30, 4, 8]);
    expect(values()).toEqual(['8', '30', '4', '8']);
  });

  it('locking again sets all four to the top-left value and drops the list', () => {
    act(() => lock().click());
    enter('Top-right', '30');
    enter('Top-left', '12');
    act(() => lock().click());
    expect(rect().cornerRadii).toBeUndefined();
    expect(rect().cornerRadius).toBe(12);
    expect(values()).toEqual(['12', '12', '12', '12']);
    // And one step undoes the lot
    act(() => s.undo());
    expect(rect().cornerRadii).toEqual([12, 30, 8, 8].map((v, i) => (i === 0 ? 12 : v)));
  });
});

describe('corner radii that already differ', () => {
  it('start unlocked and show each corner', () => {
    mount({ cornerRadii: [1, 2, 3, 4] }, 'frame');
    expect(values()).toEqual(['1', '2', '3', '4']);
    expect(lock().getAttribute('aria-pressed')).toBe('false');
    enter('Bottom-left', '9');
    expect((s.get().project.artboards[0].children[0] as FrameNode).cornerRadii).toEqual([1, 2, 3, 9]);
  });
});

describe('keyframes', () => {
  const keys = () => s.get().project.artboards[0].timelines.flatMap((t) => t.tracks.map((tr) => `${tr.prop}=${tr.keys.map((k) => k.value).join(',')}`));
  it('locked: one key button, on the single radius', () => {
    mount();
    act(() => s.set({ bottomTab: 'timeline' }));
    const btns = host.querySelectorAll<HTMLButtonElement>('.key-btn');
    expect(btns).toHaveLength(1);
    act(() => btns[0].click());
    expect(keys()).toEqual(['cornerRadius=8']);
  });
  it('unlocked: a key button per corner, starting from the single radius', () => {
    mount();
    act(() => s.set({ bottomTab: 'timeline' }));
    act(() => lock().click());
    const btns = host.querySelectorAll<HTMLButtonElement>('.key-btn');
    expect(btns).toHaveLength(4);
    act(() => btns[1].click());
    expect(keys()).toEqual(['cornerRadii.1=8']);
  });
  it('editing an unlocked corner while recording keys that corner', () => {
    mount();
    act(() => s.set({ bottomTab: 'timeline' }));
    act(() => lock().click());
    act(() => void s.addTimeline());
    act(() => s.set({ recording: true }));
    enter('Bottom-right', '40');
    expect(keys()).toEqual(['cornerRadii.2=40']);
    expect(rect().cornerRadii).toBeUndefined();
  });
});
