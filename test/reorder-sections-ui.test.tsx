import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Section } from '../src/components/ui';
import { PropSearchProvider, PropSearchStore } from '../src/lib/prop-search';
import { SectionOrderScope, groupKeys, sectionPlace } from '../src/lib/section-order';
import { getOrder, resetOrder, setOrder } from '../src/lib/reorder';
import { reloadSectionFolds } from '../src/lib/section-fold';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  setPrefs({ sectionOrder: {}, toolOrder: {} });
  reloadSectionFolds();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await Promise.resolve()));
const panel = (extra: ReactNode = null, query = '', scope: string | null = 'test') => {
  const store = new PropSearchStore();
  store.setQuery(query);
  return (
    <PropSearchProvider value={store}>
      <aside className={`inspector${query ? ' ps-on' : ''}`}>
        <SectionOrderScope.Provider value={scope}>
          <Section title="Alpha">
            <div data-prop="a">a</div>
          </Section>
          <div className="note">between</div>
          <Section title="Beta">
            <div data-prop="b">b</div>
          </Section>
          <Section id="gamma-id" title="Gamma">
            <div data-prop="g">g</div>
          </Section>
          {extra}
        </SectionOrderScope.Provider>
      </aside>
    </PropSearchProvider>
  );
};
const aside = () => host.querySelector<HTMLElement>('aside')!;
const sec = (key: string) => host.querySelector<HTMLElement>(`.section[data-reorder-key="${key}"]`)!;
const orders = () => [...aside().children].map((c) => (c as HTMLElement).style.order);
const press = (key: string, el: Element, init: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })));
const title = (key: string) => sec(key).querySelector<HTMLElement>('.section-title')!;
const announced = () => document.querySelector('[data-announce]')?.textContent?.trim();

