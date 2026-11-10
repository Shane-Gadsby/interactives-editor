//The repeater's "Repeat for each" picker, its typed-items table and its Selection setting; and a list variable edited as a table.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type GroupNode, type SceneNode, type Variable } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { RepeatSection } from '../src/panels/Inspector';
import { VariablesPanel } from '../src/panels/ScriptsVariables';

const named = { answer: 'selectedIndex' as string | null };
vi.mock('../src/components/dialogs', () => ({
  confirmDialog: async () => true,
  promptDialog: async (o: { initial?: string }) => (named.answer === null ? null : named.answer || o.initial || ''),
  alertDialog: async () => undefined,
  choiceDialog: async () => null,
  DialogHost: () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let id: string;

function Harness() {
  const g = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === id) as GroupNode);
  return <RepeatSection node={g} project={s.get().project} />;
}
function mount(repeat: GroupNode['repeat'], vars: Variable[] = [], ui: 'repeat' | 'variables' = 'repeat') {
  const p = createProject('T');
  p.variables.push(...vars);
  const g = createNode('group', { name: 'List', repeat, children: [createNode('rect', {}) as SceneNode] }) as GroupNode;
  id = g.id;
  p.artboards[0].children.push(g);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(ui === 'repeat' ? <Harness /> : <VariablesPanel />));
}
const rep = () => (s.get().project.artboards[0].children.find((c) => c.id === id) as GroupNode).repeat!;
const select = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label))?.querySelector('select') ?? null;
const pick = (sel: HTMLSelectElement, value: string) =>
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
const btn = (scope: ParentNode, text: string) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const cells = () => [...host.querySelectorAll<HTMLInputElement>('input.data-cell')];

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  named.answer = 'selectedIndex';
});

const people: Variable = { id: 'vp', name: 'people', type: 'list', initial: '[{"name": "Ann"}, {"name": "Bo"}]' } as Variable;

describe('Repeat for each', () => {
  it('offers lists and typing, and a list is just its name in Items', () => {
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    const sel = select('Repeat for each')!;
    expect([...sel.options].map((o) => o.value)).toEqual(['list:people', 'own', 'formula']);
    expect(sel.value).toBe('list:people');
    expect(host.querySelector('.list-table')).toBeNull();
    expect(host.textContent).not.toContain('placeholder');
  });

  it('Type my own items shows a table of three items to change, written into Items', () => {
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    pick(select('Repeat for each')!, 'own');
    expect(JSON.parse(rep().items)).toEqual([{ text: 'First' }, { text: 'Second' }, { text: 'Third' }]);
    expect(host.querySelector('.list-table')).not.toBeNull();
    expect(cells().some((c) => c.value === 'Second')).toBe(true);
    expect(host.textContent).toContain('{item.text}');
    //a row added in the table goes into the expression
    act(() => btn(host, 'Add').click());
    expect(JSON.parse(rep().items)).toHaveLength(4);
  });

  it('the formula stays reachable', () => {
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    pick(select('Repeat for each')!, 'formula');
    expect(rep().items).toBe('people');
    expect(host.querySelector('.list-table')).toBeNull();
    expect(select('Repeat for each')!.value).toBe('formula');
    expect(host.textContent).toContain('Items');
  });

  it('a filter formula is shown as a formula', () => {
    mount({ items: 'people.filter(p => p.name)', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    expect(select('Repeat for each')!.value).toBe('formula');
  });
});

describe('Selection', () => {
  it('One at a time asks for a name, makes a number variable that starts at -1 and sets the repeat', async () => {
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    expect(select('Selection')!.value).toBe('none');
    pick(select('Selection')!, 'one');
    await settle();
    const v = s.get().project.variables.find((x) => x.name === 'selectedIndex')!;
    expect(v).toMatchObject({ type: 'number', initial: -1 });
    expect(rep().select).toEqual({ mode: 'one', variable: v.id });
    expect(select('Remember the pick in')!.value).toBe(v.id);
    expect(host.textContent).toContain('isSelected');
  });

  it('Several makes a list variable that starts empty', async () => {
    named.answer = 'selectedItems';
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    pick(select('Selection')!, 'several');
    await settle();
    const v = s.get().project.variables.find((x) => x.name === 'selectedItems')!;
    expect(v).toMatchObject({ type: 'list', initial: '[]' });
    expect(rep().select).toEqual({ mode: 'several', variable: v.id });
    expect(select('Remember the pick in')!.value).toBe(v.id);
  });

  it('cancelling the name leaves it as it was', async () => {
    named.answer = null;
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1 }, [people]);
    pick(select('Selection')!, 'one');
    await settle();
    expect(rep().select).toBeUndefined();
  });

  it('uses a variable that is already the right kind, and None turns it off', async () => {
    const n: Variable = { id: 'vn', name: 'chosen', type: 'number', initial: -1 } as Variable;
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1, select: { mode: 'one', variable: 'vn' } }, [people, n]);
    expect(select('Remember the pick in')!.value).toBe('vn');
    pick(select('Selection')!, 'several');
    await settle();
    //a number variable is the wrong kind for several, so a new list variable is made
    expect(rep().select?.mode).toBe('several');
    expect(rep().select?.variable).not.toBe('vn');
    pick(select('Selection')!, 'none');
    expect(rep().select).toBeNull();
  });

  it('Click again to clear is a one-at-a-time setting', () => {
    const n: Variable = { id: 'vn', name: 'chosen', type: 'number', initial: -1 } as Variable;
    mount({ items: 'people', layout: 'vertical', gap: 8, columns: 1, select: { mode: 'one', variable: 'vn' } }, [people, n]);
    const box = [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Click again to clear'))!.querySelector('input')!;
    act(() => box.click());
    expect(rep().select?.toggle).toBe(true);
  });
});

describe('a list variable as a table', () => {
  it('shows a row per item and edits the starting value', () => {
    mount(null, [people], 'variables');
    expect(cells().map((c) => c.value)).toEqual(expect.arrayContaining(['name', 'Ann', 'Bo']));
    act(() => btn(host, 'Add').click());
    const rows = JSON.parse(String(s.get().project.variables[0].initial));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: 'Ann' });
  });

  it('switches to the JSON text and back, and a nested list has no table', () => {
    mount(null, [{ id: 'vq', name: 'deep', type: 'list', initial: '[{"pets": ["cat"]}]' } as Variable, people], 'variables');
    const toggles = [...host.querySelectorAll<HTMLElement>('.list-table')];
    expect(toggles).toHaveLength(2);
    //the first (nested) one has only the text, and the Table button is off
    expect(btn(toggles[0], 'Table').disabled).toBe(true);
    expect(toggles[0].querySelector('textarea')).not.toBeNull();
    //the second shows its table; JSON text shows the text and Table goes back
    expect(toggles[1].querySelector('.data-grid')).not.toBeNull();
    act(() => btn(toggles[1], 'JSON text').click());
    expect(toggles[1].querySelector('textarea')!.value).toContain('"name": "Ann"');
    expect(toggles[1].querySelector('.data-grid')).toBeNull();
    act(() => btn(toggles[1], 'Table').click());
    expect(toggles[1].querySelector('.data-grid')).not.toBeNull();
  });

  it('a plain list of numbers is one column', () => {
    mount(null, [{ id: 'vn', name: 'nums', type: 'list', initial: '[1, 2, 3]' } as Variable], 'variables');
    expect(cells().filter((c) => c.classList.contains('head')).map((c) => c.value)).toEqual(['value']);
    expect(cells().filter((c) => !c.classList.contains('head')).map((c) => c.value)).toEqual(['1', '2', '3']);
  });
});
