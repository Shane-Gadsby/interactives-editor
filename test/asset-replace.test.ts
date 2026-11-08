import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { swapAssetId } from '../src/lib/assets';
import { refreshAudioDuration } from '../src/lib/captions-edit';

describe('replacing an asset file (swapAssetId)', () => {
  it('points every reference at the new id, wherever it is, and leaves other strings alone', () => {
    const doc = {
      assets: [{ id: 'as1', name: 'a.png' }, { id: 'as2', name: 'b.png' }],
      artboards: [
        {
          children: [{ type: 'image', assetId: 'as1', name: 'as1 label' }, { type: 'rect', fills: [{ type: 'image', assetId: 'as1' }] }],
          timelines: [{ audio: [{ assetId: 'as1' }] }],
          logic: { nodes: [{ kind: 'action.sound', params: { asset: 'as1' } }] },
        },
      ],
      fonts: [{ family: 'X', assetId: 'as2' }],
    };
    const out = produce(doc, (d) => void swapAssetId(d, 'as1', 'as9'));
    expect(JSON.stringify(out)).not.toContain('"as1"');
    expect(out.assets[0].id).toBe('as9');
    expect(out.artboards[0].children[0]).toMatchObject({ assetId: 'as9', name: 'as1 label' });
    expect(out.artboards[0].logic.nodes[0].params.asset).toBe('as9');
    expect(out.fonts[0].assetId).toBe('as2');
    // untouched branches stay the same objects (immer only copies what changed)
    expect(out.fonts).toBe(doc.fonts);
  });

  it('follows the id into a list variable\'s JSON text (a card\'s sound), and leaves other text alone', () => {
    const doc = { variables: [{ name: 'cards', initial: JSON.stringify([{ phrase: 'Where is the library?', sound: 'as1' }]) }, { name: 'note', initial: 'as1 in plain text' }] };
    const out = produce(doc, (d) => void swapAssetId(d, 'as1', 'as9'));
    expect(JSON.parse(out.variables[0].initial)[0]).toEqual({ phrase: 'Where is the library?', sound: 'as9' });
    expect(out.variables[1].initial).toBe('as1 in plain text');
  });
});

describe('replacing a sound: its length and the timeline', () => {
  const doc = () =>
    ({
      artboards: [
        {
          timelines: [
            //fitted to its sound: 10 s of sound at 0
            { id: 'tl1', name: 'Fitted', duration: 10000, audio: [{ id: 'a', assetId: 'new', offset: 0, duration: 10000, volume: 1 }] },
            //a long timeline with the sound as a part of it
            { id: 'tl2', name: 'Longer', duration: 60000, audio: [{ id: 'b', assetId: 'new', offset: 5000, duration: 10000, volume: 1 }] },
            //the new sound runs past its end
            { id: 'tl3', name: 'Short', duration: 12000, audio: [{ id: 'c', assetId: 'new', offset: 4000, duration: 5000, volume: 1 }] },
            { id: 'tl4', name: 'Other', duration: 3000, audio: [{ id: 'd', assetId: 'else', offset: 0, duration: 3000, volume: 1 }] },
          ],
        },
      ],
    }) as never;

  it('gives every track using the file its new length and offers to fit the timelines that were fitted or are now too short', () => {
    const p = doc();
    const fits = refreshAudioDuration(p, 'new', 14200);
    const tls = (p as { artboards: { timelines: { id: string; duration: number; audio: { duration: number }[] }[] }[] }).artboards[0].timelines;
    expect(tls.map((t) => t.audio[0].duration)).toEqual([14200, 14200, 14200, 3000]);
    expect(fits).toEqual([
      { timelineId: 'tl1', timeline: 'Fitted', was: 10000, to: 14200 },
      { timelineId: 'tl3', timeline: 'Short', was: 12000, to: 18200 },
    ]);
    //nothing is changed on the timelines themselves until the author says yes
    expect(tls.map((t) => t.duration)).toEqual([10000, 60000, 12000, 3000]);
  });

  it('a length that cannot be read changes nothing', () => {
    const p = doc();
    expect(refreshAudioDuration(p, 'new', 0)).toEqual([]);
    expect((p as { artboards: { timelines: { audio: { duration: number }[] }[] }[] }).artboards[0].timelines[0].audio[0].duration).toBe(10000);
  });

  it('a new sound the same length as the old one offers nothing', () => {
    expect(refreshAudioDuration(doc(), 'new', 10000)).toEqual([{ timelineId: 'tl3', timeline: 'Short', was: 12000, to: 14000 }]);
  });
});
