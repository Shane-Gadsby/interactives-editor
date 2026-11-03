import { describe, expect, it } from 'vitest';
import { blendWeights } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { RIVE_CLASSES } from '../src/lib/rive-defs';

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
  varuint(0);
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
      } else varuint(Number(v));
    }
    varuint(0);
  }
  return new Uint8Array(out);
}

/** Three animations of one node's x, a number input `speed`, and a layer: entry -> 1D blend -> (trigger) -> direct blend. */
function blendFile(): Uint8Array {
  const anim = (name: string, to: number): Spec[] => [
    ['LinearAnimation', { name, duration: 60, fps: 60, loopValue: 1 }],
    ['KeyedObject', { objectId: 1 }],
    ['KeyedProperty', { propertyKey: 13 }],
    ['KeyFrameDouble', { frame: 0, value: 0 }],
    ['KeyFrameDouble', { frame: 60, value: to }],
  ];
  return writeRiv([
    ['Artboard', { name: 'Main', width: 200, height: 100 }],
    ['Node', { name: 'N', parentId: 0 }],
    ...anim('Idle', 0),
    ...anim('Walk', 50),
    ...anim('Run', 100),
    ['StateMachine', { name: 'SM' }],
    ['StateMachineNumber', { name: 'speed', value: 3 }], // input 0
    ['StateMachineNumber', { name: 'walkMix', value: 0 }], // input 1
    ['StateMachineTrigger', { name: 'swap' }], // input 2
    ['StateMachineLayer', {}],
    ['EntryState', {}], // 0
    ['StateTransition', { stateToId: 3 }],
    ['AnyState', {}], // 1
    ['ExitState', {}], // 2
    ['BlendState1DInput', { inputId: 0 }], // 3
    ['BlendAnimation1D', { animationId: 0, value: 0 }],
    ['BlendAnimation1D', { animationId: 1, value: 5 }],
    ['BlendAnimation1D', { animationId: 2, value: 10 }],
    ['StateTransition', { stateToId: 4 }],
    ['TransitionTriggerCondition', { inputId: 2 }],
    ['BlendStateDirect', {}], // 4
    ['BlendAnimationDirect', { animationId: 1, blendSource: 0, inputId: 1 }],
    ['BlendAnimationDirect', { animationId: 2, blendSource: 1, mixValue: 25 }],
  ]);
}

describe('Rive blend states', () => {
  it('become blends: 1D by an input, direct by input or fixed mix', async () => {
    const res = await importRive(blendFile(), 'blend');
    const ab = res.artboards[0];
    expect(ab.timelines.map((t) => t.name)).toEqual(['Idle', 'Walk', 'Run']);
    const speed = res.variables.find((v) => v.name === 'speed')!;
    const walkMix = res.variables.find((v) => v.name === 'walkMix')!;
    expect(ab.blends).toHaveLength(2);
    const [oneD, direct] = ab.blends!;
    expect(oneD).toMatchObject({ name: '1D blend: Idle / Walk / Run', mode: '1d', variable: speed.id });
    expect(oneD.entries).toEqual(ab.timelines.map((t, i) => ({ timeline: t.id, value: i * 5 })));
    expect(direct).toMatchObject({ name: 'Direct blend: Walk / Run', mode: 'direct', range: 100 });
    expect(direct.entries).toEqual([
      { timeline: ab.timelines[1].id, weightVariable: walkMix.id },
      { timeline: ab.timelines[2].id, weight: 0.25 },
    ]);
    // The imported blend behaves like the Rive one: input 7.5 mixes Walk and Run equally
    expect(blendWeights(oneD, (id) => (id === speed.id ? 7.5 : 0))).toEqual([0, 0.5, 0.5]);
    expect(blendWeights(direct, (id) => (id === walkMix.id ? 50 : 0))).toEqual([0.5, 0.25]);
    expect(res.warnings.some((w) => /plain states/.test(w))).toBe(false);
  });

  it('entering the state plays the blend and leaving it stops it', async () => {
    const res = await importRive(blendFile(), 'blend');
    const ab = res.artboards[0];
    const [oneD, direct] = ab.blends!;
    const { nodes, edges } = ab.logic;
    const next = (id: string, port = 'out') => nodes.find((n) => n.id === edges.find((e) => e.from === id && e.fromPort === port)?.to);
    const chain = (from: string, port = 'out') => {
      const kinds: { kind: string; blend?: unknown }[] = [];
      for (let c = next(from, port); c && kinds.length < 8; c = next(c.id)) kinds.push({ kind: c.kind, blend: c.params.blend });
      return kinds;
    };
    // Entry: both blends are stopped (nothing is running), its blend plays, then the state is recorded
    const start = nodes.find((n) => n.kind === 'event.start')!;
    expect(chain(start.id).map((c) => c.kind)).toEqual(['action.blendStop', 'action.blendStop', 'action.blendPlay', 'action.setVariable']);
    expect(chain(start.id).find((c) => c.kind === 'action.blendPlay')!.blend).toBe(oneD.id);
    // The trigger transition stops the 1D blend (among the stops) and starts the direct one
    const iff = nodes.find((n) => n.kind === 'logic.if')!;
    const route = chain(iff.id, 'true');
    expect(route.filter((c) => c.kind === 'action.blendStop').map((c) => c.blend)).toContain(oneD.id);
    expect(route.find((c) => c.kind === 'action.blendPlay')).toEqual({ kind: 'action.blendPlay', blend: direct.id });
  });

  it('warns about blend states that are only partly supported', async () => {
    const file = writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 100 }],
      ['LinearAnimation', { name: 'A', duration: 60, fps: 60 }],
      ['StateMachine', { name: 'SM' }],
      ['StateMachineBool', { name: 'flag' }],
      ['StateMachineLayer', {}],
      ['EntryState', {}],
      ['StateTransition', { stateToId: 1 }],
      ['BlendState1DInput', { inputId: 0 }],
      ['BlendAnimation1D', { animationId: 0, value: 1 }],
      ['BlendAnimation1D', { animationId: 9, value: 2 }],
    ]);
    const res = await importRive(file, 'partial');
    expect(res.artboards[0].blends).toHaveLength(1);
    expect(res.warnings.some((w) => /not a number/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /could not be found and were skipped/.test(w))).toBe(true);
  });
});
