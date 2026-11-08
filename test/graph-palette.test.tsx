//The Interactions panel's palette: folds that are remembered, search with chips, and the artboard picker that follows the store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG, createProject, NODE_GROUPS, uid } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DEFAULT_OPEN, FOLDS_STORAGE_KEY, allSet, filterPalette, groupKey, isOpen, loadFolds, onlyOpen, paletteGroups, saveFolds, toggled } from '../src/lib/graph-palette';
import { filterSections, pickerSections, stepTarget } from '../src/lib/artboard-picker';
import { nodeMenuItems } from '../src/lib/node-menu';
import { rankNodes } from '../src/lib/node-search';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('palette folds', () => {
  beforeEach(() => localStorage.clear());

  it('every catalog node is in exactly one palette group, in category order', () => {
    const groups = paletteGroups();
    expect(groups.flatMap((g) => g.defs).length).toBe(CATALOG.length);
    expect(new Set(groups.flatMap((g) => g.defs.map((d) => d.kind))).size).toBe(CATALOG.length);
    expect(groups.map((g) => g.category)).toEqual([...groups.map((g) => g.category)].sort((a, b) => ['event', 'action', 'logic'].indexOf(a) - ['event', 'action', 'logic'].indexOf(b)));
  });

  it('starts with events and the common actions open and the rest folded', () => {
    for (const g of paletteGroups()) expect(isOpen({}, g.key), g.key).toBe(DEFAULT_OPEN.includes(g.key));
    expect(isOpen({}, groupKey('action', 'Questions'))).toBe(false);
    expect(isOpen({}, groupKey('event', 'Pointer and keys'))).toBe(true);
  });

  it('toggles one, folds all, opens all, and leaves only one open', () => {
    const keys = paletteGroups().map((g) => g.key);
    const k = groupKey('action', 'Questions');
    expect(isOpen(toggled({}, k), k)).toBe(true);
    expect(isOpen(toggled(toggled({}, k), k), k)).toBe(false);
    expect(keys.every((x) => !isOpen(allSet(keys, false), x))).toBe(true);
    expect(keys.every((x) => isOpen(allSet(keys, true), x))).toBe(true);
    const only = onlyOpen(keys, k);
    expect(keys.filter((x) => isOpen(only, x))).toEqual([k]);
  });

  it('is remembered in this browser, and a damaged value is ignored', () => {
    const folds = { [groupKey('event', 'Pointer and keys')]: false, [groupKey('action', 'Questions')]: true };
    saveFolds(folds);
    expect(loadFolds()).toEqual(folds);
    localStorage.setItem(FOLDS_STORAGE_KEY, '{nonsense');
    expect(loadFolds()).toEqual({});
    localStorage.setItem(FOLDS_STORAGE_KEY, JSON.stringify({ a: true, b: 'yes', c: 3 }));
    expect(loadFolds()).toEqual({ a: true });
    localStorage.setItem(FOLDS_STORAGE_KEY, '[1]');
    expect(loadFolds()).toEqual({});
  });
});

describe('palette filter', () => {
  it('with nothing typed lists everything', () => {
    expect(filterPalette({ query: '', categories: [], topics: [] }).count).toBe(CATALOG.length);
  });
  it('chips narrow what the text searches, topics and categories together', () => {
    const ev = filterPalette({ query: '', categories: ['event'], topics: [] });
    expect(ev.groups.every((g) => g.category === 'event')).toBe(true);
    const drag = filterPalette({ query: '', categories: [], topics: ['Dragging'] });
    expect(drag.groups.map((g) => g.category).sort()).toEqual(['action', 'event']);
    const dragEvents = filterPalette({ query: '', categories: ['event'], topics: ['Dragging'] });
    expect(dragEvents.groups.length).toBe(1);
    const wait = filterPalette({ query: 'wait', categories: ['event'], topics: [] });
    expect(wait.count).toBeLessThan(filterPalette({ query: 'wait', categories: [], topics: [] }).count + 1);
    expect(filterPalette({ query: 'sound', categories: ['event'], topics: [] }).groups.every((g) => g.category === 'event')).toBe(true);
  });
  it('keeps only the hits, best first', () => {
    const r = filterPalette({ query: 'wait', categories: [], topics: [] });
    expect(r.groups[0].defs[0].kind).toBe('action.delay');
    expect(r.groups.flatMap((g) => g.defs).length).toBe(r.count);
  });
  it('every topic has nodes to filter to', () => {
    for (const t of NODE_GROUPS) expect(filterPalette({ query: '', categories: [], topics: [t] }).count, t).toBeGreaterThan(0);
  });
});

