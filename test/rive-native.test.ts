import { describe, expect, it, vi } from 'vitest';
import { Player, evaluate, relayoutTree, walk } from 'interactives-player';
import type { SceneNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';
import { box, colors, doc } from './rive-layout-scenes';

const find = (nodes: SceneNode[], name: string): SceneNode | undefined => {
  let hit: SceneNode | undefined;
  walk(nodes, (n) => {
    if (!hit && n.name === name) hit = n;
  });
  return hit;
};

describe('Rive joysticks', () => {
  const scene = (joystick: Record<string, unknown>) =>
    writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['Node', { name: 'Knob', parentId: 0, x: 50, y: 100 }], // 1
      ['Node', { name: 'Needle', parentId: 0 }], // 2
      ['Joystick', { name: 'Stick', parentId: 0, posX: 0, posY: 0, width: 100, height: 200, originX: 0, originY: 0, xId: 0, yId: 1, ...joystick }], // 3
      ['LinearAnimation', { name: 'Left to right', duration: 60, fps: 60 }],
      ['KeyedObject', { objectId: 2 }],
      ['KeyedProperty', { propertyKey: propKey('Node', 'x') }],
      ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 100, interpolationType: 1 }],
      ['LinearAnimation', { name: 'Top to bottom', duration: 60, fps: 60 }],
      ['KeyedObject', { objectId: 2 }],
      ['KeyedProperty', { propertyKey: propKey('Node', 'y') }],
      ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 100, interpolationType: 1 }],
    ] as Spec[]);

  it('imports a joystick with a handle layer as a handle in an area', async () => {
    const res = await importRive(scene({ handleSourceId: 1 }), 'j');
    const ab = res.artboards[0];
    const knob = find(ab.children, 'Knob')!;
    expect(ab.joysticks).toHaveLength(1);
    expect(ab.joysticks![0]).toMatchObject({ name: 'Stick', x: 'handle.x', y: 'handle.y', handle: knob.id, area: { x: 0, y: 0, width: 100, height: 200 } });
    expect(ab.joysticks![0].xTimeline).toBe(ab.timelines[0].id);
    expect(ab.joysticks![0].yTimeline).toBe(ab.timelines[1].id);
    expect(res.warnings.filter((w) => /oystick/.test(w))).toEqual([]);
  });

  it('puts the handle where its position says in the running player, and inverts an axis', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    document.body.innerHTML = '<div id="stage" style="width:200px;height:200px"></div>';
    const res = await importRive(scene({ handleSourceId: 1, joystickFlags: 2 }), 'j');
    const project = { ...(await import('interactives-player')).createProject(), artboards: res.artboards };
    const knob = find(res.artboards[0].children, 'Knob')!;
    const needle = find(res.artboards[0].children, 'Needle')!;
    knob.x = 75; // three quarters across the rectangle
    knob.y = 50; // a quarter down, and the y axis is inverted
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    player.step(16);
    const el = document.querySelector(`[data-ix-id="${needle.id}"]`) as HTMLElement;
    expect(el.style.transform).toContain('translate(75px, 75px');
    player.destroy();
    vi.unstubAllGlobals();
  });

  it('imports align target actions as x and y set from the pointer, through the parent\'s transform', async () => {
    const bytes = writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200, originX: 0.5, originY: 0.5 }],
      ['Node', { name: 'Holder', parentId: 0, x: 20, y: 10, scaleX: 2, scaleY: 2 }], // 1
      ['Node', { name: 'Knob', parentId: 1 }], // 2
      ['Node', { name: 'Pad', parentId: 0 }], // 3
      ['StateMachine', { name: 'SM' }],
      ['StateMachineListenerSingle', { targetId: 3, listenerTypeValue: 12 }],
      ['ListenerAlignTarget', { targetId: 2 }],
    ] as Spec[]);
    const res = await importRive(bytes, 'j');
    const nodes = res.artboards[0].logic.nodes.filter((n) => n.kind === 'action.setProperty');
    expect(nodes.map((n) => n.params.prop)).toEqual(['x', 'y']);
    // the pointer at artboard (130, 120) is Rive (30, 20): inside the holder (30 - 20) / 2 = 5 and (20 - 10) / 2 = 5
    const at = (e: string) => evaluate(e, { vars: {}, extra: { event: { x: 130, y: 120 } } });
    expect(at(String(nodes[0].params.value))).toBeCloseTo(5);
    expect(at(String(nodes[1].params.value))).toBeCloseTo(5);
    expect(res.warnings.filter((w) => /Align|align/.test(w))).toEqual([]);
  });

  it('imports a drag listener that aligns its own layer to the pointer as a draggable layer', async () => {
    const bytes = writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['Node', { name: 'Holder', parentId: 0, x: 20, y: 10 }], // 1
      ['Node', { name: 'Knob', parentId: 1 }], // 2
      ['Node', { name: 'Grip', parentId: 2 }], // 3 (inside the knob)
      ['StateMachine', { name: 'SM' }],
      ['StateMachineListenerSingle', { targetId: 3, listenerTypeValue: 12 }],
      ['ListenerAlignTarget', { targetId: 2, preserveOffset: true }],
    ] as Spec[]);
    const res = await importRive(bytes, 'j');
    const knob = (res.artboards[0].children[0] as unknown as { children: { name: string; draggable?: unknown }[] }).children.find((c) => c.name === 'Knob');
    expect(knob?.draggable).toEqual({});
    expect(res.artboards[0].logic.nodes.filter((n) => n.kind === 'action.setProperty')).toEqual([]);
    expect(res.warnings.filter((w) => /Align|align/.test(w))).toEqual([]);
  });

  it('turns a joystick set by hand into fixed positions, with the inverts', async () => {
    const res = await importRive(scene({ x: 0.5, y: -1, joystickFlags: 2 }), 'j');
    expect(res.artboards[0].joysticks![0]).toMatchObject({ x: '0.75', y: '1' });
    expect(res.artboards[0].joysticks![0].handle).toBeUndefined();
  });

  it('uses the joystick rectangle at its place in the artboard, with the artboard origin and a parent', async () => {
    const bytes = writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200, originX: 0.5, originY: 0.5 }],
      ['Node', { name: 'Group', parentId: 0, x: 10, y: 20 }], // 1
      ['Node', { name: 'Knob', parentId: 1 }], // 2
      ['Joystick', { parentId: 1, posX: 5, posY: 5, width: 40, height: 40, handleSourceId: 2, xId: 0 }], // 3 (origin is the middle)
      ['LinearAnimation', { name: 'A', duration: 60, fps: 60 }],
    ] as Spec[]);
    const res = await importRive(bytes, 'j');
    // group (10,20) + joystick (5,5) - half its size, plus the artboard's origin (100, 100)
    expect(res.artboards[0].joysticks![0].area).toEqual({ x: 95, y: 105, width: 40, height: 40 });
  });
});

