import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walk, type SceneNode } from 'interactives-player';
import { importRive, readRiveObjects } from '../src/lib/rive-import';
import { RIVE_CLASSES } from '../src/lib/rive-defs';

const dir = `${process.cwd()}/../research/rive/`;
const samples = ['breathing_for_calm_TEST1.riv', 'treasure_valley_interactive_map.riv'].filter((f) => existsSync(dir + f));

describe.skipIf(!samples.length)('Rive import (sample files in research/rive)', () => {
  for (const f of samples) {
    it(`reads ${f}`, async () => {
      const bytes = new Uint8Array(readFileSync(dir + f));
      const objs = readRiveObjects(bytes);
      expect(objs.length).toBeGreaterThan(10);
      const res = await importRive(bytes, f);
      const summary = res.artboards.map((a) => {
        let count = 0;
        const rec = (l: { children?: unknown[] }[]) => l.forEach((n) => (count++, n.children && rec(n.children as never)));
        rec(a.children as never);
        return `${a.name} ${a.width}x${a.height} layers=${count} timelines=${a.timelines.length} tracks=${a.timelines.reduce((t, x) => t + x.tracks.length, 0)} logic=${a.logic.nodes.length}`;
      });
      console.log(f, '\n ' + summary.join('\n ') + `\n variables=${res.variables.map((v) => v.name).join(',')}\n assets=${res.assets.map((a) => `${a.name}(${a.mime},${a.bytes.length})`).join(', ')}\n fonts=${res.fonts.map((x) => x.family).join(',')}\n warnings:\n  - ${res.warnings.join('\n  - ')}`);
      expect(res.artboards.length).toBeGreaterThan(0);
    });
  }
});

describe.skipIf(!samples.includes('treasure_valley_interactive_map.riv'))('Rive view model import', () => {
  it('turns view model properties into shared variables driven by listeners and tested by transitions', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const icon = res.variables.find((v) => v.name === 'MainVM_iconNum');
    const index = res.variables.find((v) => v.name === 'MainVM_indexNum');
    expect(icon?.shared).toBe(true);
    expect(index?.type).toBe('number');
    const nodes = res.artboards.flatMap((a) => a.logic.nodes);
    expect(nodes.some((n) => n.kind === 'action.setVariable' && n.params.variable === icon!.id && n.params.value === '10')).toBe(true);
    expect(nodes.some((n) => n.kind === 'logic.if' && String(n.params.condition).includes('MainVM_indexNum ==='))).toBe(true);
    expect(nodes.some((n) => n.kind === 'event.variable' && n.params.variable === index!.id)).toBe(true);
    expect(res.warnings.some((w) => /view models\) is not imported/.test(w))).toBe(false);
  });
});

describe.skipIf(!samples.includes('treasure_valley_interactive_map.riv'))('Rive solo and clipping import', () => {
  it('turns Solo into a native solo and clipping shapes into masks', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const all: SceneNode[] = [];
    for (const a of res.artboards) walk(a.children, (n) => all.push(n));
    const solos = all.filter((n) => (n.type === 'group' || n.type === 'frame') && n.solo);
    expect(solos.length).toBeGreaterThan(0);
    for (const g of solos as (SceneNode & { solo: { active: string | null }; children: SceneNode[] })[]) {
      // Active child is one of the group's layers, and nothing is hidden by per-child visibility any more
      if (g.solo.active) expect(g.children.some((c) => c.id === g.solo.active)).toBe(true);
    }
    // Solo animation is a solo.active track, not visibility tracks on the children
    const soloIds = new Set(solos.map((g) => g.id));
    const tracks = res.artboards.flatMap((a) => a.timelines.flatMap((t) => t.tracks));
    expect(tracks.some((t) => t.prop === 'solo.active' && soloIds.has(t.nodeId))).toBe(true);
    expect(tracks.some((t) => t.prop === 'visible' && soloIds.has(t.nodeId))).toBe(false);
    // Clipping shapes became masks (a mask group holding the clip shape, in front of the clipped layer)
    const masks = all.filter((n) => n.mask);
    expect(masks.length).toBeGreaterThan(0);
    for (const m of masks) expect(m.type).toBe('group');
    expect(all.some((n) => n.type === 'group' && n.children.some((c) => c.mask) && /\(clipped\)$/.test(n.name))).toBe(true);
    expect(res.warnings.some((w) => /Clipping shapes are not supported/.test(w))).toBe(false);
  });

  it('keeps clipping on the breathing sample', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'breathing_for_calm_TEST1.riv')), 'b');
    const all: SceneNode[] = [];
    for (const a of res.artboards) walk(a.children, (n) => all.push(n));
    expect(all.some((n) => n.mask)).toBe(true);
  });
});

