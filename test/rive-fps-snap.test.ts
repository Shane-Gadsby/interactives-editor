import { describe, expect, it } from 'vitest';
import { sampleArtboard } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { writeRiv, type Spec } from './rive-writer';

//a node moving x from 0 to 240 over one second at 24 fps
const scene = (anim: Record<string, unknown>): Spec[] => [
  ['Artboard', { name: 'Main', width: 200, height: 100 }],
  ['Node', { name: 'Mover', parentId: 0 }], // 1
  ['LinearAnimation', { name: 'Slide', duration: 24, fps: 24, ...anim }],
  ['KeyedObject', { objectId: 1 }],
  ['KeyedProperty', { propertyKey: 13 }],
  ['KeyFrameDouble', { frame: 0, value: 0 }],
  ['KeyFrameDouble', { frame: 24, value: 240 }],
];

describe('Rive animations that snap to frames', () => {
  it('import with their fps and snap on, and read on whole frames', async () => {
    const res = await importRive(writeRiv(scene({ quantize: true })), 'q');
    const ab = res.artboards[0];
    const tl = ab.timelines[0];
    expect(tl).toMatchObject({ fps: 24, snap: true, duration: 1000 });
    const mover = ab.children[0];
    //half way through frame 5 reads frame 5 exactly (50), not 52.5 or so
    const at = (t: number) => (sampleArtboard(ab.children, tl, t)[0] as { x: number }).x;
    expect(at(5 * (1000 / 24) + 20)).toBeCloseTo(50, 0);
    expect(at(5 * (1000 / 24) + 40)).toBeCloseTo(50, 0);
    expect(at(6 * (1000 / 24) + 1)).toBeCloseTo(60, 0);
    expect(mover.name).toBe('Mover');
  });

  it('leave animations that do not quantize free', async () => {
    const res = await importRive(writeRiv(scene({})), 'q');
    const tl = res.artboards[0].timelines[0];
    expect(tl.fps).toBeUndefined();
    expect(tl.snap).toBeUndefined();
  });
});
