import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walk, type SceneNode } from 'interactives-player';
import { importRive, readRiveObjects } from '../src/lib/rive-import';

const dir = `${process.cwd()}/../research/rive/`;
const samples = ['breathing_for_calm_TEST1.riv', 'treasure_valley_interactive_map.riv'].filter((f) => existsSync(dir + f));

describe.skipIf(!samples.length)('Rive import (sample files in research/rive)', () => {
  for (const f of samples) {
    it(`reads ${f}`, async () => {
      const bytes = new Uint8Array(readFileSync(dir + f));
      const objs = readRiveObjects(bytes);
      expect(objs.length).toBeGreaterThan(10);
      const res = await importRive(bytes, f);
      const summary = res.artboards.map((a) => {
        let count = 0;
        const rec = (l: { children?: unknown[] }[]) => l.forEach((n) => (count++, n.children && rec(n.children as never)));
        rec(a.children as never);
        return `${a.name} ${a.width}x${a.height} layers=${count} timelines=${a.timelines.length} tracks=${a.timelines.reduce((t, x) => t + x.tracks.length, 0)} logic=${a.logic.nodes.length}`;
      });
      console.log(f, '\n ' + summary.join('\n ') + `\n variables=${res.variables.map((v) => v.name).join(',')}\n assets=${res.assets.map((a) => `${a.name}(${a.mime},${a.bytes.length})`).join(', ')}\n fonts=${res.fonts.map((x) => x.family).join(',')}\n warnings:\n  - ${res.warnings.join('\n  - ')}`);
      expect(res.artboards.length).toBeGreaterThan(0);
    });
  }
});

describe.skipIf(!samples.includes('treasure_valley_interactive_map.riv'))('Rive view model import', () => {
  it('turns view model properties into shared variables driven by listeners and tested by transitions', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const icon = res.variables.find((v) => v.name === 'MainVM_iconNum');
    const index = res.variables.find((v) => v.name === 'MainVM_indexNum');
    expect(icon?.shared).toBe(true);
    expect(index?.type).toBe('number');
    const nodes = res.artboards.flatMap((a) => a.logic.nodes);
    expect(nodes.some((n) => n.kind === 'action.setVariable' && n.params.variable === icon!.id && n.params.value === '10')).toBe(true);
    expect(nodes.some((n) => n.kind === 'logic.if' && String(n.params.condition).includes('MainVM_indexNum ==='))).toBe(true);
    expect(nodes.some((n) => n.kind === 'event.variable' && n.params.variable === index!.id)).toBe(true);
    expect(res.warnings.some((w) => /view models\) is not imported/.test(w))).toBe(false);
  });
});

describe.skipIf(!samples.includes('treasure_valley_interactive_map.riv'))('Rive solo and clipping import', () => {
  it('turns Solo into a native solo and clipping shapes into masks', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const all: SceneNode[] = [];
    for (const a of res.artboards) walk(a.children, (n) => all.push(n));
    const solos = all.filter((n) => (n.type === 'group' || n.type === 'frame') && n.solo);
    expect(solos.length).toBeGreaterThan(0);
    for (const g of solos as (SceneNode & { solo: { active: string | null }; children: SceneNode[] })[]) {
      // Active child is one of the group's layers, and nothing is hidden by per-child visibility any more
      if (g.solo.active) expect(g.children.some((c) => c.id === g.solo.active)).toBe(true);
    }
    // Solo animation is a solo.active track, not visibility tracks on the children
    const soloIds = new Set(solos.map((g) => g.id));
    const tracks = res.artboards.flatMap((a) => a.timelines.flatMap((t) => t.tracks));
    expect(tracks.some((t) => t.prop === 'solo.active' && soloIds.has(t.nodeId))).toBe(true);
    expect(tracks.some((t) => t.prop === 'visible' && soloIds.has(t.nodeId))).toBe(false);
    // Clipping shapes became masks (a mask group holding the clip shape, in front of the clipped layer)
    const masks = all.filter((n) => n.mask);
    expect(masks.length).toBeGreaterThan(0);
    for (const m of masks) expect(m.type).toBe('group');
    expect(all.some((n) => n.type === 'group' && n.children.some((c) => c.mask) && /\(clipped\)$/.test(n.name))).toBe(true);
    expect(res.warnings.some((w) => /Clipping shapes are not supported/.test(w))).toBe(false);
  });

  it('keeps clipping on the breathing sample', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'breathing_for_calm_TEST1.riv')), 'b');
    const all: SceneNode[] = [];
    for (const a of res.artboards) walk(a.children, (n) => all.push(n));
    expect(all.some((n) => n.mask)).toBe(true);
  });
});
