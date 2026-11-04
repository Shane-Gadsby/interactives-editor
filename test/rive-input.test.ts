import { describe, expect, it, vi } from 'vitest';
import { Player, createProject } from 'interactives-player';
import type { ImageNode, InstanceNode, LogicNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';

const kinds = (nodes: LogicNode[], kind: string) => nodes.filter((n) => n.kind === kind);

describe('Rive keyboard and focus listeners', () => {
  const scene = (listener: Spec[]) =>
    importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['Node', { name: 'Hot', parentId: 0 }], // 1
        ['StateMachine', { name: 'SM' }],
        ['StateMachineBool', { name: 'on' }],
        ...listener,
      ]),
      'k',
    );

  it('imports key listeners as On key events with the key, modifiers and phases', async () => {
    const res = await scene([
      ['StateMachineListener', { targetId: 0 }],
      ['ListenerInputTypeKeyboard', {}],
      ['KeyboardInput', { keyType: 263, keyPhase: 1, modifiers: 1 }], // left arrow, down, shift
      ['KeyboardInput', { keyType: 65, keyPhase: 6, modifiers: 10 }], // a, repeat + up, ctrl... (2) + meta (8)
      ['KeyboardInput', { keyPhase: 1 }], // any key
      ['ListenerBoolChange', { inputId: 0, value: 1 }],
    ]);
    const keys = kinds(res.artboards[0].logic.nodes, 'event.key').map((n) => n.params);
    expect(keys).toEqual([
      expect.objectContaining({ key: 'ArrowLeft', type: 'keydown', shift: true, ctrl: false, repeat: false }),
      expect.objectContaining({ key: 'a', type: 'keydown', ctrl: true, meta: true, shift: false, repeat: true }),
      expect.objectContaining({ key: 'a', type: 'keyup', ctrl: true, meta: true }),
      expect.objectContaining({ key: '', type: 'keydown' }),
    ]);
    //all of them run the listener's action
    const set = kinds(res.artboards[0].logic.nodes, 'action.setVariable');
    expect(set).toHaveLength(1);
    const from = new Set(res.artboards[0].logic.edges.filter((e) => e.to === set[0].id).map((e) => e.from));
    expect(from.size).toBe(4);
    expect(res.warnings.filter((w) => /Listener type/.test(w))).toEqual([]);
  });

  it('maps the key codes of letters, digits, arrows, function and numpad keys', async () => {
    const codes = [32, 48, 57, 90, 256, 257, 265, 290, 301, 320, 335, 341];
    const res = await scene([
      ['StateMachineListener', { targetId: 0 }],
      ['ListenerInputTypeKeyboard', {}],
      ...codes.map((keyType): Spec => ['KeyboardInput', { keyType, keyPhase: 1 }]),
      ['ListenerBoolChange', { inputId: 0, value: 1 }],
    ]);
    expect(kinds(res.artboards[0].logic.nodes, 'event.key').map((n) => n.params.key)).toEqual(['Space', '0', '9', 'z', 'Escape', 'Enter', 'ArrowUp', 'F1', 'F12', 'Numpad0', 'NumpadEnter', 'ControlLeft']);
  });

  it('imports a keyboard listener on a layer as only heard while that layer has the focus, and warns about a key with no browser name', async () => {
    const res = await scene([
      ['StateMachineListener', { targetId: 1 }],
      ['ListenerInputTypeKeyboard', {}],
      ['KeyboardInput', { keyType: 161, keyPhase: 1 }],
      ['ListenerBoolChange', { inputId: 0, value: 1 }],
    ]);
    const hot = res.artboards[0].children.find((n) => n.name === 'Hot')!;
    expect(kinds(res.artboards[0].logic.nodes, 'event.key')[0].params).toMatchObject({ target: hot.id });
    expect(res.warnings.some((w) => /Keyboard listeners on a layer/.test(w))).toBe(false);
    expect(res.warnings.some((w) => /code 161/.test(w))).toBe(true);
  });

  it('leaves an artboard keyboard listener page-wide', async () => {
    const res = await scene([
      ['StateMachineListener', { targetId: 0 }],
      ['ListenerInputTypeKeyboard', {}],
      ['KeyboardInput', { keyType: 65, keyPhase: 1 }],
      ['ListenerBoolChange', { inputId: 0, value: 1 }],
    ]);
    expect(kinds(res.artboards[0].logic.nodes, 'event.key')[0].params.target).toBeUndefined();
  });

  it('imports focus and blur listeners, and focus actions', async () => {
    const res = await scene([
      ['StateMachineListener', { targetId: 1 }],
      ['ListenerInputType', { listenerTypeValue: 13 }],
      ['ListenerBoolChange', { inputId: 0, value: 1 }],
      ['StateMachineListener', { targetId: 1 }],
      ['ListenerInputType', { listenerTypeValue: 14 }],
      ['ListenerBoolChange', { inputId: 0, value: 0 }],
      ['StateMachineListener', { targetId: 0 }],
      ['ListenerInputTypeKeyboard', {}],
      ['KeyboardInput', { keyType: 258, keyPhase: 1 }],
      ['FocusActionTarget', { targetId: 1 }],
      ['FocusActionClear', {}],
      ['FocusActionTraversal', { traversalKind: 1 }],
    ]);
    const ab = res.artboards[0];
    const hot = ab.children.find((n) => n.name === 'Hot')!;
    expect(kinds(ab.logic.nodes, 'event.focus').map((n) => [n.params.target, n.params.type])).toEqual([[hot.id, 'focus'], [hot.id, 'blur']]);
    expect(kinds(ab.logic.nodes, 'action.focus').map((n) => [n.params.op, n.params.target])).toEqual([['focus', hot.id], ['clear', undefined]]);
    expect(res.warnings.some((w) => /Focus traversal/.test(w))).toBe(true);
    expect(res.warnings.filter((w) => /Listener type/.test(w))).toEqual([]);
  });
});

