import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { LeftPanel } from '../src/panels/LeftPanel';
import { altHintDue, ALT_HINT_TIMES } from '../src/lib/alt-drag';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
let s: EditorStore;
const ids: Record<string, string> = {};

function mount(ui: JSX.Element) {
  const p = createProject('T');
  p.artboards[0].name = 'Home';
  p.artboards[0].children.push(createNode('rect', { name: 'Box' } as never));
  for (const [i, n] of ['Intro', 'Quiz 1'].entries()) p.artboards.push(createArtboard({ name: n, width: 800, height: 600, canvasX: 1000 * (i + 1), canvasY: 0 }));
  for (const a of p.artboards) ids[a.name] = a.id;
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(ui));
}
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const label = (name: string) => [...host.querySelectorAll<SVGTextElement>('text.ab-label')].find((t) => t.textContent!.startsWith(name))!;
const canvas = () => host.querySelector('.canvas')!;
const ptr = (el: Element, type: string, x: number, y: number, mods: { altKey?: boolean } = {}) => act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...mods })));
const drag = (el: Element, dx: number, dy: number, mods: { altKey?: boolean } = {}) => {
  const z = s.get().zoom;
  ptr(el, 'pointerdown', 100, 100, mods);
  ptr(canvas(), 'pointermove', 100 + (dx / 2) * z, 100 + (dy / 2) * z, mods);
  ptr(canvas(), 'pointermove', 100 + dx * z, 100 + dy * z, mods);
  ptr(canvas(), 'pointerup', 100 + dx * z, 100 + dy * z, mods);
};

describe('Alt-drag a page name', () => {
  it('drags a copy and leaves the original where it was', () => {
    mount(<Canvas />);
    const intro = s.get().project.artboards.find((a) => a.name === 'Intro')!;
    const [x0, y0] = [intro.canvasX, intro.canvasY];
    drag(label('Intro'), 300, 200, { altKey: true });
    const all = s.get().project.artboards;
    expect(all).toHaveLength(4);
    const orig = all.find((a) => a.id === ids['Intro'])!;
    expect([orig.canvasX, orig.canvasY]).toEqual([x0, y0]);
    const copy = all[3];
    expect(copy.id).not.toBe(ids['Intro']);
    expect(copy.name).not.toBe('Intro');
    expect([copy.canvasX, copy.canvasY]).toEqual([x0 + 300, y0 + 200]);
    // the copy is what is selected
    expect(s.pickedArtboards()).toEqual([copy.id]);
    // and one undo for the move, one for the copy
    s.undo();
    s.undo();
    expect(s.get().project.artboards).toHaveLength(3);
  });

  it('copies the layers too (new ids)', () => {
    mount(<Canvas />);
    drag(label('Home'), 400, 0, { altKey: true });
    const copy = s.get().project.artboards[3];
    expect(copy.children.map((n) => n.name)).toEqual(['Box']);
    expect(copy.children[0].id).not.toBe(s.get().project.artboards[0].children[0].id);
  });

  it('a plain drag still moves the page and makes no copy', () => {
    mount(<Canvas />);
    const before = s.get().project.artboards.find((a) => a.name === 'Intro')!.canvasX;
    drag(label('Intro'), 300, 0);
    expect(s.get().project.artboards).toHaveLength(3);
    expect(s.get().project.artboards.find((a) => a.name === 'Intro')!.canvasX).toBe(before + 300);
  });

  it('an Alt click without a drag copies nothing', () => {
    mount(<Canvas />);
    ptr(label('Intro'), 'pointerdown', 100, 100, { altKey: true });
    ptr(canvas(), 'pointerup', 100, 100, { altKey: true });
    expect(s.get().project.artboards).toHaveLength(3);
  });

  it('Alt on an empty part of a page drags a copy of the page too, a plain press there is still the marquee', () => {
    mount(<Canvas />);
    const home = s.get().project.artboards[0];
    const st = s.get();
    // a point inside Home, in the canvas's own coordinates
    const px = st.panX + (home.canvasX + 400) * st.zoom;
    const py = st.panY + (home.canvasY + 300) * st.zoom;
    ptr(canvas(), 'pointerdown', px, py, {});
    ptr(canvas(), 'pointermove', px + 50, py);
    ptr(canvas(), 'pointerup', px + 50, py);
    expect(s.get().project.artboards).toHaveLength(3);
    ptr(canvas(), 'pointerdown', px, py, { altKey: true });
    ptr(canvas(), 'pointermove', px + 50 * st.zoom, py, { altKey: true });
    ptr(canvas(), 'pointermove', px + 100 * st.zoom, py, { altKey: true });
    ptr(canvas(), 'pointerup', px + 100 * st.zoom, py, { altKey: true });
    expect(s.get().project.artboards).toHaveLength(4);
    expect(s.get().project.artboards[3].canvasX).toBe(home.canvasX + 100);
  });

  it('copies every chosen page together', () => {
    mount(<Canvas />);
    s.pickArtboards([ids['Intro'], ids['Quiz 1']]);
    drag(label('Intro'), 0, 900, { altKey: true });
    const all = s.get().project.artboards;
    expect(all).toHaveLength(5);
    expect(s.pickedArtboards()).toHaveLength(2);
    const [a, b] = all.slice(3);
    expect(b.canvasX - a.canvasX).toBe(1000);
    expect(a.canvasY).toBe(900);
  });

  it('a group name copies the whole group as a new group', () => {
    mount(<Canvas />);
    s.groupArtboards([ids['Intro'], ids['Quiz 1']], 'Quiz section');
    act(() => void s.pickArtboards([ids['Home']]));
    drag(host.querySelector('rect.ab-group-chip')!, 0, 900, { altKey: true });
    expect(s.get().project.artboards).toHaveLength(5);
    expect(s.get().project.artboardGroups).toHaveLength(2);
  });

  it('the name says Alt copies, the cursor is a copy cursor while Alt is down', () => {
    mount(<Canvas />);
    expect(label('Intro').parentElement!.querySelector('title')?.textContent).toContain('Alt');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })));
    expect(canvas().classList.contains('alt-held')).toBe(true);
    act(() => void window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false })));
    expect(canvas().classList.contains('alt-held')).toBe(false);
  });
});