// ---------------------------------------------------------------- events (built by hand: the sample files have none)

type Spec = [string, Record<string, unknown>];

/** A minimal .riv writer: header, an empty property table, then objects as typeKey + key/value pairs. */
function writeRiv(objects: Spec[]): Uint8Array {
  const out: number[] = [];
  const varuint = (n: number) => {
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
  };
  const find = (cls: string, prop: string): [number, string] => {
    for (let c: string | undefined = cls; c && RIVE_CLASSES[c]; c = RIVE_CLASSES[c][1]) {
      const p = RIVE_CLASSES[c][2][prop];
      if (p) return [p[0], p[1]];
    }
    throw new Error(`${cls}.${prop} is not defined`);
  };
  out.push(...Array.from('RIVE', (c) => c.charCodeAt(0)));
  varuint(7);
  varuint(0);
  varuint(0);
  varuint(0); // no extra properties
  for (const [cls, props] of objects) {
    varuint(RIVE_CLASSES[cls][0]);
    for (const [name, v] of Object.entries(props)) {
      const [key, type] = find(cls, name);
      varuint(key);
      if (type === 'f') out.push(...new Uint8Array(new Float32Array([Number(v)]).buffer));
      else if (type === 's') {
        const b = new TextEncoder().encode(String(v));
        varuint(b.length);
        out.push(...b);
      } else if (type === 'y') {
        const b = v as Uint8Array;
        varuint(b.length);
        out.push(...b);
      } else if (type === 'c') out.push(...new Uint8Array(new Uint32Array([Number(v)]).buffer));
      else varuint(typeof v === 'boolean' ? Number(v) : Number(v));
    }
    varuint(0);
  }
  return new Uint8Array(out);
}

const wav = new Uint8Array([...new TextEncoder().encode('RIFF'), 36, 0, 0, 0, ...new TextEncoder().encode('WAVEfmt '), 16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0]);

function eventFile(): Uint8Array {
  // Artboard slots: 1 Hit (event) 2 power 3 label 4 Click (audio) 5 Go (url) 6 Node
  const objs: Spec[] = [
    ['AudioAsset', { name: 'click', volume: 0.5 }],
    ['FileAssetContents', { bytes: wav }],
    ['Artboard', { name: 'Main', width: 200, height: 100 }],
    ['Event', { name: 'Hit', parentId: 0 }],
    ['CustomPropertyNumber', { name: 'power', propertyValue: 5, parentId: 1 }],
    ['CustomPropertyString', { name: 'label', propertyValue: 'big', parentId: 1 }],
    ['AudioEvent', { name: 'Click', assetId: 0, parentId: 0 }],
    ['OpenUrlEvent', { name: 'Go', url: 'https://example.test/', targetValue: 2, parentId: 0 }],
    ['Node', { name: 'N', parentId: 0 }],
    // 60 frame timeline at 60 fps, looping, with Hit at frame 30 and Click at frame 15
    ['LinearAnimation', { name: 'Loop', duration: 60, fps: 60, loopValue: 1 }],
    ['KeyedObject', { objectId: 1 }],
    ['KeyedProperty', { propertyKey: 395 }],
    ['KeyFrameCallback', { frame: 30 }],
    ['KeyedObject', { objectId: 4 }],
    ['KeyedProperty', { propertyKey: 395 }],
    ['KeyFrameCallback', { frame: 15 }],
    ['StateMachine', { name: 'SM' }],
    ['StateMachineTrigger', { name: 'go' }],
    ['StateMachineLayer', {}],
    ['EntryState', {}], // 0
    ['StateTransition', { stateToId: 3 }],
    ['AnyState', {}], // 1
    ['ExitState', {}], // 2
    ['AnimationState', { animationId: 0 }], // 3: Click when entered, Hit when left
    ['StateMachineFireEvent', { eventId: 4, occursValue: 0 }],
    ['StateMachineFireEvent', { eventId: 1, occursValue: 1 }],
    ['StateTransition', { stateToId: 4 }],
    ['TransitionTriggerCondition', { inputId: 0 }],
    ['StateMachineFireEvent', { eventId: 5, occursValue: 1 }], // on the transition
    ['AnimationState', { animationId: 0 }], // 4
    ['StateMachineListenerSingle', { targetId: 6, listenerTypeValue: 2 }],
    ['ListenerFireEvent', { eventId: 1 }],
    ['StateMachineListener', {}],
    ['ListenerInputTypeEvent', { eventId: 1 }],
    ['ListenerInputTypeEvent', { eventId: 4 }],
    ['ListenerFireEvent', { eventId: 5 }],
  ];
  return writeRiv(objs);
}

