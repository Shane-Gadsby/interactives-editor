import { describe, expect, it } from 'vitest';
import { sampleArtboard, walk, type SceneNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';

const textFile = (textProps: Record<string, unknown>, anim: Spec[]) =>
  writeRiv([
    ['Artboard', { name: 'Main', width: 400, height: 300 }],
    ['Text', { name: 'T', parentId: 0, x: 100, y: 50, ...textProps }], // 1
    ['TextStyle', { parentId: 1, fontSize: 20 }], // 2
    ['TextValueRun', { parentId: 1, text: 'one two three four five six seven eight nine ten', styleId: 2 }],
    ['LinearAnimation', { name: 'Box', duration: 60, fps: 60, loopValue: 1 }],
    ['KeyedObject', { objectId: 1 }],
    ...anim,
  ]);
const keys = (prop: string, a: number, b: number): Spec[] => [['KeyedProperty', { propertyKey: propKey('Text', prop) }], ['KeyFrameDouble', { frame: 0, value: a }], ['KeyFrameDouble', { frame: 60, value: b }]];
const at = async (bytes: Uint8Array, ms: number) => {
  const res = await importRive(bytes, 't');
  const ab = res.artboards[0];
  let text: SceneNode | undefined;
  walk(ab.children, (n) => n.name === 'T' && (text = n));
  const sampled = sampleArtboard(ab.children, ab.timelines[0], ms);
  let out: (SceneNode & { height: number; originY: number }) | undefined;
  walk(sampled, (n) => n.name === 'T' && (out = n as never));
  return { res, ab, node: text!, at: out! };
};

describe('Rive text height and origin keys', () => {
  it('animates the height of a fixed-size text box, keeping its top where Rive keeps it', async () => {
    // Fixed size (2), top-aligned origin 0: the box grows downwards from y=50
    const r = await at(textFile({ sizingValue: 2, width: 120, height: 40, originX: 0, originY: 0 }, keys('height', 40, 100)), 500);
    expect(r.res.warnings.filter((w) => /Animating/.test(w))).toEqual([]);
    expect(r.ab.timelines[0].tracks.map((t) => t.prop)).toEqual(['height']);
    expect(r.at.height).toBeCloseTo(70, 0);
    expect(r.at.y).toBeCloseTo(50, 0);
  });

  it('moves the box with the height when the origin is not the top', async () => {
    // Origin at the bottom (originY 1): the bottom edge stays at y=50, so the top moves up as the box grows
    const r = await at(textFile({ sizingValue: 2, width: 120, height: 40, originX: 0, originY: 1 }, keys('height', 40, 100)), 1000);
    expect(r.at.height).toBeCloseTo(100, 0);
    expect(r.at.y).toBeCloseTo(50 - 100, 0);
    expect(r.ab.timelines[0].tracks.map((t) => t.prop).sort()).toEqual(['height', 'y']);
  });

  it('animates the origin: the pivot and the box position both follow', async () => {
    const r = await at(textFile({ sizingValue: 2, width: 120, height: 40, originX: 0, originY: 0 }, keys('originY', 0, 1)), 1000);
    expect(r.res.warnings.filter((w) => /Animating/.test(w))).toEqual([]);
    expect(r.at.originY).toBe(1);
    // The box is now hung from its bottom: the text's y (50) is its bottom edge
    expect(r.at.y).toBeCloseTo(10, 0);
    const half = await at(textFile({ sizingValue: 2, width: 120, height: 40, originX: 0, originY: 0 }, keys('originY', 0, 1)), 500);
    expect(half.at.originY).toBeCloseTo(0.5, 2);
    expect(half.at.y).toBeCloseTo(30, 0);
  });

  it('samples the box when the height and the origin move together', async () => {
    const r = await at(textFile({ sizingValue: 2, width: 120, height: 40, originX: 0, originY: 0 }, [...keys('height', 40, 100), ...keys('originY', 0, 1)]), 500);
    // At half way: height 70, origin 0.5, so the top is 50 - 35
    expect(r.at.height).toBeCloseTo(70, 0);
    expect(r.at.originY).toBeCloseTo(0.5, 2);
    expect(r.at.y).toBeCloseTo(15, 0);
  });

  it('ignores a height key on auto-size text, as Rive does, without a warning', async () => {
    const r = await at(textFile({ sizingValue: 0, originX: 0.5, originY: 0.5 }, [...keys('height', 0, 90), ...keys('originY', 0.5, 0.5)]), 500);
    expect(r.res.warnings.filter((w) => /Animating|not supported/.test(w))).toEqual([]);
    expect(r.ab.timelines[0].tracks.some((t) => t.prop === 'height')).toBe(false);
    expect(r.ab.timelines[0].tracks.some((t) => t.prop === 'originY')).toBe(true);
  });

  it('still moves text that only has x and y keys, as before', async () => {
    const r = await at(textFile({ sizingValue: 0, originX: 0, originY: 0 }, [...keys('x', 100, 200)]), 500);
    expect(r.at.x).toBeCloseTo(150, 0);
  });
});