describe('sections in the person\'s order', () => {
  it('changes nothing for someone who has not moved a section', async () => {
    act(() => root.render(panel()));
    await flush();
    expect(orders()).toEqual(['', '', '', '']);
    expect(aside().classList.contains('reordered')).toBe(false);
  });

  it('puts the sections in the saved order, in the places the sections hold, and leaves what is between them where it is', async () => {
    setOrder('sectionOrder', 'test', ['gamma-id', 'Alpha']);
    act(() => root.render(panel()));
    await flush();
    //children: Alpha, note, Beta, Gamma. Gamma and Alpha swap places; the note and Beta keep theirs
    expect(orders()).toEqual(['3', '1', '2', '0']);
    expect(aside().classList.contains('reordered')).toBe(true);
  });

  it('keeps a section nobody has moved in its own place when a new one appears', async () => {
    setOrder('sectionOrder', 'test', ['gamma-id', 'Alpha']);
    act(() => root.render(panel()));
    await flush();
    act(() => root.render(panel(<Section title="Delta">d</Section>)));
    await flush();
    expect(orders()).toEqual(['3', '1', '2', '0', '4']);
  });

  it('follows a change to the saved order straight away, and a reset puts everything back', async () => {
    act(() => root.render(panel()));
    await flush();
    act(() => setOrder('sectionOrder', 'test', ['Beta', 'gamma-id', 'Alpha']));
    await flush();
    expect(orders()).toEqual(['3', '1', '0', '2']);
    act(() => resetOrder('sectionOrder', 'test'));
    await flush();
    expect(orders()).toEqual(['', '', '', '']);
    expect(aside().classList.contains('reordered')).toBe(false);
  });

  it('gives each panel kind its own order', async () => {
    setOrder('sectionOrder', 'other', ['gamma-id', 'Alpha']);
    act(() => root.render(panel()));
    await flush();
    expect(orders()).toEqual(['', '', '', '']);
  });

  it('leaves the order alone while the properties search is open (it sorts by match then)', async () => {
    setOrder('sectionOrder', 'test', ['gamma-id', 'Alpha']);
    act(() => root.render(panel(null, 'a')));
    await flush();
    expect(aside().classList.contains('reordered')).toBe(false);
    expect(sec('Alpha').querySelector('.section-grip')).toBeNull();
  });

  it('labels the keys and tells a screen reader what moved', async () => {
    act(() => root.render(panel()));
    await flush();
    expect(title('Alpha').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp Alt+ArrowDown');
    expect(title('Alpha').title).toContain('Alt+Up');
    press('ArrowDown', title('Alpha'), { altKey: true });
    await flush();
    expect(announced()).toBe('Alpha moved to position 2 of 3');
  });
});

describe('moving with the keyboard', () => {
  it('moves a section down with Alt+Down and up with Alt+Up, and saves the order', async () => {
    act(() => root.render(panel()));
    await flush();
    press('ArrowDown', title('Alpha'), { altKey: true });
    await flush();
    expect(getOrder('sectionOrder', 'test')).toEqual(['Beta', 'Alpha', 'gamma-id']);
    expect(orders()).toEqual(['2', '1', '0', '3']);
    press('ArrowUp', title('gamma-id'), { altKey: true });
    await flush();
    expect(getOrder('sectionOrder', 'test')).toEqual(['Beta', 'gamma-id', 'Alpha']);
  });

  it('says so at either end instead of moving', async () => {
    act(() => root.render(panel()));
    await flush();
    press('ArrowUp', title('Alpha'), { altKey: true });
    expect(announced()).toBe('Alpha is already first');
    press('ArrowDown', title('gamma-id'), { altKey: true });
    expect(announced()).toBe('Gamma is already last');
    expect(getOrder('sectionOrder', 'test')).toBeUndefined();
  });

  it('ignores the arrows without Alt, and Alt with other keys', async () => {
    act(() => root.render(panel()));
    await flush();
    press('ArrowDown', title('Alpha'));
    press('ArrowDown', title('Alpha'), { altKey: true, shiftKey: true });
    press('Enter', title('Alpha'), { altKey: true });
    expect(getOrder('sectionOrder', 'test')).toBeUndefined();
  });

  it('keeps the unmoved sections of a panel that has more sections than the person ever saw', async () => {
    act(() => root.render(panel()));
    await flush();
    press('ArrowDown', title('Alpha'), { altKey: true });
    await flush();
    act(() => root.render(panel(<Section title="Delta">d</Section>)));
    await flush();
    //Delta is new: it stays last while Alpha and Beta keep the order the person chose
    expect(groupKeys(aside()).keys).toEqual(['Alpha', 'Beta', 'gamma-id', 'Delta']);
    expect(orders()).toEqual(['2', '1', '0', '3', '4']);
  });
});

describe('a section outside any panel kind', () => {
  it('has no grip, no key and no moving', async () => {
    act(() => root.render(panel(null, '', null)));
    await flush();
    expect(host.querySelectorAll('[data-reorder-key]').length).toBe(0);
    expect(host.querySelector('.section-grip')).toBeNull();
    const t = host.querySelector<HTMLElement>('.section-title')!;
    expect(t.getAttribute('aria-keyshortcuts')).toBeNull();
    press('ArrowDown', t, { altKey: true });
    expect(getOrder('sectionOrder', 'test')).toBeUndefined();
  });
});

describe('the right-click menu', () => {
  const menu = () => [...document.querySelectorAll<HTMLElement>('.ctx-menu button, .ctx-menu [role="menuitem"]')];
  const rightClick = (key: string) => act(() => void sec(key).querySelector('.section-title-row')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })));

  it('has Move up and Move down, with the end ones off, and a way back to the default order', async () => {
    act(() => root.render(panel()));
    await flush();
    rightClick('Alpha');
    const items = menu();
    const up = items.find((b) => b.textContent?.startsWith('Move this section up')) as HTMLButtonElement;
    const down = items.find((b) => b.textContent?.startsWith('Move this section down')) as HTMLButtonElement;
    expect(up.disabled || up.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(down.disabled || down.getAttribute('aria-disabled') === 'true').toBe(false);
    act(() => down.click());
    await flush();
    expect(getOrder('sectionOrder', 'test')).toEqual(['Beta', 'Alpha', 'gamma-id']);
    rightClick('Beta');
    act(() => (menu().find((b) => b.textContent?.startsWith('Back to the default section order')) as HTMLElement).click());
    await flush();
    expect(getOrder('sectionOrder', 'test')).toBeUndefined();
  });

  it('reports where a section sits', async () => {
    act(() => root.render(panel()));
    await flush();
    expect(sectionPlace(sec('Beta'))).toEqual({ index: 1, count: 3, scope: 'test' });
  });
});