describe('Rive events', () => {
  it('turns keyed events into timeline markers that run event flows', async () => {
    const res = await importRive(eventFile(), 'events');
    const ab = res.artboards[0];
    const tl = ab.timelines[0];
    expect(tl.loop).toBe('loop');
    expect(tl.markers?.map((m) => [m.name, m.time])).toEqual([
      ['Click', 250],
      ['Hit', 500],
    ]);
    const { nodes, edges } = ab.logic;
    const next = (id: string, port = 'out') => nodes.find((n) => n.id === edges.find((e) => e.from === id && e.fromPort === port)?.to);
    const marker = nodes.find((n) => n.kind === 'event.timelineMarker' && n.params.marker === 'Hit')!;
    expect(marker.params.timeline).toBe(tl.id);
    const emit = next(marker.id)!;
    expect(emit.kind).toBe('action.emit');
    expect(emit.params.name).toBe('Hit');
    expect(JSON.parse(String(emit.params.payload))).toEqual({ power: 5, label: 'big' });
    expect(next(emit.id)).toBeUndefined();
  });
  it('plays embedded audio for audio events and opens links for open-url events', async () => {
    const res = await importRive(eventFile(), 'events');
    const { nodes, edges } = res.artboards[0].logic;
    const next = (id: string, port = 'out') => nodes.find((n) => n.id === edges.find((e) => e.from === id && e.fromPort === port)?.to);
    const audio = res.assets.find((a) => a.mime === 'audio/wav');
    expect(audio?.name).toBe('click.wav');
    const click = nodes.find((n) => n.kind === 'event.timelineMarker' && n.params.marker === 'Click')!;
    const sound = next(next(click.id)!.id)!;
    expect(sound.kind).toBe('action.sound');
    expect(sound.params).toMatchObject({ asset: audio!.id, volume: 0.5, continue: 'start' });
    // The listener fires the URL event: message Go, then the link
    const go = nodes.find((n) => n.kind === 'action.emit' && n.params.name === 'Go')!;
    const url = next(go.id)!;
    expect(url.kind).toBe('action.url');
    expect(url.params).toMatchObject({ url: '"https://example.test/"', target: '_self' });
  });
  it('runs state and transition fire events, and listener fire events', async () => {
    const res = await importRive(eventFile(), 'events');
    const { nodes, edges } = res.artboards[0].logic;
    const next = (id: string, port = 'out') => nodes.find((n) => n.id === edges.find((e) => e.from === id && e.fromPort === port)?.to);
    // Entering state 3: set the state, then the Click event (message + sound), then play its animation
    const start = nodes.find((n) => n.kind === 'event.start')!;
    let n = next(start.id)!;
    while (n.kind !== 'action.setVariable') n = next(n.id)!;
    const chain: string[] = [];
    for (let c = next(n.id); c && chain.length < 6; c = next(c.id)) chain.push(c.kind + (c.params.name ? `:${c.params.name}` : ''));
    expect(chain).toEqual(['action.emit:Click', 'action.sound', 'action.timeline']);
    // The transition by the trigger: leaving state 3 sends Hit, the transition sends Go + link, then state 4 is entered
    const iff = nodes.find((n) => n.kind === 'logic.if')!;
    const route: string[] = [];
    for (let c = next(iff.id, 'true'); c && route.length < 8; c = next(c.id)) route.push(c.kind + (c.params.name ? `:${c.params.name}` : ''));
    expect(route.slice(0, 4)).toEqual(['action.emit:Hit', 'action.emit:Go', 'action.url', 'action.setVariable']);
    // Pointer listener fires Hit; the event listener reacts to Hit and Click and fires Go
    const down = nodes.find((n) => n.kind === 'event.pointer')!;
    expect(next(down.id)?.params).toMatchObject({ name: 'Hit' });
    const onHit = nodes.find((n) => n.kind === 'event.message' && n.params.name === 'Hit')!;
    const onClick = nodes.find((n) => n.kind === 'event.message' && n.params.name === 'Click')!;
    expect(next(onHit.id)?.id).toBe(next(onClick.id)?.id);
    expect(next(onHit.id)?.params).toMatchObject({ name: 'Go' });
    expect(res.warnings.some((w) => /events/i.test(w) && /not imported/.test(w))).toBe(false);
  });
});

