import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { walk, type SceneNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { writeRiv, type Spec } from './rive-writer';

const dir = '../research/rive/';
const sample = dir + '262426_-_breathing_for_calm.riv';

// Open Sans, as the breathing sample embeds it: hhea ascent 2189, descent 600 of 2048
const ASC = 2189 / 2048;
const DESC = 600 / 2048;

/** One text in a 400x400 artboard with an embedded font. */
const textFile = (font: Uint8Array, props: Record<string, unknown>, style: Record<string, unknown>, body = 'HHH'): Uint8Array =>
  writeRiv([
    ['Backboard', {}],
    ['FontAsset', { name: 'Open Sans', assetId: 1 }],
    ['FileAssetContents', { bytes: font }],
    ['Artboard', { name: 'Main', width: 400, height: 400 }],
    ['Text', { name: 'T', parentId: 0, x: 100, y: 200, ...props }], // 1
    ['TextStylePaint', { parentId: 1, fontAssetId: 0, ...style }], // 2
    ['SolidColor', { parentId: 5, colorValue: 0xff000000 }], // 3
    ['TextValueRun', { parentId: 1, styleId: 2, text: body }], // 4
    ['Fill', { parentId: 2 }], // 5
  ] as Spec[]);

const textOf = async (bytes: Uint8Array) => {
  const res = await importRive(bytes, 't');
  let node: SceneNode | undefined;
  walk(res.artboards[0].children, (n) => n.name === 'T' && (node = n));
  return node as SceneNode & { y: number; height: number; originY: number };
};

describe.skipIf(!existsSync(sample))('Rive text boxes, measured against the real runtime', () => {
  const fontOf = async () => (await importRive(new Uint8Array(readFileSync(sample)), 'b')).assets.find((a) => a.name === 'Open Sans.ttf')!.bytes;

  it('puts the first baseline an ascent below the top whatever the line height, so a taller line does not push the text down', async () => {
    const font = await fontOf();
    // The real runtime drew the 60px text with a 73px line height with its baseline at y + 64 (one ascent), not 59.8 as CSS centring would
    const n = await textOf(textFile(font, { originY: 0 }, { fontSize: 60, lineHeight: 73 }));
    const natural = (ASC + DESC) * 60;
    // our line box centres the glyphs in 73px, so the box sits half the extra up
    expect(n.y).toBeCloseTo(200 - (73 - natural) / 2, 0);
  });

  it('measures the box as an ascent plus a descent share of a line below the last baseline, which the origin works from', async () => {
    const font = await fontOf();
    // lineHeight 73 at 25px: the runtime's box ran about 42.4px tall, not the 73 of the line height nor the font's own 34
    const n = await textOf(textFile(font, { originY: 1 }, { fontSize: 25, lineHeight: 73 }));
    const box = ASC * 25 + (73 * DESC) / (ASC + DESC);
    expect(n.height).toBeCloseTo(box, 1);
    expect(n.y + n.originY * n.height).toBeCloseTo(200, 1);
  });

  it('puts a baseline origin on the first baseline (an ascent down from the top), not 0.95 em', async () => {
    const font = await fontOf();
    const n = await textOf(textFile(font, { originY: 0, originValue: 1 }, { fontSize: 60 }));
    expect(n.y).toBeCloseTo(200 - ASC * 60, 0);
  });

  it('keeps the lines of a taller line height spaced by it, with the box one line plus the first ascent', async () => {
    const font = await fontOf();
    const n = await textOf(textFile(font, { originY: 0 }, { fontSize: 25, lineHeight: 73 }, 'HHH\nHHH'));
    expect(n.height).toBeCloseTo(ASC * 25 + 73 + (73 * DESC) / (ASC + DESC), 1);
  });
});

describe.skipIf(!existsSync(sample))('Rive drawables flagged hidden', () => {
  it('are not drawn: the bubbles artboard keeps its three label texts hidden', async () => {
    const res = await importRive(new Uint8Array(readFileSync(sample)), 'b');
    const bubbles = res.artboards.find((a) => a.name === 'Progress Bubbles')!;
    const texts: SceneNode[] = [];
    walk(bubbles.children, (n) => n.type === 'text' && texts.push(n));
    expect(texts.length).toBe(3);
    expect(texts.every((t) => t.visible === false)).toBe(true);
  });
});

describe.skipIf(!existsSync(sample))('Rive keys that do not name an interpolation', () => {
  it('hold, as in the runtime: a button the breathing sample moves off screen jumps there instead of sliding', async () => {
    const res = await importRive(new Uint8Array(readFileSync(sample)), 'b');
    const tl = res.artboards[0].timelines.find((t) => t.name === 'Choice to End Screen')!;
    // x keyed 175 -> -175 over half a second with no interpolation written
    const track = tl.tracks.find((t) => t.prop === 'x' && t.keys.length === 2 && t.keys[0].value === 175 && t.keys[1].value === -175)!;
    expect(track).toBeTruthy();
    expect(track.keys[0].ease).toBe('step');
  });
});
