import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, defaultAutoLayout, type FrameNode, type GridLayout, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { AutoLayoutSection } from '../src/panels/Inspector';
import { LayoutItemSection } from '../src/panels/LayoutItemSection';
import { parentLayoutKind, patchLayoutItem } from '../src/lib/layout-item';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

const GRID: GridLayout = {
  columns: [
    { type: 'px', value: 100 },
    { type: 'px', value: 100 },
  ],
  rows: [],
};

/** A frame with auto layout holding three rects (and a text), the layers selected by `pick` shown in the Layout item section. */
function mount(layout: FrameNode['layout'], pick: (kids: SceneNode[]) => SceneNode[] = (k) => [k[0]], extra: SceneNode[] = []) {
  const p = createProject('T');
  const frame = createNode('frame', { name: 'List', width: 400, height: 300, layout }) as FrameNode;
  const kids = [1, 2, 3].map((i) => createNode('rect', { name: `R${i}`, width: 50, height: 40 }));
  frame.children.push(...kids, ...extra);
  p.artboards[0].children.push(frame);
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  const ids = pick([...kids, ...extra]).map((n) => n.id);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness ids={ids} />));
  return { frame, kids, ids };
}
function Harness({ ids }: { ids: string[] }) {
  const ab = useEditor((st) => st.project.artboards[0]);
  const flat = (list: SceneNode[]): SceneNode[] => list.flatMap((n) => [n, ...('children' in n ? flat(n.children) : [])]);
  const nodes = flat(ab.children).filter((n) => ids.includes(n.id));
  return <LayoutItemSection nodes={nodes} ab={ab} />;
}
const node = (id: string) => {
  const flat = (list: SceneNode[]): SceneNode[] => list.flatMap((n) => [n, ...('children' in n ? flat(n.children) : [])]);
  return flat(s.get().project.artboards[0].children).find((n) => n.id === id)!;
};
const field = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.querySelector('.field-label, span')?.textContent === label) as HTMLElement | undefined;
const has = (label: string) => !!field(label);
const titled = (start: string) => host.querySelector(`label[title^="${start}"]`) as HTMLElement;
const pick = (label: string, value: string) => {
  const sel = field(label)!.querySelector('select')!;
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const type = (el: HTMLElement, text: string) => {
  const input = el.querySelector('input')!;
  act(() => {
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
};
const check = (label: string) => act(() => field(label)!.querySelector('input')!.click());

afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
});

describe('patchLayoutItem', () => {
  it('leaves defaults out of the document', () => {
    expect(patchLayoutItem(undefined, { width: 'fixed', grow: 1, position: 'flow', gridColumn: 0, gridRowSpan: 1, wrapText: false })).toBeUndefined();
    expect(patchLayoutItem({ width: 'percent', widthPercent: 50 }, { width: 'fill' })).toEqual({ width: 'fill' });
    expect(patchLayoutItem({ margin: { top: 4, right: 0, bottom: 0, left: 0 } }, { margin: { top: 0, right: 0, bottom: 0, left: 0 } })).toBeUndefined();
    expect(patchLayoutItem({ marginAuto: { left: true } }, { marginAuto: { left: false, right: true } })).toEqual({ marginAuto: { right: true } });
    expect(patchLayoutItem({ aspectRatio: 2, aspectDerive: 'height' }, { aspectRatio: 0 })).toBeUndefined();
    expect(patchLayoutItem({ inset: { left: 4 } }, { inset: { left: undefined } })).toBeUndefined();
  });
  it('keeps one kind of basis', () => {
    expect(patchLayoutItem({ basis: 80 }, { basisPercent: 30, basis: undefined })).toEqual({ basisPercent: 30 });
    expect(patchLayoutItem({ basisPercent: 30 }, { basis: 'content', basisPercent: undefined })).toEqual({ basis: 'content' });
  });
  it('knows the parent layout kind', () => {
    const f = (layout: FrameNode['layout']) => createNode('frame', { layout }) as FrameNode;
    expect(parentLayoutKind(f(defaultAutoLayout('row')))).toBe('row');
    expect(parentLayoutKind(f(defaultAutoLayout('column')))).toBe('column');
    expect(parentLayoutKind(f({ ...defaultAutoLayout('row'), grid: GRID }))).toBe('grid');
    expect(parentLayoutKind(f({ ...defaultAutoLayout('row'), grid: { ...GRID, stack: true } }))).toBe('stack');
    expect(parentLayoutKind(f(null))).toBeNull();
    expect(parentLayoutKind(createNode('group') as never)).toBeNull();
    expect(parentLayoutKind(null)).toBeNull();
  });
});

describe('Layout item section', () => {
  it('is not shown for a layer whose parent has no auto layout', () => {
    mount(null);
    expect(host.querySelector('.section')).toBeNull();
  });

  it('in a column shows sizing and margins, but no grid placement, and grow only for a fill layer', () => {
    mount(defaultAutoLayout('column'));
    for (const l of ['Position', 'W', 'H']) expect(has(l)).toBe(true);
    expect(host.textContent).toContain('Margin');
    expect(host.querySelector('.li-auto')).not.toBeNull();
    for (const l of ['Column', 'Row', 'Col span', 'Row span', 'Grow', 'Basis', 'Aspect', 'Wrap text']) expect(has(l)).toBe(false);
  });

  it('sets the size mode, relays the frame out and undoes', () => {
    const { kids } = mount(defaultAutoLayout('column'));
    pick('W', 'fill');
    expect(node(kids[0].id).layoutItem).toEqual({ width: 'fill' });
    // 400 wide frame, 16 padding either side
    expect(node(kids[0].id).width).toBe(368);
    pick('W', 'percent');
    expect(node(kids[0].id).layoutItem).toEqual({ width: 'percent', widthPercent: 100 });
    type(field('Width %')!, '50');
    expect(node(kids[0].id).layoutItem!.widthPercent).toBe(50);
    expect(node(kids[0].id).width).toBe(184);
    pick('W', 'fixed');
    expect(node(kids[0].id).layoutItem).toBeUndefined();
    act(() => s.undo());
    expect(node(kids[0].id).layoutItem).toMatchObject({ width: 'percent' });
  });

  it('shows grow and basis for a fill layer along the row, and shares the room by weight', () => {
    const { kids } = mount(defaultAutoLayout('row'), (k) => [k[0]]);
    expect(has('Grow')).toBe(false);
    pick('W', 'fill');
    expect(has('Grow')).toBe(true);
    expect(has('Basis')).toBe(true);
    // a fill height is not along the row
    pick('W', 'fixed');
    pick('H', 'fill');
    expect(has('Grow')).toBe(false);
    pick('W', 'fill');
    type(field('Grow')!, '3');
    expect(node(kids[0].id).layoutItem).toMatchObject({ width: 'fill', grow: 3 });
    // the others are fixed (50px): 400 - 32 padding - 100 - 2 * 8 gap = 252 free
    expect(node(kids[0].id).width).toBe(252);
    type(field('Grow')!, '1');
    expect(node(kids[0].id).layoutItem!.grow).toBeUndefined();
  });

  it('sets a basis in px, percent or content, one at a time', () => {
    const { kids } = mount(defaultAutoLayout('row'));
    pick('W', 'fill');
    pick('Basis', 'px');
    // (it starts from the size it has now, so nothing jumps)
    expect(node(kids[0].id).layoutItem!.basis).toBe(252);
    type(field('Basis')!.parentElement!.querySelector('.number-field') as HTMLElement, '120');
    expect(node(kids[0].id).layoutItem!.basis).toBe(120);
    pick('Basis', 'percent');
    expect(node(kids[0].id).layoutItem).toMatchObject({ basisPercent: 50 });
    expect(node(kids[0].id).layoutItem!.basis).toBeUndefined();
    pick('Basis', 'content');
    expect(node(kids[0].id).layoutItem).toMatchObject({ basis: 'content' });
    expect(node(kids[0].id).layoutItem!.basisPercent).toBeUndefined();
    pick('Basis', 'none');
    expect(node(kids[0].id).layoutItem).toEqual({ width: 'fill' });
  });

  it('offers the aspect ratio when exactly one side hugs, and which side is derived', () => {
    const { kids } = mount(defaultAutoLayout('column'));
    expect(has('Aspect')).toBe(false);
    pick('H', 'hug');
    expect(has('Aspect')).toBe(true);
    expect(has('Derive')).toBe(false);
    type(field('Aspect')!, '2');
    expect(node(kids[0].id).layoutItem).toMatchObject({ height: 'hug', aspectRatio: 2 });
    // 50 wide, ratio 2 -> 25 tall
    expect(node(kids[0].id).height).toBe(25);
    expect(has('Derive')).toBe(true);
    pick('Derive', 'height');
    expect(node(kids[0].id).layoutItem!.aspectDerive).toBe('height');
    pick('Derive', 'either');
    expect(node(kids[0].id).layoutItem!.aspectDerive).toBeUndefined();
    // both sides hug: nothing to derive, but a ratio that is set stays editable
    pick('W', 'hug');
    expect(has('Aspect')).toBe(true);
    type(field('Aspect')!, '0');
    expect(node(kids[0].id).layoutItem!.aspectRatio).toBeUndefined();
    expect(has('Derive')).toBe(false);
  });

  it('takes the ratio from the layer size', () => {
    const { kids } = mount(defaultAutoLayout('column'));
    pick('W', 'hug');
    act(() => (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'From size') as HTMLElement).click());
    expect(node(kids[0].id).layoutItem!.aspectRatio).toBe(1.25);
  });

  it('writes margins and auto margins, and an auto margin pushes the layer to the end of the row', () => {
    const { kids } = mount(defaultAutoLayout('row'));
    type(titled('Space left')!, '12');
    expect(node(kids[0].id).layoutItem).toEqual({ margin: { top: 0, right: 0, bottom: 0, left: 12 } });
    type(titled('Space left')!, '0');
    expect(node(kids[0].id).layoutItem).toBeUndefined();
    check('Left');
    expect(node(kids[0].id).layoutItem).toEqual({ marginAuto: { left: true } });
    // inner width 368; three 50px layers and two 8px gaps leave 202, which the first one takes on its left
    expect(node(kids[0].id).x).toBe(16 + 202);
    check('Left');
    expect(node(kids[0].id).layoutItem).toBeUndefined();
    expect(node(kids[0].id).x).toBe(16);
  });

  it('shows wrap text only for text layers in a row or column', () => {
    const t = createNode('text', { name: 'T', text: 'Hello there', autoSize: 'width' }) as SceneNode;
    const { ids } = mount(defaultAutoLayout('column'), (k) => [k[3]], [t]);
    expect(has('Wrap text')).toBe(true);
    check('Wrap text');
    expect(node(ids[0]).layoutItem).toEqual({ wrapText: true });
    expect(host.textContent).not.toContain('Auto width');
    act(() => root.unmount());
    host.remove();
    const t2 = createNode('text', { name: 'T', text: 'Hello there', autoSize: 'height' }) as SceneNode;
    mount(defaultAutoLayout('column'), (k) => [k[3]], [t2]);
    expect(host.textContent).toContain('Auto width');
    act(() => root.unmount());
    host.remove();
    mount({ ...defaultAutoLayout('column'), grid: GRID }, (k) => [k[3]], [createNode('text', { name: 'T', text: 'x' }) as SceneNode]);
    expect(has('Wrap text')).toBe(false);
  });

  it('absolute position takes insets, left empty when not pinned', () => {
    const { kids } = mount(defaultAutoLayout('column'));
    expect(host.querySelector('.li-insets')).toBeNull();
    pick('Position', 'absolute');
    expect(node(kids[0].id).layoutItem).toEqual({ position: 'absolute' });
    expect(host.querySelectorAll('.li-insets label')).toHaveLength(4);
    expect(host.querySelector('.li-auto')).toBeNull();
    expect(has('Grow')).toBe(false);
    type(titled("Distance from the frame's right")!, '10');
    expect(node(kids[0].id).layoutItem).toEqual({ position: 'absolute', inset: { right: 10 } });
    expect(node(kids[0].id).x).toBe(400 - 10 - 50);
    type(titled("Distance from the frame's right")!, '');
    expect(node(kids[0].id).layoutItem).toEqual({ position: 'absolute' });
    pick('Position', 'ignore');
    expect(has('W')).toBe(false);
    pick('Position', 'flow');
    expect(node(kids[0].id).layoutItem).toBeUndefined();
  });

  it('in a grid shows the cell fields and no row or column only settings', () => {
    const { kids } = mount({ ...defaultAutoLayout('row'), grid: GRID }, (k) => [k[1]]);
    for (const l of ['Column', 'Row', 'Col span', 'Row span', 'W', 'H']) expect(has(l)).toBe(true);
    expect(host.querySelector('.li-auto')).toBeNull();
    type(field('Column')!, '2');
    type(field('Row')!, '2');
    type(field('Col span')!, '3');
    expect(node(kids[1].id).layoutItem).toEqual({ gridColumn: 2, gridRow: 2, gridColumnSpan: 3 });
    type(field('Column')!, '0');
    type(field('Col span')!, '1');
    type(field('Row')!, '0');
    expect(node(kids[1].id).layoutItem).toBeUndefined();
    // aspect needs a hugging height in a grid
    pick('W', 'hug');
    expect(has('Aspect')).toBe(false);
    pick('W', 'fixed');
    pick('H', 'hug');
    expect(has('Aspect')).toBe(true);
    // fill stretches to the cell
    pick('W', 'fill');
    expect(node(kids[1].id).width).toBe(100);
  });

  it('in a stack has no cell or margin fields', () => {
    mount({ ...defaultAutoLayout('row'), grid: { ...GRID, stack: true } });
    expect(has('W')).toBe(true);
    for (const l of ['Column', 'Row', 'Col span', 'Grow']) expect(has(l)).toBe(false);
    expect(host.textContent).not.toContain('Margin');
  });

  it('changes several selected layers together, keeping what differs', () => {
    const { kids } = mount(defaultAutoLayout('row'), (k) => [k[0], k[1]]);
    act(() => s.setProps([kids[0].id], { layoutItem: { width: 'fill', grow: 2 } }));
    // different widths: the select reads Mixed
    expect((field('W')!.querySelector('select') as HTMLSelectElement).value).toBe('');
    type(titled('Space top')!, '5');
    expect(node(kids[0].id).layoutItem).toEqual({ width: 'fill', grow: 2, margin: { top: 5, right: 0, bottom: 0, left: 0 } });
    expect(node(kids[1].id).layoutItem).toEqual({ margin: { top: 5, right: 0, bottom: 0, left: 0 } });
    pick('H', 'fill');
    expect(node(kids[0].id).layoutItem).toMatchObject({ width: 'fill', grow: 2, height: 'fill' });
    expect(node(kids[1].id).layoutItem).toMatchObject({ height: 'fill' });
    expect(node(kids[1].id).layoutItem!.width).toBeUndefined();
    // one undo takes back the last change for both
    act(() => s.undo());
    expect(node(kids[0].id).layoutItem!.height).toBeUndefined();
    expect(node(kids[1].id).layoutItem!.height).toBeUndefined();
  });

  it('says so when the layers sit in different kinds of layout', () => {
    const p = createProject('T');
    const a = createNode('frame', { layout: defaultAutoLayout('row') }) as FrameNode;
    const b = createNode('frame', { layout: { ...defaultAutoLayout('row'), grid: GRID } }) as FrameNode;
    const x = createNode('rect');
    const y = createNode('rect');
    a.children.push(x);
    b.children.push(y);
    p.artboards[0].children.push(a, b);
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness ids={[x.id, y.id]} />));
    expect(host.textContent).toContain('different kinds of layout');
    expect(has('W')).toBe(false);
  });

  it('gives every field a tooltip (its own, or the standard one from tips.ts)', () => {
    const allTitled = () => {
      const labels = Array.from(host.querySelectorAll('label'));
      expect(labels.length).toBeGreaterThan(5);
      for (const l of labels) expect(l.getAttribute('title') || '', `label "${l.textContent}"`).not.toBe('');
    };
    // a grid cell
    mount({ ...defaultAutoLayout('row'), grid: GRID });
    pick('W', 'percent');
    allTitled();
    act(() => root.unmount());
    host.remove();
    // a row: fill with a pixel basis, a hugging height with a ratio, auto margins
    mount(defaultAutoLayout('row'));
    pick('W', 'fill');
    pick('Basis', 'px');
    pick('H', 'hug');
    type(field('Aspect')!, '2');
    allTitled();
    for (const l of ['Grow', 'Aspect', 'Derive', 'Basis']) expect(field(l)).toBeDefined();
    act(() => root.unmount());
    host.remove();
    // an absolute layer
    mount(defaultAutoLayout('row'));
    pick('Position', 'absolute');
    allTitled();
    act(() => root.unmount());
    host.remove();
    // text
    mount(defaultAutoLayout('column'), (k) => [k[3]], [createNode('text', { name: 'T', text: 'x' }) as SceneNode]);
    allTitled();
  });
});

