import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createProject, type InstanceNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { LeftPanel } from '../src/panels/LeftPanel';
import { ComponentPicker } from '../src/components/ComponentPicker';
import { DialogHost } from '../src/components/dialogs';
import { artboardMenuItems } from '../src/lib/artboard-commands';
import { PAGE_DRAG, closeInsertComponentPicker, componentChoices, filterChoices, hostChoices, insertComponent, openInsertComponentPicker, wouldLoop } from '../src/lib/components';
import { buildCommands } from '../src/lib/commands';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root | null = null;
let host: HTMLElement | null = null;
let s: EditorStore;
const ids: Record<string, string> = {};

function setup() {
  const p = createProject('T');
  p.artboards[0].name = 'Home';
  p.artboards[0].width = 1000;
  p.artboards[0].height = 800;
  p.artboards.push(createArtboard({ name: 'Badge', width: 200, height: 100, canvasX: 1200, canvasY: 0 }));
  p.artboards.push(createArtboard({ name: 'Card', width: 300, height: 200, canvasX: 1600, canvasY: 0 }));
  for (const a of p.artboards) ids[a.name] = a.id;
  s = new EditorStore(p);
  setCurrentStore(s);
}
function mount(ui: JSX.Element) {
  setup();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
}
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
});
afterEach(() => {
  closeInsertComponentPicker();
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

const instances = (abName: string) => s.get().project.artboards.find((a) => a.name === abName)!.children.filter((n) => n.type === 'instance') as InstanceNode[];

describe('inserting a component', () => {
  beforeEach(setup);

  it('places an instance layer at a point, centred on it, and selects it', () => {
    const id = insertComponent(ids['Badge'], ids['Home'], { x: 500, y: 400 });
    expect(id).toBeTruthy();
    const [inst] = instances('Home');
    expect(inst.artboardId).toBe(ids['Badge']);
    expect([inst.x, inst.y, inst.width, inst.height]).toEqual([400, 350, 200, 100]);
    expect(s.get().selection).toEqual([id]);
    expect(s.get().activeArtboardId).toBe(ids['Home']);
  });

  it('goes in the middle with no point, stays inside the page, shrinks to fit, and is one undo step', () => {
    insertComponent(ids['Card'], ids['Badge']);
    const [big] = instances('Badge');
    // 300 x 200 into 200 x 100: scaled by 0.5
    expect([big.width, big.height]).toEqual([150, 100]);
    expect(big.x).toBeGreaterThanOrEqual(0);
    insertComponent(ids['Badge'], ids['Home'], { x: 5, y: 5 });
    expect(instances('Home')[0].x).toBe(0);
    s.undo();
    expect(instances('Home')).toHaveLength(0);
  });

  it('refuses a page inside itself and a loop, and a library copy', () => {
    expect(insertComponent(ids['Home'], ids['Home'])).toBeNull();
    insertComponent(ids['Badge'], ids['Home']);
    // Home now holds Badge, so Badge can't hold Home
    expect(wouldLoop(s.get().project, ids['Badge'], ids['Home'])).toBe(true);
    expect(insertComponent(ids['Home'], ids['Badge'])).toBeNull();
    expect(componentChoices(s.get().project, ids['Badge']).map((c) => c.name)).toEqual(['Card']);
    expect(hostChoices(s.get().project, ids['Home']).map((c) => c.name)).toEqual(['Card']);
    s.update((d) => void (d.artboards.find((a) => a.name === 'Card')!.library = { libraryId: 'l', componentId: 'c', version: 1 } as never));
    expect(insertComponent(ids['Badge'], ids['Card'])).toBeNull();
    expect(hostChoices(s.get().project, ids['Badge']).map((c) => c.name)).toEqual(['Home']);
  });

  it('the choices are the other pages, found by any words of their name, group or size', () => {
    const all = componentChoices(s.get().project, ids['Home']);
    expect(all.map((c) => c.name)).toEqual(['Badge', 'Card']);
    expect(all[0].size).toBe('200 × 100');
    expect(filterChoices(all, 'car').map((c) => c.name)).toEqual(['Card']);
    expect(filterChoices(all, '200 100').map((c) => c.name)).toEqual(['Badge']);
    expect(filterChoices(all, 'zzz')).toEqual([]);
  });

  it('the page menu has Place in…, with the pages it can go in, and it works', () => {
    const items = artboardMenuItems([ids['Badge']]);
    const place = items.find((i) => 'label' in i && i.label === 'Place in…') as { items: { label: string; onClick: () => void }[] };
    expect(place.items.map((i) => i.label)).toEqual(['Home', 'Card']);
    place.items[0].onClick();
    expect(instances('Home')).toHaveLength(1);
    // several pages selected: not offered
    expect(artboardMenuItems([ids['Badge'], ids['Card']]).some((i) => 'label' in i && i.label === 'Place in…')).toBe(false);
  });

  it('the command palette lists Insert a component here…', () => {
    expect(buildCommands().some((c) => c.title === 'Insert a component here…' && !c.disabled)).toBe(true);
  });
});

describe('the Insert component picker', () => {
  const rows = () => [...host!.querySelectorAll('[role="option"]')].map((r) => r.querySelector('.cmd-title')?.textContent);
  const type = (el: HTMLInputElement, value: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('lists the pages that can go in, filters as you type and places the one you pick with Enter', () => {
    mount(<ComponentPicker />);
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    act(() => void openInsertComponentPicker({ hostId: ids['Home'], at: { x: 100, y: 100 } }));
    expect(rows()).toEqual(['Badge', 'Card']);
    const input = host!.querySelector('input')!;
    type(input, 'car');
    expect(rows()).toEqual(['Card']);
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    const [inst] = instances('Home');
    expect(inst.artboardId).toBe(ids['Card']);
    expect([inst.x, inst.y]).toEqual([0, 0]);
  });

  it('opens on the open page by default and Escape closes it', () => {
    mount(<ComponentPicker />);
    act(() => void openInsertComponentPicker());
    expect(host!.querySelector('input')!.getAttribute('aria-label')).toContain('Home');
    act(() => void host!.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host!.querySelector('[role="dialog"]')).toBeNull();
  });

  it('says so when there is nothing to place', () => {
    mount(<ComponentPicker />);
    s.update((d) => void (d.artboards = d.artboards.slice(0, 1)));
    act(() => void openInsertComponentPicker());
    expect(host!.textContent).toContain('No other pages');
  });
});

describe('the canvas and the Layers list', () => {
  const canvas = () => host!.querySelector('.canvas')!;
  const dnd = (type: string, x: number, y: number, data: Record<string, string> = {}) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, relatedTarget: null, dataTransfer: { types: Object.keys(data), dropEffect: '', effectAllowed: '', setData() {}, getData: (k: string) => data[k] ?? '' } });
    return e;
  };

  it('dropping a page from the Layers list on another page places it there, and outlines the target while over it', () => {
    mount(<Canvas />);
    const st = s.get();
    const home = st.project.artboards[0];
    const x = st.panX + (home.canvasX + 300) * st.zoom;
    const y = st.panY + (home.canvasY + 300) * st.zoom;
    act(() => void canvas().dispatchEvent(dnd('dragover', x, y, { [PAGE_DRAG]: ids['Badge'] })));
    expect(host!.querySelector('.drop-host')).toBeTruthy();
    act(() => void canvas().dispatchEvent(dnd('drop', x, y, { [PAGE_DRAG]: ids['Badge'] })));
    expect(host!.querySelector('.drop-host')).toBeNull();
    const [inst] = instances('Home');
    expect(inst.artboardId).toBe(ids['Badge']);
    // centred on the drop point
    expect([inst.x + inst.width / 2, inst.y + inst.height / 2]).toEqual([300, 300]);
  });

  it('a page can not be dropped on itself', () => {
    mount(<Canvas />);
    const st = s.get();
    const home = st.project.artboards[0];
    const x = st.panX + (home.canvasX + 300) * st.zoom;
    const y = st.panY + (home.canvasY + 300) * st.zoom;
    act(() => void canvas().dispatchEvent(dnd('drop', x, y, { [PAGE_DRAG]: ids['Home'] })));
    expect(instances('Home')).toHaveLength(0);
  });

  it('right-click on an empty part of a page has Insert component here…, which asks for the picker at that spot', () => {
    mount(
      <>
        <Canvas />
        <ComponentPicker />
      </>,
    );
    const st = s.get();
    const home = st.project.artboards[0];
    const x = st.panX + (home.canvasX + 300) * st.zoom;
    const y = st.panY + (home.canvasY + 300) * st.zoom;
    act(() => void canvas().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })));
    const item = [...document.querySelectorAll<HTMLElement>('.ctx-menu *')].find((n) => n.textContent === 'Insert component here…' && n.children.length === 0)!;
    expect(item).toBeTruthy();
    act(() => void item.click());
    expect(host!.querySelector('[role="dialog"]')).toBeTruthy();
    act(() => void host!.querySelector<HTMLElement>('[role="option"]')!.click());
    const [inst] = instances('Home');
    expect([inst.x + inst.width / 2, inst.y + inst.height / 2]).toEqual([300, 300]);
  });

  it('page rows in the Layers list can be dragged, and right-click has Place in…', () => {
    mount(
      <>
        <LeftPanel />
        <DialogHost />
      </>,
    );
    const row = [...host!.querySelectorAll<HTMLElement>('.artboard-row')].find((r) => r.querySelector('.layer-name')?.textContent === 'Badge')!;
    expect(row.getAttribute('draggable')).toBe('true');
    const data: Record<string, string> = {};
    const e = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.assign(e, { dataTransfer: { effectAllowed: '', setData: (k: string, v: string) => void (data[k] = v) } });
    act(() => void row.dispatchEvent(e));
    expect(data[PAGE_DRAG]).toBe(ids['Badge']);
    act(() => void row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect([...document.querySelectorAll('.ctx-menu *')].some((n) => n.textContent === 'Place in…')).toBe(true);
  });
});