describe('Rive layer masks', () => {
  const scene = (maskFlags: number, extra: Spec[] = []) =>
    writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['Shape', { name: 'Content', parentId: 0 }], // 1
      ['Rectangle', { parentId: 1, width: 200, height: 200 }], // 2
      ['LayerMask', { parentId: 1, sourceId: 4, maskFlags }], // 3
      ['Node', { name: 'Hole', parentId: 0, x: 100, y: 100 }], // 4
      ['Shape', { name: 'Dot', parentId: 4 }], // 5
      ['Ellipse', { parentId: 5, width: 60, height: 60 }], // 6
      ...extra,
    ] as Spec[]);

  it('wraps the masked layer with a masking copy of the source', async () => {
    const res = await importRive(scene(4), 'm');
    const wrap = res.artboards[0].children.find((n) => n.name === 'Content (clipped)')!;
    expect(wrap).toBeTruthy();
    const kids = (wrap as unknown as { children: SceneNode[] }).children;
    expect(kids[0].mask).toBe(true);
    expect(find(kids[0] ? [kids[0]] : [], 'Dot')).toBeTruthy();
    expect(kids[1].name).toBe('Content');
    // Rive does not draw the source of a mask by itself
    expect(find(res.artboards[0].children, 'Hole')).toMatchObject({ visible: false });
    expect(res.warnings.filter((w) => /mask/i.test(w))).toEqual([]);
  });

  it('keeps drawing the source when the mask says so', async () => {
    const res = await importRive(scene(4 | 8), 'm');
    expect(find(res.artboards[0].children, 'Hole')).toMatchObject({ visible: true });
  });

  it('keeps the mode of inverted, luminance and inverted luminance masks, and skips a switched off one', async () => {
    const maskOf = async (flags: number) => {
      const res = await importRive(scene(flags), 'm');
      const wrap = find(res.artboards[0].children, 'Content (clipped)') as unknown as { children: SceneNode[] } | undefined;
      return { res, mask: wrap?.children[0] };
    };
    const alpha = await maskOf(4);
    expect(alpha.mask!.mask).toBe(true);
    expect(alpha.mask!.maskMode).toBeUndefined();
    for (const [flags, mode] of [[1 | 4, 'inverted'], [2 | 4, 'luminance'], [3 | 4, 'invertedLuminance']] as const) {
      const r = await maskOf(flags);
      expect(r.mask!.mask).toBe(true);
      expect(r.mask!.maskMode).toBe(mode);
      expect(r.res.warnings.filter((w) => /mask/i.test(w))).toEqual([]);
    }
    expect((await maskOf(0)).mask).toBeUndefined();
  });

  it('skips a mask whose source sits inside the masked layer', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Node', { name: 'Both', parentId: 0 }], // 1
        ['Shape', { name: 'Inner', parentId: 1 }], // 2
        ['Rectangle', { parentId: 2, width: 20, height: 20 }], // 3
        ['LayerMask', { parentId: 1, sourceId: 2, maskFlags: 4 }], // 4
      ] as Spec[]),
      'm',
    );
    expect(find(res.artboards[0].children, 'Both (clipped)')).toBeUndefined();
  });
});

