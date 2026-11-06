import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Artboard, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { LeftPanel } from '../src/panels/LeftPanel';
import { filterLayers, referenceFill, referenceFont, sameFill, sameFont, selectSameItems } from '../src/lib/layer-find';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
};

const solid = (color: string) => ({ type: 'solid', color }) as never;
const node = (type: string, props: Record<string, unknown>): SceneNode => createNode(type as never, props as never);

// Back to front: Card group (Title text, Body text with runs, Badge rect), Bg rect, Hero text. Plus a second artboard.
function build() {
  const p = createProject('T');
  const title = node('text', { name: 'Title', text: 'Welcome home', fontFamily: 'Lora', color: '#112233' });
  const body = node('text', { name: 'Body', text: 'Say hello', fontFamily: 'Inter', color: '#112233', runs: [{ text: 'Say ' }, { text: 'hello', fontFamily: 'Lora' }] });
  const badge = node('rect', { name: 'Badge', fill: solid('#FF0000') });
  const card = node('group', { name: 'Card' });
  (card as unknown as { children: SceneNode[] }).children = [title, body, badge];
  const bg = node('rect', { name: 'Bg', fill: solid('#ff0000'), fills: [solid('#00ff00')] });
  const hero = node('text', { name: 'Hero', text: 'Big', fontFamily: 'Lora', color: '#ffffff' });
  p.artboards[0].name = 'Home';
  p.artboards[0].children.push(card, bg, hero);
  return { p, ab: p.artboards[0] as Artboard, ids: { title: title.id, body: body.id, badge: badge.id, card: card.id, bg: bg.id, hero: hero.id } };
}

describe('layer search', () => {
  it('matches names, keeps the groups above a hit, and reads text only when asked', () => {
    const { p, ab, ids } = build();
    const byName = filterLayers([ab], 'BADGE', false);
    expect([...byName.hits]).toEqual([ids.badge]);
    expect(byName.keep.has(ids.card)).toBe(true);
    expect(byName.keep.has(ids.hero)).toBe(false);
    expect(filterLayers([ab], 'welcome', false).hits.size).toBe(0);
    expect([...filterLayers([ab], 'welcome', true).hits]).toEqual([ids.title]);
    // Words that only exist across rich-text runs
    expect([...filterLayers([ab], 'say hello', true).hits]).toEqual([ids.body]);
    expect(filterLayers([ab], 'home', false).artboards.has(ab.id)).toBe(true);
    expect(filterLayers([ab], '  ', true).keep.size).toBe(0);
    expect(p.artboards.length).toBe(1);
  });
});

describe('select same', () => {
  it('fill: any of a layer\'s fills counts, case does not matter, a text colour is a fill, locked layers stay out', () => {
    const { ab, ids } = build();
    const bg = ab.children.find((n) => n.id === ids.bg)!;
    expect(referenceFill(bg)).toBe('solid:#ff0000');
    expect(sameFill(ab, 'solid:#ff0000').sort()).toEqual([ids.badge, ids.bg].sort());
    // The second fill of Bg is reachable too
    expect(sameFill(ab, 'solid:#00ff00')).toEqual([ids.bg]);
    expect(sameFill(ab, 'solid:#112233').sort()).toEqual([ids.title, ids.body].sort());
    const badge = (ab.children.find((n) => n.id === ids.card) as unknown as { children: SceneNode[] }).children.find((n) => n.id === ids.badge)!;
    badge.locked = true;
    expect(sameFill(ab, 'solid:#ff0000')).toEqual([ids.bg]);
  });

  it('font: a rich-text run in the font counts, a rect has none', () => {
    const { ab, ids } = build();
    const hero = ab.children.find((n) => n.id === ids.hero)!;
    expect(referenceFont(hero)).toBe('Lora');
    expect(sameFont(ab, 'Lora').sort()).toEqual([ids.title, ids.body, ids.hero].sort());
    expect(sameFont(ab, 'Inter')).toEqual([ids.body]);
    expect(referenceFont(ab.children.find((n) => n.id === ids.bg)!)).toBeNull();
    const items = selectSameItems(ab, ab.children.find((n) => n.id === ids.bg)!);
    expect(items.map((i) => ('disabled' in i ? i.disabled : null))).toEqual([false, true]);
  });

  it('the menu item selects through the store', () => {
    const { p, ab, ids } = build();
    const s = new EditorStore(p);
    setCurrentStore(s);
    const items = selectSameItems(ab, ab.children.find((n) => n.id === ids.hero)!);
    const fontItem = items.find((i) => 'label' in i && i.label === 'Select same font') as { onClick: () => void };
    fontItem.onClick();
    expect([...s.get().selection].sort()).toEqual([ids.title, ids.body, ids.hero].sort());
    expect(s.get().activeArtboardId).toBe(ab.id);
  });
});

describe('Layers panel filter', () => {
  let root: Root;
  let host: HTMLElement;
  let ids: ReturnType<typeof build>['ids'];
  let s: EditorStore;
  beforeEach(() => {
    const b = build();
    ids = b.ids;
    s = new EditorStore(b.p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<LeftPanel />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const names = () => [...host.querySelectorAll('.layer-row .layer-name')].map((e) => e.textContent);
  const type = (v: string) => {
    const input = host.querySelector('.layers-search input') as HTMLInputElement;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('shows the hit under its group, even when the group is collapsed, and says how many', () => {
    expect(names()).toEqual(['Hero', 'Bg', 'Card', 'Badge', 'Body', 'Title']);
    const card = [...host.querySelectorAll('.layer-row')].find((r) => r.textContent?.includes('Card')) as HTMLElement;
    act(() => void (card.querySelector('button.twisty') as HTMLElement).click());
    expect(names()).toEqual(['Hero', 'Bg', 'Card']);
    type('badge');
    expect(names()).toEqual(['Card', 'Badge']);
    expect(host.querySelector('.layers-search-count')!.textContent).toBe('1 match');
    expect(host.querySelector('.layer-row.not-a-hit .layer-name')!.textContent).toBe('Card');
    expect(host.querySelector('.layer-row')!.getAttribute('draggable')).toBe('false');
    type('zzz');
    expect(names()).toEqual([]);
    expect(host.querySelector('.layers-search-count')!.textContent).toBe('No layers match');
    type('');
    expect(names()).toEqual(['Hero', 'Bg', 'Card']);
    expect(host.querySelector('.layers-search-count')).toBeNull();
  });

  it('the Text toggle adds the words, and a filtered row still selects', () => {
    type('welcome');
    expect(names()).toEqual([]);
    act(() => void (host.querySelector('.layers-search-text') as HTMLElement).click());
    expect(names()).toEqual(['Card', 'Title']);
    const title = [...host.querySelectorAll('.layer-row')].find((r) => r.textContent?.includes('Title')) as HTMLElement;
    act(() => void title.click());
    expect(s.get().selection).toEqual([ids.title]);
  });

  it('right-click on a row opens Select same fill and font', () => {
    const hero = [...host.querySelectorAll('.layer-row')].find((r) => r.textContent?.includes('Hero')) as HTMLElement;
    act(() => void hero.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const labels = [...document.querySelectorAll('.ctx-menu button')].map((b) => b.textContent);
    expect(labels.some((l) => l?.includes('Select same fill'))).toBe(true);
    expect(labels.some((l) => l?.includes('Select same font'))).toBe(true);
    const font = [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent?.includes('Select same font')) as HTMLElement;
    act(() => void font.click());
    expect(s.get().selection.length).toBe(3);
  });
});
