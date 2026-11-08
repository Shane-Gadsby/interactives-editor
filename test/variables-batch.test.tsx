//The editor side of live variables, user data variables, Reset variables and the new Set variable ops:
//the Variables tab ticks, the graph's forms, the Usage checker and the canvas preview.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project, type Variable } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { VariablesPanel } from '../src/panels/ScriptsVariables';
import { analyzeUsage } from '../src/lib/dependencies';
import { previewScope } from '../src/lib/data';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const vars = (): Variable[] => [
  { id: 'va', name: 'a', type: 'number', initial: 1 },
  { id: 'vb', name: 'b', type: 'number', initial: 0, formula: 'a * 2', live: true },
  { id: 'vc', name: 'c', type: 'number', initial: 0, formula: 'a + 1' },
];

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

function mountPanel(p: Project) {
  const s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<VariablesPanel />));
  return s;
}
const row = (i: number) => host!.querySelectorAll('.var-table tbody tr')[i] as HTMLElement;
const tick = (r: HTMLElement, label: string) => Array.from(r.querySelectorAll<HTMLLabelElement>('label.check-field')).find((l) => l.textContent === label)?.querySelector('input') as HTMLInputElement | undefined;

describe('Variables tab', () => {
  it('offers Keep up to date only with a formula, and ticking it makes the variable live', () => {
    const p = createProject('T');
    p.variables.push(...vars());
    const s = mountPanel(p);
    expect(tick(row(0), 'Keep up to date')).toBeUndefined();
    expect(tick(row(1), 'Keep up to date')!.checked).toBe(true);
    expect(tick(row(2), 'Keep up to date')!.checked).toBe(false);
    act(() => tick(row(2), 'Keep up to date')!.click());
    expect(s.get().project.variables[2].live).toBe(true);
    act(() => tick(row(1), 'Keep up to date')!.click());
    expect(s.get().project.variables[1].live).toBeFalsy();
  });

  it('Save as user data is a tick on every variable, and not for a live one', () => {
    const p = createProject('T');
    p.variables.push(...vars());
    const s = mountPanel(p);
    expect(tick(row(1), 'Save as user data')!.disabled).toBe(true);
    act(() => tick(row(0), 'Save as user data')!.click());
    expect(s.get().project.variables[0].userData).toBe(true);
    act(() => tick(row(0), 'Save as user data')!.click());
    expect(s.get().project.variables[0].userData).toBeFalsy();
    //making a variable live drops its user data tick
    act(() => tick(row(2), 'Save as user data')!.click());
    expect(s.get().project.variables[2].userData).toBe(true);
    act(() => tick(row(2), 'Keep up to date')!.click());
    expect(s.get().project.variables[2]).toMatchObject({ live: true });
    expect(s.get().project.variables[2].userData).toBeFalsy();
  });

  it('clearing the formula takes the live tick with it', () => {
    const p = createProject('T');
    p.variables.push(...vars());
    const s = mountPanel(p);
    act(() => s.update((d) => void Object.assign(d.variables[1], { formula: undefined, live: undefined })));
    expect(tick(row(1), 'Keep up to date')).toBeUndefined();
  });

  it('warns about a circle and about a node that tries to set a live variable', () => {
    const p = createProject('T');
    p.variables.push(
      { id: 'vp', name: 'p', type: 'number', initial: 0, formula: 'q', live: true },
      { id: 'vq', name: 'q', type: 'number', initial: 0, formula: 'p', live: true },
      { id: 'vl', name: 'ok', type: 'number', initial: 0, formula: '1', live: true },
    );
    p.artboards[0].logic.nodes.push({ id: 'n', kind: 'action.setVariable', x: 0, y: 0, params: { variable: 'vl', op: 'set', value: '3' } });
    mountPanel(p);
    expect(row(0).textContent).toContain('stays at its starting value');
    expect(row(1).textContent).toContain('stays at its starting value');
    expect(row(2).textContent).not.toContain('stays at its starting value');
    expect(row(2).textContent).toContain('try to set this');
  });
});

describe('Usage checker', () => {
  it('lists nodes that write a live variable and live variables in a circle among the broken things', () => {
    const p = createProject('T');
    p.variables.push(...vars(), { id: 'vp', name: 'p', type: 'number', initial: 0, formula: 'p + 1', live: true });
    p.artboards[0].logic.nodes.push(
      { id: 's', kind: 'action.setVariable', x: 0, y: 0, params: { variable: 'vb', op: 'set', value: '1' } },
      { id: 'r', kind: 'action.resetVariables', x: 0, y: 0, params: { variables: ['va', 'vb'] } },
      { id: 'ok', kind: 'action.setVariable', x: 0, y: 0, params: { variable: 'va', op: 'toggle' } },
    );
    const report = analyzeUsage(p);
    const bad = report.missing.filter((m) => m.problem);
    expect(bad.map((m) => [m.by.type, m.ref, m.how]).sort()).toEqual([
      ['logic', 'b', 'Change a value or counter'],
      ['logic', 'b', 'Put values back to the start'],
      ['project', 'p', 'live formula'],
    ]);
    //Reset variables counts as a use of the variables it lists
    expect(report.variables.find((v) => v.id === 'va')!.usedBy.map((u) => u.how)).toContain('Put values back to the start');
  });
});

