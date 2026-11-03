import { describe, expect, it } from 'vitest';
import { relayoutTree, walk } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';
import { scenes as layoutScenes } from './rive-layout-scenes';

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

describe('Rive text placement, weight and radial gradients', () => {
  const textFile = (textProps: Record<string, unknown>, extra: Spec[] = [], body = 'Hello there') =>
    writeRiv([
      ['Artboard', { name: 'Main', width: 400, height: 200 }],
      ['Text', { name: 'T', parentId: 0, x: 100, y: 50, ...textProps }], // 1
      ['TextStyle', { parentId: 1, fontSize: 20 }], // 2
      ['TextValueRun', { parentId: 1, text: body, styleId: 2 }],
      ...extra,
    ]);
  const find = (ab: { children: unknown[] }, name: string) => {
    let found: { x: number; width: number; align: string; fontWeight: number } | undefined;
    walk(ab.children as never, (n) => n.name === name && (found = n as never));
    return found!;
  };

  it('does not lay out a root that holds only text: the text keeps its position', async () => {
    const ab = (await importRive(textFile({ sizingValue: 0 }), 't')).artboards[0];
    expect(ab.children.some((c) => c.name === 'Artboard layout')).toBe(false);
    expect(find(ab, 'T').x).toBe(100);
  });

  it('gives auto-width text a box as wide as its text, aligned to its origin', async () => {
    const centred = find((await importRive(textFile({ sizingValue: 0, originX: 0.5, alignValue: 0 }), 't')).artboards[0], 'T');
    expect(centred.align).toBe('center');
    expect(centred.width).toBeGreaterThan(40);
    expect(centred.width).toBeLessThan(200);
    // The box is centred on the origin, so its left edge sits half a width to the left of x
    expect(centred.x).toBeCloseTo(100 - centred.width / 2, 0);
    const right = find((await importRive(textFile({ sizingValue: 0, originX: 1 }), 't')).artboards[0], 'T');
    expect(right.align).toBe('right');
    // Centred lines of a multi-line block stay centred in a box the width of the longest line
    const multi = find((await importRive(textFile({ sizingValue: 0, alignValue: 2 }, [], 'ab\nabcdefghij'), 't')).artboards[0], 'T');
    expect(multi.align).toBe('center');
    expect(multi.width).toBeLessThan(200);
  });

  it('reads the variable font weight axis', async () => {
    const axis: Spec[] = [['TextStyleAxis', { parentId: 2, tag: 0x77676874, axisValue: 700 }]];
    expect(find((await importRive(textFile({}, axis), 't')).artboards[0], 'T').fontWeight).toBe(700);
    expect(find((await importRive(textFile({}), 't')).artboards[0], 'T').fontWeight).toBe(400);
  });

  it('squeezes a radial gradient that ends at the box side, since ours ends at the farthest corner', async () => {
    const file = (endX: number) =>
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Shape', { name: 'Dot', parentId: 0 }], // 1
        ['Ellipse', { parentId: 1, width: 200, height: 200 }],
        ['Fill', { parentId: 1 }], // 3
        ['RadialGradient', { parentId: 3, endX }], // 4
        ['GradientStop', { parentId: 4, colorValue: 0xffff0000, position: 0 }],
        ['GradientStop', { parentId: 4, colorValue: 0xff0000ff, position: 1 }],
      ]);
    const stops = async (endX: number) => {
      let fill: { stops: { offset: number }[] } | undefined;
      walk((await importRive(file(endX), 'g')).artboards[0].children, (n) => n.name === 'Dot' && (fill = (n as never as { fill: typeof fill }).fill));
      return fill!.stops.map((s) => s.offset);
    };
    // Radius 100 in a 200x200 box: the corner is 141 away, so the blue is reached at 0.71 and carries on
    expect(await stops(100)).toEqual([0, 0.71, 1]);
    // Reaching the corner or beyond needs no change
    expect(await stops(142)).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------- layout styles
// The scenes in rive-layout-scenes.ts were drawn by the Rive runtime and by our player side by side; the numbers below
// are where Rive put each box (measured from its render, in artboard px), so these hold the importer and the layout
// engine to what Rive does. A box is found by the name its layout has in the scene.

type Box = { x: number; y: number; width: number; height: number };
const near = (b: Box, x: number, y: number, w: number, h: number, tol = 1) => {
  expect(Math.abs(b.x - x), `x ${b.x} vs ${x}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(b.y - y), `y ${b.y} vs ${y}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(b.width - w), `width ${b.width} vs ${w}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(b.height - h), `height ${b.height} vs ${h}`).toBeLessThanOrEqual(tol);
};

const sceneOf = (name: string) => layoutScenes().find((d) => d.name === name)!;
/** Import one scene, lay it out as the editor and player do, and find boxes by name. */
const laid = async (name: string, mutate?: (specs: Spec[]) => void) => {
  const specs = sceneOf(name).specs.slice();
  mutate?.(specs);
  const res = await importRive(writeRiv([['Backboard', {}], ...specs]), name);
  const ab = res.artboards[0];
  relayoutTree(ab.children);
  const by = (n: string): Box & { layoutItem?: unknown; layout?: unknown } => {
    let found: unknown;
    walk(ab.children, (x) => x.name === n && (found = x));
    if (!found) throw new Error(`no layer "${n}"`);
    return found as Box;
  };
  return { res, by };
};

describe('Rive layout styles', () => {
  it('puts padding and a gap in px where Rive does', async () => {
    const { by } = await laid('pad');
    near(by('b0'), 20, 20, 60, 60);
    near(by('b1'), 90, 20, 60, 60);
    near(by('b2'), 160, 20, 60, 60);
  });

  it('ignores padding and gaps that have no unit, as Rive does', async () => {
    const { by } = await laid('pad', (specs) => {
      for (const s of specs) if (s[0] === 'LayoutComponentStyle') for (const k of Object.keys(s[1])) if (/UnitsValue$/.test(k)) delete s[1][k];
    });
    near(by('b0'), 0, 0, 60, 60);
    near(by('b1'), 60, 0, 60, 60);
  });

  it('resolves percent padding, gaps and sizes against the width of the layout that owns them', async () => {
    // Root 400 wide, padding 10% = 40 on every side (even the top), a gap of 5% = 20, children 20% of the 320 inside
    const { by, res } = await laid('percent');
    near(by('b0'), 40, 40, 64, 50);
    near(by('b1'), 124, 40, 64, 50);
    near(by('b2'), 208, 40, 64, 50);
    expect(res.warnings.some((w) => /Percentage padding/.test(w))).toBe(false);
  });

  it('resolves percent margins against the parent\'s inner width, and keeps px and negative margins', async () => {
    const { by } = await laid('margin');
    near(by('m1'), 20, 20, 60, 60);
    // 10% of the 390 px inside the root's 10 px padding
    near(by('m2'), 129.3, 10, 60, 60);
    near(by('m3'), 169.3, 50, 60, 60);
  });

  it('gives auto margins the free space of the line', async () => {
    const { by } = await laid('auto');
    near(by('x1'), 10, 10, 60, 60);
    near(by('x2'), 270, 10, 60, 60);
    near(by('x3'), 330, 10, 60, 60);
  });

  it('places absolute layers by px and percent insets from the layout\'s edges', async () => {
    // Percent insets are shares of the inner size (360 x 180 inside the root's 40 / 20 padding), measured from the outer edge
    const { by } = await laid('inset');
    near(by('i1'), 36, 18, 60, 60);
    near(by('i2'), 320, 122, 60, 60);
    near(by('i3'), 40, 20, 60, 60);
  });

  it('uses the other axis\'s gap between wrapped lines', async () => {
    const { by, res } = await laid('wrapgap');
    near(by('w0'), 10, 10, 110, 40);
    near(by('w2'), 250, 10, 110, 40);
    near(by('w3'), 10, 80, 110, 40);
    near(by('w4'), 130, 80, 110, 40);
    expect(res.warnings).toEqual([]);
  });

  it('takes a layout\'s border widths as room inside it, like padding', async () => {
    const { by } = await laid('border');
    near(by('bd'), 10, 10, 120, 100);
    // (the inner box's x and y are inside the border box: 10 border + 10 padding)
    near(by('inner'), 20, 20, 40, 40);
  });

  it('resolves nested percent padding, margin and gap the way Rive does', async () => {
    const { by } = await laid('nested');
    near(by('p'), 20, 20, 190, 150);
    // k1 and k2 are measured from the card: padding 10% of 380 = 38 on the left and top, k1 also a 10% margin of the card's inner width
    near(by('k1'), 52.7, 38, 40, 30, 1);
    near(by('k2'), 38, 91.3, 40, 30, 1);
    near(by('q'), 220, 20, 60, 60);
  });

  it('centres, ends and spreads children by the 9 positions and space-between', async () => {
    near((await laid('alignC')).by('a0'), 115, 80, 50, 40);
    near((await laid('alignBR')).by('a2'), 350, 120, 50, 80);
    const sb = (await laid('alignSB')).by;
    near(sb('a0'), 0, 0, 50, 40);
    near(sb('a2'), 350, 0, 50, 80);
  });

  it('keeps one radius when the corners are linked and four when they are not', async () => {
    const linked = await laid('border');
    expect((linked.by('bd') as unknown as { cornerRadius: number; cornerRadii?: unknown }).cornerRadius).toBe(30);
    expect('cornerRadii' in linked.by('bd')).toBe(false);
    const { by } = await laid('corners');
    expect(by('c')).toMatchObject({ cornerRadii: [40, 0, 40, 0] });
    expect(by('c2')).toMatchObject({ cornerRadii: [0, 50, 0, 10] });
  });
});

describe('Rive grid and stack layouts', () => {
  it('sizes tracks in px, percent, fr and auto, with gaps, in the order the layers come', async () => {
    // Columns 25%, 80 px, 1fr, 2fr and rows 60 px, 1fr in a 400 x 200 box with 10 px padding and gaps
    const { by, res } = await laid('grid_basic');
    near(by('g0'), 10, 10, 94.7, 60);
    near(by('g1'), 115.3, 10, 79.4, 60);
    near(by('g2'), 205.3, 10, 58, 60);
    near(by('g3'), 273.3, 10, 116.7, 60);
    near(by('g4'), 10, 80, 94.7, 110);
    near(by('g5'), 115.3, 80, 79.4, 110);
    expect(res.warnings).toEqual([]);
  });

  it('sizes auto tracks to what is in them, and lets a fr track have the rest', async () => {
    const { by } = await laid('grid_auto');
    near(by('g0'), 10, 10, 30, 30);
    near(by('g1'), 50, 10, 60, 20);
    near(by('g2'), 120, 10, 40, 50);
    near(by('g3'), 10, 80, 20, 20);
    // A layer that fills its cell stretches to the column the others make
    near(by('g4'), 50, 80, 60, 30);
    near(by('g5'), 120, 80, 50, 30);
  });

  it('places layers where their placement says, spans cells, and puts the rest in the next free cell', async () => {
    const { by } = await laid('grid_place');
    near(by('g0'), 100, 10, 80, 50); // column 2, row 1
    near(by('g2'), 10, 70, 80, 50); // column 1, row 2
    near(by('g3'), 190, 10, 80, 50); // column -1: the last one
    near(by('g1'), 100, 70, 170, 50); // two columns wide, in the first free spot that fits
  });

  it('centres the tracks and the layers in their rows for the centre alignments, spreads columns for the spread ones, and leaves the end ones at the start', async () => {
    const c = (await laid('grid_center')).by;
    near(c('g0'), 90, 45.3, 30, 30);
    near(c('g1'), 210, 50, 60, 20);
    near(c('g2'), 90, 125.3, 30, 30);
    const s = (await laid('grid_spread')).by;
    near(s('g0'), 0, 55.3, 30, 30);
    near(s('g1'), 300, 60, 60, 20);
    // End does nothing in the Rive runtime's grid
    const e = (await laid('grid_end')).by;
    near(e('g0'), 0, 0, 30, 30);
    near(e('g1'), 100, 0, 60, 20);
    const t = (await laid('grid_topcenter')).by;
    near(t('g0'), 100, 0, 30, 30);
    near(t('g1'), 200, 0, 60, 20);
  });

  it('puts a layer in its cell by the justify-items setting, and fills the cell when it fills', async () => {
    const c = (await laid('grid_just')).by;
    near(c('g0'), 60, 0, 30, 30);
    near(c('g1'), 150, 0, 150, 30);
    const e = (await laid('grid_justend')).by;
    near(e('g0'), 120, 0, 30, 30);
  });

  it('stacks every layer in one cell, placed by the alignment', async () => {
    const c = (await laid('stack_center')).by;
    near(c('g0'), 185, 85, 30, 30);
    near(c('g1'), 170, 90, 60, 20);
    const e = (await laid('stack_end')).by;
    near(e('g0'), 370, 170, 30, 30);
    near(e('g1'), 340, 180, 60, 20);
    near((await laid('stack_top')).by('g0'), 0, 0, 30, 30);
  });

  it('uses a track\'s minimum size when it has its own maximum, and says so', async () => {
    const { res } = await laid('grid_basic', (specs) => {
      const t = specs.find((sp) => sp[0] === 'GridTrack')!;
      t[1].trackMaxType = 3;
      t[1].trackMaxValue = 1;
    });
    expect(res.warnings).toEqual([expect.stringContaining('maximum size')]);
  });
});

describe('Rive flex basis, weights and aspect ratio', () => {
  it('starts a fill layer from its flex basis (px, or a share of the row) and shares the rest; fixed layers ignore it', async () => {
    const { by } = await laid('basis');
    near(by('f0'), 10, 10, 60, 40); // fixed: the basis is not used
    near(by('f1'), 80, 10, 60, 40);
    near(by('f2'), 150, 10, 140, 40); // 50 px basis + its half of the free space
    near(by('f3'), 300, 10, 90, 40);
    const col = (await laid('basiscol')).by;
    near(col('f0'), 10, 10, 60, 20);
    near(col('f1'), 10, 40, 60, 20);
    near(col('f2'), 10, 70, 60, 120);
  });

  it('shares the free space by the fill layers\' weights', async () => {
    const { by } = await laid('fraction');
    near(by('r0'), 10, 10, 90, 40);
    near(by('r1'), 110, 10, 180, 40);
    near(by('r2'), 300, 10, 90, 40);
  });

  it('starts fill layers from their content when the basis is auto, so a layer with more inside gets more', async () => {
    const { by } = await laid('basisauto');
    near(by('r0'), 10, 10, 173.3, 60);
    near(by('r1'), 193.3, 10, 113.4, 60);
    near(by('r2'), 316.7, 10, 73.3, 60);
  });

  it('derives a hugging size from the other one by the aspect ratio', async () => {
    // Width 120, height hugging, ratio 3: 40 tall
    const a0 = (await laid('ar0')).by;
    near(a0('a0'), 10, 10, 120, 40);
    near(a0('a1'), 140, 10, 50, 50);
    // A fill width in a row (330 of 390 after the 50 px box and the gap), ratio 1.5
    near((await laid('ar2')).by('a0'), 10, 10, 330, 220);
    // Height fixed at 60, width hugging, ratio 0.5: 30 wide
    near((await laid('ar3')).by('a0'), 10, 10, 30, 60);
    // The height-only mode never gives the width
    const a1 = (await laid('ar1')).by;
    near(a1('a0'), 10, 10, 0, 60);
    near(a1('a1'), 20, 10, 50, 50);
  });
});

describe('Rive dashes on layouts and shapes', () => {
  const dashesOf = async (name: string, find: string) => {
    const specs = layoutScenes().find((d) => d.name === name)!.specs;
    const res = await importRive(writeRiv([['Backboard', {}], ...specs]), name);
    let found: unknown;
    walk(res.artboards[0].children, (x) => x.name === find && (found = x));
    return { res, node: found as { stroke: { dash?: number[]; dashOffset?: number } | null; width: number; height: number } };
  };

  it('imports pixel dashes and an offset on a layout\'s border', async () => {
    const { node, res } = await dashesOf('dashround', 'round');
    expect(node.stroke).toMatchObject({ dash: [16, 10], dashOffset: 8 });
    expect(res.warnings.some((w) => /Dash/.test(w))).toBe(false);
  });

  it('turns dash lengths given as a share of the outline into px, for a layout', async () => {
    // 200 x 120 box: 640 px round, so 5% is 32 and 2.5% is 16, as Rive draws it
    const { node, res } = await dashesOf('dashpct', 'pct');
    expect(node.stroke!.dash).toEqual([32, 16]);
    expect(res.warnings.some((w) => /Dash/.test(w))).toBe(false);
  });

  it('measures an ellipse and a rectangle shape for share dashes, and keeps their size (the dash sits on the outline)', async () => {
    const { node } = await dashesOf('dashshape', 'r');
    // The rectangle's dashes are 1000% of 460 px: a solid line (no gap is longer than the outline)
    expect(node.stroke!.dash![0]).toBeCloseTo(4600, 0);
    expect(node.width).toBe(130);
    expect(node.height).toBe(100);
    const e = await dashesOf('dashshape', 'e');
    expect(e.node.stroke!.dash).toEqual([14, 8]);
    expect(e.node.width).toBe(160);
  });
});

describe('Rive text in layouts', () => {
  // A text sits in a hugging layout, which sits in the column: it wraps at the column's width and its box shrinks to the widest line
  const textScene = async (name: string, wrapper?: Record<string, unknown>) => {
    const specs = sceneOf(name).specs.map((sp): Spec => (wrapper && sp[0] === 'LayoutComponentStyle' && sp[1].intrinsicallySizedValue ? [sp[0], { ...sp[1], ...wrapper }] : sp));
    const res = await importRive(writeRiv([['Backboard', {}], ...specs]), 'text');
    const ab = res.artboards[0];
    relayoutTree(ab.children);
    const nodes: Record<string, unknown>[] = [];
    walk(ab.children, (x) => nodes.push(x as never));
    const text = nodes.find((x) => x.type === 'text') as { autoSize: string; maxWidth?: number; width: number; layoutItem: { width: string; wrapText?: boolean } };
    return { text, wrapper: nodes.find((x) => x.name === 'txt') as { layoutItem: { width: string } } };
  };

  it('keeps a hugging text hugging, and lets it wrap at the room its column offers', async () => {
    // Column inside 20 px of padding: 360 px of room
    const { text, wrapper } = await textScene('t_hug');
    expect(wrapper.layoutItem.width).toBe('hug');
    expect(text.autoSize).toBe('width');
    expect(text.layoutItem).toMatchObject({ width: 'hug', wrapText: true });
    expect(text.maxWidth).toBe(360);
  });

  it('wraps a hugging text in a row at what the layers before it leave, plus the wrapping the reference has', async () => {
    // Root 400 wide, padding 20: 360 inside. Layers before the text: a 60 px box and a 10 px gap. Rive wraps this at ~345
    expect((await textScene('tr_p2')).text.maxWidth).toBeCloseTo(345, 0);
    // Nothing before it: the whole 360
    expect((await textScene('tr_p1')).text.maxWidth).toBe(360);
    // Layers after it do not narrow it (tr_p3 has a footer)
    expect((await textScene('tr_p3')).text.maxWidth).toBeCloseTo(345, 0);
    expect((await textScene('tr_big')).text.maxWidth).toBeCloseTo(255, 0);
    expect((await textScene('tr_pad50')).text.maxWidth).toBeCloseTo(285, 0);
  });

  it('does not limit a text that fills or has a fixed box', async () => {
    expect((await textScene('tr_fill')).text.maxWidth).toBeUndefined();
    expect((await textScene('tr_fixed')).text.maxWidth).toBeUndefined();
  });
});

describe('Rive cubic value interpolators', () => {
  const rotation = async (interp: Spec, interpolationType: number) => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Node', { name: 'N', parentId: 0 }], // 1
        interp, // 2
        ['LinearAnimation', { name: 'Spin', fps: 24, duration: 16 }],
        ['KeyedObject', { objectId: 1 }],
        ['KeyedProperty', { propertyKey: propKey('Node', 'rotation') }],
        ['KeyFrameDouble', { frame: 0, value: Math.PI / 2, interpolationType, interpolatorId: 2 }],
        ['KeyFrameDouble', { frame: 8, value: -0.1745 }],
      ]),
      'ci',
    );
    return res.artboards[0].timelines.find((t) => t.name === 'Spin')!.tracks[0].keys[0].ease;
  };

  it('keeps a cubic ease as it is', async () => {
    expect(await rotation(['CubicEaseInterpolator', { x1: 0.2, y1: 1.3, x2: 0.5, y2: 0.9 }], 2)).toEqual([0.2, 1.3, 0.5, 0.9]);
  });

  it('turns the handle values of a cubic value curve into a share of the segment, since its y numbers are in the property\'s own units', async () => {
    // From 1.5708 (90 degrees) to -0.1745: a handle at 1.2975 is 16% of the way, and one at the end value is the whole way
    const ease = (await rotation(['CubicValueInterpolator', { x1: 0.04, y1: 1.2975, y2: -0.1745 }], 3)) as number[];
    expect(ease).toEqual([0.04, 0.157, 0.58, 1]);
  });
});

describe('Rive dash animation', () => {
  /** The scene with a DashPath offset animated 0 to 1 (a share of the outline when `percent`) */
  const marching = async (scene: string, percent: boolean, target: 'offset' | 'length' = 'offset') => {
    const specs = sceneOf(scene).specs.slice();
    const dp = specs.findIndex((sp) => sp[0] === 'DashPath');
    if (percent) specs[dp][1].offsetIsPercentage = true;
    const owner = target === 'offset' ? dp : specs.findIndex((sp) => sp[0] === 'Dash');
    specs.push(
      ['LinearAnimation', { name: 'March', fps: 60, duration: 60 }],
      ['KeyedObject', { objectId: owner }],
      ['KeyedProperty', { propertyKey: propKey(target === 'offset' ? 'DashPath' : 'Dash', target) }],
      ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 1, interpolationType: 1 }],
    );
    const res = await importRive(writeRiv([['Backboard', {}], ...specs]), scene);
    return { res, tracks: res.artboards[0].timelines.find((t) => t.name === 'March')!.tracks };
  };

  it('keys the dash offset of a layout\'s border, in px', async () => {
    const { tracks, res } = await marching('dash', false);
    expect(tracks.map((t) => [t.prop, t.keys.map((k) => k.value)])).toEqual([['stroke.dashOffset', [0, 1]]]);
    expect(res.warnings).toEqual([]);
  });

  it('keys an offset given as a share of the outline as px of it (a 200 x 120 box is 640 round)', async () => {
    const { tracks, res } = await marching('dashpct', true);
    expect(tracks.map((t) => [t.prop, t.keys.map((k) => k.value)])).toEqual([['stroke.dashOffset', [0, 640]]]);
    expect(res.warnings).toEqual([]);
    // The same on a plain shape: the 160 x 100 ellipse is about 414 round
    const shape = await marching('dashshape', true);
    const key = shape.tracks.find((t) => t.prop === 'stroke.dashOffset')!.keys[1].value as number;
    expect(key).toBeGreaterThan(413);
    expect(key).toBeLessThan(415);
  });

  it('says what is not imported when dash lengths are animated, and not that dashes are unsupported', async () => {
    const { res } = await marching('dash', false, 'length');
    expect(res.warnings).toEqual(['Animated dash lengths are not imported; the dashes keep their starting lengths']);
  });
});
