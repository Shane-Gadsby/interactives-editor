import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { getOrder, resetToolOrder, setOrder } from '../src/lib/reorder';
import { setPrefs } from '../src/lib/prefs';

vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => undefined;

let root: Root | null = null;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  setPrefs({ sectionOrder: {}, toolOrder: {} });
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});
async function mount() {
  const { Toolbar } = await import('../src/Editor');
  const p = createProject('T');
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Toolbar />));
  return s;
}
const groups = () => [...document.querySelectorAll<HTMLElement>('.toolbar > .tool-group')].map((g) => g.dataset.reorderKey);
const group = (id: string) => document.querySelector<HTMLElement>(`.tool-group[data-reorder-key="${id}"]`)!;
const head = (id: string) => group(id).querySelector<HTMLElement>('.tool-group-head')!;
const tools = (id: string) => [...group(id).querySelectorAll<HTMLElement>(':scope > .tool-grid > [data-reorder-key]')].map((b) => b.dataset.reorderKey);
const open = (id: string) => head(id).getAttribute('aria-expanded') === 'false' && act(() => head(id).click());
const press = (el: Element, key: string, init: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, altKey: true, ...init })));
const announced = () => document.querySelector('[data-announce]')?.textContent?.trim();

describe('the tool rail in the person\'s order', { timeout: 30000 }, () => {
  it('starts in the editor\'s own order', async () => {
    await mount();
    expect(groups()).toEqual(['shapes', 'draw', 'media', 'data', 'web', 'rig']);
    expect(tools('shapes')).toEqual(['artboard', 'frame', 'rect', 'ellipse', 'polygon', 'star']);
  });

  it('draws the groups and the tools in the saved order, including the extra buttons of a group', async () => {
    setOrder('toolOrder', 'groups', ['rig', 'draw']);
    setOrder('toolOrder', 'shapes', ['star', 'rect']);
    setOrder('toolOrder', 'media', ['catalogue', 'text']);
    await mount();
    //rig and draw swap, shapes and the rest stay put
    expect(groups()).toEqual(['shapes', 'rig', 'media', 'data', 'web', 'draw']);
    expect(tools('shapes')).toEqual(['artboard', 'frame', 'star', 'ellipse', 'polygon', 'rect']);
    open('media');
    expect(tools('media')).toEqual(['catalogue', 'draw', 'shader', 'animation', 'video', 'image', 'text']);
  });

  it('moves a group with Alt+Down on its heading, keeps the focus on it, and says so', async () => {
    await mount();
    head('shapes').focus();
    press(head('shapes'), 'ArrowDown');
    expect(groups().slice(0, 3)).toEqual(['draw', 'shapes', 'media']);
    expect(getOrder('toolOrder', 'groups')).toEqual(['draw', 'shapes', 'media', 'data', 'web', 'rig']);
    expect(announced()).toBe('Shapes group moved to position 2 of 6');
    await act(async () => void (await new Promise((r) => requestAnimationFrame(() => r(null)))));
    expect(document.activeElement).toBe(head('shapes'));
  });

  it('moves a tool with Alt+Right and Alt+Left', async () => {
    await mount();
    const rect = () => group('shapes').querySelector<HTMLElement>('[data-reorder-key="rect"]')!;
    press(rect(), 'ArrowRight');
    expect(tools('shapes')).toEqual(['artboard', 'frame', 'ellipse', 'rect', 'polygon', 'star']);
    expect(announced()).toBe('Rectangle moved to position 4 of 6 in Shapes');
    press(rect(), 'ArrowLeft');
    press(rect(), 'ArrowLeft');
    expect(tools('shapes')).toEqual(['artboard', 'rect', 'frame', 'ellipse', 'polygon', 'star']);
  });

  it('says so at the ends of a list and changes nothing', async () => {
    await mount();
    press(head('shapes'), 'ArrowUp');
    expect(announced()).toBe('Shapes group is already first');
    expect(getOrder('toolOrder', 'groups')).toBeUndefined();
  });

  it('does not move on a plain arrow key, or on Select and Hand (they have no group)', async () => {
    await mount();
    press(head('shapes'), 'ArrowDown', { altKey: false });
    expect(groups()[0]).toBe('shapes');
    const select = document.querySelector<HTMLElement>('.toolbar > .tool-grid .icon-btn')!;
    press(select, 'ArrowRight');
    expect(getOrder('toolOrder', 'groups')).toBeUndefined();
  });

  it('has a heading and tool tooltip that say how to move them, and the shortcut keys', async () => {
    await mount();
    expect(head('draw').title).toContain('Drag to move the group');
    expect(head('draw').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp Alt+ArrowDown');
  });

  it('puts the groups in the saved order the first time, and back in the default order on a reset', async () => {
    setOrder('toolOrder', 'groups', ['rig', 'data']);
    await mount();
    expect(groups()).toEqual(['shapes', 'draw', 'media', 'rig', 'web', 'data']);
    act(() => resetToolOrder());
    expect(groups()).toEqual(['shapes', 'draw', 'media', 'data', 'web', 'rig']);
  });

  it('has move items and Reset tool order in the right-click menu', async () => {
    await mount();
    act(() => void head('draw').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })));
    const items = [...document.querySelectorAll<HTMLElement>('.ctx-menu button, .ctx-menu [role="menuitem"]')].map((b) => b.textContent ?? '');
    expect(items.some((t) => t.startsWith('Move the Draw group up'))).toBe(true);
    expect(items.some((t) => t.startsWith('Move the Draw group down'))).toBe(true);
    const reset = [...document.querySelectorAll<HTMLElement>('.ctx-menu button, .ctx-menu [role="menuitem"]')].find((b) => b.textContent === 'Reset tool order')!;
    setOrder('toolOrder', 'groups', ['draw', 'shapes']);
    act(() => reset.click());
    expect(getOrder('toolOrder', 'groups')).toBeUndefined();
  });

  it('drags a group by its heading to where the gold line is', async () => {
    await mount();
    const gs = [...document.querySelectorAll<HTMLElement>('.toolbar > .tool-group')];
    gs.forEach((g, i) => (g.getBoundingClientRect = () => ({ left: 0, right: 70, top: i * 60, bottom: i * 60 + 50, width: 70, height: 50, x: 0, y: i * 60, toJSON: () => ({}) })));
    const fire = (target: EventTarget, type: string, y: number) => act(() => void target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: y, button: 0 }))));
    fire(head('shapes'), 'pointerdown', 10);
    fire(window, 'pointermove', 100);
    expect(document.querySelector('.reorder-line')).toBeTruthy();
    expect(document.querySelector('.reorder-ghost')!.textContent).toBe('Shapes');
    fire(window, 'pointermove', 160);
    fire(window, 'pointerup', 160);
    expect(groups().slice(0, 3)).toEqual(['draw', 'media', 'shapes']);
    expect(document.querySelector('.reorder-line')).toBeNull();
  });
});
