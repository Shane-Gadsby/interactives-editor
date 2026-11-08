import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createArtboard, createNode, createProject, Player, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { newProjectWithThemes } from '../src/lib/themes';
import { addPageNavigation, hasOwnNavigation, NAV_STYLES, navPages, PAGE_NAV_TAG, removePageNav, type NavStyle } from '../src/lib/page-nav';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { contentBox } from '../src/lib/branded/kit';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Four pages of a plain themed project. */
function book(pages = 4): Project {
  const p = newProjectWithThemes('Book');
  p.artboards = Array.from({ length: pages }, (_, i) => createArtboard({ id: `p${i + 1}`, name: `Page ${i + 1}`, width: 800, height: 500, canvasX: i * 900 }));
  p.settings.startArtboardId = 'p1';
  return p;
}
const names = (ab: Artboard) => ab.children.map((c) => c.name);
const all = (p: Project) => p.artboards.map((a) => a.id);
const layer = (ab: Artboard, name: string) => ab.children.find((c) => c.name === name) as SceneNode & { x: number; y: number; width: number; height: number };

describe('page navigation generator', () => {
  const expected: Record<NavStyle, string[]> = {
    'back-next': ['Back button', 'Next button', 'Page counter'],
    next: ['Next button'],
    dots: ['Back button', 'Next button', 'Page dot 1', 'Page dot 2', 'Page dot 3', 'Page dot 4'],
    progress: ['Back button', 'Next button', 'Page counter', 'Page progress'],
    number: ['Page counter'],
  };
  for (const style of NAV_STYLES.map((s) => s.id)) {
    it(`${style}: the layers it should have, in a bottom bar inside the page`, () => {
      const p = book();
      const r = addPageNavigation(p, all(p), style);
      expect(r.added).toHaveLength(4);
      for (const ab of p.artboards) {
        expect(names(ab)).toEqual(expected[style]);
        for (const l of ab.children) {
          expect(l.x).toBeGreaterThanOrEqual(0);
          expect(l.x + l.width).toBeLessThanOrEqual(ab.width);
          //the bottom bar: in the lower part of the page
          expect(l.y + l.height).toBeLessThanOrEqual(ab.height);
          expect(l.y).toBeGreaterThan(ab.height * 0.7);
        }
      }
    });
  }

  it('puts Back on the left, Next (the primary one) on the right and the counter between', () => {
    const p = book();
    addPageNavigation(p, all(p), 'back-next');
    const ab = p.artboards[1];
    const back = layer(ab, 'Back button');
    const next = layer(ab, 'Next button');
    const counter = layer(ab, 'Page counter');
    expect(back.x).toBeLessThan(counter.x);
    expect(counter.x + counter.width).toBeLessThanOrEqual(next.x);
    expect(back.y).toBe(next.y);
    expect((next as unknown as { fill: { color: string } }).fill.color).toMatch(/^token:/);
    expect(ab.children.every((c) => (c as unknown as { tags: string[] }).tags.includes(PAGE_NAV_TAG))).toBe(true);
  });

  it('shows Back from the second page and Next until the last, with the count from the page order', () => {
    const p = book();
    addPageNavigation(p, all(p), 'back-next');
    expect(layer(p.artboards[0], 'Back button').bindings).toEqual({ visible: 'pageNumber > 1' });
    expect(layer(p.artboards[0], 'Next button').bindings).toEqual({ visible: 'pageNumber < pageCount' });
    expect((layer(p.artboards[0], 'Page counter') as unknown as { text: string }).text).toBe('Page {pageNumber} of {pageCount}');
  });

  it('wires Next and Back as ordinary click events and Go to artboard nodes', () => {
    const p = book();
    addPageNavigation(p, ['p2'], 'back-next');
    const ab = p.artboards[1];
    const events = ab.logic.nodes.filter((n) => n.kind === 'event.pointer');
    expect(events.map((e) => [e.params.type, e.note]).sort()).toEqual([['click', 'Next page'], ['click', 'Previous page']]);
    const go = ab.logic.nodes.filter((n) => n.kind === 'action.artboard');
    expect(go.map((n) => n.params.to).sort()).toEqual(['next', 'previous']);
    for (const e of ab.logic.edges) expect(ab.logic.nodes.some((n) => n.id === e.from) && ab.logic.nodes.some((n) => n.id === e.to)).toBe(true);
    expect(p.artboards[0].children).toHaveLength(0);
  });

  it('fills the dot for this page and no other', () => {
    const p = book();
    addPageNavigation(p, all(p), 'dots');
    p.artboards.forEach((ab, i) => {
      const fills = [1, 2, 3, 4].map((n) => (layer(ab, `Page dot ${n}`) as unknown as { fill: { color: string } }).fill.color);
      const mine = fills[i];
      expect(fills.filter((f) => f === mine)).toHaveLength(1);
    });
  });

  it('swaps the style when run again, and leaves nothing of the old one behind', () => {
    const p = book();
    const mine = createNode('rect', { id: 'mine', name: 'My own shape', x: 0, y: 0, width: 10, height: 10 });
    p.artboards[0].children.push(mine);
    addPageNavigation(p, all(p), 'progress');
    addPageNavigation(p, all(p), 'next');
    expect(names(p.artboards[0])).toEqual(['My own shape', 'Next button']);
    const ab = p.artboards[0];
    expect(ab.logic.nodes.filter((n) => n.kind === 'event.pointer')).toHaveLength(1);
    expect(ab.logic.nodes.filter((n) => n.kind === 'action.artboard')).toHaveLength(1);
    //only edges between nodes that exist
    expect(ab.logic.edges).toHaveLength(1);
  });

  it('removes only what it made, with its clicks, and keeps the author\'s own graph', () => {
    const p = book();
    p.artboards[0].logic.nodes.push({ id: 'keep', kind: 'event.start', x: 0, y: 0, params: {} });
    addPageNavigation(p, all(p), 'back-next');
    expect(removePageNav(p.artboards[0])).toBe(true);
    expect(p.artboards[0].children).toHaveLength(0);
    expect(p.artboards[0].logic.nodes.map((n) => n.id)).toEqual(['keep']);
    expect(p.artboards[0].logic.edges).toHaveLength(0);
    expect(removePageNav(p.artboards[0])).toBe(false);
  });

  it('leaves a page with its own Next or Back button alone, and says so', () => {
    const p = book();
    p.artboards[2].children.push(createNode('button', { name: 'Next button', label: 'Next', x: 0, y: 0, width: 100, height: 40 }));
    const r = addPageNavigation(p, all(p), 'back-next');
    expect(r.added).toEqual(['Page 1', 'Page 2', 'Page 4']);
    expect(r.skipped).toEqual([{ page: 'Page 3', why: 'it already has its own Next or Back button' }]);
    expect(hasOwnNavigation(p.artboards[2])).toBe(true);
    expect(p.artboards[2].children).toHaveLength(1);
  });

  it('leaves out masters, narrow versions and hidden pages, and has nothing to add for a single page', () => {
    const p = book(2);
    p.artboards.push(createArtboard({ id: 'm', name: 'Master', isMaster: true }), createArtboard({ id: 'n', name: 'Narrow', variantOf: 'p1' }), createArtboard({ id: 'h', name: 'Hidden', canvasHidden: true }));
    expect(navPages(p).map((a) => a.id)).toEqual(['p1', 'p2']);
    const lone = book(1);
    const r = addPageNavigation(lone, all(lone), 'back-next');
    expect(r.added).toEqual([]);
    expect(r.skipped[0].why).toMatch(/only page/);
    //the page number alone is fine on any page
    expect(addPageNavigation(lone, all(lone), 'number').added).toEqual(['Page 1']);
  });

  it('falls back to a plain counter when there are too many pages for dots', () => {
    const p = book(60);
    addPageNavigation(p, ['p1'], 'dots');
    expect(names(p.artboards[0])).toEqual(['Back button', 'Next button', 'Page counter']);
  });

  it('uses the project\'s own colour tokens so it follows the theme (and plain colours when there are none)', () => {
    const themed = book();
    addPageNavigation(themed, ['p1'], 'back-next');
    expect(JSON.stringify(themed.artboards[0].children)).toMatch(/token:/);
    const bare = createProject('Bare');
    bare.artboards = ['a', 'b'].map((id) => createArtboard({ id, name: id, width: 600, height: 400 }));
    addPageNavigation(bare, ['a'], 'back-next');
    expect(JSON.stringify(bare.artboards[0].children)).not.toMatch(/token:/);
  });

  it('narrow pages get smaller buttons that still fit', () => {
    const p = book();
    p.artboards.forEach((a) => (a.width = 360));
    addPageNavigation(p, all(p), 'back-next');
    const ab = p.artboards[0];
    expect(layer(ab, 'Next button').x + layer(ab, 'Next button').width).toBeLessThanOrEqual(360);
    expect(layer(ab, 'Page counter').width).toBeGreaterThan(40);
  });

  it('on a branded page the bar sits at the bottom of the content box, clear of the footer and logo', () => {
    const start = BRANDED_STARTERS.find((st) => st.key === 'story/slideshow') ?? BRANDED_STARTERS.find((st) => st.set === 'story') ?? BRANDED_STARTERS[0];
    const project = projectFromBrandedStarter(start, COLOURWAYS[0]);
    const page = project.artboards.find((a) => !a.isMaster && !hasOwnNavigation(a))!;
    const before = page.children.length;
    addPageNavigation(project, [page.id], 'back-next');
    const box = contentBox(page);
    const next = layer(page, 'Next button');
    expect(page.children.length).toBeGreaterThan(before);
    expect(next.y + next.height).toBe(box.y + box.height);
    expect(next.x + next.width).toBe(box.x + box.width);
  });
});

