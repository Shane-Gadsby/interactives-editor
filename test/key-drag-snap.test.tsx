import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel } from '../src/panels/Timeline';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The lane is 600 px wide in jsdom (the panel's default), so with a 576 ms timeline one pixel is one millisecond
function mount(): void {
  const p: Project = createProject('Snap');
  const a = createNode('rect', { name: 'A', x: 0, y: 0, width: 10, height: 10 });
  p.artboards[0].children.push(a);
  p.artboards[0].timelines.push({
    id: 'tl',
    name: 'T',
    duration: 576,
    loop: 'once',
    autoplay: false,
    speed: 1,
    markers: [{ id: 'm1', time: 300, name: 'Mid' }],
    tracks: [{ id: 'tr', nodeId: a.id, prop: 'x', keys: [{ id: 'k1', t: 100, value: 0, ease: 'linear' }] }],
  });
  s = new EditorStore(p);
  s.set({ activeTimelineId: 'tl', bottomTab: 'timeline', playhead: 450 });
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<TimelinePanel />));
}
const keyT = () => s.get().project.artboards[0].timelines[0].tracks[0].keys[0].t;

function drag(by: number, init: MouseEventInit = {}): void {
  const el = host!.querySelector<HTMLElement>('.lane:not(.node-lane) .key')!;
  act(() => void el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 })));
  act(() => void el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: by, ...init })));
  act(() => void el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
}

describe('dragging a key', () => {
  it('snaps onto a marker when it gets close', () => {
    mount();
    drag(196);
    expect(keyT()).toBe(300);
  });
  it('snaps onto where the playhead was before the press moved it', () => {
    mount();
    drag(347);
    expect(keyT()).toBe(450);
  });
  it('falls back to the 10 ms grid away from both', () => {
    mount();
    drag(63);
    expect(keyT()).toBe(160);
  });
  it('lets go of the marker with Alt held', () => {
    mount();
    drag(194, { altKey: true });
    expect(keyT()).toBe(290);
  });
});
