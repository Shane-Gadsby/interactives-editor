import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { sampleArtboard } from 'interactives-player';

const layout = { direction: 'column' as const, gap: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'start' as const, align: 'start' as const, wrap: false, hugWidth: false, hugHeight: false };

describe('settling auto layout after a change', () => {
  it('still lays children out when a change touches a layout frame', () => {
    const p: Project = createProject('T');
    const kids = [createNode('rect', { width: 10, height: 10 }), createNode('rect', { width: 10, height: 10 })];
    const frame = createNode('frame', { width: 100, height: 100, layout, children: kids as SceneNode[] });
    p.artboards[0].children.push(frame);
    const s = new EditorStore(p);
    const second = () => (s.artboard()!.children[0] as typeof frame).children[1];
    expect(second().y).toBe(14);
    s.setProps([kids[0].id], { height: 30 });
    expect(second().y).toBe(34);
  });

  it('keeps untouched artboards as they were when another one changes', () => {
    const p: Project = createProject('T');
    p.artboards[0].children.push(...Array.from({ length: 50 }, () => createNode('rect')));
    const s = new EditorStore(p);
    s.addArtboard({ canvasX: 2000 });
    const other = s.get().project.artboards[1];
    s.set({ activeArtboardId: s.get().project.artboards[0].id });
    for (let i = 0; i < 5; i++) s.setProps([s.get().project.artboards[0].children[0].id], { x: i + 1 });
    expect(s.get().project.artboards[0].children[0].x).toBe(5);
    expect(s.get().project.artboards[1]).toBe(other);
  });

  it('shares unchanged layers with the document when sampling a timeline', () => {
    const p: Project = createProject('T');
    const rects = Array.from({ length: 5 }, () => createNode('rect'));
    p.artboards[0].children.push(...rects);
    const tl = { id: 't', name: 'T', duration: 1000, loop: 'once' as const, autoplay: false, speed: 1, tracks: [{ id: 'k', nodeId: rects[0].id, prop: 'x', keys: [{ id: 'a', t: 0, value: 0, ease: 'linear' as const }, { id: 'b', t: 1000, value: 100, ease: 'linear' as const }] }] };
    const s = new EditorStore(p);
    const out = sampleArtboard(s.artboard()!.children, tl, 500);
    expect(out[0].x).toBe(50);
    expect(out[1]).toBe(s.artboard()!.children[1]);
  });
});
