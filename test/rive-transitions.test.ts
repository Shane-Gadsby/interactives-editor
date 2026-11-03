import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { writeRiv, type Spec } from './rive-writer';

const flush = () => new Promise((r) => setTimeout(r, 0));

type Props = Record<string, unknown>;

/**
 * One node N. Animations (a second long, 60 fps): A moves x 0 to 100 (loops), B x 200 to 300, C x 400 to 500.
 * Layer: entry -> A; A -> B on trigger `go` (with `tr`), B -> A on trigger `back` (with `back`).
 */
function scene(v: { tr?: Props; back?: Props; extraA?: Spec[]; extraStates?: Spec[]; aLoop?: number; cubic?: [number, number, number, number]; blend?: boolean } = {}): Uint8Array {
  const anim = (name: string, loop: number, a: number, b: number): Spec[] => [
    ['LinearAnimation', { name, duration: 60, fps: 60, loopValue: loop }],
    ['KeyedObject', { objectId: 1 }],
    ['KeyedProperty', { propertyKey: 13 }],
    ['KeyFrameDouble', { frame: 0, value: a }],
    ['KeyFrameDouble', { frame: 60, value: b }],
  ];
  const objs: Spec[] = [['Artboard', { name: 'Main', width: 200, height: 100 }], ['Node', { name: 'N', parentId: 0 }], ...anim('A', v.aLoop ?? 1, 0, 100), ...anim('B', 1, 200, 300), ...anim('C', 1, 400, 500)];
  const tr: Props = { stateToId: 1, ...(v.tr ?? {}) };
  let interp: Spec[] = [];
  if (v.cubic) {
    interp = [['CubicEaseInterpolator', { x1: v.cubic[0], y1: v.cubic[1], x2: v.cubic[2], y2: v.cubic[3] }]];
    tr.interpolationType = 2;
    tr.interpolatorId = 2; // components count from the artboard (0): the node is 1, the interpolator 2
  }
  return writeRiv([
    ...objs,
    ...interp,
    ['StateMachine', { name: 'SM' }],
    ['StateMachineTrigger', { name: 'go' }], // 0
    ['StateMachineTrigger', { name: 'back' }], // 1
    ['StateMachineNumber', { name: 'n', value: 0 }], // 2
    ['StateMachineLayer', { name: 'L' }],
    ['AnimationState', { animationId: 0 }], // 0 A
    ['StateTransition', tr],
    ['TransitionTriggerCondition', { inputId: 0 }],
    ...(v.extraA ?? []),
    ['AnimationState', { animationId: 1 }], // 1 B
    ['StateTransition', { stateToId: 0, ...(v.back ?? {}) }],
    ['TransitionTriggerCondition', { inputId: 1 }],
    ['AnyState', {}], // 2
    ['ExitState', {}], // 3
    ['EntryState', {}], // 4
    ['StateTransition', { stateToId: 0 }],
    ...(v.extraStates ?? []),
  ]);
}

