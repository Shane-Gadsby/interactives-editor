import { describe, expect, it } from 'vitest';
import { walk } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';

describe('Rive copy constraints', () => {
  const file = (constraint: Spec) =>
    writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['Node', { name: 'Mover', parentId: 0, x: 5 }], // 1
      ['Node', { name: 'Leader', parentId: 0 }], // 2
      constraint,
    ]);
  const mover = async (constraint: Spec) => {
    const res = await importRive(file(constraint), 'c');
    return { res, node: res.artboards[0].children.find((n) => n.name === 'Mover')! };
  };

  it('imports rotation constraints with the factor, offset, limits (radians to degrees) and source space', async () => {
    const { node, res } = await mover(['RotationConstraint', { parentId: 1, targetId: 2, strength: 0.5, copyFactor: 0.5, offset: true, min: true, minValue: -Math.PI / 2, max: true, maxValue: Math.PI, sourceSpaceValue: 1 }]);
    expect(node.constraints).toHaveLength(1);
    expect(node.constraints![0]).toMatchObject({ type: 'copyRotation', strength: 0.5, factor: 0.5, additive: true, min: -90, max: 180, space: 'local' });
    expect(res.warnings.some((w) => /Rotation and scale constraints are not imported/.test(w))).toBe(false);
  });

  it('imports scale constraints per axis with limits, defaulting to world scale', async () => {
    const { node } = await mover(['ScaleConstraint', { parentId: 1, targetId: 2, doesCopyY: false, copyFactor: 2, max: true, maxValue: 3, minY: true, minValueY: 0.5, copyFactorY: 2 }]);
    expect(node.constraints![0]).toMatchObject({ type: 'copyScale', space: 'world', copyX: true, copyY: false, factor: 2, max: 3, minY: 0.5 });
    expect(node.constraints![0].min).toBeUndefined();
  });

  it('imports translation constraint factor, offset and limits instead of plain copies', async () => {
    const { node, res } = await mover(['TranslationConstraint', { parentId: 1, targetId: 2, copyFactor: 0.25, offset: true, max: true, maxValue: 40, doesCopyY: false, copyFactorY: 0.25 }]);
    expect(node.constraints![0]).toMatchObject({ type: 'copyPosition', factor: 0.25, additive: true, max: 40, copyY: false });
    expect(res.warnings.some((w) => /plain copies/.test(w))).toBe(false);
  });

  it('imports follow path constraints (distance along the outline, orient)', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Node', { name: 'Rider', parentId: 0 }], // 1
        ['Shape', { name: 'Track', parentId: 0 }], // 2
        ['Rectangle', { parentId: 2, width: 100, height: 10 }],
        ['FollowPathConstraint', { parentId: 1, targetId: 2, distance: 0.25, orient: false }],
      ]),
      'fp',
    );
    const rider = res.artboards[0].children.find((n) => n.name === 'Rider')!;
    const track = res.artboards[0].children.find((n) => n.name === 'Track')!;
    expect(rider.constraints).toHaveLength(1);
    expect(rider.constraints![0]).toMatchObject({ type: 'followPath', target: track.id, distance: 0.25, orient: false });
    expect(res.warnings.some((w) => /FollowPath constraints are not supported/.test(w))).toBe(false);
  });

  it('keys the strength and the path distance onto the constraint', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Node', { name: 'Rider', parentId: 0 }], // 1
        ['Shape', { name: 'Track', parentId: 0 }], // 2
        ['Rectangle', { parentId: 2, width: 100, height: 10 }],
        ['FollowPathConstraint', { parentId: 1, targetId: 2, distance: 0 }], // 4
        ['LinearAnimation', { name: 'Go', fps: 60, duration: 60 }],
        ['KeyedObject', { objectId: 4 }],
        ['KeyedProperty', { propertyKey: propKey('FollowPathConstraint', 'distance') }],
        ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
        ['KeyFrameDouble', { frame: 60, value: 1, interpolationType: 1 }],
      ]),
      'fp2',
    );
    const rider = res.artboards[0].children.find((n) => n.name === 'Rider')!;
    const tl = res.artboards[0].timelines.find((t) => t.name === 'Go')!;
    expect(tl.tracks.map((t) => [t.nodeId, t.prop])).toEqual([[rider.id, 'constraints.0.distance']]);
  });
});

describe('Rive transition blend durations', () => {
  const machine = (transition: Record<string, unknown>) =>
    writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['LinearAnimation', { name: 'Idle', fps: 10, duration: 20, loopValue: 1 }], // 2 s
      ['LinearAnimation', { name: 'Wave', fps: 10, duration: 10 }],
      ['StateMachine', { name: 'SM' }],
      ['StateMachineTrigger', { name: 'go' }],
      ['StateMachineLayer', { name: 'L' }],
      ['AnimationState', { animationId: 0 }], // 0
      ['StateTransition', { stateToId: 1, ...transition }],
      ['TransitionTriggerCondition', { inputId: 0 }],
      ['AnimationState', { animationId: 1 }], // 1
      ['AnyState', {}],
      ['ExitState', {}],
      ['EntryState', {}],
      ['StateTransition', { stateToId: 0 }],
    ]);
  const fadeOf = async (transition: Record<string, unknown>) => {
    const res = await importRive(machine(transition), 'sm');
    const ab = res.artboards[0];
    const wave = ab.timelines.find((t) => t.name === 'Wave')!;
    return { res, ab, plays: ab.logic.nodes.filter((n) => n.kind === 'action.timeline' && n.params.timeline === wave.id) };
  };

  it('cross-fades into the next state over the transition duration (milliseconds)', async () => {
    const { plays, res } = await fadeOf({ duration: 250 });
    expect(plays).toHaveLength(1);
    expect(plays[0].params).toMatchObject({ op: 'restart', fade: '250' });
    expect(res.warnings.some((w) => /blend durations/.test(w))).toBe(false);
  });

  it('turns a percentage duration into a share of the state\'s animation', async () => {
    const { plays } = await fadeOf({ duration: 25, flags: 2 });
    expect(plays[0].params.fade).toBe('500'); // 25% of the 2 s animation
  });

  it('adds no blend-in with a zero duration, and skips disabled transitions', async () => {
    const { plays } = await fadeOf({});
    expect(Number(plays[0].params.fade)).toBe(0);
    const off = await fadeOf({ duration: 100, flags: 1 });
    expect(off.plays).toHaveLength(0);
  });
});