describe('canvas preview', () => {
  it('works live variables out from all the variables, whatever order they are in', () => {
    const p = createProject('T');
    p.variables.push(
      { id: 'vb', name: 'b', type: 'number', initial: 0, formula: 'a * 2 + c', live: true },
      { id: 'va', name: 'a', type: 'number', initial: 3 },
      { id: 'vc', name: 'c', type: 'number', initial: 0, formula: 'a + 1', live: true },
    );
    const scope = previewScope(p);
    expect(scope.c).toBe(4);
    expect(scope.b).toBe(10);
  });

  it('gives userData to formulas', () => {
    const p = createProject('T');
    p.variables.push({ id: 'vr', name: 'ready', type: 'boolean', initial: false, formula: 'userData.loaded', live: true });
    expect(previewScope(p).ready).toBe(false);
  });
});

describe('graph forms', () => {
  async function mountGraph(p: Project) {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    return s;
  }
  const select = async (id: string) => {
    const el = host!.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    const opt = { bubbles: true, cancelable: true, button: 0, clientX: 10 };
    act(() => void el.dispatchEvent(new MouseEvent('pointerdown', opt)));
    act(() => void el.dispatchEvent(new MouseEvent('pointerup', opt)));
    act(() => void el.dispatchEvent(new MouseEvent('click', opt)));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
  };
  const form = () => host!.querySelector('.logic-settings')!;
  const button = (label: string) => Array.from(form().querySelectorAll('button')).find((b) => b.textContent === label)!;

  it('Reset variables picks several variables, with All and None, and leaves live ones out', async () => {
    const p = createProject('T');
    p.variables.push(...vars());
    p.artboards[0].logic.nodes.push({ id: 'r', kind: 'action.resetVariables', x: 40, y: 40, params: { variables: [] } });
    const s = await mountGraph(p);
    await select('r');
    const boxes = () => Array.from(form().querySelectorAll<HTMLInputElement>('.param-variables input[type=checkbox]'));
    expect(boxes()).toHaveLength(3);
    expect(boxes()[1].disabled).toBe(true);
    act(() => button('All').click());
    expect(s.artboard()!.logic.nodes[0].params.variables).toEqual(['va', 'vc']);
    act(() => button('None').click());
    expect(s.artboard()!.logic.nodes[0].params.variables).toEqual([]);
    act(() => boxes()[2].click());
    expect(s.artboard()!.logic.nodes[0].params.variables).toEqual(['vc']);
  });

  it('Set variable shows the list ops and their fields, and warns when the variable is live', async () => {
    const p = createProject('T');
    p.variables.push(...vars(), { id: 'vl', name: 'picked', type: 'list', initial: '[]' });
    p.artboards[0].logic.nodes.push({ id: 's', kind: 'action.setVariable', x: 40, y: 40, params: { variable: 'vl', op: 'set', value: '[]' } });
    const s = await mountGraph(p);
    await select('s');
    expect(form().textContent).not.toContain('Item position');
    const op = () => Array.from(form().querySelectorAll('select')).find((x) => Array.from(x.options).some((o) => o.value === 'setItem'))!;
    const choose = (value: string) =>
      act(() => {
        const sel = op();
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    expect(Array.from(op().options).map((o) => o.value)).toEqual(expect.arrayContaining(['reset', 'toggleItem', 'removeValue', 'setItem']));
    choose('setItem');
    expect(form().textContent).toContain('Item position');
    expect(form().textContent).toContain('Field');
    choose('toggleItem');
    expect(form().textContent).not.toContain('Item position');
    expect(form().textContent).not.toContain('is a live variable');
    act(() => s.update((d) => void (d.artboards[0].logic.nodes[0].params.variable = 'vb')));
    expect(form().textContent).toContain('b is a live variable');
    choose('reset');
    expect(s.artboard()!.logic.nodes[0].params.op).toBe('reset');
  });

  it('Wait takes an expression', async () => {
    const p = createProject('T');
    p.variables.push(...vars());
    p.artboards[0].logic.nodes.push({ id: 'w', kind: 'action.delay', x: 40, y: 40, params: { ms: 'a <= 4 ? 4000 : 8000' } });
    await mountGraph(p);
    await select('w');
    expect(form().textContent).toContain('worked out when the wait starts');
    expect(host!.querySelector('.react-flow__node[data-id="w"]')!.textContent).toContain('a <= 4 ? 4000 : 8000');
  });
});
