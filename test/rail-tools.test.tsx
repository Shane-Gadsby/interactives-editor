import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Icons } from '../src/components/icons';
import { closeHelp, HelpHost } from '../src/help/Help';
import { getTopic, topicBody } from '../src/help/topics';
import { slug } from '../src/help/markdown';

vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

//jsdom has no CSS.escape, which the help uses to find an anchor
(globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS ??= { escape: (s: string) => s };

Element.prototype.scrollIntoView ??= () => undefined;

let root: Root | null = null;
afterEach(() => {
  act(() => closeHelp());
  act(() => root?.unmount());
  document.body.innerHTML = '';
  localStorage.clear();
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
  act(() => root!.render(<><Toolbar /><HelpHost /></>));
  return s;
}
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.toolbar .icon-btn')];
const catalogue = () => buttons().filter((b) => b.title.startsWith('Media Catalogue'));
const media = () => [...document.querySelectorAll<HTMLButtonElement>('.tool-group-head')].find((b) => b.textContent === 'Media')!;

describe('the tool rail', { timeout: 30000 }, () => {
  it('has no help button of its own', async () => {
    await mount();
    for (const g of document.querySelectorAll<HTMLButtonElement>('.tool-group-head[aria-expanded="false"]')) act(() => g.click());
    expect(buttons().filter((b) => /^Help/.test(b.title))).toEqual([]);
    expect(document.querySelectorAll('.toolbar .icon-btn svg path[d^="M12 21a9 9 0 100-18"]').length).toBe(0);
  });

  it('has the Media Catalogue once, inside the Media group, and not in the bottom cluster', async () => {
    await mount();
    expect(catalogue().length).toBe(0);
    act(() => media().click());
    expect(catalogue().length).toBe(1);
    expect(catalogue()[0].closest('.tool-group')).toBe(media().closest('.tool-group'));
    expect(document.querySelector('.toolbar-fill ~ .tool-grid')!.contains(catalogue()[0])).toBe(false);
  });

  it('opens the catalogue as an action: it never stays lit', async () => {
    await mount();
    act(() => media().click());
    act(() => catalogue()[0].click());
    expect(document.querySelector('.catalogue-modal')).toBeTruthy();
    expect(catalogue()[0].classList.contains('active')).toBe(false);
    expect(catalogue()[0].getAttribute('aria-pressed')).toBeNull();
  });

  it('uses the catalogue\'s iris icon, filled with currentColor', async () => {
    await mount();
    act(() => media().click());
    const svg = catalogue()[0].querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    //the iris is six petals, and nothing in it carries its own colour
    expect(svg.querySelectorAll('path').length).toBe(6);
    expect(svg.querySelector('[fill]:not(svg), [style]')).toBeNull();
    expect(typeof Icons.catalogue).toBe('function');
  });

  it('keeps the rail help in the right-click menu, pointing at a real heading', async () => {
    await mount();
    act(() => void document.querySelector('.toolbar')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const item = [...document.querySelectorAll<HTMLElement>('.ctx-menu [role="menuitem"]')].find((b) => b.textContent?.startsWith('Help for the tools'))!;
    expect(item).toBeTruthy();
    act(() => item.click());
    expect(document.querySelector('.help-drawer h1')?.textContent).toContain('editor at a glance');
    const heads = [...topicBody(getTopic('interface')!).matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1]));
    expect(heads).toContain('tool-bar-left-edge-unless-you-move-it');
  });
});