describe('the first plain drags mention Alt', () => {
  it('only a few times', () => {
    const seen = Array.from({ length: ALT_HINT_TIMES + 2 }, () => altHintDue());
    expect(seen).toEqual([true, true, true, false, false]);
  });

  it('every time with Always show the Alt-drag hint ticked', () => {
    setPrefs({ altDragHintAlways: true });
    try {
      expect(Array.from({ length: ALT_HINT_TIMES + 3 }, () => altHintDue()).every(Boolean)).toBe(true);
    } finally {
      setPrefs({ altDragHintAlways: false });
    }
  });

  it('a page-name drag shows the note and takes it away on release', () => {
    mount(<Canvas />);
    const z = s.get().zoom;
    ptr(label('Intro'), 'pointerdown', 100, 100);
    ptr(canvas(), 'pointermove', 100 + 50 * z, 100, {});
    expect(host.querySelector('.tool-hint')?.textContent).toContain('Alt');
    ptr(canvas(), 'pointerup', 150, 100);
    expect(host.querySelector('.tool-hint')).toBeNull();
  });
});

describe('Alt-drag in the Layers list', () => {
  const dragEvent = (type: string, y: number, altKey: boolean) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: 500, clientY: y, altKey, dataTransfer: { dropEffect: '', effectAllowed: '', setData() {} }, relatedTarget: null });
    return e;
  };
  it('drops a copy and keeps the original; without Alt it still moves', () => {
    mount(<LeftPanel />);
    act(() => void s.update((d) => void d.artboards[0].children.push(createNode('rect', { name: 'Top' } as never))));
    const rows = () => [...host.querySelectorAll('.layer-row .layer-name')].map((n) => n.textContent);
    expect(rows()).toEqual(['Top', 'Box']);
    const top = [...host.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.textContent === 'Top')!;
    act(() => void top.dispatchEvent(dragEvent('dragstart', 0, true)));
    const list = host.querySelector('.layers')!;
    // below the last row of Home: flat rows are Home, Top, Box
    const y = 4 + 3 * 26 - 4;
    act(() => void list.dispatchEvent(dragEvent('dragover', y, true)));
    act(() => void list.dispatchEvent(dragEvent('drop', y, true)));
    const kids = s.get().project.artboards[0].children.map((n) => n.name);
    expect(kids).toHaveLength(3);
    expect(kids).toContain('Top');
    expect(kids.filter((n) => n.startsWith('Top'))).toHaveLength(2);
    // the copy is selected
    expect(s.get().selection).toHaveLength(1);
  });
});
