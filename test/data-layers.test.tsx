import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, isTokenRef, tokenRef, type ChartNode, type Project, type ProgressNode, type SceneNode } from 'interactives-player';
import { ChartSection, ProgressSection, chartPreview } from '../src/panels/DataLayerInspectors';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { addToken, lookDefaults, removeToken, starterThemes } from '../src/lib/themes';
import { analyzeUsage } from '../src/lib/dependencies';
import { checkAccessibility } from '../src/lib/a11y/checks';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

function mountWith(node: SceneNode, prep: (p: Project) => void = () => undefined) {
  const p = createProject('T');
  p.artboards[0].children.push(node);
  prep(p);
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.select([node.id]);
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const draw = () => {
    const cur = s.artboard()!.children.find((n) => n.id === node.id)!;
    const proj = s.get().project;
    act(() => root!.render(cur.type === 'chart' ? <ChartSection nodes={[cur as ChartNode]} project={proj} ab={s.artboard()} /> : <ProgressSection nodes={[cur as ProgressNode]} project={proj} />));
  };
  draw();
  s.subscribe(draw);
  return { s, p, host, node: () => s.artboard()!.children.find((n) => n.id === node.id)! };
}
const change = (el: HTMLInputElement | HTMLSelectElement, v: string) =>
  act(() => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    if (el instanceof HTMLInputElement) el.dispatchEvent(new Event('change', { bubbles: true }));
  });
//A number field takes what was typed when it loses focus
const typeNumber = (el: HTMLInputElement, v: string) => {
  act(() => el.focus());
  change(el, v);
  act(() => el.blur());
};
const field = (host: HTMLElement, label: string) => [...host.querySelectorAll('.field')].find((f) => f.querySelector('.field-label')?.textContent === label);
const select = (host: HTMLElement, label: string) => field(host, label)!.querySelector('select')!;
const input = (host: HTMLElement, label: string) => field(host, label)!.querySelector('input')!;

describe('progress layer inspector', () => {
  it('edits value, max, direction and the spoken role on the layer', () => {
    const { host, node } = mountWith(createNode('progress', { id: 'p', name: 'Score' }));
    change(select(host, 'Direction'), 'vertical');
    expect((node() as ProgressNode).orientation).toBe('vertical');
    change(select(host, 'Tells screen readers'), 'meter');
    expect((node() as ProgressNode).semantics).toBe('meter');
    change(select(host, 'Tells screen readers'), 'none');
    expect((node() as ProgressNode).semantics).toBe('none');
    expect(field(host, 'Spoken value')).toBeUndefined();
  });

  it('writes the spoken value template, and a blank one is left off', () => {
    const { host, node } = mountWith(createNode('progress', { id: 'p', name: 'Score' }));
    const box = field(host, 'Spoken value')!.querySelector('input,textarea') as HTMLInputElement;
    change(box, 'Step {step} of 5');
    expect((node() as ProgressNode).valueText).toBe('Step {step} of 5');
    change(box, '');
    expect((node() as ProgressNode).valueText).toBeUndefined();
  });

  it('has its own value and max in the number fields', () => {
    const { host, node } = mountWith(createNode('progress', { id: 'p', value: 10 }));
    typeNumber(input(host, 'Value'), '75');
    expect((node() as ProgressNode).value).toBe(75);
    typeNumber(input(host, 'Max'), '200');
    expect((node() as ProgressNode).max).toBe(200);
  });

  it('can be keyed on the timeline: value is its own animatable setting', () => {
    const { s } = mountWith(createNode('progress', { id: 'p', value: 30 }));
    s.set({ timelineShown: true });
    s.keyCurrent('p', 'value');
    const tl = s.artboard()!.timelines[0];
    expect(tl.tracks.map((t) => [t.nodeId, t.prop, t.keys[0].value])).toEqual([['p', 'value', 30]]);
  });

  it('does not make a key from typing in an input layer\'s Value while recording', () => {
    const inp = createNode('input', { id: 'i' });
    const p = createProject('T');
    p.artboards[0].children.push(inp);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select(['i']);
    s.set({ timelineShown: true, recording: true });
    s.addTimeline();
    s.setProps(['i'], { value: 'hello' });
    expect(s.artboard()!.timelines[0].tracks).toEqual([]);
    expect((s.artboard()!.children[0] as { value: string }).value).toBe('hello');
  });
});

