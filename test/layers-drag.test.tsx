import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, isContainer, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { LeftPanel } from '../src/panels/LeftPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
};

let root: Root;
let host: HTMLElement;
let s: EditorStore;

// Back to front: Group (Inner), Plain. Drawn top first: Plain, Group, Inner. The last row is inside the group.
function mount() {
  const p = createProject('T');
  const g = createNode('group', { name: 'Group' } as never);
  g.children = [createNode('rect', { name: 'Inner' } as never)];
  p.artboards[0].children.push(g, createNode('rect', { name: 'Plain' } as never));
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<LeftPanel />));
}
beforeEach(mount);
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const layers = () => host.querySelector('.layers') as HTMLElement;
const rowOf = (name: string) => [...host.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.textContent === name) as HTMLElement;
const names = () => {
  const out: string[] = [];
  const walk = (list: SceneNode[], d: number) => {
    for (let i = list.length - 1; i >= 0; i--) {
      out.push(`${'-'.repeat(d)}${list[i].name}`);
      const n = list[i];
      if (isContainer(n)) walk(n.children, d + 1);
    }
  };
  walk(s.get().project.artboards[0].children, 0);
  return out.join(' ');
};
// jsdom lays nothing out: the list's rect is all zeros, so a pointer y is its offset into the list. Row 0 is the artboard row.
function dragEvent(type: string, x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, dataTransfer: { dropEffect: '', effectAllowed: '', setData() {} }, relatedTarget: null });
  return e;
}
const rowY = (flatIndex: number, frac = 0.5) => 4 + (flatIndex + frac) * 26;

describe('Layers panel drag and drop', () => {
  it('draws a line indented to the depth, and drops at the very bottom outside the group', () => {
    const plain = rowOf('Plain');
    act(() => void plain.dispatchEvent(dragEvent('dragstart', 0, 0)));
    // Flat: Home 0, Plain 1, Group 2, Inner 3. The bottom half of Inner, pointer far right: stays in the group
    act(() => void layers().dispatchEvent(dragEvent('dragover', 500, rowY(3, 0.8))));
    let line = host.querySelector('.drop-line') as HTMLElement;
    expect(line).toBeTruthy();
    const inGroup = parseInt(line.style.left, 10);
    // Pointer at the left edge: the line moves out to the top level, under the group
    act(() => void layers().dispatchEvent(dragEvent('dragover', 2, rowY(3, 0.8))));
    line = host.querySelector('.drop-line') as HTMLElement;
    expect(parseInt(line.style.left, 10)).toBeLessThan(inGroup);
    expect(line.style.top).toBe(`${4 + 4 * 26 - 1}px`);
    act(() => void layers().dispatchEvent(dragEvent('drop', 2, rowY(3, 0.8))));
    expect(names()).toBe('Group -Inner Plain');
    expect(host.querySelector('.drop-line')).toBeNull();
  });

  it('the empty space under the last row counts as the end of the list', () => {
    act(() => void rowOf('Plain').dispatchEvent(dragEvent('dragstart', 0, 0)));
    act(() => void layers().dispatchEvent(dragEvent('dragover', 500, rowY(20))));
    expect(host.querySelector('.drop-line')).toBeTruthy();
    act(() => void layers().dispatchEvent(dragEvent('drop', 500, rowY(20))));
    // Pointer on the right of the indent, so it joins the group Inner is in, under Inner
    expect(names()).toBe('Group -Inner -Plain');
  });

  it('outlines a group when the middle of its row is the target, and drops inside', () => {
    act(() => void rowOf('Plain').dispatchEvent(dragEvent('dragstart', 0, 0)));
    act(() => void layers().dispatchEvent(dragEvent('dragover', 100, rowY(2, 0.5))));
    expect(rowOf('Group').classList.contains('drop-inside')).toBe(true);
    expect(host.querySelector('.drop-line')).toBeNull();
    expect(rowOf('Plain').classList.contains('dragging')).toBe(true);
    act(() => void layers().dispatchEvent(dragEvent('drop', 100, rowY(2, 0.5))));
    expect(names()).toBe('Group -Plain -Inner');
  });

  it('the top and bottom thirds of a group row put the layer before or after it', () => {
    act(() => void rowOf('Inner').dispatchEvent(dragEvent('dragstart', 0, 0)));
    act(() => void layers().dispatchEvent(dragEvent('dragover', 100, rowY(2, 0.1))));
    expect(rowOf('Group').classList.contains('drop-inside')).toBe(false);
    act(() => void layers().dispatchEvent(dragEvent('drop', 100, rowY(2, 0.1))));
    expect(names()).toBe('Plain Inner Group');
  });

  it('shows no line for a drop that changes nothing, and does not move anything', () => {
    act(() => void rowOf('Plain').dispatchEvent(dragEvent('dragstart', 0, 0)));
    act(() => void layers().dispatchEvent(dragEvent('dragover', 100, rowY(1, 0.2))));
    act(() => void layers().dispatchEvent(dragEvent('drop', 100, rowY(1, 0.2))));
    expect(names()).toBe('Plain Group -Inner');
    expect(s.get().project.artboards[0].children.length).toBe(2);
  });

  it('clears the line when the drag ends', () => {
    act(() => void rowOf('Plain').dispatchEvent(dragEvent('dragstart', 0, 0)));
    act(() => void layers().dispatchEvent(dragEvent('dragover', 100, rowY(3, 0.8))));
    expect(host.querySelector('.drop-line')).toBeTruthy();
    act(() => void rowOf('Plain').dispatchEvent(dragEvent('dragend', 0, 0)));
    expect(host.querySelector('.drop-line')).toBeNull();
    expect(host.querySelector('.dragging')).toBeNull();
  });
});
