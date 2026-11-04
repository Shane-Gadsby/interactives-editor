import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, defaultAutoLayout, type FrameNode, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { AutoLayoutSection } from '../src/panels/Inspector';
import { LayoutItemSection } from '../src/panels/LayoutItemSection';
import { gapUnit, lineGapUnit, marginUnit, paddingUnit, patchGap, patchLineGap, patchMargin, patchPadding } from '../src/lib/layout-units';
import { patchLayoutItem } from '../src/lib/layout-item';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
});

describe('layout unit patches', () => {
  const L = defaultAutoLayout('column');
  it('records only the percent sides', () => {
    const a = patchPadding(L, 'left', 10, 'percent');
    expect(a.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 10 });
    expect(a.units).toEqual({ padding: { left: 'percent' } });
    const b = patchPadding({ ...L, ...a } as typeof L, 'left', 12, 'px');
    expect(b.units).toBeUndefined();
  });
  it('keeps the line gap following the gap only when value and unit match', () => {
    const withGap = { ...L, ...patchGap(L, 5, 'percent') };
    expect(gapUnit(withGap)).toBe('percent');
    // No line gap of its own: it is in the gap's unit
    expect(lineGapUnit(withGap)).toBe('percent');
    const own = { ...withGap, ...patchLineGap(withGap, 20, 'px') };
    expect(own.crossGap).toBe(20);
    expect(lineGapUnit(own)).toBe('px');
    expect(own.units).toEqual({ gap: 'percent' });
    const back = { ...own, ...patchLineGap(own, 5, 'percent') };
    expect(back.crossGap).toBeUndefined();
  });
  it('tidies margins: percent sides listed, none without a margin', () => {
    const p = patchMargin(undefined, 'left', 10, 'percent');
    expect(p).toEqual({ margin: { top: 0, right: 0, bottom: 0, left: 10 }, marginUnits: { left: 'percent' } });
    expect(patchLayoutItem(undefined, p)).toEqual({ margin: { top: 0, right: 0, bottom: 0, left: 10 }, marginUnits: { left: 'percent' } });
    expect(patchLayoutItem(p, patchMargin(p, 'left', 0, 'percent'))).toBeUndefined();
    expect(marginUnit(p, 'left')).toBe('percent');
    expect(marginUnit(p, 'top')).toBe('px');
    expect(paddingUnit(L, 'top')).toBe('px');
  });
});

describe('percent fields in the inspector', () => {
  let frameId: string;
  function Frame() {
    const frame = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === frameId) as FrameNode);
    return <AutoLayoutSection frame={frame} />;
  }
  function Item({ id }: { id: string }) {
    const ab = useEditor((st) => st.project.artboards[0]);
    const flat = (list: SceneNode[]): SceneNode[] => list.flatMap((n) => [n, ...('children' in n ? flat(n.children) : [])]);
    return <LayoutItemSection nodes={flat(ab.children).filter((n) => n.id === id)} ab={ab} />;
  }
  const frame = () => s.get().project.artboards[0].children.find((c) => c.id === frameId) as FrameNode;
  function mount(layout: FrameNode['layout'], ui: 'frame' | 'item' = 'frame') {
    const p = createProject('T');
    const f = createNode('frame', { name: 'F', width: 400, height: 300, layout, children: [createNode('rect', { name: 'R', width: 50, height: 40 })] }) as FrameNode;
    frameId = f.id;
    p.artboards[0].children.push(f);
    s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ activeArtboardId: p.artboards[0].id });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(ui === 'frame' ? <Frame /> : <Item id={f.children[0].id} />));
  }
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
  const titled = (start: string) => host.querySelector(`label[title^="${start}"]`) as HTMLElement;

  it('takes 10% typed into a padding field, and lays the frame out with it', () => {
    mount({ ...defaultAutoLayout('column'), padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    type(titled('Left padding'), '10%');
    expect(frame().layout!.padding.left).toBe(10);
    expect(frame().layout!.units).toEqual({ padding: { left: 'percent' } });
    // 10% of the 400 px frame
    expect(frame().children[0].x).toBe(40);
    expect(titled('Left padding').querySelector('input')!.value).toBe('10%');
    // The frame gets wider, the padding follows
    act(() => s.setProps([frameId], { width: 800 }));
    expect(frame().children[0].x).toBe(80);
    // Typing px (or just a number in a px field) goes back
    type(titled('Left padding'), '12px');
    expect(frame().layout!.units).toBeUndefined();
    expect(frame().children[0].x).toBe(12);
  });

  it('switches a field with the unit button, keeping the size it comes to', () => {
    mount({ ...defaultAutoLayout('column'), padding: { top: 0, right: 0, bottom: 0, left: 20 } });
    const btn = titled('Left padding').querySelector('button')!;
    expect(btn.textContent).toBe('px');
    act(() => btn.click());
    // 20 px of a 400 px frame is 5%
    expect(frame().layout!.padding.left).toBe(5);
    expect(frame().layout!.units).toEqual({ padding: { left: 'percent' } });
    expect(frame().children[0].x).toBe(20);
    expect(titled('Left padding').querySelector('button')!.textContent).toBe('%');
    act(() => titled('Left padding').querySelector('button')!.click());
    expect(frame().layout!.padding.left).toBe(20);
    expect(frame().layout!.units).toBeUndefined();
  });

  it('takes a percent gap', () => {
    mount({ ...defaultAutoLayout('column'), padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    const gap = Array.from(host.querySelectorAll('label')).find((l) => l.querySelector('.field-label')?.textContent === 'Gap') as HTMLElement;
    type(gap, '5%');
    expect(frame().layout!.gap).toBe(5);
    expect(frame().layout!.units).toEqual({ gap: 'percent' });
  });

  it('takes a percent margin on a layer in the frame', () => {
    mount({ ...defaultAutoLayout('column'), padding: { top: 0, right: 0, bottom: 0, left: 0 } }, 'item');
    type(titled('Space left'), '10%');
    const r = frame().children[0];
    expect(r.layoutItem).toMatchObject({ margin: { left: 10 }, marginUnits: { left: 'percent' } });
    expect(r.x).toBe(40);
    act(() => s.setProps([frameId], { width: 200 }));
    expect(frame().children[0].x).toBe(20);
  });
});