describe('Rive nested artboard control', () => {
  /** Main holds a nested artboard (slot 2) whose state machine has inputs [flag, bump, level]; Child is artboard 1. */
  const scene = (more: Spec[]): Spec[] => [
    ['Artboard', { name: 'Main', width: 200, height: 200 }],
    ['Node', { name: 'Hot', parentId: 0 }], // 1
    ['NestedArtboard', { name: 'Badge', parentId: 0, artboardId: 1 }], // 2
    ['NestedStateMachine', { parentId: 2, animationId: 0 }], // 3
    ['NestedBool', { parentId: 3, inputId: 0, nestedValue: true }], // 4
    ['NestedTrigger', { parentId: 3, inputId: 1 }], // 5
    ['NestedNumber', { parentId: 3, inputId: 2, nestedValue: 3 }], // 6
    ...more,
    ['Artboard', { name: 'Child', width: 50, height: 50 }],
    ['StateMachine', { name: 'Child SM' }],
    ['StateMachineBool', { name: 'flag' }],
    ['StateMachineTrigger', { name: 'bump' }],
    ['StateMachineNumber', { name: 'level' }],
  ];

  it('keeps the starting values and fires listener actions on the nested inputs', async () => {
    const res = await importRive(
      writeRiv(
        scene([
          ['StateMachine', { name: 'Main SM' }],
          ['StateMachineListener', { targetId: 1 }],
          ['ListenerInputTypeKeyboard', {}],
          ['KeyboardInput', { keyType: 66, keyPhase: 1 }],
          ['ListenerTriggerChange', { nestedInputId: 5 }],
          ['ListenerNumberChange', { nestedInputId: 6, value: 9 }],
          ['ListenerBoolChange', { nestedInputId: 4, value: 0 }],
          ['StateMachineListener', { targetId: 1 }],
          ['ListenerInputType', { listenerTypeValue: 2 }],
          ['ListenerBoolChange', { nestedInputId: 4, value: 2 }],
        ]),
      ),
      'n',
    );
    const ab = res.artboards.find((a) => a.name === 'Main')!;
    const badge = ab.children.find((n) => n.name === 'Badge') as InstanceNode;
    expect(badge.type).toBe('instance');
    expect(badge.inputs).toEqual({ flag: true, level: 3 });
    const trig = kinds(ab.logic.nodes, 'action.instanceTrigger');
    const inputs = kinds(ab.logic.nodes, 'action.instanceInput');
    expect(trig.map((n) => [n.params.target, n.params.name])).toEqual([[badge.id, 'bump']]);
    expect(inputs.map((n) => [n.params.target, n.params.name, n.params.value])).toEqual([
      [badge.id, 'level', '9'],
      [badge.id, 'flag', 'false'],
      [badge.id, 'flag', `!instanceInput(${JSON.stringify(badge.id)}, "flag")`],
    ]);
    expect(res.warnings.some((w) => /Toggling a nested bool/.test(w))).toBe(false);
  });

  it('turns keys on nested inputs into markers that set them or fire the trigger', async () => {
    const res = await importRive(
      writeRiv(
        scene([
          ['LinearAnimation', { name: 'Drive', duration: 60, fps: 60 }],
          ['KeyedObject', { objectId: 4 }],
          ['KeyedProperty', { propertyKey: propKey('NestedBool', 'nestedValue') }],
          ['KeyFrameBool', { frame: 0, value: false }],
          ['KeyFrameBool', { frame: 30, value: true }],
          ['KeyFrameBool', { frame: 60, value: true }],
          ['KeyedObject', { objectId: 5 }],
          ['KeyedProperty', { propertyKey: 401 }],
          ['KeyFrameCallback', { frame: 45 }],
          ['KeyedObject', { objectId: 6 }],
          ['KeyedProperty', { propertyKey: propKey('NestedNumber', 'nestedValue') }],
          ['KeyFrameDouble', { frame: 15, value: 7 }],
          ['KeyFrameDouble', { frame: 30, value: 8 }],
        ]),
      ),
      'n',
    );
    const ab = res.artboards.find((a) => a.name === 'Main')!;
    const tl = ab.timelines[0];
    expect(tl.markers!.map((m) => [m.time, m.name])).toEqual([
      [0, 'Badge: flag = false'],
      [500, 'Badge: flag = true'],
      [750, 'Badge: bump'],
      [1000, 'Badge: flag = true'],
    ]);
    //the number is a track on the instance's input, so it tweens between its keys
    const badge = ab.children.find((n) => n.name === 'Badge')!;
    const track = tl.tracks.find((t) => t.nodeId === badge.id)!;
    expect(track.prop).toBe('inputs.level');
    expect(track.keys.map((k) => [k.t, k.value])).toEqual([
      [250, 7],
      [500, 8],
    ]);
    //one flow per distinct key, listening to that marker
    const events = kinds(ab.logic.nodes, 'event.timelineMarker');
    expect(events.map((n) => n.params.marker).sort()).toEqual(['Badge: bump', 'Badge: flag = false', 'Badge: flag = true']);
    const flowOf = (marker: string) => {
      const ev = events.find((n) => n.params.marker === marker)!;
      const edge = ab.logic.edges.find((e) => e.from === ev.id)!;
      return ab.logic.nodes.find((n) => n.id === edge.to)!;
    };
    expect(flowOf('Badge: bump')).toMatchObject({ kind: 'action.instanceTrigger', params: { name: 'bump' } });
    expect(flowOf('Badge: flag = true').params).toMatchObject({ name: 'flag', value: 'true' });
    expect(res.warnings.some((w) => /nested numbers jump/.test(w))).toBe(false);
  });
});

