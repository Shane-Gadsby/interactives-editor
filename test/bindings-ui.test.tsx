import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { BindingsSection, bindableProps } from '../src/panels/BindingsSection';
import { Section } from '../src/components/ui';

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

function setup(node: SceneNode, vars: Project['variables']) {
  const p = createProject('T');
  p.variables = vars;
  let current = node;
  const set = vi.fn((patch: Record<string, unknown>) => {
    current = { ...current, ...patch } as SceneNode;
    act(() => root!.render(<BindingsSection node={current} project={p} set={set} />));
  });
  mount(<BindingsSection node={current} project={p} set={set} />);
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

  it('shows a formula as a formula, and works a look-up through so a missing line is plain to see', () => {
    const node = createNode('rect', { id: 'r1', bindings: { opacity: 'value2 * 1' }, converters: { opacity: [{ type: 'map', map: { true: 'Open', false: 'Closed' } }] } });
    setup(node, [{ id: 'v', name: 'value2', type: 'number', initial: 1 }]);
    expect(document.querySelector('.binding-source .seg-btn.on')?.textContent).toBe('Formula');
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