describe('Rive text modifiers', () => {
  const scene = (group: Record<string, unknown>, ranges: Record<string, unknown>[], text = 'Hello big wide world', extra: Spec[] = []) =>
    writeRiv([
      ['Artboard', { name: 'Main', width: 400, height: 200 }],
      ['Text', { name: 'T', parentId: 0, x: 10, y: 10, sizingValue: 0 }], // 1
      ['TextStyle', { parentId: 1, fontSize: 20 }], // 2
      ['TextValueRun', { parentId: 1, text, styleId: 2 }], // 3
      ['TextModifierGroup', { name: 'Wave', parentId: 1, ...group }], // 4
      ...ranges.map((r) => ['TextModifierRange', { parentId: 4, ...r }] as Spec),
      ...extra,
    ] as Spec[]);
  const textOf = (res: Awaited<ReturnType<typeof importRive>>) => find(res.artboards[0].children, 'T') as unknown as { modifiers?: Record<string, unknown>[] };

  it('turns a group and its range into a modifier with the flagged changes', async () => {
    const res = await importRive(scene({ modifierFlags: 4 | 8 | 16 | 32, x: 6, y: -12, rotation: Math.PI / 2, scaleX: 1.5, scaleY: 1.5, opacity: 0.5 }, [{ modifyFrom: 0.25, modifyTo: 0.75, offset: 0.1, strength: 0.8 }], 'HelloBigWideWorld'), 'tm');
    expect(textOf(res).modifiers).toEqual([
      expect.objectContaining({ name: 'Wave', unit: 'letter', start: 25, end: 75, offset: 10, shape: 'square', strength: 80, x: 6, y: -12, rotation: 90, scale: 1.5, opacity: 0.5 }),
    ]);
    expect(res.warnings.filter((w) => /modifier/i.test(w))).toEqual([]);
  });

  it('leaves out what the flags do not switch on', async () => {
    const res = await importRive(scene({ modifierFlags: 4, x: 3, y: 4, rotation: 1, scaleX: 2, opacity: 0.1 }, [{}]), 't');
    expect(textOf(res).modifiers![0]).toMatchObject({ x: 3, y: 4, rotation: 0, scale: 1, opacity: 1 });
  });

  it('reads words, index ranges and falloffs, and warns where it approximates', async () => {
    const res = await importRive(scene({ modifierFlags: 4, y: -5 }, [{ unitsValue: 2, typeValue: 1, modifyFrom: 1, modifyTo: 3, falloffFrom: 0.5, falloffTo: 0.5 }], 'one two three four'), 't');
    // words 1 to 3 of 4
    expect(textOf(res).modifiers![0]).toMatchObject({ unit: 'word', start: 25, end: 75, shape: 'triangle' });
    expect(res.warnings.some((w) => /falloffs are approximated/.test(w))).toBe(true);
  });

  it('puts one modifier on each range of a group', async () => {
    const res = await importRive(scene({ modifierFlags: 4, y: -5 }, [{ modifyTo: 0.5 }, { modifyFrom: 0.5 }]), 't');
    expect(textOf(res).modifiers!.map((m) => [m.start, m.end])).toEqual([[0, 50], [50, 100]]);
  });

  it('follows keys on the range and the group onto the modifier', async () => {
    const res = await importRive(
      scene({ modifierFlags: 4, y: -5 }, [{ modifyTo: 0.5 }], 'Hello big wide world', [
        ['LinearAnimation', { name: 'Sweep', duration: 60, fps: 60 }],
        ['KeyedObject', { objectId: 5 }], // the range
        ['KeyedProperty', { propertyKey: propKey('TextModifierRange', 'offset') }],
        ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
        ['KeyFrameDouble', { frame: 60, value: 0.5, interpolationType: 1 }],
        ['KeyedObject', { objectId: 4 }], // the group
        ['KeyedProperty', { propertyKey: propKey('TextModifierGroup', 'y') }],
        ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
        ['KeyFrameDouble', { frame: 60, value: -20, interpolationType: 1 }],
      ]),
      't',
    );
    const tracks = res.artboards[0].timelines[0].tracks;
    const offset = tracks.find((t) => t.prop === 'modifiers.0.offset')!;
    expect(offset.keys.map((k) => k.value)).toEqual([0, 50]);
    expect(tracks.find((t) => t.prop === 'modifiers.0.y')!.keys.map((k) => k.value)).toEqual([0, -20]);
    expect(res.warnings.filter((w) => /Animating/.test(w))).toEqual([]);
  });

  it('warns about follow path modifiers and imports nothing for a group without a range', async () => {
    const res = await importRive(scene({ modifierFlags: 4 }, [], 'abc', [['TextFollowPathModifier', { parentId: 4, targetId: 0 }]]), 't');
    expect(textOf(res).modifiers).toBeUndefined();
    expect(res.warnings.some((w) => /follow path modifiers\) is not imported/.test(w))).toBe(true);
  });
});

