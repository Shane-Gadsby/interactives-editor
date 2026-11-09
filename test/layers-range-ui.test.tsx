import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
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

// Back to front: A, Grp (Inner), C, D. Drawn top first: D, C, Grp, Inner, A
beforeEach(() => {
  const p = createProject('T');
  const g = createNode('group', { name: 'Grp' } as never);
  g.children = [createNode('rect', { name: 'Inner' } as never)];
  p.artboards[0].children.push(createNode('rect', { name: 'A' } as never), g, createNode('rect', { name: 'C' } as never), createNode('rect', { name: 'D' } as never));
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<LeftPanel />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const row = (name: string) => [...host.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.textContent === name) as HTMLElement;
const click = (name: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) => act(() => void row(name).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...mods })));
const key = (name: string, k: string, mods: { shiftKey?: boolean } = {}) => act(() => void row(name).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: k, ...mods })));
const sel = () => s.get().project.artboards[0].children.filter((n) => s.get().selection.includes(n.id)).map((n) => n.name).sort().join(',');
const selAll = () => {
  const names: string[] = [];
  const walk = (list: { id: string; name: string; children?: unknown[] }[]) => list.forEach((n) => (s.get().selection.includes(n.id) && names.push(n.name), n.children && walk(n.children as never)));
  walk(s.get().project.artboards[0].children as never);
  return names.sort().join(',');
};

describe('Layers panel range select', () => {
  it('Shift+click selects every layer in between, in the order listed', () => {
    click('D');
    click('Grp', { shiftKey: true });
    expect(selAll()).toBe('C,D,Grp');
    // the highlighted rows are the selection
    expect(host.querySelectorAll('.layer-row.selected').length).toBe(3);
    // the anchor stays on D, so the next Shift+click re-sweeps from it
    click('A', { shiftKey: true });
    expect(selAll()).toBe('A,C,D,Grp,Inner');
  });

  it('a folded group counts as one row', () => {
    act(() => void (row('Grp').querySelector('.twisty') as HTMLElement).click());
    expect(row('Inner')).toBeUndefined();
    click('D');
    click('A', { shiftKey: true });
    expect(selAll()).toBe('A,C,D,Grp');
  });

  it('Ctrl+click toggles one and moves the anchor, Ctrl+Shift+click adds a range', () => {
    click('A');
    click('C', { ctrlKey: true });
    expect(sel()).toBe('A,C');
    click('D', { ctrlKey: true, shiftKey: true });
    expect(sel()).toBe('A,C,D');
    click('C', { metaKey: true });
    expect(sel()).toBe('A,D');
  });

  it('Shift+arrow grows the selection one row at a time', () => {
    click('D');
    key('D', 'ArrowDown', { shiftKey: true });
    expect(sel()).toBe('C,D');
    key('C', 'ArrowDown', { shiftKey: true });
    expect(selAll()).toBe('C,D,Grp');
    key('Grp', 'ArrowUp', { shiftKey: true });
    expect(sel()).toBe('C,D');
  });

  it('a plain arrow still only moves focus', () => {
    click('D');
    key('D', 'ArrowDown');
    expect(sel()).toBe('D');
  });
});
