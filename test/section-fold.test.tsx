import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { Section } from '../src/components/ui';
import { PropSearchProvider, PropSearchStore } from '../src/lib/prop-search';
import { reloadSectionFolds, isSectionOpen } from '../src/lib/section-fold';
import { sectionTags } from './helpers/sections-scan';

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
  reloadSectionFolds();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const head = (title: string) => [...host.querySelectorAll<HTMLElement>('.section-title')].find((b) => b.textContent?.trim() === title)!;
const open = (title: string) => head(title).getAttribute('aria-expanded') === 'true';
const click = (el: Element, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })));
const stored = () => JSON.parse(localStorage.getItem('ix-section-folds') ?? '{}') as Record<string, boolean>;

describe('every Section has a stable fold key', () => {
  const tags = sectionTags();
  it('finds the sections in the source', () => expect(tags.length).toBeGreaterThan(60));
  it('has a plain-text title or an explicit id', () => {
    const bad = tags.filter((t) => t.title === null && !t.id).map((t) => `${t.file}:${t.line}`);
    expect(bad).toEqual([]);
  });
  it('gives no two explicit ids the same name', () => {
    const ids = tags.filter((t) => t.id).map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe('the fold memory', () => {
  const tree = (query = '') => {
    const store = new PropSearchStore();
    store.setQuery(query);
    return (
      <PropSearchProvider value={store}>
        <Section title="Alpha">
          <div data-prop="a">a</div>
        </Section>
        <Section title="Beta" defaultOpen={false}>
          <div data-prop="b">b</div>
        </Section>
        <Section title="Count 3" id="count" actions={<button className="plus">+</button>} defaultOpen={false}>
          <div data-prop="c">c</div>
        </Section>
      </PropSearchProvider>
    );
  };

  it('keeps a fold when the sections are mounted again, and only stores what differs from the default', () => {
    act(() => root.render(tree()));
    expect([open('Alpha'), open('Beta')]).toEqual([true, false]);
    click(head('Alpha'));
    click(head('Beta'));
    expect(stored()).toEqual({ Alpha: false, Beta: true });
    act(() => root.unmount());
    root = createRoot(host);
    reloadSectionFolds();
    act(() => root.render(tree()));
    expect([open('Alpha'), open('Beta')]).toEqual([false, true]);
    //putting one back where its default is forgets it, so a later default can still change
    click(head('Alpha'));
    expect(stored()).toEqual({ Beta: true });
  });

  it('keys a section with a count in its title by its id', () => {
    act(() => root.render(tree()));
    click(host.querySelector('.plus')!);
    expect(stored()).toEqual({ count: true });
    expect(isSectionOpen('count', false)).toBe(true);
  });

  it('opens every section while searching, and the folds come back when it is cleared', () => {
    act(() => root.render(tree()));
    click(head('Alpha'));
    expect(open('Alpha')).toBe(false);
    act(() => root.render(tree('a')));
    expect([open('Alpha'), open('Beta')]).toEqual([true, true]);
    act(() => root.render(tree('')));
    expect([open('Alpha'), open('Beta')]).toEqual([false, false]);
  });

  it('keeps sections with defaultOpen false folded until they are opened, and the plus opens its own', () => {
    act(() => root.render(tree()));
    expect(open('Beta')).toBe(false);
    expect(open('Count 3')).toBe(false);
    click(host.querySelector('.plus')!);
    expect(open('Count 3')).toBe(true);
    expect(open('Beta')).toBe(false);
  });

  it('folds and unfolds all, from the right-click menu, and opens only one on Alt-click', () => {
    act(() => root.render(tree()));
    act(() => void head('Alpha').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const item = (label: string) => [...document.querySelectorAll<HTMLElement>('.ctx-menu [role=menuitem], .ctx-menu button')].find((b) => b.textContent?.includes(label))!;
    click(item('Unfold all'));
    expect([open('Alpha'), open('Beta'), open('Count 3')]).toEqual([true, true, true]);
    act(() => void head('Beta').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    click(item('Fold all'));
    expect([open('Alpha'), open('Beta'), open('Count 3')]).toEqual([false, false, false]);
    click(head('Beta'), { altKey: true });
    expect([open('Alpha'), open('Beta'), open('Count 3')]).toEqual([false, true, false]);
    click(head('Alpha'), { altKey: true });
    expect([open('Alpha'), open('Beta'), open('Count 3')]).toEqual([true, false, false]);
  });
});

describe('the inspector remembers folds across layers', () => {
  function scene() {
    const p: Project = createProject('T');
    const ab = p.artboards[0];
    const a = createNode('rect', { name: 'one' }) as SceneNode;
    const b = createNode('rect', { name: 'two' }) as SceneNode;
    const t = createNode('text', { name: 'words' }) as SceneNode;
    ab.children.push(a, b, t);
    const s = new EditorStore(p);
    setCurrentStore(s);
    return { s, a: a.id, b: b.id, t: t.id };
  }
  it('folding a section on one layer folds it on the next, and on a different kind of layer', () => {
    const x = scene();
    x.s.select([x.a]);
    act(() => root.render(<Inspector />));
    const titles = [...host.querySelectorAll('.section-title')].map((b) => b.textContent?.trim());
    expect(titles).toContain('Accessibility');
    const was = open('Accessibility');
    click(head('Accessibility'));
    expect(open('Accessibility')).toBe(!was);
    act(() => x.s.select([x.b]));
    expect(open('Accessibility')).toBe(!was);
    act(() => x.s.select([x.t]));
    expect(open('Accessibility')).toBe(!was);
    //the header button folds everything on screen
    act(() => void host.querySelector<HTMLElement>('.prop-fold-all')!.click());
    expect([...host.querySelectorAll('.section-title')].every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    //a section the text didn't have is on its own default; the ones it shared stay folded
    act(() => x.s.select([x.a]));
    expect(open('Accessibility')).toBe(false);
  });
  it('still opens every section while a properties search is typed', async () => {
    const x = scene();
    x.s.select([x.a]);
    act(() => root.render(<Inspector />));
    act(() => void host.querySelector<HTMLElement>('.prop-fold-all')!.click());
    const input = host.querySelector<HTMLInputElement>('.prop-search-input')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'opacity');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => void (await new Promise((r) => setTimeout(r, 120))));
    const visible = [...host.querySelectorAll('.section:not(.ps-hide) .section-title')];
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
  });
});