describe.skipIf(!samples.includes('treasure_valley_interactive_map.riv'))('Rive waves, morphing paths and holes', () => {
  const area = (pts: { x: number; y: number }[]) => pts.reduce((s, p, i) => s + (p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y), 0);

  it('animates path vertices (the little waves, sails, clouds) as keys on the points', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const iconBg = res.artboards.find((a) => a.name === 'IconBG')!;
    const water = iconBg.timelines.find((t) => t.name === 'loop Water')!;
    const morph = water.tracks.filter((t) => /^paths\.\d+\.points\.\d+\.(x|y|in\.x|in\.y|out\.x|out\.y)$/.test(t.prop));
    expect(morph.length).toBeGreaterThan(100);
    // Several poses per loop, not just two
    expect(Math.max(...morph.map((t) => t.keys.length))).toBeGreaterThan(3);
    // Every track points at a point that exists on its node
    const byId = new Map<string, SceneNode>();
    walk(iconBg.children, (n) => byId.set(n.id, n));
    for (const t of morph) {
      const n = byId.get(t.nodeId) as Extract<SceneNode, { type: 'path' }> | undefined;
      expect(n?.type).toBe('path');
      const [, sub, , idx] = t.prop.split('.');
      expect(n!.paths[Number(sub)]?.points[Number(idx)]).toBeTruthy();
    }
    expect(res.warnings.some((w) => /Path vertex animation/.test(w))).toBe(false);
    // The boat's sail morphs too
    expect(iconBg.timelines.find((t) => t.name === 'loop Boat')!.tracks.some((t) => t.prop.startsWith('paths.'))).toBe(true);
  });

  it('opens holes (isHole paths wind the other way round) and copies translation constraints per axis', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const ab = res.artboards.find((a) => a.name === 'Southeast Boise ICON')!;
    const all: SceneNode[] = [];
    walk(ab.children, (n) => all.push(n));
    // The inner tube: a path with two sub-paths wound in opposite directions
    expect(all.some((n) => n.type === 'path' && n.paths.length >= 2 && Math.sign(area(n.paths[0].points)) !== Math.sign(area(n.paths[1].points)))).toBe(true);
    const iconBg: SceneNode[] = [];
    walk(res.artboards.find((a) => a.name === 'IconBG')!.children, (n) => iconBg.push(n));
    const copy = iconBg.flatMap((n) => n.constraints ?? []).filter((c) => c.type === 'copyPosition');
    expect(copy.length).toBeGreaterThan(0);
    expect(copy.some((c) => c.copyX !== false && c.copyY === false)).toBe(true);
  });
});

// ---------------------------------------------------------------- data binds on layers (built by hand: the samples only bind transitions and listeners)

function propKey(cls: string, prop: string): number {
  for (let c: string | undefined = cls; c && RIVE_CLASSES[c]; c = RIVE_CLASSES[c][1]) {
    const p = RIVE_CLASSES[c][2][prop];
    if (p) return p[0];
  }
  throw new Error(`${cls}.${prop} is not defined`);
}

const path = (...ids: number[]) => new Uint8Array(ids);

