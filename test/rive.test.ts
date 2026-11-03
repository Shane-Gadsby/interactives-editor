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