describe('chart layer inspector', () => {
  const sales = (p: Project) => p.variables.push({ id: 'v', name: 'sales', type: 'list', initial: JSON.stringify([{ label: 'Mon', value: 4 }, { label: 'Tue', value: 8 }]) } as never);

  it('previews what the data expression gives', () => {
    const { host } = mountWith(createNode('chart', { id: 'c', data: 'sales' }), sales);
    const rows = [...host.querySelectorAll('.chart-preview tbody tr')].map((r) => r.textContent);
    expect(rows).toEqual(['Mon4', 'Tue8']);
    expect(host.querySelector('.chart-preview caption')!.textContent).toBe('2 items');
  });

  it('says what is wrong with the data instead of a table', () => {
    const { host } = mountWith(createNode('chart', { id: 'c', data: 'sales +' }), sales);
    expect(host.querySelector('.chart-preview .hint')!.textContent).toMatch(/problem/);
    const none = mountWith(createNode('chart', { id: 'c2', data: '[]' }));
    expect(none.host.querySelector('.chart-preview .hint')!.textContent).toMatch(/no items/);
  });

  it('previews pairs and numbers, and counts past what it lists', () => {
    const p = createProject('T');
    expect(chartPreview(p, undefined, { data: '[3, 4]', labelKey: '', valueKey: '' }).items).toEqual([{ label: '1', value: 3 }, { label: '2', value: 4 }]);
    const big = chartPreview(p, undefined, { data: '[1,2,3,4,5,6,7,8,9,10,11]', labelKey: '', valueKey: '' });
    expect(big.items).toHaveLength(8);
    expect(big.total).toBe(11);
    expect(chartPreview(p, undefined, { data: '', labelKey: '', valueKey: '' }).problem).toMatch(/expression/);
  });

  it('names the field that hides an item, and the preview says which items are hidden', () => {
    const { host, node } = mountWith(createNode('chart', { id: 'c', data: '[{label: "A", value: 3}, {label: "B", secret: true}]' } as Partial<ChartNode>));
    const rows = () => [...host.querySelectorAll('.chart-preview tbody tr')].map((r) => r.textContent);
    //nothing is hidden until the key says so
    expect(rows()[1]).toBe('B0');
    change(input(host, 'Hidden key'), 'secret');
    expect((node() as ChartNode).hiddenKey).toBe('secret');
    expect(rows()[1]).toBe('Bhidden');
    change(input(host, 'Hidden key'), '');
    expect((node() as ChartNode).hiddenKey).toBeUndefined();
    const p = createProject('T');
    expect(chartPreview(p, undefined, { data: '[{label: "A", hidden: true}]', labelKey: '', valueKey: '', hiddenKey: '' }).items[0].hidden).toBe(true);
  });

  it('changes kind, switches options and edits the colour list', () => {
    const { host, node } = mountWith(createNode('chart', { id: 'c', data: 'sales' }), sales);
    change(select(host, 'Kind'), 'donut');
    expect((node() as ChartNode).kind).toBe('donut');
    //the donut has a hole and no axis
    expect(field(host, 'Hole')).toBeDefined();
    expect(field(host, 'Axis min')).toBeUndefined();
    change(select(host, 'Kind'), 'line');
    expect(field(host, 'Axis min')).toBeDefined();
    const before = (node() as ChartNode).colors.length;
    act(() => void [...host.querySelectorAll('button')].find((b) => b.textContent === '+ Add colour')!.click());
    expect((node() as ChartNode).colors).toHaveLength(before + 1);
    act(() => void (host.querySelector('button[title="Remove this colour"]') as HTMLButtonElement).click());
    expect((node() as ChartNode).colors).toHaveLength(before);
    const box = [...host.querySelectorAll('.check-field')].find((l) => l.textContent === 'Legend')!.querySelector('input')!;
    act(() => void box.click());
    expect((node() as ChartNode).legend).toBe(true);
  });

  it('fixes the ends of the axis, or leaves them to fit the data', () => {
    const { host, node } = mountWith(createNode('chart', { id: 'c' }));
    change(input(host, 'Axis max'), '50');
    expect((node() as ChartNode).max).toBe(50);
    change(input(host, 'Axis max'), '');
    expect((node() as ChartNode).max).toBeNull();
    change(input(host, 'Axis max'), 'lots');
    expect((node() as ChartNode).max).toBeNull();
  });
});