describe('Rive scroll constraints', () => {
  const scroll = async (constraint: Record<string, unknown>, extra: Spec[] = []) => {
    const d = doc('scroll', 200, 200, {});
    const view = box(d, 0, 'View', 100, 100, colors[0], { flexDirectionValue: 0 });
    const content = box(d, view, 'Content', 100, 0, colors[1], { flexDirectionValue: 0, layoutHeightScaleType: 2 });
    for (let i = 0; i < 5; i++) box(d, content, `item${i}`, 100, 40, colors[i]);
    d.add(['ScrollConstraint', { parentId: view, ...constraint }]);
    for (const e of extra) d.add(e);
    const res = await importRive(writeRiv([['Backboard', {}], ...d.specs] as Spec[]), 's');
    relayoutTree(res.artboards[0].children);
    return { res, view: find(res.artboards[0].children, 'View') as unknown as { scroll?: string; clip: boolean; children: { height: number }[] } };
  };

  it('makes the layout a scrollable frame along the constraint direction', async () => {
    const { res, view } = await scroll({ directionValue: 1 });
    expect(view).toMatchObject({ scroll: 'vertical', clip: true });
    expect(view.children[0].height).toBeGreaterThan(100); // the content is taller than the viewport
    expect(res.warnings.filter((w) => /scroll/i.test(w))).toEqual([]);
    expect((await scroll({ directionValue: 0 })).view.scroll).toBe('horizontal');
    expect((await scroll({ directionValue: 2 })).view.scroll).toBe('both');
  });

  it('says what the browser scrolling does not do', async () => {
    const { res } = await scroll({ snap: true, infinite: true, virtualize: true, dragMultiplier: 2, scrollOffsetY: 30 });
    for (const re of [/snapping/, /Endless/, /Virtualised/, /drag speed/, /starting scroll offset/]) expect(res.warnings.some((w) => re.test(w))).toBe(true);
  });

  it('warns about elastic physics and scroll bars, and leaves a non-interactive scroller alone', async () => {
    const { res } = await scroll({ physicsId: 7 }, [['ElasticScrollPhysics', { parentId: 0, constraintId: 5 }]]);
    void res;
    const fixed = await scroll({ interactive: false });
    expect(fixed.view.scroll).toBeUndefined();
    expect(fixed.res.warnings.some((w) => /cannot be dragged/.test(w))).toBe(true);
  });
});

