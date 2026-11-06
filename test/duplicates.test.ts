import { describe, expect, it } from 'vitest';
import { createProject, createNode } from 'interactives-player';
import { mergeDuplicates, mergePlan, repointAssets } from '../src/lib/duplicates';

const project = () => {
  const p: any = createProject('T');
  p.assets = [
    { id: 'assetAAAA1111', name: 'logo.png', mime: 'image/png', size: 10 },
    { id: 'assetBBBB2222', name: 'logo (1).png', mime: 'image/png', size: 10 },
    { id: 'assetCCCC3333', name: 'other.png', mime: 'image/png', size: 5 },
  ];
  const img = createNode('image', { name: 'Logo' }) as any;
  img.assetId = 'assetBBBB2222';
  const r = createNode('rect', { name: 'R' }) as any;
  r.fills = [{ type: 'image', assetId: 'assetBBBB2222' }];
  p.artboards[0].children.push(img, r);
  p.fonts = [{ family: 'Brand', source: 'asset', assetId: 'assetAAAA1111' }, { family: 'Brand', source: 'asset', assetId: 'assetBBBB2222' }];
  return p;
};

describe('merging duplicate assets', () => {
  it('keeps the first in the asset list', () => {
    const p = project();
    expect(mergePlan(p, [{ ids: ['assetBBBB2222', 'assetAAAA1111'] }, { ids: ['assetCCCC3333', 'gone00000000'] }])).toEqual([{ keep: 'assetAAAA1111', drop: ['assetBBBB2222'] }]);
  });

  it('points every reference at the kept copy, wherever it sits, and leaves the asset list alone', () => {
    const p = project();
    expect(repointAssets(p, new Map([['assetBBBB2222', 'assetAAAA1111']]))).toBe(3);
    expect(p.artboards[0].children[0].assetId).toBe('assetAAAA1111');
    expect(p.artboards[0].children[1].fills[0].assetId).toBe('assetAAAA1111');
    expect(p.assets.map((a: { id: string }) => a.id)).toContain('assetBBBB2222');
  });

  it('drops the duplicates and the font rows they doubled', () => {
    const p = project();
    mergeDuplicates(p, [{ keep: 'assetAAAA1111', drop: ['assetBBBB2222'] }]);
    expect(p.assets.map((a: { id: string }) => a.id)).toEqual(['assetAAAA1111', 'assetCCCC3333']);
    expect(p.fonts).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain('assetBBBB2222');
  });
});
