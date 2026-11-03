import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type RectNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { FillSection, PaintOrderSection, StrokeSection } from '../src/panels/PaintLayers';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let id: string;

function Harness({ type }: { type: 'fill' | 'stroke' | 'order' }) {
  const project = useEditor((st) => st.project);
  const node = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === id)!);
  if (type === 'order') return <PaintOrderSection nodes={[node]} />;
  return type === 'fill' ? <FillSection nodes={[node]} project={project} /> : <StrokeSection nodes={[node]} project={project} />;
}
const rect = () => s.get().project.artboards[0].children.find((c) => c.id === id) as RectNode;
const click = (title: string) => {
  const b = host.querySelector(`[title="${title}"]`) as HTMLElement | null;
  if (!b) throw new Error(`no button "${title}"`);
  act(() => b.click());
};
const has = (title: string) => !!host.querySelector(`[title="${title}"]`);
const colors = () => [rect().fill, ...(rect().fills ?? [])].map((p) => (p as { color: string } | null)?.color);

function mount(type: 'fill' | 'stroke' | 'order', props: Record<string, unknown> = {}) {
  const p = createProject('T');
  const r = createNode('rect', { name: 'Card', ...props });
  id = r.id;
  p.artboards[0].children.push(r);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness type={type} />));
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Fill list (inspector)', () => {
  beforeEach(() => mount('fill', { fill: { type: 'solid', color: '#111111' } }));

  it('adds a fill on top of the first, and undoes it', () => {
    expect(rect().fills).toBeUndefined();
    click('Add fill');
    expect(rect().fill).toMatchObject({ color: '#111111' });
    expect(rect().fills).toHaveLength(1);
    expect(has('Remove fill 1')).toBe(true);
    expect(has('Remove fill 2')).toBe(true);
    act(() => s.undo());
    expect(rect().fills).toBeUndefined();
    expect(has('Remove fill 2')).toBe(false);
    act(() => s.redo());
    expect(rect().fills).toHaveLength(1);
  });

  it('reorders: the first entry is always the shape\'s own fill', () => {
    click('Add fill');
    act(() => s.setProps([id], { 'fills.0.color': '#222222' }));
    expect(colors()).toEqual(['#111111', '#222222']);
    click('Move fill 2 down (behind)');
    expect(colors()).toEqual(['#222222', '#111111']);
    expect(rect().fills).toHaveLength(1);
    // the top one cannot go further up, the bottom one not further down
    expect((host.querySelector('[title="Move fill 2 up (in front)"]') as HTMLButtonElement).disabled).toBe(true);
    act(() => s.undo());
    expect(colors()).toEqual(['#111111', '#222222']);
  });

  it('hides a fill with its eye and brings it back', () => {
    click('Add fill');
    click('Hide fill 2');
    expect(rect().fills![0].visible).toBe(false);
    click('Show fill 2');
    expect(rect().fills![0].visible).toBeUndefined();
  });

  it('removes a layer, and the extra list goes with the last one', () => {
    click('Add fill');
    click('Add fill');
    expect(rect().fills).toHaveLength(2);
    click('Remove fill 2');
    expect(rect().fills).toHaveLength(1);
    click('Remove fill 2');
    expect(rect().fills).toBeUndefined();
    expect(rect().fill).toMatchObject({ color: '#111111' });
    // removing the base promotes the next one
    click('Add fill');
    act(() => s.setProps([id], { 'fills.0.color': '#333333' }));
    click('Remove fill 1');
    expect(rect().fill).toMatchObject({ color: '#333333' });
    expect(rect().fills).toBeUndefined();
  });

  it('shows the controls of each layer: opacity, blend, feather and offset', () => {
    click('Add fill');
    expect(host.querySelectorAll('.paint-item')).toHaveLength(2);
    const text = host.textContent ?? '';
    expect(text).toContain('Feather');
    expect(text).toContain('Blend');
  });
});

