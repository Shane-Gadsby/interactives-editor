import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Player, createProject } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';

const flush = () => new Promise((r) => setTimeout(r, 0));
const dir = '../research/rive/';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

//a sample played in the player (jsdom): time moves by hand, pointer events go to the elements inside the nested artboards
async function open(bytes: Uint8Array) {
  document.body.innerHTML = '<div id="stage" style="width:400px;height:300px"></div>';
  const res = await importRive(bytes, 't');
  const project = createProject('t');
  project.artboards = res.artboards;
  project.variables = res.variables;
  project.settings.startArtboardId = res.artboard.id;
  //the sandbox bundle is not loaded here: the imported flows must not need it
  project.settings.scriptSandbox = false;
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  await flush();
  let clock = 0;
  let last = '';
  const run = async (ms: number) => {
    for (let i = 0; i < ms / 250; i++) {
      player.step(250);
      clock += 250;
      await flush();
      if (process.env.WATCH) { const cur = String(player.getVariable('Main_Animation_SM_layer1_state')) + ' r' + player.getVariable('VM_roundNum') + ' s' + player.getVariable('VM_sceneNum'); if (cur !== last) console.log('W', clock, cur); last = cur; }
    }
  };
  const kids = () => [...(player as unknown as { instances: Set<Player> }).instances] as unknown as { session: { artboard: { name: string; logic: { nodes: { kind: string; params: Record<string, unknown> }[] } }; renderer: { element(id: string): Element } } }[];
  //the pointer listener of a nested artboard's own state machine, as the browser would send it
  const pointer = async (artboard: string, kind: 'pointerenter' | 'pointerdown' | 'pointerleave') => {
    const k = kids().find((x) => x.session.artboard.name === artboard);
    const ev = k?.session.artboard.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.type === kind);
    const el = k && ev ? k.session.renderer.element(String(ev.params.target)) : null;
    if (!el) throw new Error(`no ${kind} listener on ${artboard}`);
    if (kind === 'pointerenter') el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: document.body }));
    else if (kind === 'pointerleave') el.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    else el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flush();
  };
  const get = (name: string) => player.getVariable(name);
  return { res, player, run, pointer, get, time: () => clock };
}