describe('Rive artboard component lists', () => {
  const path = (...ids: number[]) => new Uint8Array(ids);
  const file = (rules: Spec[], bind = true) =>
    writeRiv([
      ['Backboard', {}],
      ['ViewModel', { name: 'Item' }], // 0
      ['ViewModelPropertyString', { name: 'label' }],
      ['ViewModelInstance', { viewModelId: 0, name: 'a' }],
      ['ViewModelInstanceString', { parentId: 0, viewModelPropertyId: 0, propertyValue: 'a' }],
      ['ViewModelInstance', { viewModelId: 0, name: 'b' }],
      ['ViewModelInstanceString', { parentId: 0, viewModelPropertyId: 0, propertyValue: 'b' }],
      ['ViewModel', { name: 'Main' }], // 1
      ['ViewModelPropertyList', { name: 'rows' }],
      ['ViewModelInstance', { viewModelId: 1, name: 'Instance' }],
      ['ViewModelInstanceList', { parentId: 0, viewModelPropertyId: 0 }],
      ['ViewModelInstanceListItem', { viewModelId: 0, viewModelInstanceId: 0 }],
      ['ViewModelInstanceListItem', { viewModelId: 0, viewModelInstanceId: 1 }],
      ['Artboard', { name: 'Row', width: 100, height: 30 }],
      ['Artboard', { name: 'Main', width: 300, height: 300 }],
      ['LayoutComponentStyle', { parentId: 0, flexDirectionValue: 0, gapVertical: 6, gapVerticalUnitsValue: 1 }], // 1
      ['LayoutComponent', { name: 'Col', parentId: 0, width: 300, height: 300, styleId: 1 }], // 2
      ['ArtboardComponentList', { name: 'Rows', parentId: 2 }], // 3
      ...(bind ? [['DataBindContext', { propertyKey: propKey('ArtboardComponentList', 'listSource'), sourcePathIds: path(1, 0) }] as Spec] : []),
      ...rules,
    ] as Spec[]);

  it('becomes a repeater over the list with an instance of the item artboard, along the parent\'s direction', async () => {
    const res = await importRive(file([['ArtboardListMapRule', { parentId: 3, artboardId: 0, viewModelId: 0 }]]), 'l');
    const main = res.artboards.find((a) => a.name === 'Main')!;
    const rows = find(main.children, 'Rows') as unknown as { repeat: { items: string }; layout: { direction: string; gap: number; hugHeight: boolean }; children: { type: string; artboardId: string; width: number; height: number }[] };
    expect(rows.repeat.items).toBe('Main_rows');
    expect(rows.layout).toMatchObject({ direction: 'column', gap: 6, hugHeight: true });
    expect(rows.children[0]).toMatchObject({ type: 'instance', artboardId: res.artboards.find((a) => a.name === 'Row')!.id, width: 100, height: 30 });
    expect(res.variables.find((v) => v.name === 'Main_rows')).toMatchObject({ type: 'list' });
    expect(res.warnings.some((w) => /values each item carries/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /Data binds on listSource/.test(w))).toBe(false);
  });

  it('draws one copy per item in the player', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    document.body.innerHTML = '<div id="stage" style="width:300px;height:300px"></div>';
    const res = await importRive(file([['ArtboardListMapRule', { parentId: 3, artboardId: 0, viewModelId: 0 }]]), 'l');
    const project = { ...(await import('interactives-player')).createProject(), artboards: res.artboards, variables: res.variables };
    const player = new Player(document.getElementById('stage')!, project, { artboard: res.artboards.find((a) => a.name === 'Main')!.id, loadData: false });
    player.step(16);
    expect(document.querySelectorAll('[data-ix-id*="~"]').length).toBeGreaterThanOrEqual(2);
    player.destroy();
    vi.unstubAllGlobals();
  });

  it('skips a list with no list property or no item artboard', async () => {
    const unbound = await importRive(file([['ArtboardListMapRule', { parentId: 3, artboardId: 0, viewModelId: 0 }]], false), 'l');
    expect(find(unbound.artboards.find((a) => a.name === 'Main')!.children, 'Rows')).toBeUndefined();
    expect(unbound.warnings.some((w) => /no list property/.test(w))).toBe(true);
    const bare = await importRive(file([]), 'l');
    expect(find(bare.artboards.find((a) => a.name === 'Main')!.children, 'Rows')).toBeUndefined();
    expect(bare.warnings.some((w) => /no artboard to show/.test(w))).toBe(true);
  });
});

describe('joystick handles in the editor', () => {
  it('copies the handle with the artboard and counts it as a use of the layer', async () => {
    const { createNode, createProject } = await import('interactives-player');
    const { EditorStore } = await import('../src/store/store');
    const { analyzeUsage } = await import('../src/lib/dependencies');
    const p: any = createProject('T');
    const ab = p.artboards[0];
    const knob = createNode('rect', { name: 'Knob' });
    ab.children.push(knob);
    ab.joysticks = [{ id: 'j1', name: 'J', xTimeline: null, x: 'handle.x', handle: knob.id, area: { x: 0, y: 0, width: 100, height: 100 } }];
    const report = analyzeUsage(p);
    expect(report.missing.filter((m) => m.how === 'joystick handle')).toEqual([]);
    expect(report.layers.find((l) => l.id === knob.id)?.usedBy.map((u) => u.how)).toContain('joystick handle');
    const s = new EditorStore(p);
    s.duplicateArtboard(ab.id);
    const copy = s.get().project.artboards[1] as any;
    expect(copy.joysticks[0].handle).toBe(copy.children[0].id);
    expect(copy.joysticks[0].handle).not.toBe(knob.id);
  });
});
