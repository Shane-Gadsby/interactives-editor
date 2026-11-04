import { describe, expect, it } from 'vitest';
import { applyConstraints, apply, createProject, sampleArtboard, walk, worldMatrices, type Artboard, type BoneNode, type PathNode, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { locate } from '../src/store/doc';
import { addBonesExample, bonesExample } from '../src/lib/bones-example';
import { bonesOf, skinOf } from '../src/lib/rig';

const board = (width = 800, height = 600) => ({ ...createProject('Rig').artboards[0], width, height }) as Artboard;

/** Where the last bone's tip is once constraints are applied, and where the dot's centre is. */
function tipAndDot(nodes: SceneNode[], handleId: string) {
  const out = applyConstraints(nodes);
  const world = worldMatrices(out);
  let hand: BoneNode | undefined;
  let dot: SceneNode | undefined;
  walk(out, (n) => {
    if (n.name === 'Hand') hand = n as BoneNode;
    if (n.id === handleId) dot = n;
  });
  const tip = apply(world.get(hand!.id)!, hand!.width, 0);
  const d = apply(world.get(dot!.id)!, dot!.width * dot!.originX, dot!.height * dot!.originY);
  return { tip, dot: d };
}

describe('bones example', () => {
  it('makes a three bone chain, an arm skinned to all of them and a draggable dot the last bone is constrained to', () => {
    const ab = board();
    const ex = bonesExample(ab);
    expect(ex.bones.map((b) => b.name)).toEqual(['Upper arm', 'Forearm', 'Hand']);
    expect(bonesOf(ex.nodes).map((b) => b.name)).toEqual(['Upper arm', 'Forearm', 'Hand']);
    const skin = skinOf(ex.arm)!;
    expect(skin.bones.map((b) => b.bone)).toEqual(ex.bones.map((b) => b.id));
    // Every point has weights, and every bone pulls something
    const used = new Set(skin.weights[0].flatMap((p) => p.w.map((i) => i.b)));
    expect([...used].sort()).toEqual([0, 1, 2]);
    expect(skin.weights[0]).toHaveLength(ex.arm.paths[0].points.length);
    expect(ex.handle.draggable).toBeTruthy();
    expect(ex.bones[2].constraints).toEqual([expect.objectContaining({ type: 'ik', target: ex.handle.id, bones: 3, strength: 1 })]);
  });

  it('reaches the dot, and follows it when the dot is moved (what dragging does)', () => {
    const ex = bonesExample(board());
    const at = () => tipAndDot(ex.nodes, ex.handle.id);
    let r = at();
    expect(Math.hypot(r.tip.x - r.dot.x, r.tip.y - r.dot.y)).toBeLessThan(0.5);
    ex.handle.x += 60;
    ex.handle.y += 50;
    r = at();
    expect(Math.hypot(r.tip.x - r.dot.x, r.tip.y - r.dot.y)).toBeLessThan(0.5);
  });

  it('bends the skinned shape with the bones and keeps the rest shape without IK', () => {
    const ex = bonesExample(board());
    //Without the constraint the arm is straight, exactly as drawn
    const plain = bonesExample(board());
    plain.bones[2].constraints = [];
    const straight = applyConstraints(plain.nodes).find((n) => n.id === plain.arm.id) as PathNode;
    straight.paths[0].points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(plain.arm.paths[0].points[i].x, 3);
      expect(p.y).toBeCloseTo(plain.arm.paths[0].points[i].y, 3);
    });
    const bent = applyConstraints(ex.nodes).find((n) => n.id === ex.arm.id) as PathNode;
    const moved = bent.paths[0].points.filter((p, i) => Math.abs(p.y - ex.arm.paths[0].points[i].y) > 5);
    expect(moved.length).toBeGreaterThan(4);
  });

  it('waves: the strength drops to 0 while the bones swing, and is back to 1 at the end', () => {
    const ex = bonesExample(board());
    const wave = ex.timelines[0];
    expect(wave.loop).toBe('once');
    expect(wave.autoplay).toBe(false);
    const strength = (t: number) => {
      const nodes = sampleArtboard(ex.nodes, wave, t);
      let hand: BoneNode | undefined;
      walk(nodes, (n) => n.name === 'Hand' && (hand = n as BoneNode));
      return hand!.constraints![0].strength;
    };
    expect(strength(0)).toBe(1);
    expect(strength(1000)).toBe(0);
    expect(strength(2400)).toBe(1);
    // Mid wave the arm is not on the dot, and the tip moves between two samples
    const tip = (t: number) => tipAndDot(sampleArtboard(ex.nodes, wave, t), ex.handle.id);
    expect(Math.hypot(tip(1100).tip.x - tip(1100).dot.x, tip(1100).tip.y - tip(1100).dot.y)).toBeGreaterThan(20);
    expect(Math.abs(tip(700).tip.y - tip(1100).tip.y)).toBeGreaterThan(5);
    const end = tip(2400);
    expect(Math.hypot(end.tip.x - end.dot.x, end.tip.y - end.dot.y)).toBeLessThan(0.5);
  });

  it('has the Wave button start the timeline, and instructions on the artboard', () => {
    const ab = board();
    const ex = bonesExample(ab);
    const button = ex.nodes.find((n) => n.type === 'button')!;
    const [click, play] = ex.logic.nodes;
    expect(click).toMatchObject({ kind: 'event.pointer', params: { target: button.id, type: 'click' } });
    expect(play).toMatchObject({ kind: 'action.timeline', params: { timeline: ex.timelines[0].id, op: 'restart' } });
    expect(ex.logic.edges).toEqual([expect.objectContaining({ from: click.id, to: play.id, fromPort: 'out', toPort: 'in' })]);
    const texts = ex.nodes.filter((n) => n.type === 'text').map((n) => (n as { text: string }).text);
    expect(texts).toContain('Drag the orange dot');
  });

  it('fits a small artboard too', () => {
    const ab = board(420, 400);
    const ex = bonesExample(ab);
    const r = tipAndDot(ex.nodes, ex.handle.id);
    expect(Math.hypot(r.tip.x - r.dot.x, r.tip.y - r.dot.y)).toBeLessThan(0.5);
    for (const n of ex.nodes) if (n.type !== 'bone' && n.type !== 'path') expect(n.x).toBeGreaterThanOrEqual(0);
    expect(ex.handle.x).toBeGreaterThan(0);
    expect(ex.handle.x + ex.handle.width).toBeLessThan(ab.width);
  });

  it('is added in one undo step, below what the graph already holds', () => {
    const p = createProject('Rig');
    const s = new EditorStore(p);
    s.set({ activeArtboardId: p.artboards[0].id });
    s.update((d) => void addBonesExample(d.artboards[0]));
    const ab = s.artboard()!;
    expect(bonesOf(ab.children)).toHaveLength(3);
    expect(ab.timelines).toHaveLength(1);
    expect(ab.logic.nodes).toHaveLength(2);
    expect(locate(ab, ab.children.find((n) => n.type === 'path')!.id)).toBeTruthy();
    s.undo();
    expect(s.artboard()!.children).toHaveLength(0);
    expect(s.artboard()!.timelines).toHaveLength(0);
    expect(s.artboard()!.logic.nodes).toHaveLength(0);
  });
});
