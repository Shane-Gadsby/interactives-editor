import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, prepareNodes, type SceneNode } from 'interactives-player';
import { drawnGeometryVersion, hitTest, nodeCorners, recordDrawnGeometry, selectionBounds } from '../src/store/doc';

describe('the selection outline follows the drawn layout', () => {
  // A frame that hugs a column of three repeated rows, and a hint hidden by a binding
  const row = createNode('rect', { id: 'row', x: 0, y: 0, width: 100, height: 20 });
  const hint = createNode('text', { id: 'hint', x: 0, y: 0, width: 100, height: 30, text: 'Hint', bindings: { visible: 'false' } });
  const list = createNode('frame', { id: 'list', x: 0, y: 0, width: 100, layout: { direction: 'column', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'start', justify: 'start', hugWidth: false, hugHeight: true } as never, height: 20, repeat: { items: 'items', layout: 'none', gap: 0, columns: 1 }, children: [row] });
  const card = createNode('frame', {
    id: 'card',
    x: 10,
    y: 10,
    width: 100,
    height: 50,
    layout: { direction: 'column', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'start', justify: 'start', hugWidth: false, hugHeight: true } as never,
    children: [list, hint],
  });
  const ab = createArtboard({ id: 'ab', width: 400, height: 400, children: [card] });
  const vars = { items: [{}, {}, {}] };

  it('uses the prepared size while the layer is unchanged, and the document one once it changes', () => {
    const prepared = prepareNodes(ab.children, { vars });
    const drawnCard = prepared[0];
    const before = drawnGeometryVersion();
    recordDrawnGeometry('ab', ab.children, prepared);
    // stored: one row (20) + the hint (30); drawn: three rows (60), hint hidden
    expect([card.height, drawnCard.height]).toEqual([50, 60]);
    expect(drawnGeometryVersion()).toBe(before + 1);
    const b = selectionBounds(ab, ['card'])!;
    expect(b.height).toBe(drawnCard.height);
    // hit testing agrees: a point inside the drawn card but outside the stored one hits it
    const inside = { x: 20, y: 10 + Math.max(card.height, drawnCard.height) - 2 };
    const hitDrawn = hitTest(ab, inside.x, inside.y).map((n) => n.id);
    expect(hitDrawn[0]).toBe('card');
    // the same record again changes nothing
    recordDrawnGeometry('ab', ab.children, prepared);
    expect(drawnGeometryVersion()).toBe(before + 1);
    // an edited card is a new object: its stored size is used until the next draw
    const edited = { ...card, height: 61 } as SceneNode;
    const ab2 = { ...ab, children: [edited] };
    expect(nodeCorners(ab2, 'card')[2].y).toBe(10 + 61);
  });

  it('forgets an artboard drawn without anything prepared', () => {
    const plain = createArtboard({ id: 'ab3', children: [createNode('rect', { id: 'r' })] });
    recordDrawnGeometry('ab3', plain.children, plain.children);
    expect(nodeCorners(plain, 'r').length).toBe(4);
  });
});
