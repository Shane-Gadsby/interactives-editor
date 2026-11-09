import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arrange, getOrder, hasCustomOrder, mergeOrder, moved, resetAllOrders, resetOrder, resetToolOrder, setOrder } from '../src/lib/reorder';
import { gapAt, landing, type Box } from '../src/lib/reorder-drag';
import { prefs, setPrefs } from '../src/lib/prefs';

describe('arrange: the person\'s order over the keys on screen', () => {
  it('is the default order when nothing is saved', () => {
    expect(arrange(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(arrange(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });
  it('puts the saved keys in the saved order', () => {
    expect(arrange(['a', 'b', 'c', 'd'], ['d', 'b', 'a', 'c'])).toEqual(['d', 'b', 'a', 'c']);
  });
  it('leaves a key that was never saved where the editor put it', () => {
    //new is a section a later version added between b and c: it keeps its own place while the others take their turns around it
    expect(arrange(['a', 'b', 'new', 'c', 'd'], ['d', 'a', 'b', 'c'])).toEqual(['d', 'a', 'new', 'b', 'c']);
  });
  it('skips saved keys that are not on screen (a section that only shows for some layers)', () => {
    expect(arrange(['a', 'c'], ['c', 'x', 'a'])).toEqual(['c', 'a']);
  });
  it('is stable for a key listed twice', () => {
    expect(arrange(['a', 'b'], ['b', 'a', 'b'])).toEqual(['b', 'a']);
  });
});

describe('moved and mergeOrder', () => {
  it('moves one key to a new place', () => {
    expect(moved(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
  });
  it('saves the keys on screen where the first of them was, and keeps the keys that are not on screen', () => {
    expect(mergeOrder(undefined, ['b', 'a'])).toEqual(['b', 'a']);
    expect(mergeOrder(['x', 'a', 'b', 'y'], ['b', 'a'])).toEqual(['x', 'b', 'a', 'y']);
    expect(mergeOrder(['x', 'y'], ['b', 'a'])).toEqual(['x', 'y', 'b', 'a']);
  });
  it('keeps the list to 80 keys', () => {
    expect(mergeOrder([], Array.from({ length: 120 }, (_, i) => `k${i}`))).toHaveLength(80);
  });
});

describe('the order in the preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    setPrefs({ sectionOrder: {}, toolOrder: {} });
  });
  it('is saved per place and read back', () => {
    expect(getOrder('sectionOrder', 'layer:rect')).toBeUndefined();
    setOrder('sectionOrder', 'layer:rect', ['Fill', 'Stroke']);
    setOrder('toolOrder', 'groups', ['draw', 'shapes']);
    expect(getOrder('sectionOrder', 'layer:rect')).toEqual(['Fill', 'Stroke']);
    expect(prefs().toolOrder).toEqual({ groups: ['draw', 'shapes'] });
    expect(hasCustomOrder()).toBe(true);
  });
  it('resets one place, the tools, or everything', () => {
    setOrder('sectionOrder', 'page', ['a']);
    setOrder('sectionOrder', 'layer:text', ['b']);
    setOrder('toolOrder', 'groups', ['c']);
    resetOrder('sectionOrder', 'page');
    expect(prefs().sectionOrder).toEqual({ 'layer:text': ['b'] });
    resetToolOrder();
    expect(prefs().toolOrder).toEqual({});
    resetAllOrders();
    expect(hasCustomOrder()).toBe(false);
  });
  it('forgets an empty list', () => {
    setOrder('sectionOrder', 'page', ['a']);
    setOrder('sectionOrder', 'page', []);
    expect(prefs().sectionOrder).toEqual({});
  });
});

const col = (n: number): Box[] => Array.from({ length: n }, (_, i) => ({ left: 0, right: 100, top: i * 40, bottom: i * 40 + 30 }));

describe('where a drop lands', () => {
  it('in a column, the gap is counted by the items\' middles above the pointer', () => {
    const b = col(3);
    expect(gapAt(b, 50, -10, 'column').gap).toBe(0);
    expect(gapAt(b, 50, 20, 'column').gap).toBe(1);
    expect(gapAt(b, 50, 50, 'column').gap).toBe(1);
    expect(gapAt(b, 50, 60, 'column').gap).toBe(2);
    expect(gapAt(b, 50, 500, 'column').gap).toBe(3);
  });
  it('draws the line in the middle of the space between two items, and along the whole width', () => {
    const { line } = gapAt(col(3), 50, 60, 'column');
    expect(line).toEqual({ left: 0, right: 100, top: 75, bottom: 75 });
    expect(gapAt(col(3), 50, -5, 'column').line.top).toBe(0);
    expect(gapAt(col(3), 50, 999, 'column').line.top).toBe(110);
  });
  it('in a row the same thing goes along x', () => {
    const b: Box[] = [0, 1, 2].map((i) => ({ top: 0, bottom: 28, left: i * 40, right: i * 40 + 30 }));
    expect(gapAt(b, 70, 10, 'row').gap).toBe(2);
    expect(gapAt(b, 70, 10, 'row').line).toMatchObject({ top: 0, bottom: 28, left: 75, right: 75 });
  });
  it('in a grid, the nearest item decides, and which half of it the pointer is in says before or after', () => {
    //two columns of 28px with a 2px gap, like the tool rail
    const b: Box[] = [0, 1, 2, 3].map((i) => ({ left: (i % 2) * 30, right: (i % 2) * 30 + 28, top: Math.floor(i / 2) * 30, bottom: Math.floor(i / 2) * 30 + 28 }));
    expect(gapAt(b, 3, 40, 'grid').gap).toBe(2);
    expect(gapAt(b, 25, 40, 'grid').gap).toBe(3);
    expect(gapAt(b, 59, 5, 'grid').gap).toBe(2);
    expect(gapAt(b, 59, 5, 'grid').line.left).toBe(59);
  });
  it('has no gap to find in an empty list', () => expect(gapAt([], 5, 5, 'column').gap).toBe(0));
  it('says where the item ends up once it is taken out of the list', () => {
    expect(landing(1, 0)).toBe(0);
    expect(landing(1, 1)).toBe(1);
    expect(landing(1, 2)).toBe(1);
    expect(landing(1, 4)).toBe(3);
  });
});