describe('page navigation in the editor and in the player', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:500px"></div>';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('goes through the store as one undoable change', () => {
    const store = new EditorStore(book());
    setCurrentStore(store);
    store.update((d) => void addPageNavigation(d as Project, all(d as Project), 'back-next'));
    expect(names(store.get().project.artboards[0])).toContain('Next button');
    store.undo();
    expect(store.get().project.artboards[0].children).toHaveLength(0);
  });

  it('the Next button takes a learner to the next page, and Back to the one before', async () => {
    const p = book();
    addPageNavigation(p, all(p), 'back-next');
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 10));
    const click = (name: string) => {
      const ab = p.artboards.find((a) => a.name === player.artboard.name)!;
      const id = layer(ab, name).id;
      document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.click();
    };
    expect(player.artboard.name).toBe('Page 1');
    click('Next button');
    await new Promise((r) => setTimeout(r, 20));
    expect(player.artboard.name).toBe('Page 2');
    click('Next button');
    await new Promise((r) => setTimeout(r, 20));
    click('Back button');
    await new Promise((r) => setTimeout(r, 20));
    expect(player.artboard.name).toBe('Page 2');
  });

  it('the section offers every style, adds to this page or all, and reports what it left alone', async () => {
    const { PageNavSection } = await import('../src/panels/PageNavSection');
    const p = book();
    p.artboards[1].children.push(createNode('button', { name: 'Back', label: 'Back', x: 0, y: 0, width: 100, height: 40 }));
    const store = new EditorStore(p);
    setCurrentStore(store);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const show = () => act(() => root.render(<PageNavSection ids={['p1']} project={store.get().project} />));
    show();
    //open by default while the project has pages and none has navigation yet
    expect(host.querySelector('.section-title')!.getAttribute('aria-expanded')).toBe('true');
    const radios = [...host.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((r) => r.querySelector('strong')!.textContent)).toEqual(NAV_STYLES.map((s) => s.label));
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    act(() => radios[2].click());
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Add to all 4 pages')!.click());
    expect(names(store.get().project.artboards[0])).toContain('Page dot 1');
    expect(host.querySelector('[role="status"]')!.textContent).toMatch(/Added to 3 pages\. Left alone: Page 2 \(it already has its own Next or Back button\)/);
    act(() => root.unmount());
    host.remove();
  });
});