describe('dragging a section by its title', () => {
  // jsdom has no layout: each section is given a box, stacked 40px apart in the order the page shows them
  const lay = () => {
    const els = [...aside().querySelectorAll<HTMLElement>('.section')];
    els
      .slice()
      .sort((a, b) => Number(a.style.order || els.indexOf(a)) - Number(b.style.order || els.indexOf(b)))
      .forEach((e, i) => (e.getBoundingClientRect = () => ({ left: 0, right: 200, top: i * 40, bottom: i * 40 + 30, width: 200, height: 30, x: 0, y: i * 40, toJSON: () => ({}) })));
  };
  const fire = (target: EventTarget, type: string, x: number, y: number, extra: { pointerType?: string; button?: number } = {}) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: extra.button ?? 0 });
    if (extra.pointerType) Object.defineProperty(e, 'pointerType', { value: extra.pointerType });
    act(() => void target.dispatchEvent(e));
  };
  const row = (key: string) => sec(key).querySelector<HTMLElement>('.section-title-row')!;

  it('moves a section to the gold line when it is let go, and saves it', async () => {
    act(() => root.render(panel()));
    await flush();
    lay();
    fire(row('Alpha'), 'pointerdown', 20, 10);
    fire(window, 'pointermove', 20, 40);
    //a gold line and a label while it is carried, and the section dims
    expect(document.querySelector('.reorder-line')).toBeTruthy();
    expect(document.querySelector('.reorder-ghost')!.textContent).toBe('Alpha');
    expect(sec('Alpha').classList.contains('reorder-lifted')).toBe(true);
    fire(window, 'pointermove', 20, 200);
    fire(window, 'pointerup', 20, 200);
    await flush();
    expect(document.querySelector('.reorder-line')).toBeNull();
    expect(sec('Alpha').classList.contains('reorder-lifted')).toBe(false);
    expect(getOrder('sectionOrder', 'test')).toEqual(['Beta', 'gamma-id', 'Alpha']);
    expect(announced()).toBe('Alpha moved to position 3 of 3');
  });

  it('is only a click until it moves a few pixels', async () => {
    act(() => root.render(panel()));
    await flush();
    lay();
    fire(row('Alpha'), 'pointerdown', 20, 10);
    fire(window, 'pointermove', 22, 12);
    fire(window, 'pointerup', 22, 12);
    expect(document.querySelector('.reorder-line')).toBeNull();
    expect(getOrder('sectionOrder', 'test')).toBeUndefined();
  });

  it('puts everything back on Escape', async () => {
    act(() => root.render(panel()));
    await flush();
    lay();
    fire(row('Alpha'), 'pointerdown', 20, 10);
    fire(window, 'pointermove', 20, 200);
    expect(document.querySelector('.reorder-line')).toBeTruthy();
    press('Escape', window as unknown as Element);
    fire(window, 'pointerup', 20, 200);
    expect(document.querySelector('.reorder-line')).toBeNull();
    expect(document.body.classList.contains('reorder-active')).toBe(false);
    expect(getOrder('sectionOrder', 'test')).toBeUndefined();
  });

  it('does not fold the section it was dropped from', async () => {
    act(() => root.render(panel()));
    await flush();
    lay();
    const open = () => title('Alpha').getAttribute('aria-expanded');
    const before = open();
    fire(row('Alpha'), 'pointerdown', 20, 10);
    fire(window, 'pointermove', 20, 200);
    fire(window, 'pointerup', 20, 200);
    fire(title('Alpha'), 'click', 20, 200);
    expect(open()).toBe(before);
  });

  it('ignores touch (it scrolls the panel) and the right button', async () => {
    act(() => root.render(panel()));
    await flush();
    lay();
    fire(row('Alpha'), 'pointerdown', 20, 10, { pointerType: 'touch' });
    fire(window, 'pointermove', 20, 200, { pointerType: 'touch' });
    expect(document.querySelector('.reorder-line')).toBeNull();
    fire(row('Alpha'), 'pointerdown', 20, 10, { button: 2 });
    fire(window, 'pointermove', 20, 200);
    expect(document.querySelector('.reorder-line')).toBeNull();
  });
});

describe('Preferences: Reset section and tool order', () => {
  it('is off until something has been moved, then puts everything back and says so', async () => {
    const { PrefsModal } = await import('../src/components/PrefsModal');
    act(() => root.render(<PrefsModal workspace page="workspace" onClose={() => undefined} />));
    const btn = () => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Section and tool order"] button')].find((b) => b.textContent === 'Reset section and tool order')!;
    expect(btn().disabled).toBe(true);
    act(() => {
      setOrder('sectionOrder', 'page', ['a']);
      setOrder('toolOrder', 'groups', ['draw']);
    });
    expect(btn().disabled).toBe(false);
    act(() => btn().click());
    expect(getOrder('sectionOrder', 'page')).toBeUndefined();
    expect(getOrder('toolOrder', 'groups')).toBeUndefined();
    expect(btn().disabled).toBe(true);
    expect(announced()).toBe('Sections and tools are back in their default order');
  });
});
