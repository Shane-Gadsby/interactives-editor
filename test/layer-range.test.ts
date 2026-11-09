import { describe, expect, it } from 'vitest';
import { extendLayers, pickLayer, rangeBetween } from '../src/lib/layer-range';

const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

describe('layer range select', () => {
  it('takes every row between the anchor and the target, either way round', () => {
    expect(rangeBetween(rows, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(rows, 'd', 'b')).toEqual(['d', 'c', 'b']);
    expect(rangeBetween(rows, 'b', 'zz')).toBeNull();
  });

  it('skips locked brand rows', () => {
    const r = [{ id: 'a' }, { id: 'b', held: true }, { id: 'c' }];
    expect(rangeBetween(r, 'a', 'c')).toEqual(['a', 'c']);
  });

  it('plain click sets the anchor, Shift+click sweeps from it and keeps it', () => {
    const one = pickLayer(rows, 'b', [], null, {});
    expect(one).toEqual({ selection: ['b'], anchor: 'b' });
    const swept = pickLayer(rows, 'd', one.selection, one.anchor, { shiftKey: true });
    expect(swept).toEqual({ selection: ['b', 'c', 'd'], anchor: 'b' });
    // a second Shift+click moves the end, not the start
    expect(pickLayer(rows, 'a', swept.selection, swept.anchor, { shiftKey: true }).selection).toEqual(['b', 'a']);
  });

  it('Ctrl/Cmd+click toggles and moves the anchor, Ctrl+Shift adds a range', () => {
    const t = pickLayer(rows, 'a', [], null, { ctrlKey: true });
    expect(t.selection).toEqual(['a']);
    const t2 = pickLayer(rows, 'c', t.selection, t.anchor, { metaKey: true });
    expect(t2).toEqual({ selection: ['a', 'c'], anchor: 'c' });
    expect(pickLayer(rows, 'c', t2.selection, t2.anchor, { ctrlKey: true }).selection).toEqual(['a']);
    const add = pickLayer(rows, 'e', t2.selection, t2.anchor, { ctrlKey: true, shiftKey: true });
    expect(add.selection.sort()).toEqual(['a', 'c', 'd', 'e']);
  });

  it('Shift+click with no anchor here ranges from the last selected layer, or just picks', () => {
    expect(pickLayer(rows, 'd', ['b'], null, { shiftKey: true }).selection).toEqual(['b', 'c', 'd']);
    expect(pickLayer(rows, 'd', [], null, { shiftKey: true })).toEqual({ selection: ['d'], anchor: 'd' });
    // an anchor that is on another artboard (not in these rows) is ignored
    expect(pickLayer(rows, 'd', [], 'elsewhere', { shiftKey: true }).selection).toEqual(['d']);
  });

  it('Shift+arrow extends by one row and stops at the ends', () => {
    const first = extendLayers(rows, 'b', 1, 'b')!;
    expect(first.selection).toEqual(['b', 'c']);
    expect(first.focus).toBe('c');
    const second = extendLayers(rows, 'c', 1, first.anchor)!;
    expect(second.selection).toEqual(['b', 'c', 'd']);
    // going back up shrinks it again
    expect(extendLayers(rows, 'd', -1, 'b')!.selection).toEqual(['b', 'c']);
    expect(extendLayers(rows, 'e', 1, 'a')).toBeNull();
  });
});