function dataBindFile(): Uint8Array {
  const objs: Spec[] = [
    // converters, by index: 0 range mapper, 1 rounder, 2 group (0 then 1), 3 to string, 4 negate, 5 multiply by 2
    ['DataConverterRangeMapper', { minInput: 0, maxInput: 1, minOutput: 0, maxOutput: 200, flags: 3 }],
    ['DataConverterRounder', { decimals: 1 }],
    ['DataConverterGroup', {}],
    ['DataConverterGroupItem', { converterId: 0 }],
    ['DataConverterGroupItem', { converterId: 1 }],
    ['DataConverterToString', { decimals: 2 }],
    ['DataConverterBooleanNegate', {}],
    ['DataConverterOperationValue', { operationType: 2, operationValue: 2 }],
    ['DataEnumCustom', { name: 'Mode' }],
    ['DataEnumValue', { key: 'low', value: 'low' }],
    ['DataEnumValue', { key: 'high', value: 'high' }],
    // view model 0: an item with a label; two instances
    ['ViewModel', { name: 'Item' }],
    ['ViewModelPropertyString', { name: 'label' }],
    ['ViewModelInstance', { viewModelId: 0, name: 'a' }],
    ['ViewModelInstanceString', { parentId: 0, viewModelPropertyId: 0, propertyValue: 'a' }],
    ['ViewModelInstance', { viewModelId: 0, name: 'b' }],
    ['ViewModelInstanceString', { parentId: 0, viewModelPropertyId: 0, propertyValue: 'b' }],
    // view model 1: the main one
    ['ViewModel', { name: 'Main' }],
    ['ViewModelPropertyNumber', { name: 'amount' }], // 0
    ['ViewModelPropertyColor', { name: 'tint' }], // 1
    ['ViewModelPropertyBoolean', { name: 'flag' }], // 2
    ['ViewModelPropertyEnumCustom', { name: 'mode', enumId: 0 }], // 3
    ['ViewModelPropertyList', { name: 'items' }], // 4
    ['ViewModelInstance', { viewModelId: 1, name: 'Instance' }],
    ['ViewModelInstanceNumber', { parentId: 0, viewModelPropertyId: 0, propertyValue: 0.5 }],
    ['ViewModelInstanceColor', { parentId: 0, viewModelPropertyId: 1, propertyValue: 0xff2e7d32 }],
    ['ViewModelInstanceBoolean', { parentId: 0, viewModelPropertyId: 2, propertyValue: true }],
    ['ViewModelInstanceEnum', { parentId: 0, viewModelPropertyId: 3, propertyValue: 1 }],
    ['ViewModelInstanceList', { parentId: 0, viewModelPropertyId: 4 }],
    ['ViewModelInstanceListItem', { viewModelId: 0, viewModelInstanceId: 0 }],
    ['ViewModelInstanceListItem', { viewModelId: 0, viewModelInstanceId: 1 }],
    ['Artboard', { name: 'Main', width: 400, height: 300 }],
    // slot 1: a node whose x, rotation (twice, the second to the view model only) follow the view model
    ['Node', { name: 'Mover', parentId: 0 }],
    ['DataBindContext', { propertyKey: propKey('Node', 'x'), sourcePathIds: path(1, 0), converterId: 2 }],
    ['DataBindContext', { propertyKey: propKey('Node', 'rotation'), sourcePathIds: path(1, 0), converterId: 5 }],
    ['DataBindContext', { propertyKey: propKey('Node', 'scaleX'), flags: 1, sourcePathIds: path(1, 0) }], // layer to view model
    // slot 2-5: a rectangle whose fill colour follows a colour
    ['Shape', { name: 'Box', parentId: 0 }],
    ['Rectangle', { parentId: 2, width: 40, height: 40 }],
    ['Fill', { parentId: 2 }],
    ['SolidColor', { parentId: 4, colorValue: 0xff000000 }],
    ['DataBindContext', { propertyKey: propKey('SolidColor', 'colorValue'), sourcePathIds: path(1, 1) }],
    // slot 6: a node shown by a flag (negated), moved by the list's length
    ['Node', { name: 'Flagged', parentId: 0 }],
    ['DataBindContext', { propertyKey: propKey('Node', 'opacity'), sourcePathIds: path(1, 2), converterId: 4 }],
    ['DataBindContext', { propertyKey: propKey('Node', 'y'), flags: 2, sourcePathIds: path(1, 4) }],
    // slots 7-9: text from the choice, and text from the number to two decimals
    ['Text', { name: 'Mode text', parentId: 0 }],
    ['TextStylePaint', { parentId: 7, fontSize: 20 }],
    ['TextValueRun', { parentId: 7, styleId: 8, text: 'x' }],
    ['DataBindContext', { propertyKey: propKey('TextValueRun', 'text'), sourcePathIds: path(1, 3) }],
    ['Text', { name: 'Amount text', parentId: 0 }],
    ['TextStylePaint', { parentId: 10, fontSize: 20 }],
    ['TextValueRun', { parentId: 10, styleId: 11, text: 'y' }],
    ['DataBindContext', { propertyKey: propKey('TextValueRun', 'text'), sourcePathIds: path(1, 0), converterId: 3 }],
  ];
  return writeRiv(objs);
}

