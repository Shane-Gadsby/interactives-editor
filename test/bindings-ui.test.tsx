import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { BindingsSection, bindableProps } from '../src/panels/BindingsSection';
import { Section } from '../src/components/ui';
import { ExprLocals } from '../src/components/ExprField';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});
function mount(el: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());
const type = (input: HTMLInputElement, text: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

function setup(node: SceneNode, vars: Project['variables'], repeat: { locals?: string[]; values?: Record<string, unknown> } = {}) {
  const p = createProject('T');
  p.variables = vars;
  let current = node;
  const view = () => (
    <ExprLocals.Provider value={repeat}>
      <BindingsSection node={current} project={p} set={set} />
    </ExprLocals.Provider>
  );
  const set = vi.fn((patch: Record<string, unknown>) => {
    current = { ...current, ...patch } as SceneNode;
    act(() => root!.render(view()));
  });
  mount(view());
  return { set, get: () => current };
}

describe('Data bindings section', () => {
  it('adds a binding from a searchable property list, then sets it from a variable picked from a list', () => {
    const { get } = setup(createNode('rect', { id: 'r1' }), [{ id: 'v1', name: 'score', type: 'number', initial: 3 }, { id: 'v2', name: 'open', type: 'boolean', initial: true }]);
    // the section starts folded when nothing is bound; its header + opens it and the list
    click(document.querySelector('.search-picker.icon-picker'));
    const search = document.querySelector<HTMLInputElement>('.search-pop-input')!;
    expect(document.activeElement).toBe(search);
    type(search, 'opa');
    const items = [...document.querySelectorAll('.search-pop-list li')].map((li) => li.textContent);
    expect(items[0]).toMatch(/^Opacity/);
    act(() => void search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(get().bindings).toEqual({ opacity: '' });
    // a new binding starts on Variable, asking for one
    expect(document.querySelector('.binding-trace')?.textContent).toMatch(/Pick a variable/);
    click([...document.querySelectorAll('.binding-source .search-picker')][0]);
    const opts = [...document.querySelectorAll('.search-pop-list li')];
    expect(opts.map((o) => o.textContent)).toEqual(['scorenumber', 'openboolean', '+ New variable…']);
    click(opts[0]);
    expect(get().bindings).toEqual({ opacity: 'score' });
    expect(document.querySelector('.binding-trace')?.textContent).toBe('At the start: score is 3 → Opacity is set to 3');
  });

  it('shows a binding that is only a look-up as the By value table, and works it through so a missing line is plain to see', () => {
    const node = createNode('rect', { id: 'r1', bindings: { opacity: 'value2 * 1' }, converters: { opacity: [{ type: 'map', map: { true: 'Open', false: 'Closed' } }] } });
    setup(node, [{ id: 'v', name: 'value2', type: 'number', initial: 1 }]);
    expect(document.querySelector('.binding-source .seg-btn.on')?.textContent).toBe('By value');
    expect(document.querySelectorAll('.by-value-row:not(.otherwise)').length).toBe(2);
    expect(document.querySelector('.binding-trace')?.textContent).toMatch(/Look up: no line for 1, so it stays 1/);
  });

  it('switches a binding to out or both, which ties it to a variable (a formula is dropped)', () => {
    const { get } = setup(createNode('rect', { id: 'r1', bindings: { x: 'a', opacity: 'a * 2' } }), [{ id: 'a', name: 'a', type: 'number', initial: 1 }]);
    const dir = (prop: string, m: string) => [...document.querySelectorAll<HTMLButtonElement>('.binding')].find((b) => b.querySelector('.mono')?.textContent === prop)!.querySelector<HTMLButtonElement>(`.binding-dir [role="radio"]:nth-child(${['in', 'out', 'both'].indexOf(m) + 1})`)!;
    click(dir('x', 'out'));
    expect(get().bindingModes).toEqual({ x: 'out' });
    expect(get().bindings).toEqual({ x: 'a', opacity: 'a * 2' });
    expect(document.querySelector('.binding-trace')?.textContent).toMatch(/Whenever X changes, a is set to it/);
    click(dir('opacity', 'both'));
    expect(get().bindingModes).toEqual({ x: 'out', opacity: 'both' });
    expect(get().bindings!.opacity).toBe('');
    click(dir('x', 'in'));
    expect(get().bindingModes).toEqual({ opacity: 'both' });
  });

  it("offers every plain setting of a layer, and a video's playback, with read-only ones out only", () => {
    const v = createNode('video', { id: 'v1', name: 'Clip' });
    const project = createProject('P');
    project.artboards[0].children.push(v);
    const props = bindableProps(v, project).map((p) => p.prop);
    expect(props).toEqual(expect.arrayContaining(['x', 'opacity', 'autoplay', 'loop', 'src', 'media.time', 'media.playing', 'media.duration']));
    expect(props).not.toContain('id');
    expect(bindableProps(v, project).find((p) => p.prop === 'media.duration')?.readOnly).toBe(true);
  });

  it('By value: switching a choice variable to a table gives it a row per option, and editing a row writes a Look up', () => {
    const { get } = setup(createNode('rect', { id: 'r1', fill: { type: 'solid', color: '#123456' }, bindings: { 'fill.color': 'mood' } }), [{ id: 'm', name: 'mood', type: 'enum', initial: 'happy', options: ['happy', 'sad'] }]);
    const by = [...document.querySelectorAll<HTMLButtonElement>('.binding-source .seg-btn')].find((b) => b.textContent === 'By value')!;
    click(by);
    expect(get().bindings).toEqual({ 'fill.color': 'mood' });
    expect(get().converters).toEqual({ 'fill.color': [{ type: 'map', map: { happy: '#123456', sad: '#123456' } }] });
    expect(document.querySelectorAll('.by-value-row:not(.otherwise)').length).toBe(2);
    // the result is the property's own widget: a colour field
    expect(document.querySelectorAll('.by-value-row .color-field').length).toBe(2);
    // the otherwise row starts as keep the value, and Choose one gives it a colour
    expect(document.querySelector('.by-value-row.otherwise')?.textContent).toMatch(/keeps the value/);
    click([...document.querySelectorAll<HTMLButtonElement>('.by-value-row.otherwise .link-btn')][0]);
    expect((get().converters!['fill.color'][0] as { fallback?: string }).fallback).toBe('#123456');
    // and it comes back as a table when the section is opened again
    expect([...document.querySelectorAll('.binding-source .seg-btn.on')].map((b) => b.textContent)).toEqual(['By value']);
  });

  it('By value: inside a repeater the item fields are offered, and picking one keeps the table', () => {
    const { get } = setup(createNode('rect', { id: 'r1', bindings: { opacity: '' } }), [], { locals: ['item', 'index'], values: { item: { state: 'wrong', selected: false }, index: 0 } });
    click([...document.querySelectorAll<HTMLButtonElement>('.binding-source .seg-btn')].find((b) => b.textContent === 'By value'));
    click(document.querySelector('.by-value-when .search-picker'));
    const opts = [...document.querySelectorAll('.search-pop-list li')].map((o) => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(['item.statethis item', 'item.selectedthis item', 'indexits place in the list', 'Write a formula…']));
    click([...document.querySelectorAll('.search-pop-list li')].find((o) => o.textContent?.startsWith('item.state')));
    expect(get().bindings).toEqual({ opacity: 'item.state' });
    // free text: Add a value makes a row to type the value into, and the result starts as the property's value
    click(document.querySelector('.by-value-add'));
    expect(get().converters).toEqual({ opacity: [{ type: 'map', map: { 'new value': 1 } }] });
    const key = document.querySelector<HTMLInputElement>('.by-value-if input')!;
    act(() => void key.focus());
    type(key, 'wrong');
    act(() => void key.blur());
    expect(get().converters).toEqual({ opacity: [{ type: 'map', map: { wrong: 1 } }] });
  });

  it('By value: leaving the table for Variable takes the Look up away', () => {
    const { get } = setup(createNode('rect', { id: 'r1', bindings: { opacity: 'score' }, converters: { opacity: [{ type: 'map', map: { 1: 0.5 } }] } }), [{ id: 's', name: 'score', type: 'number', initial: 1 }]);
    click([...document.querySelectorAll<HTMLButtonElement>('.binding-source .seg-btn')].find((b) => b.textContent === 'Variable'));
    expect(get().bindings).toEqual({ opacity: 'score' });
    expect(get().converters).toBeUndefined();
  });

  it('puts a rule between bindings, and removes one with its bin', () => {
    const { get } = setup(createNode('rect', { id: 'r1', bindings: { opacity: 'a', x: 'b' } }), [{ id: 'a', name: 'a', type: 'number', initial: 1 }, { id: 'b', name: 'b', type: 'number', initial: 2 }]);
    expect(document.querySelectorAll('.binding').length).toBe(2);
    expect(document.querySelectorAll('hr.item-sep').length).toBe(2);
    click(document.querySelector('[aria-label="Remove the Opacity binding"]'));
    expect(get().bindings).toEqual({ x: 'b' });
  });
});

describe('collapsible sections', () => {
  it('show a chevron and their state, and fold when the title is clicked', () => {
    mount(
      <Section title="Things">
        <p>inside</p>
      </Section>,
    );
    const btn = document.querySelector<HTMLButtonElement>('.section-title')!;
    expect(btn.querySelector('.section-chev')).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    click(document.querySelector('.section-title-row'));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.section')?.classList.contains('closed')).toBe(true);
  });
});
