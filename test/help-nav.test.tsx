import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { closeHelp, helpBack, helpForward, helpHistory, helpHome, HelpHost, openHelp } from '../src/help/Help';
import { HelpHistory } from '../src/help/history';
import { setPreviewOpen } from '../src/lib/overlays';
import { warmHelp } from './lazy-chunks';

//the editor loads these in chunks of their own; the test starts with them in
beforeAll(() => warmHelp());

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the history stack', () => {
  it('goes back and forward, drops the forward side on a new visit, and ignores the same place twice', () => {
    const h = new HelpHistory();
    h.push({ id: 'a' });
    h.push({ id: 'b' });
    h.push({ id: 'b' });
    h.push({ id: 'c', anchor: 'x' });
    expect(h.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect([h.canBack, h.canForward]).toEqual([true, false]);
    expect(h.back()?.id).toBe('b');
    expect(h.back()?.id).toBe('a');
    expect([h.canBack, h.canForward]).toEqual([false, true]);
    expect(h.back()).toBeNull();
    expect(h.forward()?.id).toBe('b');
    h.push({ id: 'd' });
    expect(h.entries.map((e) => e.id)).toEqual(['a', 'b', 'd']);
    expect(h.canForward).toBe(false);
  });
  it('keeps where each article was scrolled to', () => {
    const h = new HelpHistory();
    h.push({ id: 'a' });
    h.saveScroll(240);
    h.push({ id: 'b' });
    h.saveScroll(10);
    expect(h.back()?.scroll).toBe(240);
    expect(h.forward()?.scroll).toBe(10);
  });
  it('is capped', () => {
    const h = new HelpHistory();
    for (let i = 0; i < 200; i++) h.push({ id: `t${i}` });
    expect(h.entries.length).toBeLessThanOrEqual(60);
    expect(h.current?.id).toBe('t199');
  });
});

describe('the drawer', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    helpHistory.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<HelpHost />));
  });
  afterEach(() => {
    act(() => closeHelp());
    act(() => root.unmount());
    host.remove();
    setPreviewOpen(false);
    vi.restoreAllMocks();
  });
  const title = () => document.querySelector('.help-drawer h1')?.textContent ?? '';
  const btn = (label: string) => document.querySelector<HTMLButtonElement>(`.help-drawer button[aria-label="${label}"]`)!;
  const click = (el: Element) => act(() => void (el as HTMLElement).click());
  const alt = (key: string, target: Element = document.querySelector('.help-drawer .help-search')!) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true })));

  it('has Home, Back and Forward before the search box, labelled', () => {
    act(() => openHelp('shapes'));
    const head = document.querySelector('.help-head')!;
    const kids = [...head.children];
    const group = head.querySelector('.help-nav-btns')!;
    expect(kids.indexOf(group)).toBe(0);
    expect(kids.indexOf(group)).toBeLessThan(kids.indexOf(head.querySelector('.help-search')!));
    expect([...group.querySelectorAll('button')].map((b) => [b.getAttribute('aria-label'), !!b.title])).toEqual([
      ['Back', true],
      ['Forward', true],
      ['Help home', true],
    ]);
  });

  it('disables Back and Forward at the ends and walks the visited topics', () => {
    act(() => openHelp('shapes'));
    expect([btn('Back').disabled, btn('Forward').disabled]).toEqual([true, true]);
    act(() => openHelp('text'));
    expect(title()).toContain('Text');
    expect([btn('Back').disabled, btn('Forward').disabled]).toEqual([false, true]);
    click(btn('Back'));
    expect(title()).toContain('Shapes');
    expect([btn('Back').disabled, btn('Forward').disabled]).toEqual([true, false]);
    click(btn('Forward'));
    expect(title()).toContain('Text');
  });

  it('Home goes to the welcome page, and Back returns from it', () => {
    act(() => openHelp('shapes'));
    click(btn('Help home'));
    expect(title()).toContain('Welcome');
    click(btn('Back'));
    expect(title()).toContain('Shapes');
  });

  it('records link clicks and search results, not only things opened from outside', () => {
    act(() => openHelp('shapes'));
    const link = document.querySelector<HTMLAnchorElement>('.help-drawer .help-pager a')!;
    click(link);
    expect(helpHistory.entries.length).toBe(2);
    act(() => closeHelp());
    //closed and opened from somewhere else (context help): Back still returns to what was being read
    act(() => openHelp('charts', undefined, 'Chart layer'));
    expect(helpHistory.entries.length).toBe(3);
    expect(document.querySelector('.help-context')?.textContent).toContain('Chart layer');
    click(btn('Back'));
    expect(document.querySelector('.help-context')).toBeNull();
  });

  it('puts the article back where it was scrolled to', () => {
    act(() => openHelp('shapes'));
    const body = () => document.querySelector<HTMLElement>('.help-drawer .help-body')!;
    body().scrollTop = 320;
    act(() => openHelp('text'));
    body().scrollTop = 40;
    click(btn('Back'));
    expect(body().scrollTop).toBe(320);
    click(btn('Forward'));
    expect(body().scrollTop).toBe(40);
  });

  it('answers Alt+Left and Alt+Right, even from the search box, and the mouse back and forward buttons', () => {
    act(() => openHelp('shapes'));
    act(() => openHelp('text'));
    alt('ArrowLeft');
    expect(title()).toContain('Shapes');
    alt('ArrowRight');
    expect(title()).toContain('Text');
    const aside = document.querySelector('.help-drawer')!;
    const up = (button: number) => act(() => void aside.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true, cancelable: true })));
    up(3);
    expect(title()).toContain('Shapes');
    up(4);
    expect(title()).toContain('Text');
  });

  it('shows a Back to general help line for context help, which goes to the welcome page', () => {
    act(() => openHelp('charts', undefined, 'Chart layer'));
    const line = document.querySelector('.help-context')!;
    expect(line.textContent).toContain('Help for Chart layer');
    click(line.querySelector('button')!);
    expect(title()).toContain('Welcome');
    expect(document.querySelector('.help-context')).toBeNull();
  });

  it('Shift+F1 opens the context help, ? the shortcuts sheet; F1 opens the search, and so does Ctrl+K where there is no command palette', async () => {
    const { setContextHelp } = await import('../src/help/Help');
    setContextHelp(() => openHelp('charts', undefined, 'Chart layer'));
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', shiftKey: true, bubbles: true, cancelable: true })));
    expect(title()).toContain('Chart');
    const { closeShortcuts, shortcutsOpen } = await import('../src/lib/shortcuts-sheet');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })));
    expect(shortcutsOpen()).toBe(true);
    closeShortcuts();
    expect(document.querySelector('.quick-help-backdrop')).toBeNull();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true })));
    expect(document.querySelector('.quick-help-backdrop')).toBeTruthy();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(document.querySelector('.quick-help-backdrop')).toBeTruthy();
    setContextHelp(null);
  });

  it('helpHome, helpBack and helpForward work without the buttons', () => {
    act(() => openHelp('shapes'));
    act(() => helpHome());
    act(() => helpBack());
    expect(title()).toContain('Shapes');
    act(() => helpForward());
    expect(title()).toContain('Welcome');
  });
});