describe('Rive data binds on layers', () => {
  it('turns view model values driving layer properties into bindings, with the bind converters', async () => {
    const res = await importRive(dataBindFile(), 'binds');
    const ab = res.artboards[0];
    const find = (name: string) => {
      const all: SceneNode[] = [];
      walk(ab.children, (n) => all.push(n));
      return all.find((n) => n.name === name)!;
    };
    const amount = res.variables.find((v) => v.name === 'Main_amount')!;
    expect(amount).toMatchObject({ shared: true, type: 'number', initial: 0.5 });

    const mover = find('Mover');
    expect(mover.bindings).toMatchObject({ x: 'Main_amount', rotation: 'Main_amount' });
    // group: range mapper then rounder
    expect(mover.converters?.x).toEqual([{ type: 'range', inMin: 0, inMax: 1, outMin: 0, outMax: 200, clamp: true }, { type: 'round', decimals: 1 }]);
    // multiply by 2, then radians to degrees for our rotation
    expect(mover.converters?.rotation?.[0]).toEqual({ type: 'expr', expr: 'value * 2' });
    expect(mover.converters?.rotation?.[1]).toMatchObject({ type: 'expr' });
    expect(String((mover.converters!.rotation![1] as { expr: string }).expr)).toMatch(/^value \* 57\.29/);
    // the bind that writes the layer back to the view model is not a binding
    expect(mover.bindings?.scaleX).toBeUndefined();

    // fill colour from a colour property
    const tint = res.variables.find((v) => v.name === 'Main_tint')!;
    expect(tint.type).toBe('color');
    expect(find('Box').bindings).toEqual({ 'fill.color': 'Main_tint' });

    // negate converter on a flag; the two-way bind on y is one way
    expect(find('Flagged').bindings?.opacity).toBe('Main_flag');
    expect(find('Flagged').converters?.opacity).toEqual([{ type: 'invert' }]);
    expect(find('Flagged').bindings?.y).toBe('Main_items');

    // text from an enum and from a number to text
    expect(find('Mode text').bindings?.text).toBe('Main_mode');
    expect(find('Amount text').bindings?.text).toBe('Main_amount');
    expect(find('Amount text').converters?.text).toEqual([{ type: 'format', decimals: 2 }]);

    expect(res.warnings.some((w) => /write a layer value back/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /Two-way/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /not imported yet/.test(w))).toBe(false);
  });

  it('turns enum properties into choices and list properties into list variables', async () => {
    const res = await importRive(dataBindFile(), 'binds');
    const mode = res.variables.find((v) => v.name === 'Main_mode')!;
    expect(mode).toMatchObject({ type: 'enum', options: ['low', 'high'], initial: 'high', shared: true });
    const items = res.variables.find((v) => v.name === 'Main_items')!;
    expect(items.type).toBe('list');
    expect(JSON.parse(String(items.initial))).toEqual([{ label: 'a' }, { label: 'b' }]);
  });

  it('plays: the bound layers follow the view model', async () => {
    const res = await importRive(dataBindFile(), 'binds');
    const { createProject, prepareNodes, applyConverters } = await import('interactives-player');
    void createProject;
    const ab = res.artboards[0];
    const vars = Object.fromEntries(res.variables.map((v) => [v.name, v.type === 'list' ? JSON.parse(String(v.initial)) : v.initial]));
    const all: SceneNode[] = [];
    walk(prepareNodes(ab.children, { vars }), (n) => all.push(n));
    const mover = all.find((n) => n.name === 'Mover')!;
    expect(mover.x).toBe(100);
    expect(all.find((n) => n.name === 'Amount text')).toMatchObject({ text: '0.50' });
    expect(all.find((n) => n.name === 'Mode text')).toMatchObject({ text: 'high' });
    const flagged = all.find((n) => n.name === 'Flagged')!;
    expect(flagged.opacity).toBe(0);
    void applyConverters;
    const again: SceneNode[] = [];
    walk(prepareNodes(ab.children, { vars: { ...vars, Main_amount: 1, Main_flag: false } }), (n) => again.push(n));
    expect(again.find((n) => n.name === 'Mover')!.x).toBe(200);
    expect(again.find((n) => n.name === 'Flagged')!.opacity).toBe(1);
  });
});

