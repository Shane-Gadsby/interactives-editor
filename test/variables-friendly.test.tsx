import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Variable } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { VariablesPanel } from '../src/panels/ScriptsVariables';
import { VARIABLE_KINDS, variableFor } from '../src/lib/variable-kinds';

const confirm = { answer: true, asked: [] as { title: string; message?: string }[] };
vi.mock('../src/components/dialogs', () => ({
  confirmDialog: async (o: { title: string; message?: string }) => {
    confirm.asked.push(o);
    return confirm.answer;
  },
  promptDialog: async () => null,
  alertDialog: async () => undefined,
  DialogHost: () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount(vars: Variable[] = [], layers: Parameters<typeof createNode>[1][] = []) {
  const p = createProject('T');
  p.variables.push(...vars);
  for (const l of layers) p.artboards[0].children.push(createNode('rect', l));
  s = new EditorStore(p);
  setCurrentStore(s);
  confirm.answer = true;
  confirm.asked = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<VariablesPanel />));
}
beforeEach(() => void (confirm.asked = []));
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const vars = () => s.get().project.variables;
const rows = () => [...host.querySelectorAll<HTMLElement>('.var-table tbody tr')];
const btn = (scope: ParentNode, text: string | RegExp) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')))!;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe('adding a variable in plain words', () => {
  it('Add offers a choice of kinds, each with a line saying what it is for', () => {
    mount();
    expect(host.querySelector('.var-add-menu')).toBeNull();
    act(() => btn(host, '+ Add variable').click());
    const items = [...host.querySelectorAll('.var-add-menu [role="menuitem"]')];
    expect(items.map((i) => i.querySelector('strong')!.textContent)).toEqual(expect.arrayContaining(['Counter', 'Switch (on or off)', 'Text', 'Score', 'List']));
    for (const i of items) expect((i.querySelector('span')!.textContent ?? '').length).toBeGreaterThan(20);
    expect(btn(host, '+ Add variable').getAttribute('aria-expanded')).toBe('true');
  });

  it('each kind makes an ordinary variable with its own starting value', () => {
    mount();
    const make = (label: string) => {
      act(() => btn(host, '+ Add variable').click());
      act(() => [...host.querySelectorAll<HTMLButtonElement>('.var-add-menu button')].find((b) => b.querySelector('strong')!.textContent === label)!.click());
      return vars().at(-1)!;
    };
    expect(make('Counter')).toMatchObject({ name: 'count', type: 'number', initial: 0 });
    expect(make('Switch (on or off)')).toMatchObject({ name: 'isOn', type: 'boolean', initial: false });
    expect(make('Text')).toMatchObject({ name: 'words', type: 'string', initial: '' });
    expect(make('Score')).toMatchObject({ name: 'points', type: 'number', initial: 0, persist: true });
    expect(make('List')).toMatchObject({ name: 'items', type: 'list', initial: '[]' });
    expect(make('Choice')).toMatchObject({ type: 'enum', options: ['first', 'second'], initial: 'first' });
    // the menu closes after a pick, and a second of the same kind gets a free name
    expect(host.querySelector('.var-add-menu')).toBeNull();
    expect(make('Counter').name).toBe('count2');
    expect(vars()).toHaveLength(7);
  });

  it('Escape closes the menu without adding', () => {
    mount();
    act(() => btn(host, '+ Add variable').click());
    act(() => void host.querySelector('.var-add-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.var-add-menu')).toBeNull();
    expect(vars()).toHaveLength(0);
  });

  it('every kind is a plain variable the format already has, and its default name is a valid, free one', () => {
    for (const k of VARIABLE_KINDS) {
      const v = variableFor(k, [k.name]);
      expect(v.name).not.toBe(k.name);
      expect(['number', 'string', 'boolean', 'color', 'enum', 'list']).toContain(v.type);
    }
  });
});

