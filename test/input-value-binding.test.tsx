import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type InputNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { bindableProps } from '../src/panels/BindingsSection';
import { addQuestion } from '../src/lib/question-kit';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(input: Partial<InputNode> = {}) {
  const p = createProject('T');
  p.variables.push({ id: 'v1', name: 'answer', type: 'string', initial: '' });
  const n = createNode('input', { name: 'Box', ...input } as never) as InputNode;
  p.artboards[0].children.push(n);
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.select([n.id]);
  act(() => root.render(<Inspector />));
  return { s, id: n.id, node: () => s.get().project.artboards[0].children.find((c) => c.id === n.id) as InputNode };
}
const labels = () => [...host.querySelectorAll('.inspector label, .inspector .prop-label, .inspector .field-label')].map((l) => l.textContent);
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());

describe('input value binding in the inspector', () => {
  it('has no separate Variable picker: an unbound input has a Value field and a Bind to a variable shortcut', () => {
    mount();
    const text = host.textContent ?? '';
    expect(text).not.toMatch(/Variable\s*Not bound/);
    expect(host.querySelector('.inspector .add-binding')?.textContent).toMatch(/Bind to a variable/);
    expect(labels().join('|')).toMatch(/Value/);
  });

  it('the shortcut adds the standard binding on value in Both mode', () => {
    const { node } = mount();
    click(host.querySelector('.inspector .search-picker.add-binding:not(.icon-picker)'));
    const options = [...document.querySelectorAll('.search-pop-list li')];
    expect(options.map((o) => o.textContent)).toEqual(['answerstring', '+ New variable…']);
    click(options[0]);
    expect(node().bindings).toEqual({ value: 'answer' });
    expect(node().bindingModes).toEqual({ value: 'both' });
    expect('variableId' in node()).toBe(false);
    // the Value field gives way to a line that says so, and the Data bindings section lists it
    expect(host.textContent).toMatch(/Value is bound ⇄ Both answer/);
  });

  it('Unbind takes it away again, and an Out binding keeps the Value field', () => {
    const { node } = mount({ bindings: { value: 'answer', opacity: 'answer == "" ? 1 : 0.5' }, bindingModes: { value: 'both' } });
    click([...host.querySelectorAll('.inspector button')].find((b) => b.textContent === 'Unbind'));
    expect(node().bindings).toEqual({ opacity: 'answer == "" ? 1 : 0.5' });
    expect(node().bindingModes).toBeUndefined();
    const out = mount({ bindings: { value: 'answer' }, bindingModes: { value: 'out' } });
    expect(host.textContent).toMatch(/Value is bound Out →/);
    expect(out.node().bindingModes).toEqual({ value: 'out' });
  });

  it('offers value as a bindable property, typed for the kind of input', () => {
    const p = createProject('T');
    const box = createNode('input', { inputType: 'checkbox' } as never);
    const num = createNode('input', { inputType: 'range' } as never);
    expect(bindableProps(box, p).find((x) => x.prop === 'value')?.kind).toBe('boolean');
    expect(bindableProps(num, p).find((x) => x.prop === 'value')?.kind).toBe('number');
    expect(bindableProps(createNode('input', {} as never), p).find((x) => x.prop === 'value')?.kind).toBe('string');
  });
});

describe('the question kit ties its blank boxes to their variables the same way', () => {
  it('a fill-in-the-blank question has Both bindings on the boxes, one variable each', () => {
    const p = createProject('T');
    const id = addQuestion(p, p.artboards[0].id, 'blank');
    expect(id).toBeTruthy();
    const inputs: InputNode[] = [];
    const walk = (nodes: unknown[]) => {
      for (const n of nodes as { type: string; children?: unknown[] }[]) {
        if (n.type === 'input') inputs.push(n as unknown as InputNode);
        if (n.children) walk(n.children);
      }
    };
    walk(p.artboards[0].children);
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) {
      expect(i.bindingModes?.value).toBe('both');
      expect(p.variables.some((v) => v.name === i.bindings?.value)).toBe(true);
      expect('variableId' in i).toBe(false);
    }
  });
});