describe.skipIf(!samples.includes('treasure_valley_interactive_map.riv'))('Treasure Valley: what plays on its own', () => {
  // Rive plays an artboard's default state machine. (rive.js plays the *first animation* when it is told no machine; for the
  // MAIN artboard that is "Preview", a one-frame animation that fades in a still picture of the map, which looks like
  // the artboard "switching" to another map. There is no timer, exit time or view model change behind it.)
  it('does not play the Preview animation that only fades in a still picture', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const main = res.artboards.find((a) => a.name === 'MAIN')!;
    const preview = main.timelines.find((t) => t.name === 'Preview')!;
    expect(preview.autoplay).toBeFalsy();
    const all: SceneNode[] = [];
    walk(main.children, (n) => all.push(n));
    const picture = all.find((n) => n.type === 'image')!;
    expect(picture.opacity).toBe(0);
    // nothing on the artboard moves a picture or the district map by time or by a view model value
    const previewTrack = preview.tracks.find((t) => t.nodeId === picture.id && t.prop === 'opacity');
    expect(previewTrack?.keys[0].value).toBe(1);
    expect(main.timelines.filter((t) => t.autoplay).length).toBe(0);
  });

  it('starts the icon artboards loops: Any state transitions whose condition already holds run on start', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const bg = res.artboards.find((a) => a.name === 'IconBG')!;
    const { nodes, edges } = bg.logic;
    const water = bg.timelines.find((t) => t.name === 'loop Water')!;
    const startIds = new Set(nodes.filter((n) => n.kind === 'event.start').map((n) => n.id));
    // an If with a view model condition, fed by On start, that goes on to restart the loop
    const gate = nodes.find((n) => n.kind === 'logic.if' && String(n.params.condition).startsWith('MainVM_indexNum === 0 &&') && edges.some((e) => startIds.has(e.from) && e.to === n.id) && String(n.params.condition).includes('loop Water'))!;
    expect(gate).toBeTruthy();
    const follows = (id: string): string[] => edges.filter((e) => e.from === id && e.fromPort !== 'false').map((e) => e.to);
    const reach = new Set<string>();
    const queue = [gate.id];
    while (queue.length) for (const next of follows(queue.shift()!)) if (!reach.has(next)) (reach.add(next), queue.push(next));
    expect(nodes.some((n) => reach.has(n.id) && n.kind === 'action.timeline' && n.params.timeline === water.id && n.params.op === 'restart')).toBe(true);
  });

  it('keeps the straight lines of the icon artboards (ladder rungs, bands) as paths with a hairline box', async () => {
    const res = await importRive(new Uint8Array(readFileSync(dir + 'treasure_valley_interactive_map.riv')), 'tv');
    const icon = res.artboards.find((a) => a.name === 'South Boise ICON')!;
    const all: SceneNode[] = [];
    walk(icon.children, (n) => all.push(n));
    const lines = all.filter((n) => n.type === 'path' && (n.height < 1 || n.width < 1) && n.paths.length === 1 && n.paths[0].points.length === 2 && n.stroke && n.stroke.width > 0);
    expect(lines.length).toBeGreaterThan(5);
  });
});
