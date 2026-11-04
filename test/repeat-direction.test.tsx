import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type GroupNode, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { RepeatSection } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let id: string;

function Harness() {
  const g = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === id) as GroupNode);
  return <RepeatSection node={g} project={s.get().project} />;
}
function mount(repeat: GroupNode['repeat']) {
  const p = createProject('T');
  const g = createNode('group', { name: 'List', repeat, children: [createNode('rect', {}) as SceneNode] }) as GroupNode;
  id = g.id;
  p.artboards[0].children.push(g);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
}
const rep = () => (s.get().project.artboards[0].children.find((c) => c.id === id) as GroupNode).repeat!;
const select = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label))?.querySelector('select') ?? null;
const pick = (sel: HTMLSelectElement, value: string) =>
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('repeater fill direction field', () => {
  it('is only there for the grid layout', () => {
    mount({ items: '[1,2,3]', layout: 'vertical', gap: 8, columns: 2 });
    expect(select('Fill order')).toBeNull();
    pick(select('Layout')!, 'grid');
    expect(select('Fill order')).not.toBeNull();
  });

  it('sets columns first, and clears back to the default for rows first', () => {
    mount({ items: '[1,2,3]', layout: 'grid', gap: 8, columns: 2 });
    expect(select('Fill order')!.value).toBe('rows');
    pick(select('Fill order')!, 'columns');
    expect(rep().direction).toBe('columns');
    expect(select('Fill order')!.value).toBe('columns');
    pick(select('Fill order')!, 'rows');
    expect(rep().direction).toBeUndefined();
  });
});