describe('Stroke list (inspector)', () => {
  beforeEach(() => mount('stroke', { stroke: { paint: { type: 'solid', color: '#111111' }, width: 2 } }));

  it('adds, reorders and removes strokes', () => {
    click('Add stroke');
    expect(rect().strokes).toHaveLength(1);
    act(() => s.setProps([id], { 'strokes.0.width': 8 }));
    click('Move stroke 2 down (behind)');
    expect(rect().stroke!.width).toBe(8);
    expect(rect().strokes![0].width).toBe(2);
    click('Remove stroke 2');
    expect(rect().strokes).toBeUndefined();
    act(() => s.undo());
    expect(rect().strokes).toHaveLength(1);
  });

  it('offers cap, join and align for each stroke', () => {
    const text = host.textContent ?? '';
    for (const word of ['Cap', 'Join', 'Align']) expect(text).toContain(word);
  });
});

describe('Paint order (inspector)', () => {
  const solid = (color: string) => ({ type: 'solid' as const, color });
  const order = () => (rect() as RectNode & { paintOrder?: string[] }).paintOrder;
  const rows = () => Array.from(host.querySelectorAll('.paint-order-row .paint-head-name')).map((e) => e.textContent);

  it('is not shown for a shape with only fills, or only a stroke', () => {
    mount('order', { fill: solid('#111111'), fills: [solid('#222222')] });
    expect(host.querySelector('.paint-order-row')).toBeNull();
    act(() => root.unmount());
    host.remove();
    mount('order', { fill: null, stroke: { paint: solid('#111111'), width: 2 } });
    expect(host.querySelector('.paint-order-row')).toBeNull();
  });

  it('lists every paint front-most first, and moves a stroke under the fill', () => {
    mount('order', { fill: solid('#111111'), stroke: { paint: solid('#222222'), width: 2 } });
    expect(rows()).toEqual(['Stroke (stroke)', 'Fill']);
    expect(order()).toBeUndefined();
    click('Move stroke down in the paint order (behind)');
    expect(order()).toEqual(['stroke', 'fill']);
    expect(rows()).toEqual(['Fill', 'Stroke (stroke)']);
    // The plain order is not stored
    click('Move stroke up in the paint order (in front)');
    expect(order()).toBeUndefined();
    act(() => s.undo());
    expect(order()).toEqual(['stroke', 'fill']);
  });

  it('puts a stroke between two fills, and swapping two fills swaps their places in the fill list', () => {
    mount('order', { fill: solid('#111111'), fills: [solid('#222222')], stroke: { paint: solid('#333333'), width: 2 } });
    expect(rows()).toEqual(['Stroke (stroke)', 'Fill 2', 'Fill 1']);
    click('Move stroke down in the paint order (behind)');
    expect(order()).toEqual(['fill', 'stroke', 'fill']);
    expect(colors()).toEqual(['#111111', '#222222']);
    // Fill 2 down past the stroke: both fills are under it again, so no order is stored
    click('Move fill 2 down in the paint order (behind)');
    expect(order()).toBeUndefined();
    expect(rect().stroke).not.toBeNull();
    // and past fill 1: it becomes the first fill
    click('Move fill 2 down in the paint order (behind)');
    expect(colors()).toEqual(['#222222', '#111111']);
  });

  it('keeps a custom order when paints are added or removed in the Fill and Stroke sections', () => {
    mount('order', { fill: solid('#111111'), stroke: { paint: solid('#222222'), width: 2 }, paintOrder: ['stroke', 'fill'] });
    act(() => root.unmount());
    host.remove();
    // A fill added next to a stroke that sits under the first fill goes just above that fill
    const p = createProject('T');
    const r = createNode('rect', { fill: solid('#111111'), stroke: { paint: solid('#222222'), width: 2 }, paintOrder: ['stroke', 'fill'] });
    id = r.id;
    p.artboards[0].children.push(r);
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness type="fill" />));
    click('Add fill');
    expect(order()).toEqual(['stroke', 'fill', 'fill']);
    click('Remove fill 1');
    expect(order()).toEqual(['stroke', 'fill']);
    act(() => root.render(<Harness type="stroke" />));
    click('Add stroke');
    expect(order()).toEqual(['stroke', 'fill', 'stroke']);
    click('Remove stroke 1');
    expect(order()).toBeUndefined();
  });
});