describe('in a project', () => {
  it('a new layer follows the project\'s tokens', () => {
    const p = createProject('T');
    p.themes = starterThemes();
    const bar = lookDefaults(p, 'progress') as { fill: { color: string }; barFill: { color: string } };
    expect(isTokenRef(bar.barFill.color)).toBe(true);
    expect(isTokenRef(bar.fill.color)).toBe(true);
    const chart = lookDefaults(p, 'chart') as { colors: string[]; color: string };
    expect(chart.colors.length).toBe(6);
    expect(chart.colors.every(isTokenRef)).toBe(true);
    expect(isTokenRef(chart.color)).toBe(true);
    //no tokens, the plain defaults
    expect(lookDefaults(createProject('T'), 'chart')).toEqual({});
  });

  it('removing a token leaves the bar and chart with its colour', () => {
    const p = createProject('T');
    const tok = addToken(p, 'color/series', '#336699');
    const bar = createNode('progress', { id: 'p', barFill: { type: 'solid', color: tokenRef(tok.id) } });
    const chart = createNode('chart', { id: 'c', colors: [tokenRef(tok.id), '#ffffff'] });
    p.artboards[0].children.push(bar, chart);
    removeToken(p, tok.id);
    expect(((p.artboards[0].children[0] as ProgressNode).barFill as { color: string }).color).toBe('#336699');
    expect((p.artboards[0].children[1] as ChartNode).colors).toEqual(['#336699', '#ffffff']);
  });

  it('a variable only a chart reads counts as used', () => {
    const p = createProject('T');
    p.variables.push({ id: 'v', name: 'sales', type: 'list', initial: '[]' } as never);
    p.variables.push({ id: 'w', name: 'unused', type: 'list', initial: '[]' } as never);
    p.variables.push({ id: 'x', name: 'step', type: 'number', initial: 0 } as never);
    p.variables.push({ id: 'y', name: 'unit', type: 'text', initial: 'kg' } as never);
    p.artboards[0].children.push(createNode('chart', { data: 'sales', suffix: ' {unit}' }), createNode('progress', { valueText: 'Step {step} of 5' }));
    const r = analyzeUsage(p);
    expect(r.variables.find((v) => v.name === 'unit')!.unused).toBe(false);
    const unused = (n: string) => r.variables.find((v) => v.name === n)!.unused;
    expect(unused('sales')).toBe(false);
    expect(unused('step')).toBe(false);
    expect(unused('unused')).toBe(true);
  });

  it('the accessibility checker asks for a name for a chart and a progress bar', () => {
    const p = createProject('T');
    p.settings.title = 'T';
    p.artboards[0].children.push(createNode('chart', { id: 'c', name: 'Sales' }), createNode('progress', { id: 'p', name: 'Bar' }), createNode('progress', { id: 'q', name: 'Quiet', semantics: 'none' }), createNode('chart', { id: 'd', name: 'Named', ariaLabel: 'Sales by month' }));
    const found = checkAccessibility(p).findings.filter((f) => f.check === 'description');
    expect(found.map((f) => f.title).sort()).toEqual(['Chart has no description', 'Progress bar has no name']);
  });

  it('the store adds and undoes the layers like any other', () => {
    const p = createProject('T');
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.addNodes([createNode('progress', { id: 'p' }), createNode('chart', { id: 'c' })]);
    expect(s.artboard()!.children.map((n) => n.type)).toEqual(['progress', 'chart']);
    s.setProps(['p'], { value: 90 });
    expect((s.artboard()!.children[0] as ProgressNode).value).toBe(90);
    s.undo();
    expect((s.artboard()!.children[0] as ProgressNode).value).toBe(40);
  });
});
