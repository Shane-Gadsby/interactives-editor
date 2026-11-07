import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { swapAssetId } from '../src/lib/assets';

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