describe('Rive keyboard listeners driving nested inputs, played', () => {
  it('a key press sets the nested number and fires the nested trigger inside the instance', async () => {
    document.body.innerHTML = '<div id="stage" style="width:200px;height:200px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['NestedArtboard', { name: 'Badge', parentId: 0, artboardId: 1 }], // 1
        ['NestedStateMachine', { parentId: 1, animationId: 0 }], // 2
        ['NestedTrigger', { parentId: 2, inputId: 0 }], // 3
        ['NestedNumber', { parentId: 2, inputId: 1, nestedValue: 3 }], // 4
        ['StateMachine', { name: 'Main SM' }],
        ['StateMachineListener', { targetId: 0 }],
        ['ListenerInputTypeKeyboard', {}],
        ['KeyboardInput', { keyType: 66, keyPhase: 1 }],
        ['ListenerNumberChange', { nestedInputId: 4, value: 9 }],
        ['ListenerTriggerChange', { nestedInputId: 3 }],
        ['Artboard', { name: 'Child', width: 50, height: 50 }],
        ['StateMachine', { name: 'Child SM' }],
        ['StateMachineTrigger', { name: 'bump' }],
        ['StateMachineNumber', { name: 'level' }],
      ]),
      'e2e',
    );
    const project = createProject('e2e');
    project.artboards = res.artboards;
    project.variables = res.variables;
    project.settings.startArtboardId = res.artboard.id;
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getInstanceInput('Badge', 'level')).toBe(3);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getInstanceInput('Badge', 'level')).toBe(9);
    player.destroy();
    vi.unstubAllGlobals();
  });
});