describe('what uses a variable', () => {
  const rect = (bindings: Record<string, string>, name = 'Box') => ({ name, bindings });
  it('says used in N places, and lists them on a click', () => {
    mount([{ id: 'v1', name: 'points', type: 'number', initial: 0 }], [rect({ x: 'points * 2' }, 'Bar'), rect({ width: 'points + 1' }, 'Meter')]);
    const row = rows()[0];
    const used = row.querySelector<HTMLButtonElement>('.var-used button')!;
    expect(used.textContent).toBe('used in 2 places');
    expect(used.getAttribute('aria-expanded')).toBe('false');
    expect(row.querySelector('.var-places')).toBeNull();
    act(() => used.click());
    const items = [...row.querySelectorAll('.var-places li')].map((li) => li.textContent);
    expect(items).toHaveLength(2);
    expect(items.join(' ')).toContain('Bar');
    expect(items.join(' ')).toContain('Meter');
    expect(row.querySelector('.var-used button')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('a place in the list takes you to it', () => {
    mount([{ id: 'v1', name: 'points', type: 'number', initial: 0 }], [rect({ x: 'points' }, 'Bar')]);
    act(() => rows()[0].querySelector<HTMLButtonElement>('.var-used button')!.click());
    act(() => rows()[0].querySelector<HTMLButtonElement>('.var-places button')!.click());
    expect(s.get().selection).toHaveLength(1);
    expect(s.selectedNodes()[0].name).toBe('Bar');
  });

  it('says not used yet for one nothing reads, and it says "1 place" for one', () => {
    mount(
      [
        { id: 'v1', name: 'idle', type: 'number', initial: 0 },
        { id: 'v2', name: 'busy', type: 'number', initial: 0 },
      ],
      [rect({ x: 'busy' })],
    );
    expect(rows()[0].querySelector('.var-used')!.textContent).toBe('not used yet');
    expect(rows()[1].querySelector('.var-used')!.textContent).toBe('used in 1 place');
  });
});

describe('deleting a variable', () => {
  const del = (i: number) => act(() => void rows()[i].querySelector<HTMLButtonElement>('td:last-child button')!.click());
  it('one that nothing uses goes straight away, with an Undo', async () => {
    mount([{ id: 'v1', name: 'idle', type: 'number', initial: 0 }]);
    del(0);
    await settle();
    expect(confirm.asked).toHaveLength(0);
    expect(vars()).toHaveLength(0);
    expect(s.get().toast?.action?.kind).toBe('undo');
    s.runToastAction();
    expect(vars().map((v) => v.name)).toEqual(['idle']);
  });

  it('one that is used asks first, naming the places, and does nothing if you say no', async () => {
    mount([{ id: 'v1', name: 'points', type: 'number', initial: 0 }], [{ name: 'Bar', bindings: { x: 'points' } }]);
    confirm.answer = false;
    del(0);
    await settle();
    expect(confirm.asked).toHaveLength(1);
    expect(confirm.asked[0].title).toBe('Delete "points"?');
    expect(confirm.asked[0].message).toMatch(/used in 1 place/);
    expect(confirm.asked[0].message).toContain('Bar');
    expect(vars()).toHaveLength(1);
  });

  it('and deletes it when you say yes', async () => {
    mount([{ id: 'v1', name: 'points', type: 'number', initial: 0 }], [{ name: 'Bar', bindings: { x: 'points' } }]);
    del(0);
    await settle();
    expect(vars()).toHaveLength(0);
  });
});

describe('Remember, Save as user data and the formula', () => {
  const tick = (r: HTMLElement, label: string) => [...r.querySelectorAll<HTMLLabelElement>('label.check-field')].find((l) => l.textContent === label)?.querySelector('input');
  it('the Remember column is gone and its tick lives under Options with a sentence', () => {
    mount([{ id: 'v1', name: 'a', type: 'number', initial: 0 }]);
    expect([...host.querySelectorAll('.var-table th')].map((th) => th.textContent)).toEqual(['Name', 'Type', 'Value', '']);
    const opts = rows()[0].querySelector<HTMLDetailsElement>('details.var-options')!;
    expect(opts.querySelector('summary')!.textContent).toBe('Options');
    expect(opts.open).toBe(false);
    expect(tick(opts, 'Remember')).toBeTruthy();
    expect(tick(opts, 'Save as user data')).toBeTruthy();
    expect(opts.querySelectorAll('.hint').length).toBe(2);
    act(() => tick(opts, 'Remember')!.click());
    expect(vars()[0].persist).toBe(true);
  });

  it('Options is open for a variable that has any of them switched on', () => {
    mount([
      { id: 'v1', name: 'a', type: 'number', initial: 0, persist: true },
      { id: 'v2', name: 'b', type: 'number', initial: 0 },
    ]);
    expect(rows()[0].querySelector<HTMLDetailsElement>('details.var-options')!.open).toBe(true);
    expect(rows()[1].querySelector<HTMLDetailsElement>('details.var-options')!.open).toBe(false);
  });

  it('the formula box and its placeholder only show for Worked out', () => {
    mount([
      { id: 'v1', name: 'plain', type: 'string', initial: '' },
      { id: 'v2', name: 'grid', type: 'string', initial: '', formula: 'crossword(words, 10)' },
    ]);
    const formula = (r: HTMLElement) => r.querySelector('[placeholder^="Or work it out"]');
    expect(formula(rows()[0])).toBeNull();
    expect(formula(rows()[1])).toBeTruthy();
    expect(tick(rows()[0], 'Keep up to date')).toBeUndefined();
    // choosing Worked out on the plain one shows the box (and changes nothing in the file)
    const before = JSON.stringify(vars());
    const mode = rows()[0].querySelector<HTMLSelectElement>('select[title^="Starts as a value"], label[title^="Starts as a value"] select')!;
    act(() => {
      mode.value = 'worked';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(formula(rows()[0])).toBeTruthy();
    expect(JSON.stringify(vars())).toBe(before);
    // and back to a value drops a formula
    const back = rows()[1].querySelector<HTMLSelectElement>('select[title^="Starts as a value"], label[title^="Starts as a value"] select')!;
    expect(back.value).toBe('worked');
    act(() => {
      back.value = 'fixed';
      back.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(vars()[1].formula).toBeUndefined();
    expect(formula(rows()[1])).toBeNull();
  });

  it('the starting value stays editable when worked out, as the fallback', () => {
    mount([{ id: 'v1', name: 'grid', type: 'number', initial: 5, formula: '1 + 1' }]);
    expect(rows()[0].querySelector<HTMLInputElement>('.number-field input')!.value).toBe('5');
  });

  it('the type box keeps the technical names next to the plain ones', () => {
    mount([{ id: 'v1', name: 'a', type: 'boolean', initial: false }]);
    const opts = [...rows()[0].querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(['Number (counter, score)', 'True/false (switch)', 'Text', 'List']));
  });
});
