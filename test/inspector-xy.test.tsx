//The Inspector's X and Y: a group's, a laid-out child's, and a field that has to follow the layer when the view changes
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type FrameNode, type GroupNode, type SceneNode, type Timeline } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { NodeInspector } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

const flat = (list: SceneNode[]): SceneNode[] => list.flatMap((n) => [n, ...('children' in n ? flat(n.children) : [])]);
const node = (id: string) => flat(s.get().project.artboards[0].children).find((n) => n.id === id)!;

/** The Inspector for the layer `id`, in a project holding `kids` on its page. */
function mount(kids: SceneNode[], id: string, timelines: Timeline[] = []) {
  const p = createProject('T');
  p.artboards[0].children.push(...kids);
  p.artboards[0].timelines = timelines;
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const Harness = ({ pick }: { pick: string }) => {
    const ab = useEditor((st) => st.project.artboards[0]);
    const project = useEditor((st) => st.project);
    //what the real Inspector re-renders on, so the fields read the timeline they are shown against
    useEditor((st) => `${st.timelineShown}|${st.activeTimelineId}|${st.playhead}|${st.recording}`);
    const n = flat(ab.children).find((x) => x.id === pick)!;
    return <NodeInspector nodes={[n]} ab={ab} project={project} />;
  };
  act(() => root.render(<Harness pick={id} />));
  return (pick: string) => act(() => root.render(<Harness pick={pick} />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const field = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.querySelector('.field-label')?.textContent === label) as HTMLElement | undefined;
const box = (label: string) => field(label)!.querySelector('input')!;
const type = (label: string, text: string) => {
  const input = box(label);
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
};

describe('X and Y read the layer, not what was typed', () => {
  it('a field follows the layer when the view goes back to Design view', () => {
    const tl: Timeline = { id: 't', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'tr', nodeId: 'a', prop: 'y', keys: [{ id: 'k1', t: 0, value: 230, ease: 'linear' }] }] } as never;
    mount([createNode('rect', { id: 'a', x: 10, y: 130, width: 50, height: 50 })], 'a', [tl]);
    act(() => s.set({ timelineShown: true, activeTimelineId: 't', playhead: 0 }));
    expect(box('Y').value).toBe('230');
    type('Y', '300');
    expect(box('Y').value).toBe('300');
    act(() => s.set({ activeTimelineId: null, playhead: 0, recording: false }));
    expect(node('a').y).toBe(130);
    expect(box('Y').value).toBe('130');
  });

  const focusAndType = (input: HTMLInputElement, text?: string) =>
    act(() => {
      input.focus();
      if (text === undefined) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('a box that has focus but was not typed in follows the layer when it moves elsewhere', () => {
    mount([createNode('rect', { id: 'a', x: 10, y: 130, width: 50, height: 50 })], 'a');
    const input = box('Y');
    focusAndType(input);
    act(() => void s.setProps(['a'], { y: 50 }));
    expect(input.value).toBe('50');
  });

  it('a box half typed in keeps what was typed when the layer moves, but not when the view changes under it', () => {
    const tl: Timeline = { id: 't', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'tr', nodeId: 'a', prop: 'y', keys: [{ id: 'k1', t: 0, value: 230, ease: 'linear' }] }] } as never;
    mount([createNode('rect', { id: 'a', x: 10, y: 130, width: 50, height: 50 })], 'a', [tl]);
    act(() => s.set({ timelineShown: true, activeTimelineId: 't', playhead: 0 }));
    const input = box('Y');
    focusAndType(input, '300');
    act(() => void s.setProps(['a'], { y: 240 }));
    expect(input.value).toBe('300');
    //Design view: the layer is 130 here, the field is still open with the 300 typed for the timeline
    act(() => s.set({ activeTimelineId: null, playhead: 0, recording: false }));
    expect(node('a').y).toBe(130);
    expect(input.value).toBe('130');
  });
});

describe('a group sits where its layers are', () => {
  const group = () => createNode('group', { id: 'g', x: 100, y: 0, width: 50, height: 50, children: [createNode('rect', { id: 'c', x: 0, y: 0, width: 50, height: 50 })] }) as GroupNode;

  it('typing a layer inside a group a new X shows the layer where it is now, and the group follows its layers', () => {
    mount([group()], 'c');
    s.select(['c']);
    type('X', '20');
    //the group moved to 120 to hug its layer, which is back at 0 in the group
    expect((node('g') as GroupNode).x).toBe(120);
    expect(node('c').x).toBe(0);
    expect(box('X').value).toBe('0');
  });

  it('the group itself reads its own X, which is its layers box', () => {
    const rerender = mount([group()], 'g');
    expect(box('X').value).toBe('100');
    act(() => void s.setProps(['c'], { x: 20 }));
    rerender('g');
    expect(box('X').value).toBe('120');
  });
});

describe('X and Y of a child an auto layout places', () => {
  const frame = (position?: 'absolute' | 'ignore') =>
    createNode('frame', {
      id: 'f',
      name: 'Cards',
      width: 400,
      height: 100,
      layout: { direction: 'row', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, wrap: false, justify: 'start', align: 'start' },
      children: [createNode('rect', { id: 'a', width: 50, height: 40 }), createNode('rect', { id: 'b', width: 50, height: 40, ...(position ? { layoutItem: { position } } : {}) })],
    } as never) as FrameNode;

  it('are shown but cannot be typed in, and a line says who places it and how to take over', () => {
    mount([frame()], 'b');
    expect(box('X').disabled).toBe(true);
    expect(box('Y').disabled).toBe(true);
    expect(box('X').value).toBe('60');
    expect(host.textContent).toContain('Placed by the auto layout of Cards');
    expect(host.textContent).toContain('Ignore');
  });

  it('Absolute says its inset places it', () => {
    mount([frame('absolute')], 'b');
    expect(box('X').disabled).toBe(true);
    expect(host.textContent).toMatch(/inset/i);
  });

  it('Ignore auto layout gives the fields back', () => {
    mount([frame('ignore')], 'b');
    expect(box('X').disabled).toBe(false);
    expect(host.textContent).not.toContain('Placed by the auto layout');
    type('X', '75');
    expect(node('b').x).toBe(75);
  });

  it('a layer in a plain group, or a frame without auto layout, is free', () => {
    mount([createNode('frame', { id: 'f', width: 300, height: 300, children: [createNode('rect', { id: 'a', width: 50, height: 40 })] } as never)], 'a');
    expect(box('X').disabled).toBe(false);
  });
});