describe('Rive keyboard listeners on a layer, played', () => {
  it('only hear the key while that layer has the focus', async () => {
    document.body.innerHTML = '<div id="stage" style="width:200px;height:200px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 200, height: 200 }],
        ['NestedArtboard', { name: 'Badge', parentId: 0, artboardId: 1 }], // 1
        ['NestedStateMachine', { parentId: 1, animationId: 0 }], // 2
        ['NestedNumber', { parentId: 2, inputId: 0, nestedValue: 3 }], // 3
        ['StateMachine', { name: 'Main SM' }],
        ['StateMachineListener', { targetId: 1 }],
        ['ListenerInputTypeKeyboard', {}],
        ['KeyboardInput', { keyType: 66, keyPhase: 1 }],
        ['ListenerNumberChange', { nestedInputId: 3, value: 9 }],
        ['Artboard', { name: 'Child', width: 50, height: 50 }],
        ['StateMachine', { name: 'Child SM' }],
        ['StateMachineNumber', { name: 'level' }],
      ]),
      'focus',
    );
    const project = createProject('focus');
    project.artboards = res.artboards;
    project.variables = res.variables;
    project.settings.startArtboardId = res.artboard.id;
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    const badge = res.artboards[0].children.find((n) => n.name === 'Badge')!;
    const el = document.querySelector<HTMLElement>(`[data-ix-id="${badge.id}"]`)!;
    expect(el.tabIndex).toBe(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getInstanceInput('Badge', 'level')).toBe(3);
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getInstanceInput('Badge', 'level')).toBe(9);
    player.destroy();
    vi.unstubAllGlobals();
  });
});

describe('Rive nested inputs, played', () => {
  const play = async (objects: Spec[]) => {
    document.body.innerHTML = '<div id="stage" style="width:200px;height:200px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const res = await importRive(writeRiv(objects), 'nested');
    const project = createProject('nested');
    project.artboards = res.artboards;
    project.variables = res.variables;
    project.settings.startArtboardId = res.artboard.id;
    const player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    return player;
  };

  it('a nested number animated between keys tweens inside the instance', async () => {
    const player = await play([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['NestedArtboard', { name: 'Badge', parentId: 0, artboardId: 1 }], // 1
      ['NestedStateMachine', { parentId: 1, animationId: 0 }], // 2
      ['NestedNumber', { parentId: 2, inputId: 0, nestedValue: 0 }], // 3
      ['LinearAnimation', { name: 'Grow', duration: 60, fps: 60 }],
      ['KeyedObject', { objectId: 3 }],
      ['KeyedProperty', { propertyKey: propKey('NestedNumber', 'nestedValue') }],
      ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 10 }],
      ['Artboard', { name: 'Child', width: 50, height: 50 }],
      ['StateMachine', { name: 'Child SM' }],
      ['StateMachineNumber', { name: 'level' }],
    ]);
    player.step(250);
    expect(Number(player.getInstanceInput('Badge', 'level'))).toBeCloseTo(2.5, 1);
    player.step(250);
    expect(Number(player.getInstanceInput('Badge', 'level'))).toBeCloseTo(5, 1);
    player.destroy();
    vi.unstubAllGlobals();
  });

  it('toggling a nested bool flips what it is now', async () => {
    const player = await play([
      ['Artboard', { name: 'Main', width: 200, height: 200 }],
      ['NestedArtboard', { name: 'Badge', parentId: 0, artboardId: 1 }], // 1
      ['NestedStateMachine', { parentId: 1, animationId: 0 }], // 2
      ['NestedBool', { parentId: 2, inputId: 0, nestedValue: false }], // 3
      ['StateMachine', { name: 'Main SM' }],
      ['StateMachineListener', { targetId: 0 }],
      ['ListenerInputTypeKeyboard', {}],
      ['KeyboardInput', { keyType: 66, keyPhase: 1 }],
      ['ListenerBoolChange', { nestedInputId: 3, value: 2 }],
      ['Artboard', { name: 'Child', width: 50, height: 50 }],
      ['StateMachine', { name: 'Child SM' }],
      ['StateMachineBool', { name: 'flag' }],
    ]);
    const press = async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
      await new Promise((r) => setTimeout(r, 0));
    };
    expect(player.getInstanceInput('Badge', 'flag')).toBe(false);
    await press();
    expect(player.getInstanceInput('Badge', 'flag')).toBe(true);
    await press();
    expect(player.getInstanceInput('Badge', 'flag')).toBe(false);
    player.destroy();
    vi.unstubAllGlobals();
  });
});