describe.skipIf(!existsSync(dir + '262426_-_breathing_for_calm.riv'))('the breathing sample plays through its buttons', () => {
  it('splash, begin, three rounds, choice, another round, the end screen, info and home', async () => {
    const t = await open(new Uint8Array(readFileSync(dir + '262426_-_breathing_for_calm.riv')));
    const state = () => String(t.get('Main_Animation_SM_layer1_state'));
    try {
      await t.run(2000);
      expect(state()).toBe('Splash screen');
      //nothing happens until the button is pressed, however long the splash animation has been over
      await t.run(5000);
      expect(state()).toBe('Splash screen');
      await t.pointer('Lets Begin', 'pointerenter');
      expect(t.get('VM_startBool')).toBe(true);
      await t.pointer('Lets Begin', 'pointerdown');
      await t.run(500);
      expect(state()).toBe('Splash Screen to Countdown');
      //entering the countdown sets the scene to 2 and the round to 1
      expect(t.get('VM_sceneNum')).toBe(2);
      expect(t.get('VM_roundNum')).toBe(1);
      await t.run(8000);
      expect(state()).toBe('Breath Cycle Middle (3)');
      await t.run(14000);
      expect(t.get('VM_roundNum')).toBe(2);
      await t.run(14000);
      expect(t.get('VM_roundNum')).toBe(3);
      await t.run(15000);
      //then the choice screen waits for a button (the scene was put back to 0 on the way)
      expect(state()).toBe('Choice');
      await t.run(10000);
      expect(state()).toBe('Choice');
      //another round
      await t.pointer('DoAnotherRoundButton', 'pointerdown');
      await t.run(2000);
      expect(state()).toBe('Breath Cycle Middle (3)');
      expect(t.get('VM_roundNum')).toBe(1);
      await t.run(14000 * 2 + 15000);
      expect(state()).toBe('Choice');
      //finish
      await t.pointer('Ready to Continue', 'pointerdown');
      await t.run(3000);
      expect(state()).toBe('End Screen');
      await t.pointer('Info Button', 'pointerdown');
      await t.run(2000);
      expect(state()).toBe('Information Panel (2)');
      await t.pointer('info X Button', 'pointerdown');
      await t.run(2000);
      expect(state()).toBe('End Screen');
      await t.pointer('Home button', 'pointerdown');
      await t.run(3000);
      expect(state()).toBe('Splash screen');
      expect(t.get('VM_finalScene')).toBe(0);
      //and round again
      await t.pointer('Lets Begin', 'pointerdown');
      await t.run(1000);
      expect(state()).toBe('Splash Screen to Countdown');
    } finally {
      t.player.destroy();
    }
  });

  it('lets the pointer through everything but the layers a listener names', async () => {
    const t = await open0();
    try {
      const kids = (t.player as unknown as { instances: Set<{ session: { artboard: { name: string; logic: { nodes: { kind: string; params: Record<string, unknown> }[] } }; renderer: { root: HTMLElement; element(id: string): HTMLElement } } }> }).instances;
      const named = (n: string) => [...kids].find((k) => k.session.artboard.name === n)!;
      //a panel with no listeners (and its layers) never takes the pointer; a button's target does, and so does what is inside it
      const panel = named('Information panel').session.renderer;
      expect(panel.root.style.pointerEvents).toBe('none');
      const begin = named('Lets Begin').session;
      const target = begin.renderer.element(String(begin.artboard.logic.nodes.find((n) => n.kind === 'event.pointer')!.params.target));
      expect(target.style.pointerEvents).toBe('auto');
      expect(begin.renderer.root.style.pointerEvents).toBe('none');
      expect(t.res.artboards.every((a) => a.pointerThrough)).toBe(true);
    } finally {
      t.player.destroy();
    }
  });

  it('opens the support page once per click, and not when the page loads', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    const t = await open0();
    try {
      await t.run(1000);
      expect(opened).not.toHaveBeenCalled();
      //the layer waits in its entry state until the button is pressed
      expect(t.get('Main_Animation_SM_layer3_state')).toBe('EntryState');
      const main = t.player as unknown as { session: { artboard: { logic: { nodes: { kind: string; params: Record<string, unknown> }[] } }; renderer: { element(id: string): Element } } };
      const ev = main.session.artboard.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.type === 'pointerdown')!;
      main.session.renderer.element(String(ev.params.target)).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await t.run(1500);
      expect(opened).toHaveBeenCalledTimes(1);
      expect(String(opened.mock.calls[0][0])).toMatch(/mental-health/);
    } finally {
      t.player.destroy();
    }
  });
});

async function open0() {
  return open(new Uint8Array(readFileSync(dir + '262426_-_breathing_for_calm.riv')));
}

const path = (...ids: number[]) => new Uint8Array(ids);