async function run(bytes: Uint8Array) {
  document.body.innerHTML = '<div id="stage" style="width:400px;height:300px"></div>';
  const res = await importRive(bytes, 't');
  const project = createProject('t');
  project.artboards = res.artboards;
  project.variables = res.variables;
  project.settings.startArtboardId = res.artboard.id;
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  await flush();
  const ab = res.artboards[0];
  const n = player['session']!.byId.get(ab.children.find((c) => c.name === 'N')!.id) as unknown as { x: number };
  const stateVar = res.variables.find((x) => /layer1_state/.test(x.name))!;
  return { res, ab, player, n, state: () => String(player.getVariable(stateVar.name)) };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Rive transitions run the way Rive mixes them', () => {
  it('the state left keeps playing while the next one mixes in over it', async () => {
    const t = await run(scene({ tr: { duration: 400 } }));
    const timelines = Object.fromEntries(t.ab.timelines.map((x) => [x.name, x.id]));
    const play = t.ab.logic.nodes.find((x) => x.kind === 'action.timeline' && x.params.timeline === timelines.B)!;
    expect(play.params).toMatchObject({ fade: '400', outgoing: JSON.stringify([timelines.A]) });
    // the old state is not paused up front
    // (only the entry and the way back stop the other states, and with the node that starts the next one)
    expect(t.ab.logic.nodes.filter((x) => x.kind === 'action.code')).toHaveLength(0);
    expect(t.ab.logic.nodes.filter((x) => x.kind === 'action.timeline' && Number(x.params.fade) === 0 && x.params.outgoing)).toHaveLength(2);
    t.player.step(100);
    expect(t.n.x).toBeCloseTo(10);
    t.player.send('go');
    await flush();
    t.player.step(100); // A at 200ms (x 20), B at 100ms (x 210), a quarter in
    expect(t.n.x).toBeCloseTo(20 * 0.75 + 210 * 0.25);
    t.player.step(300);
    expect(t.n.x).toBeCloseTo(200 + 40); // B at 400ms, A stopped
    expect(t.player.timeline('A')!.playing).toBe(false);
    t.player.destroy();
  });

  it('pause on exit holds the old state while mixing', async () => {
    const t = await run(scene({ tr: { duration: 400, flags: 16 } }));
    t.player.step(100);
    t.player.send('go');
    await flush();
    t.player.step(100);
    expect(t.n.x).toBeCloseTo(10 * 0.75 + 210 * 0.25);
    t.player.destroy();
  });

  it('a cubic mix curve shapes the mix', async () => {
    const lin = await run(scene({ tr: { duration: 400, flags: 16 } }));
    lin.player.step(100);
    lin.player.send('go');
    await flush();
    lin.player.step(100);
    const linear = lin.n.x;
    lin.player.destroy();
    const slow = await run(scene({ tr: { duration: 400, flags: 16 }, cubic: [0.9, 0, 1, 0.5] }));
    const bPlay = slow.ab.logic.nodes.find((x) => x.kind === 'action.timeline' && x.params.timeline === slow.ab.timelines.find((tl) => tl.name === 'B')!.id);
    expect(bPlay?.params.fadeEase).toEqual([0.9, 0, 1, 0.5]);
    slow.player.step(100);
    slow.player.send('go');
    await flush();
    slow.player.step(100);
    // eased: the new state takes over more slowly than evenly
    expect(slow.n.x).toBeLessThan(linear);
    expect(slow.n.x).toBeGreaterThan(10 * 0.75 + 210 * 0.25 - 60);
    slow.player.destroy();
  });

  it('a mix into a blend state blends the blend in', async () => {
    const bytes = scene({
      tr: { duration: 400, stateToId: 5 },
      extraStates: [
        ['BlendStateDirect', {}], // 5
        ['BlendAnimationDirect', { animationId: 2, blendSource: 1, mixValue: 100 }],
      ],
    });
    const t = await run(bytes);
    const play = t.ab.logic.nodes.find((x) => x.kind === 'action.blendPlay')!;
    expect(play.params).toMatchObject({ fade: '400' });
    expect(String(play.params.outgoing)).toContain(t.ab.timelines[0].id);
    expect(t.res.warnings.some((w) => /blend durations into blend states/.test(w))).toBe(false);
    t.player.step(100); // A x 10
    t.player.send('go');
    await flush();
    t.player.step(100); // A at 200ms (x 20), the blend (C, x 400 at its start) weighs a quarter
    expect(t.n.x).toBeCloseTo(20 * 0.75 + (400 + 10) * 0.25, 0);
    t.player.step(300);
    expect(t.n.x).toBeCloseTo(400 + 40, 0);
    t.player.destroy();
  });
});

describe('Rive exit time', () => {
  const stateAfter = async (tr: Props, stepsMs: number[]) => {
    const t = await run(scene({ tr }));
    t.player.step(100);
    t.player.send('go');
    await flush();
    const seen: string[] = [];
    for (const ms of stepsMs) {
      t.player.step(ms);
      await flush();
      seen.push(t.state());
    }
    t.player.destroy();
    return { seen, t };
  };

  it('waits for a time in milliseconds before taking the transition', async () => {
    const { seen, t } = await stateAfter({ flags: 4, exitTime: 500 }, [300, 150]);
    expect(t.ab.logic.nodes.some((x) => x.kind === 'action.waitTimeline' && x.params.at === 500 && x.params.unit === 'ms')).toBe(true);
    expect(seen).toEqual(['A', 'B']); // A is at 400ms, then at 550ms
  });

  it('waits for a share of the animation (percentage flag)', async () => {
    const { seen } = await stateAfter({ flags: 4 | 8, exitTime: 50 }, [300, 150]);
    expect(seen).toEqual(['A', 'B']);
  });

  it('takes it at once when the exit time has already gone by', async () => {
    const { seen } = await stateAfter({ flags: 4, exitTime: 50 }, [0]);
    expect(seen).toEqual(['B']);
  });

  it('an exit time at the very end waits for the animation to finish', async () => {
    const t = await run(scene({ tr: { flags: 4 | 8, exitTime: 100 }, aLoop: 0 }));
    t.player.send('go');
    await flush();
    t.player.step(800);
    await flush();
    expect(t.state()).toBe('A');
    t.player.step(200);
    await flush();
    expect(t.state()).toBe('B');
    t.player.destroy();
  });

  it('a transition with only an exit time leaves once the time is reached', async () => {
    // A -> B has no conditions: only the exit time
    const bytes = writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 100 }],
      ['Node', { name: 'N', parentId: 0 }],
      ['LinearAnimation', { name: 'A', duration: 60, fps: 60, loopValue: 0 }],
      ['KeyedObject', { objectId: 1 }],
      ['KeyedProperty', { propertyKey: 13 }],
      ['KeyFrameDouble', { frame: 0, value: 0 }],
      ['KeyFrameDouble', { frame: 60, value: 100 }],
      ['LinearAnimation', { name: 'B', duration: 60, fps: 60, loopValue: 1 }],
      ['KeyedObject', { objectId: 1 }],
      ['KeyedProperty', { propertyKey: 13 }],
      ['KeyFrameDouble', { frame: 0, value: 200 }],
      ['KeyFrameDouble', { frame: 60, value: 300 }],
      ['StateMachine', { name: 'SM' }],
      ['StateMachineLayer', { name: 'L' }],
      ['AnimationState', { animationId: 0 }],
      ['StateTransition', { stateToId: 1, flags: 4, exitTime: 400 }],
      ['AnimationState', { animationId: 1 }],
      ['AnyState', {}],
      ['ExitState', {}],
      ['EntryState', {}],
      ['StateTransition', { stateToId: 0 }],
    ]);
    const t = await run(bytes);
    t.player.step(300);
    await flush();
    expect(t.state()).toBe('A');
    t.player.step(200);
    await flush();
    expect(t.state()).toBe('B');
    t.player.destroy();
  });
});

