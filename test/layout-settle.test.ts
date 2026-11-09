//Auto layout is settled for the artboards an edit changed, not again for every artboard of the project
import { describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, type FrameNode, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';

const laid = vi.hoisted(() => ({ calls: 0 }));
vi.mock('interactives-player', async (orig) => {
  const real = await orig<typeof import('interactives-player')>();
  return { ...real, relayoutTree: (...a: Parameters<typeof real.relayoutTree>) => (laid.calls++, real.relayoutTree(...a)) };
});

function pages(n: number): Project {
  const p = createProject('T');
  p.artboards = [];
  for (let i = 0; i < n; i++) {
    const ab = createArtboard({ id: `ab${i}`, name: `Page ${i}`, canvasX: i * 900 });
    const frame = createNode('frame', { id: `fr${i}`, name: 'Stack', x: 0, y: 0, width: 300, height: 300, layout: { direction: 'column', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, wrap: false, justify: 'start', align: 'start', hugWidth: false, hugHeight: false } }) as FrameNode;
    for (let k = 0; k < 3; k++) frame.children.push(createNode('rect', { id: `r${i}_${k}`, name: `Box ${k}`, width: 50, height: 40 }));
    ab.children.push(frame);
    p.artboards.push(ab);
  }
  return p;
}
const ys = (s: EditorStore, ab: number) => (s.get().project.artboards[ab].children[0] as FrameNode).children.map((c) => c.y);

describe('settling auto layout', () => {
  it('lays out the page that changed and leaves the rest alone', () => {
    const s = new EditorStore(pages(4));
    expect(ys(s, 0)).toEqual([0, 50, 100]);
    const before = s.get().project;
    laid.calls = 0;
    s.update((d) => void ((d.artboards[2].children[0] as FrameNode).children[0].height = 100));
    // the changed page: laid out again, and the boxes below the taller one moved down
    expect(ys(s, 2)).toEqual([0, 110, 160]);
    // one page's worth of work, not four
    expect(laid.calls).toBe(1);
    for (const i of [0, 1, 3]) expect(s.get().project.artboards[i]).toBe(before.artboards[i]);
  });

  it('keeps settling the page on every edit to it, and after undo and redo', () => {
    const s = new EditorStore(pages(2));
    const frame = () => (s.get().project.artboards[1].children[0] as FrameNode).children;
    s.update((d) => void ((d.artboards[1].children[0] as FrameNode).children[1].height = 90));
    expect(frame().map((c) => c.y)).toEqual([0, 50, 150]);
    s.update((d) => void ((d.artboards[1].children[0] as FrameNode).children[1].height = 20));
    expect(frame().map((c) => c.y)).toEqual([0, 50, 80]);
    s.undo();
    expect(frame().map((c) => c.y)).toEqual([0, 50, 150]);
    s.redo();
    expect(frame().map((c) => c.y)).toEqual([0, 50, 80]);
  });

  it('settles a page that arrives by someone else\'s ops, and one added later', () => {
    const s = new EditorStore(pages(2));
    s.update((d) => void d.artboards.push(pages(1).artboards[0]));
    laid.calls = 0;
    s.update((d) => void ((d.artboards[2].children[0] as FrameNode).children[0].height = 70));
    expect(ys(s, 2)).toEqual([0, 80, 130]);
  });
});