describe('Grid alignment (auto layout inspector)', () => {
  let frameId: string;
  function Frame() {
    const frame = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === frameId) as FrameNode);
    return <AutoLayoutSection frame={frame} />;
  }
  const frame = () => s.get().project.artboards[0].children.find((c) => c.id === frameId) as FrameNode;
  function mountFrame(layout: FrameNode['layout']) {
    const p = createProject('T');
    const f = createNode('frame', { name: 'F', layout }) as FrameNode;
    frameId = f.id;
    p.artboards[0].children.push(f);
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Frame />));
  }
  const cell = (name: string) => host.querySelector(`[role="radio"][aria-label="${name}"]`) as HTMLElement;

  it('has no alignment for a row or column', () => {
    mountFrame(defaultAutoLayout('row'));
    expect(host.querySelector('.li-picker')).toBeNull();
    expect(has('Justify content')).toBe(false);
  });

  it('picks where items sit in their cells, leaving start out of the document', () => {
    mountFrame({ ...defaultAutoLayout('row'), grid: GRID });
    expect(cell('Top left').getAttribute('aria-checked')).toBe('true');
    act(() => cell('Bottom right').click());
    expect(frame().layout!.grid).toMatchObject({ justifyItems: 'end', alignItems: 'end' });
    act(() => cell('Middle centre').click());
    expect(frame().layout!.grid).toMatchObject({ justifyItems: 'center', alignItems: 'center' });
    expect(cell('Middle centre').getAttribute('aria-checked')).toBe('true');
    act(() => cell('Top left').click());
    expect(frame().layout!.grid!.justifyItems).toBeUndefined();
    expect(frame().layout!.grid!.alignItems).toBeUndefined();
    act(() => s.undo());
    expect(frame().layout!.grid).not.toBe(undefined);
    act(() => s.redo());
    expect(frame().layout!.grid!.justifyItems).toBeUndefined();
  });

  it('sets where the tracks sit when they do not fill the frame', () => {
    mountFrame({ ...defaultAutoLayout('row'), grid: GRID });
    pick('Justify content', 'space-between');
    pick('Align content', 'center');
    expect(frame().layout!.grid).toMatchObject({ justifyContent: 'space-between', alignContent: 'center' });
    pick('Justify content', 'start');
    expect(frame().layout!.grid!.justifyContent).toBeUndefined();
    expect(frame().layout!.grid!.columns).toEqual(GRID.columns);
  });

  it('moves a fixed-size layer to the picked cell corner and lays out again', () => {
    const p = createProject('T');
    const k = createNode('rect', { width: 20, height: 20 });
    const f = createNode('frame', {
      name: 'F',
      width: 300,
      height: 200,
      layout: { ...defaultAutoLayout('row'), padding: { top: 0, right: 0, bottom: 0, left: 0 }, grid: { columns: [{ type: 'px', value: 100 }], rows: [{ type: 'px', value: 50 }] } },
    }) as FrameNode;
    f.children.push(k);
    frameId = f.id;
    p.artboards[0].children.push(f);
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Frame />));
    act(() => cell('Bottom right').click());
    expect(frame().children[0]).toMatchObject({ x: 80, y: 30 });
  });

  it('turns a grid into a stack and back, keeping the tracks', () => {
    mountFrame({ ...defaultAutoLayout('row'), grid: GRID });
    pick('Layout', 'stack');
    expect(frame().layout!.grid).toMatchObject({ stack: true, columns: GRID.columns });
    expect(has('Columns')).toBe(false);
    expect(has('Column gap')).toBe(false);
    expect(has('Justify content')).toBe(false);
    expect(host.textContent).toContain('Stack position');
    act(() => cell('Middle centre').click());
    expect(frame().layout!.grid).toMatchObject({ stack: true, justifyItems: 'center', alignItems: 'center' });
    pick('Layout', 'grid');
    expect(frame().layout!.grid!.stack).toBeUndefined();
    expect(has('Columns')).toBe(true);
    pick('Layout', 'flow');
    expect(frame().layout!.grid).toBeUndefined();
  });
});