describe('the Add and connect menu', () => {
  it('lists the same nodes with the same summaries and synonyms the palette searches by', () => {
    const items = nodeMenuItems(() => undefined);
    const leaves = items.flatMap((i) => ('items' in i ? i.items : []));
    expect(leaves.length).toBe(CATALOG.length);
    for (const l of leaves) if ('onClick' in l) expect(l.title).toBe(CATALOG.find((d) => d.label === l.label && d.summary === l.title)?.summary);
    expect(rankNodes('goto')[0].kind).toBe('action.artboard');
  });
});

describe('artboard picker data', () => {
  const build = () => {
    const p = createProject('P');
    p.artboards[0].name = 'Home';
    const mk = (name: string, nodes = 0, extra: object = {}) => {
      const a = { ...JSON.parse(JSON.stringify(p.artboards[0])), id: uid('ab'), name, ...extra };
      a.logic = { nodes: Array.from({ length: nodes }, (_, i) => ({ id: uid('n'), kind: 'event.start', x: i, y: 0, params: {} })), edges: [] };
      p.artboards.push(a);
      return a;
    };
    p.artboardGroups = [{ id: 'g1', name: 'Quiz' }];
    const w = mk('Word', 12, { group: 'g1' });
    const x = mk('Image', 0, { group: 'g1' });
    const m = mk('Brand master', 2, { isMaster: true });
    return { p, w, x, m };
  };

  it('lists artboards by group with their node counts, and masters apart at the end', () => {
    const { p } = build();
    const sections = pickerSections(p);
    expect(sections.map((s) => s.heading)).toEqual(['Artboards', 'Quiz', 'Page masters']);
    expect(sections[1].rows.map((r) => r.label)).toEqual(['Word · 12 nodes', 'Image · no nodes yet']);
    expect(sections[2].rows[0].master).toBe(true);
  });

  it('has no headings when there are no groups or masters', () => {
    const p = createProject('P');
    expect(pickerSections(p).map((s) => s.heading)).toEqual([null]);
  });

  it('steps to the artboard before or after, stopping at the ends', () => {
    const { p, w, x } = build();
    const home = p.artboards[0].id;
    expect(stepTarget(p, home, 1)).toBe(w.id);
    expect(stepTarget(p, w.id, 1)).toBe(x.id);
    expect(stepTarget(p, w.id, -1)).toBe(home);
    expect(stepTarget(p, home, -1)).toBeNull();
  });

  it('is searched with the same matcher, by name or by group', () => {
    const { p } = build();
    const names = (q: string) => filterSections(pickerSections(p), q).flatMap((s) => s.rows.map((r) => r.name));
    expect(names('wrd')).toEqual(['Word']);
    expect(names('quiz')).toEqual(['Word', 'Image']);
    expect(names('')).toHaveLength(4);
  });
});