describe('Rive 9-slice images', () => {
  // A png header of the wanted size is enough for the importer's size probe
  const sized = (width: number, height: number) => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(b.buffer).setUint32(16, width);
    new DataView(b.buffer).setUint32(20, height);
    return b;
  };
  const scene = (image: Record<string, unknown>, slicer: Spec[], more: Spec[] = []): Spec[] => [
    ['ImageAsset', { name: 'panel', width: 100, height: 60 }],
    ['FileAssetContents', { bytes: sized(100, 60) }],
    ['Artboard', { name: 'Main', width: 300, height: 300 }],
    ['Image', { name: 'Panel', parentId: 0, assetId: 0, ...image }], // 1
    ['NSlicer', { parentId: 1 }], // 2
    ...slicer,
    ...more,
  ];

  it('imports two axes per direction as the image insets', async () => {
    const res = await importRive(
      writeRiv(
        scene({}, [
          ['AxisX', { parentId: 2, offset: 20 }],
          ['AxisX', { parentId: 2, offset: 70 }],
          ['AxisY', { parentId: 2, offset: 0.25, normalized: true }],
          ['AxisY', { parentId: 2, offset: 45 }],
        ]),
      ),
      's',
    );
    const img = res.artboards[0].children[0] as ImageNode;
    expect(img.slice).toEqual({ top: 15, right: 30, bottom: 15, left: 20 });
    expect(img.sliceTile).toBeUndefined();
  });

  it('keeps corners at their size when the image is scaled, by resizing the box', async () => {
    const res = await importRive(
      writeRiv(
        scene({ scaleX: 2, scaleY: 3 }, [
          ['AxisX', { parentId: 2, offset: 20 }],
          ['AxisX', { parentId: 2, offset: 80 }],
          ['AxisY', { parentId: 2, offset: 10 }],
          ['AxisY', { parentId: 2, offset: 50 }],
        ]),
      ),
      's',
    );
    const img = res.artboards[0].children[0] as ImageNode;
    expect([img.width, img.height, img.scaleX, img.scaleY]).toEqual([200, 180, 1, 1]);
    expect(img.slice).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
  });

  it('reads tile modes and warns about what a 9-slice here cannot do', async () => {
    const res = await importRive(
      writeRiv(
        scene({}, [
          ['AxisX', { parentId: 2, offset: 20 }],
          ['AxisX', { parentId: 2, offset: 80 }],
          ['AxisY', { parentId: 2, offset: 10 }],
          ['AxisY', { parentId: 2, offset: 50 }],
          ['NSlicerTileMode', { parentId: 2, patchIndex: 4, style: 1 }],
          ['NSlicerTileMode', { parentId: 2, patchIndex: 1, style: 2 }],
        ]),
      ),
      's',
    );
    expect((res.artboards[0].children[0] as ImageNode).sliceTile).toBe('repeat');
    expect(res.warnings.some((w) => /hidden/i.test(w))).toBe(true);

    const odd = await importRive(
      writeRiv(
        scene({}, [
          ['AxisX', { parentId: 2, offset: 20 }],
          ['AxisY', { parentId: 2, offset: 10 }],
        ]),
      ),
      's',
    );
    expect((odd.artboards[0].children[0] as ImageNode).slice).toBeFalsy();
    expect(odd.warnings.some((w) => /two axes/.test(w))).toBe(true);
  });

  it('reports N-sliced nodes, which resize a group, as plain groups', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 300, height: 300 }],
        ['NSlicedNode', { name: 'Box', parentId: 0, width: 100, height: 100, initialWidth: 100, initialHeight: 100 }],
        ['Ellipse', { name: 'Dot', parentId: 1, width: 10, height: 10 }],
      ]),
      's',
    );
    expect(res.warnings.some((w) => /N-sliced/.test(w))).toBe(true);
  });
});