describe('Rive early exit', () => {
  const afterBack = async (go: Props) => {
    const t = await run(scene({ tr: { duration: 400, ...go } }));
    t.player.send('go');
    await flush();
    t.player.step(100);
    t.player.send('back');
    await flush();
    const during = t.state();
    t.player.step(500);
    await flush();
    t.player.send('back');
    await flush();
    const after = t.state();
    const gated = t.ab.logic.nodes.filter((x) => x.kind === 'action.waitBlendIn').length;
    t.player.destroy();
    return { during, after, gated };
  };

  it('a state being mixed into cannot be left until the mix is done (a trigger meanwhile is lost)', async () => {
    const r = await afterBack({});
    expect(r.gated).toBe(1);
    expect(r.during).toBe('B');
    expect(r.after).toBe('A');
  });

  it('with early exit it can be left at once', async () => {
    const r = await afterBack({ flags: 32 });
    expect(r.during).toBe('A');
  });

  it('adds no waiting where nothing is mixed into', async () => {
    const t = await run(scene({}));
    expect(t.ab.logic.nodes.some((x) => x.kind === 'action.waitBlendIn')).toBe(false);
    t.player.destroy();
  });
});

describe('Rive random transitions', () => {
  // A -> B (weight 1) and A -> C (weight 3), both on `go`
  const randomScene = (w1: number, w2: number) =>
    scene({
      tr: w1 === 1 ? {} : { randomWeight: w1 },
      extraA: [['StateTransition', { stateToId: 2, ...(w2 === 1 ? {} : { randomWeight: w2 }) }], ['TransitionTriggerCondition', { inputId: 0 }]],
      extraStates: [],
    });
  // state 2 must be a real state: replace the Any state slot with a third animation state by building it explicitly
  const bytes = (w1: number, w2: number) => {
    const anim = (name: string, a: number, b: number): Spec[] => [
      ['LinearAnimation', { name, duration: 60, fps: 60, loopValue: 1 }],
      ['KeyedObject', { objectId: 1 }],
      ['KeyedProperty', { propertyKey: 13 }],
      ['KeyFrameDouble', { frame: 0, value: a }],
      ['KeyFrameDouble', { frame: 60, value: b }],
    ];
    return writeRiv([
      ['Artboard', { name: 'Main', width: 200, height: 100 }],
      ['Node', { name: 'N', parentId: 0 }],
      ...anim('A', 0, 100),
      ...anim('B', 200, 300),
      ...anim('C', 400, 500),
      ['StateMachine', { name: 'SM' }],
      ['StateMachineTrigger', { name: 'go' }],
      ['StateMachineLayer', { name: 'L' }],
      ['AnimationState', { animationId: 0 }], // 0 A
      ['StateTransition', { stateToId: 1, ...(w1 === 1 ? {} : { randomWeight: w1 }) }],
      ['TransitionTriggerCondition', { inputId: 0 }],
      ['StateTransition', { stateToId: 2, ...(w2 === 1 ? {} : { randomWeight: w2 }) }],
      ['TransitionTriggerCondition', { inputId: 0 }],
      ['AnimationState', { animationId: 1 }], // 1 B
      ['AnimationState', { animationId: 2 }], // 2 C
      ['AnyState', {}],
      ['ExitState', {}],
      ['EntryState', {}],
      ['StateTransition', { stateToId: 0 }],
    ]);
  };
  void randomScene;

  const go = async (w1: number, w2: number, roll: number) => {
    const t = await run(bytes(w1, w2));
    vi.spyOn(Math, 'random').mockReturnValue(roll);
    t.player.send('go');
    await flush();
    const out = { state: t.state(), random: t.ab.logic.nodes.filter((x) => x.kind === 'logic.random') };
    t.player.destroy();
    return out;
  };

  it('picks among the valid transitions by their weights', async () => {
    const low = await go(1, 3, 0.1);
    expect(low.random).toHaveLength(1);
    expect(low.random[0].params).toMatchObject({ weights: '[1, 3]' });
    expect(low.state).toBe('B');
    expect((await go(1, 3, 0.3)).state).toBe('C');
    expect((await go(1, 3, 0.99)).state).toBe('C');
  });

  it('a weight of 0 is never picked', async () => {
    expect((await go(0, 1, 0.01)).state).toBe('C');
  });

  it('adds no random pick when every weight is the default', async () => {
    const r = await go(1, 1, 0.99);
    expect(r.random).toHaveLength(0);
  });
});