describe('the panel', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
    vi.unstubAllGlobals();
  });

  async function mount(more = 2) {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    p.artboards[0].name = 'Home';
    for (let i = 0; i < more; i++) {
      const a = { ...JSON.parse(JSON.stringify(p.artboards[0])), id: `ab${i}`, name: `Page ${i + 2}`, canvasX: 900 * (i + 1) };
      a.logic = { nodes: i === 0 ? [{ id: 'q', kind: 'event.start', x: 0, y: 0, params: {} }] : [], edges: [] };
      p.artboards.push(a);
    }
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    return { s };
  }
  const q = <T extends Element = HTMLElement>(sel: string) => host!.querySelector(sel) as T;
  const type = (el: HTMLInputElement, value: string) =>
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const items = () => [...host!.querySelectorAll('.palette-item')].map((b) => b.textContent);
  const fold = (name: string) => [...host!.querySelectorAll<HTMLElement>('.palette-fold')].find((b) => b.textContent?.startsWith(name))!;

  it('headings are fold buttons: expanded state, a count, Enter and Space (a button click) toggle, and it is remembered', async () => {
    await mount();
    const head = fold('Pointer and keys');
    expect(head.tagName).toBe('BUTTON');
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(head.textContent).toContain('· 4');
    expect(items()).toContain('On pointer');
    act(() => head.click());
    expect(fold('Pointer and keys').getAttribute('aria-expanded')).toBe('false');
    expect(items()).not.toContain('On pointer');
    expect(fold('Pointer and keys').textContent).toContain('· 4');
    expect(loadFolds()[groupKey('event', 'Pointer and keys')]).toBe(false);
    expect(fold('Pointer and keys').getAttribute('aria-controls')).toBeTruthy();
  });

  it('Alt+click leaves only that group open', async () => {
    await mount();
    act(() => void fold('Questions').dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true })));
    const open = [...host!.querySelectorAll<HTMLElement>('.palette-fold')].filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.textContent);
    expect(open).toHaveLength(1);
    expect(open[0]).toContain('Questions');
  });

  it('a search opens every group with a hit, then puts the folds back when it is cleared', async () => {
    await mount();
    act(() => fold('Pointer and keys').click());
    expect(items()).not.toContain('On pointer');
    type(q<HTMLInputElement>('.palette-search-input'), 'click');
    expect(items()).toContain('On pointer');
    expect(host!.querySelector('.palette-status')!.textContent).toMatch(/\d+ nodes?/);
    type(q<HTMLInputElement>('.palette-search-input'), '');
    expect(items()).not.toContain('On pointer');
    expect(fold('Pointer and keys').getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter adds the first match, Esc clears, and nothing found offers a suggestion', async () => {
    const { s } = await mount();
    const box = q<HTMLInputElement>('.palette-search-input');
    type(box, 'wait');
    const before = s.get().project.artboards[0].logic.nodes.length;
    act(() => void box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const nodes = s.get().project.artboards[0].logic.nodes;
    expect(nodes.length).toBe(before + 1);
    expect(nodes[nodes.length - 1].kind).toBe('action.delay');
    act(() => void box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(box.value).toBe('');
    type(box, 'artbaord zzz');
    expect(host!.querySelector('.palette-status')!.textContent).toContain('No node called');
    type(box, 'artbaord');
    expect(items()).toEqual(['Go to artboard']);
  });

  it('/ and Ctrl+F focus the search from the graph, and an artboard key steps through the artboards', async () => {
    const { s } = await mount();
    const canvas = q('.logic-canvas');
    canvas.focus();
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(q('.palette-search-input'));
    (q('.palette-search-input') as HTMLElement).blur();
    canvas.focus();
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(q('.palette-search-input'));
    const first = s.get().project.artboards[0].id;
    canvas.focus();
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true })));
    expect(s.get().activeArtboardId).toBe('ab0');
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ']', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(s.get().activeArtboardId).toBe('ab1');
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true })));
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '[', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(s.get().activeArtboardId).toBe(first);
  });

  it('the picker shows the open artboard, follows the store both ways, and a pick is not a document change', async () => {
    const { s } = await mount();
    const btn = () => q('.ab-picker-btn');
    expect(btn().textContent).toContain('Home');
    expect(btn().textContent).toContain('no nodes yet');
    act(() => s.set({ activeArtboardId: 'ab0' }));
    expect(btn().textContent).toContain('Page 2');
    expect(btn().textContent).toContain('1 node');
    const rev = s.get().project;
    act(() => btn().click());
    const rows = [...document.querySelectorAll('.ab-picker-row')];
    expect(rows.map((r) => r.querySelector('.ab-picker-name')!.textContent)).toEqual(['Home', 'Page 2', 'Page 3']);
    expect(document.querySelector('.ab-picker-row.current .ab-picker-name')!.textContent).toBe('Page 2');
    act(() => void (rows[2] as HTMLElement).click());
    expect(s.get().activeArtboardId).toBe('ab1');
    expect(s.get().artboardSelected).toBe(true);
    expect(s.get().project).toBe(rev);
    expect(btn().textContent).toContain('Page 3');
  });

  it('the picker gets a search box once there are many artboards', async () => {
    await mount(10);
    act(() => q('.ab-picker-btn').click());
    const input = document.querySelector<HTMLInputElement>('.ab-picker-pop .search-pop-input');
    expect(input).toBeTruthy();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      set.call(input!, 'page 7');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = [...document.querySelectorAll('.ab-picker-row .ab-picker-name')].map((n) => n.textContent);
    expect(names).toContain('Page 7');
    expect(names.length).toBeLessThan(5);
  });

  it('the inspector shows the summary with a link to the reference, and the names an event gives', async () => {
    const { s } = await mount();
    act(() =>
      s.update((d) => {
        d.artboards[0].logic.nodes.push({ id: 'k', kind: 'event.key', x: 0, y: 0, params: {} });
      }),
    );
    act(() => s.set({ logicSelection: 'k' }));
    expect(q('.node-summary').textContent).toContain('Runs when a key is pressed or released.');
    expect(q('.node-summary .link-btn').textContent).toContain('More about On key');
    expect(q('.node-gives').textContent).toContain('event.key');
    expect(q('.node-gives').textContent).toContain('and 5 more');
    expect(host!.querySelector('.param-form')!.textContent).not.toContain('Keys typed into a text box');
  });
});
