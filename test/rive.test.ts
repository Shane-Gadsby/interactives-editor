import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
