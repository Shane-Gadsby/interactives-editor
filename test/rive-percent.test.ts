import { describe, expect, it } from 'vitest';
import { relayoutTree, walk, type FrameNode, type SceneNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { writeRiv } from './rive-writer';
import { scenes } from './rive-layout-scenes';

/** Import one of the layout scenes and find layers by name. The artboard is sized after the import to test the live values. */
async function load(name: string) {
  const specs = scenes().find((d) => d.name === name)!.specs;
  const res = await importRive(writeRiv([['Backboard', {}], ...specs]), name);
  const ab = res.artboards[0];
  const by = (n: string) => {
    let found: SceneNode | undefined;
    walk(ab.children, (x) => x.name === n && (found = x));
    if (!found) throw new Error(`no layer "${n}"`);
    return found;
  };
  return { res, ab, by };
}

/** The frame that holds a layer. */
const holder = (ab: { children: SceneNode[] }, id: string): FrameNode => {
  let found: FrameNode | undefined;
  walk(ab.children, (x) => x.type === 'frame' && x.children.some((k) => k.id === id) && (found = x as FrameNode));
  return found!;
};

describe('Rive percent padding, margin and gap import as percents', () => {
  it('keeps percent padding and gap on the root layout as percents', async () => {
    const { ab, by } = await load('percent');
    const root = holder(ab, by('b0').id);
    expect(root.layout!.padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(root.layout!.gap).toBe(5);
    expect(root.layout!.units).toEqual({ gap: 'percent', padding: { top: 'percent', right: 'percent', bottom: 'percent', left: 'percent' } });
  });

  it('lays the same at the file size and follows the frame when it is resized', async () => {
    const { ab, by } = await load('percent');
    relayoutTree(ab.children);
    // (Rive's own numbers for this scene, at the 400 px width it was drawn at)
    expect(by('b0')).toMatchObject({ x: 40, y: 40 });
    expect(Math.round(by('b1').x)).toBe(124);
    const root = holder(ab, by('b0').id);
    root.width = 800;
    relayoutTree(ab.children);
    // 10% of 800 = 80 of padding on every side; the gap is 5% of 800 = 40 between children 20% of the 640 inside (128)
    expect(by('b0')).toMatchObject({ x: 80, y: 80 });
    expect(Math.round(by('b1').x)).toBe(80 + 128 + 40);
    root.width = 200;
    relayoutTree(ab.children);
    expect(by('b0')).toMatchObject({ x: 20, y: 20 });
  });

  it('keeps a percent margin as one, and px and negative margins as px', async () => {
    const { ab, by } = await load('margin');
    const m2 = by('m2');
    expect(m2.layoutItem!.margin!.left).toBe(10);
    expect(m2.layoutItem!.marginUnits).toEqual({ left: 'percent' });
    expect(by('m1').layoutItem!.marginUnits).toBeUndefined();
    expect(by('m3').layoutItem!.marginUnits).toBeUndefined();
    expect(by('m3').layoutItem!.margin!.left).toBe(-20);
    relayoutTree(ab.children);
    expect(Math.abs(m2.x - 129.3)).toBeLessThanOrEqual(1);
    // A wider layout: 10% of the 780 inside its 10 px padding
    const root = holder(ab, m2.id);
    root.width = 800;
    relayoutTree(ab.children);
    expect(Math.abs(m2.x - (10 + 60 + 20 + 78))).toBeLessThanOrEqual(1);
  });

  it('keeps nested percent padding and gaps, measured against the layout around them', async () => {
    const { ab, by } = await load('nested');
    const p = by('p') as FrameNode;
    expect(p.layout!.units).toMatchObject({ gap: 'percent', padding: { left: 'percent', top: 'percent' } });
    expect(p.layout!.units!.padding!.right).toBeUndefined();
    relayoutTree(ab.children);
    // The same boxes Rive gave this scene (see rive-parity.test.ts)
    expect(Math.abs(by('k1').x - 52.7)).toBeLessThanOrEqual(1);
    expect(Math.round(by('k1').y)).toBe(38);
  });

  it('leaves px layouts alone', async () => {
    const { ab, by } = await load('pad');
    const root = holder(ab, by('b0').id);
    expect(root.layout!.units).toBeUndefined();
    expect(by('b0').layoutItem?.marginUnits).toBeUndefined();
  });
});
