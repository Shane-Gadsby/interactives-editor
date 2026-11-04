import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; the timeline only measures its lanes with it
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  localStorage.clear();
});
async function mount(el: () => Promise<React.ReactElement>) {
  const p = createProject('T');
  const s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const node = await el();
  act(() => root!.render(node));
  return s;
}
const titles = () => [...document.querySelectorAll('.toolbar .icon-btn')].map((b) => b.getAttribute('title') ?? '');

// importing the whole Editor module is slow on a loaded machine (about 3.5s alone)
describe('tools column in folding groups', { timeout: 30000 }, () => {
  it('opens Shapes and Draw, folds Media, Web and Rig, and remembers a fold', async () => {
    const { Toolbar } = await import('../src/Editor');
    await mount(async () => <Toolbar />);
    expect(titles().some((t) => t.startsWith('Rectangle'))).toBe(true);
    expect(titles().some((t) => t.startsWith('Button'))).toBe(false);
    const web = [...document.querySelectorAll<HTMLButtonElement>('.tool-group-head')].find((b) => b.textContent === 'Web')!;
    act(() => web.click());
    expect(titles().some((t) => t.startsWith('Button'))).toBe(true);
    expect(JSON.parse(localStorage.getItem('ix-tool-groups')!).web).toBe(true);
  });

  it('shows the tool in use even when its group is folded', async () => {
    const { Toolbar } = await import('../src/Editor');
    const s = await mount(async () => <Toolbar />);
    act(() => s.set({ tool: 'bone' }));
    expect(titles().some((t) => t.startsWith('Bone'))).toBe(true);
  });
});

describe('timeline settings in a popover', { timeout: 30000 }, () => {
  it('shows a summary in the bar and the fields behind the gear', async () => {
    const { TimelinePanel } = await import('../src/panels/Timeline');
    const s = await mount(async () => <TimelinePanel />);
    act(() => s.addTimeline());
    expect(document.querySelector('.tl-summary')?.textContent).toMatch(/ms · Play once · 1×/);
    expect(document.querySelector('.tl-settings-pop')).toBeNull();
    act(() => (document.querySelector('.tl-settings .icon-btn') as HTMLElement).click());
    const pop = document.querySelector('.tl-settings-pop')!;
    expect(pop.textContent).toMatch(/Name.*Length.*Speed.*Frame rate/s);
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.tl-settings-pop')).toBeNull();
  });
});