//one view model S (n, count). Animation A (a second, once) leaves for B by exit time, once n is 1; B sets count to 5 on entering.
//A fires an open-link event when the layer starts in it.
function exitScene(): Uint8Array {
  const value = propKey('BindablePropertyNumber', 'propertyValue');
  const anim = (name: string, a: number, b: number): Spec[] => [
    ['LinearAnimation', { name, duration: 60, fps: 60, loopValue: 0 }],
    ['KeyedObject', { objectId: 1 }],
    ['KeyedProperty', { propertyKey: 13 }],
    ['KeyFrameDouble', { frame: 0, value: a }],
    ['KeyFrameDouble', { frame: 60, value: b }],
  ];
  return writeRiv([
    ['ViewModel', { name: 'S' }],
    ['ViewModelPropertyNumber', { name: 'n' }],
    ['ViewModelPropertyNumber', { name: 'count' }],
    ['ViewModelInstance', { viewModelId: 0, name: 'i' }],
    ['ViewModelInstanceNumber', { parentId: 0, viewModelPropertyId: 0, propertyValue: 0 }],
    ['ViewModelInstanceNumber', { parentId: 0, viewModelPropertyId: 1, propertyValue: 0 }],
    ['Artboard', { name: 'Main', width: 200, height: 100 }],
    ['Node', { name: 'N', parentId: 0 }], // 1
    ['OpenUrlEvent', { name: 'Go', url: 'https://example.com/x', parentId: 0 }], // 2
    ...anim('A', 0, 100),
    ...anim('B', 200, 300),
    ['StateMachine', { name: 'SM' }],
    ['StateMachineLayer', { name: 'L' }],
    ['AnimationState', { animationId: 0 }], // 0 A
    ['StateMachineFireEvent', { eventId: 2 }],
    ['StateTransition', { stateToId: 1, flags: 4, exitTime: 1000 }],
    ['TransitionViewModelCondition', {}],
    ['BindablePropertyNumber', {}],
    ['DataBindContext', { propertyKey: value, sourcePathIds: path(0, 0) }],
    ['TransitionPropertyViewModelComparator', {}],
    ['TransitionValueNumberComparator', { value: 1 }],
    ['AnimationState', { animationId: 1 }], // 1 B
    ['BindablePropertyNumber', { propertyValue: 5 }],
    ['DataBindContext', { propertyKey: value, flags: 1, sourcePathIds: path(0, 1) }],
    ['ListenerViewModelChange', { flags: 4 }],
    ['AnyState', {}], // 2
    ['ExitState', {}], // 3
    ['EntryState', {}], // 4
    ['StateTransition', { stateToId: 0 }],
  ]);
}

describe('Rive state machines wait for what a transition needs', () => {
  it('an exit time at the end of the animation still takes a condition that comes true later', async () => {
    const t = await open(exitScene());
    const state = () => String(t.get('SM_layer1_state'));
    try {
      await t.run(3000);
      //the animation is long over and the condition not true: A stays
      expect(state()).toBe('A');
      t.player.setVariable('S_n', 1);
      await flush();
      expect(state()).toBe('B');
    } finally {
      t.player.destroy();
    }
  });

  it('waits for the end of the animation when the condition is true before it', async () => {
    const t = await open(exitScene());
    try {
      await t.run(250);
      t.player.setVariable('S_n', 1);
      await flush();
      expect(t.get('SM_layer1_state')).toBe('A');
      await t.run(1000);
      expect(t.get('SM_layer1_state')).toBe('B');
    } finally {
      t.player.destroy();
    }
  });

  it('actions on a state set view model properties when it is entered', async () => {
    const res = await importRive(exitScene(), 't');
    const sets = res.artboards[0].logic.nodes.filter((n) => n.kind === 'action.setVariable' && n.params.variable === res.variables.find((v) => v.name === 'S_count')!.id);
    expect(sets).toHaveLength(1);
    expect(sets[0].params).toMatchObject({ op: 'set', value: '5' });
    const t = await open(exitScene());
    try {
      await t.run(250);
      expect(t.get('S_count')).toBe(0);
      t.player.setVariable('S_n', 1);
      await t.run(1500);
      expect(t.get('S_count')).toBe(5);
    } finally {
      t.player.destroy();
    }
  });

  it('a layer starting in a state with an open-link event does not open the page', async () => {
    const open_ = vi.spyOn(window, 'open').mockImplementation(() => null);
    const res = await importRive(exitScene(), 't');
    expect(res.artboards[0].logic.nodes.filter((n) => n.kind === 'action.url')).toHaveLength(0);
    expect(res.artboards[0].logic.nodes.filter((n) => n.kind === 'action.emit')).toHaveLength(1);
    expect(open_).not.toHaveBeenCalled();
  });
});