describe('Rive text box settings', () => {
  const text = async (props: Record<string, unknown>) => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Text', { name: 'T', parentId: 0, width: 100, height: 40, ...props }], // 1
        ['TextStyle', { parentId: 1, fontSize: 12 }], // 2
        ['TextValueRun', { parentId: 1, text: 'Hello there', styleId: 2 }],
      ]),
      't',
    );
    let found: unknown;
    walk(res.artboards[0].children, (n) => n.name === 'T' && (found = n));
    return { res, node: found as { verticalAlign: string; overflow?: string; wrap?: boolean; autoSize: string } };
  };
  it('imports vertical alignment, overflow and no-wrap of a fixed box', async () => {
    const { node } = await text({ sizingValue: 2, verticalAlignValue: 2, overflowValue: 3, wrapValue: 1 });
    expect(node).toMatchObject({ autoSize: 'none', verticalAlign: 'bottom', overflow: 'ellipsis', wrap: false });
  });
  it('treats hidden and clipped as clipping, keeps defaults off the node, and warns about fit', async () => {
    const hidden = await text({ sizingValue: 2, overflowValue: 1 });
    expect(hidden.node.overflow).toBe('hidden');
    const plain = await text({ sizingValue: 2 });
    expect(plain.node.overflow).toBeUndefined();
    expect(plain.node.wrap).toBeUndefined();
    expect(plain.node.verticalAlign).toBe('top');
    const fit = await text({ sizingValue: 2, overflowValue: 4, paragraphSpacing: 6 });
    expect(fit.node.overflow).toBe('hidden');
    expect(fit.res.warnings.some((w) => /fit/.test(w))).toBe(true);
    expect(fit.res.warnings.some((w) => /Paragraph spacing/.test(w))).toBe(true);
    const auto = await text({ sizingValue: 1, overflowValue: 3 });
    expect(auto.node.overflow).toBeUndefined();
  });
});

describe('Rive pointer listeners', () => {
  it('imports move and drag listeners as pointer move and drag events', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Node', { name: 'Hot', parentId: 0 }], // 1
        ['StateMachine', { name: 'SM' }],
        ['StateMachineBool', { name: 'on' }],
        ['StateMachineListenerSingle', { targetId: 1, listenerTypeValue: 4 }],
        ['ListenerBoolChange', { inputId: 0, value: 1 }],
        ['StateMachineListenerSingle', { targetId: 1, listenerTypeValue: 12 }],
        ['ListenerBoolChange', { inputId: 0, value: 1 }],
        ['StateMachineListenerSingle', { targetId: 1, listenerTypeValue: 9 }],
        ['ListenerBoolChange', { inputId: 0, value: 1 }],
        ['StateMachineListenerSingle', { targetId: 1, listenerTypeValue: 10 }],
        ['ListenerBoolChange', { inputId: 0, value: 0 }],
        ['StateMachineListenerSingle', { targetId: 1, listenerTypeValue: 13 }],
        ['ListenerBoolChange', { inputId: 0, value: 0 }],
      ]),
      'l',
    );
    const ab = res.artboards[0];
    const hot = ab.children.find((n) => n.name === 'Hot')!;
    const types = ab.logic.nodes.filter((n) => n.kind === 'event.pointer').map((n) => [n.params.target, n.params.type]);
    expect(types).toEqual([[hot.id, 'pointermove'], [hot.id, 'drag'], [hot.id, 'dragstart'], [hot.id, 'dragend']]);
    expect(res.warnings.filter((w) => /Listener type/.test(w))).toEqual([expect.stringContaining('Listener type 13')]);
  });
});

describe('Rive reversed layout directions', () => {
  const layout = async (dir: number) => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['LayoutComponent', { name: 'Row', parentId: 0, width: 100, height: 50, styleId: 2 }], // 1
        ['LayoutComponentStyle', { flexDirectionValue: dir }], // 2
        ['Node', { name: 'A', parentId: 1 }],
        ['Node', { name: 'B', parentId: 1 }],
      ]),
      'lay',
    );
    let found: { layout?: { direction: string; reverse?: boolean } } | undefined;
    walk(res.artboards[0].children, (n) => n.name === 'Row' && (found = n as never));
    return found!.layout!;
  };
  it('keeps the order for row and column, and reverses it for the reversed directions', async () => {
    expect(await layout(2)).toMatchObject({ direction: 'row', reverse: true });
    expect(await layout(3)).toMatchObject({ direction: 'row', reverse: false });
    expect(await layout(0)).toMatchObject({ direction: 'column', reverse: true });
    expect(await layout(1)).toMatchObject({ direction: 'column', reverse: false });
  });
});
