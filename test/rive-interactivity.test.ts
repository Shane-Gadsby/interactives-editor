import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Player, createProject, hitTargets } from 'interactives-player';
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
  // The player's sessions, the artboards nested in it at any depth
  type Sess = { artboard: { name: string; width: number; height: number; logic: { nodes: { id: string; kind: string; params: Record<string, unknown> }[]; edges: { from: string; to: string }[] } }; renderer: { root: HTMLElement; element(id: string): HTMLElement }; hitTree?: unknown[]; live: unknown[] };
  type Node = { player: Player; session: Sess };
  const all = (): Node[] => {
    const out: Node[] = [];
    const visit = (p: Player) => {
      for (const k of (p as unknown as { instances: Set<Player> }).instances) {
        out.push({ player: k, session: (k as unknown as { session: Sess }).session });
        visit(k);
      }
    };
    visit(player);
    return out;
  };
  //jsdom has no layout: every artboard gets a place of its own on an imaginary page (each 10000px further along), so a position is over one artboard only
  const places = new Map<Sess, number>();
  const place = (n: Node) => {
    if (!places.has(n.session)) places.set(n.session, places.size);
    const left = places.get(n.session)! * 10000;
    const { width, height } = n.session.artboard;
    n.session.renderer.root.getBoundingClientRect = () => ({ left, top: 0, right: left + width, bottom: height, width, height, x: left, y: 0, toJSON: () => ({}) });
    return left;
  };
  const named = (artboard: string) => {
    const k = all().find((x) => x.session.artboard.name === artboard);
    if (!k) throw new Error(`no artboard ${artboard}`);
    place(k);
    return k;
  };
  //where, in the artboard, the listeners' targets given are under the pointer
  const hitsAt = (k: Node, ids: string[] | Set<string>, x: number, y: number) => hitTargets((k.session.hitTree ?? k.session.live) as never, ids instanceof Set ? ids : new Set(ids), x, y);
  const targetsOf = (k: Node, type: string) => k.session.artboard.logic.nodes.filter((n) => n.kind === 'event.pointer' && n.params.type === type).map((n) => String(n.params.target));
  //a point in the artboard (a step of 6) that is over every one of the targets given, and none of `not`
  const spot = (k: Node, ids: string[], not: string[] = []) => {
    const every = (x: number, y: number) => ids.every((id) => hitsAt(k, [id], x, y).length) && !not.some((id) => hitsAt(k, [id], x, y).length);
    const { width, height } = k.session.artboard;
    for (let y = 3; y < height; y += 9) for (let x = 3 - width; x < width * 2; x += 9) if (every(x, y)) return { x, y };
    throw new Error(`no point over ${ids.length} targets of ${k.session.artboard.name}`);
  };
  //the pointer, as the browser sends it: client positions on the page
  const send = (type: string, k: Node | null, at: { x: number; y: number } | null) => {
    const left = k ? place(k) : 0;
    const target = (k?.session ?? (player as unknown as { session: Sess }).session).renderer.root;
    const clientX = at ? left + at.x : -5000;
    const clientY = at ? at.y : -5000;
    if (type === 'click') target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY, detail: 1 }));
    else target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY }));
  };
  const move = async (k: Node | null, at: { x: number; y: number } | null) => {
    send('pointermove', k, at);
    await flush();
  };
  const press = async (k: Node, at: { x: number; y: number }) => {
    await move(k, at);
    send('pointerdown', k, at);
    send('pointerup', k, at);
    send('click', k, at);
    await flush();
  };
  //the pointer listener of a nested artboard's own state machine, as the browser would send it
  const pointer = async (artboard: string, kind: 'pointerenter' | 'pointerdown' | 'pointerleave') => {
    const k = named(artboard);
    const id = targetsOf(k, kind)[0];
    if (!id) throw new Error(`no ${kind} listener on ${artboard}`);
    if (kind === 'pointerleave') await move(null, null);
    else if (kind === 'pointerenter') await move(k, spot(k, [id]));
    else await press(k, spot(k, [id]));
  };
  const get = (name: string) => player.getVariable(name);
  return { res, player, run, pointer, get, time: () => clock, all, named, spot, hitsAt, targetsOf, move, press, send };
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
      //the countdown's actions run when it ends (flags bit 0 is 'at end', as the real Rive runtime reads them): the scene is 1
      //and no round has started until then, which is what keeps the progress bubbles empty under the 3, 2, 1
      expect(t.get('VM_sceneNum')).toBe(1);
      expect(t.get('VM_roundNum')).toBe(0);
      await t.run(8000);
      expect(t.get('VM_sceneNum')).toBe(2);
      expect(t.get('VM_roundNum')).toBe(1);
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
      const main = { player: t.player, session: (t.player as unknown as { session: never }).session } as never as ReturnType<typeof t.all>[number];
      const ev = main.session.artboard.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.type === 'pointerdown')!;
      //the button slides in with the splash; it can be pressed where it is
      let at: { x: number; y: number } | null = null;
      for (let i = 0; i < 20 && !at; i++) {
        try {
          at = t.spot(main, [String(ev.params.target)]);
        } catch {
          await t.run(500);
        }
      }
      expect(opened).not.toHaveBeenCalled();
      await t.press(main, at!);
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

const tvFile = dir + 'treasure_valley_interactive_map.riv';

describe.skipIf(!existsSync(tvFile))('the Treasure Valley map reacts to the pointer like the Rive runtime does', () => {
  //what the real runtime (@rive-app/webgl2 2.49.2, MAIN with its default machine) answered for the same pointer, checked side by side
  async function map() {
    const t = await open(new Uint8Array(readFileSync(tvFile)));
    await t.run(4000);
    const tv = t.named('TREASURE VALLEY');
    const val = (k: ReturnType<typeof t.named>, type: string) => {
      const out = new Map<string, string>();
      const { nodes, edges } = k.session.artboard.logic;
      for (const n of nodes.filter((x) => x.kind === 'event.pointer' && x.params.type === type)) {
        const to = edges.filter((e) => e.from === n.id).map((e) => nodes.find((x) => x.id === e.to)!.params.value);
        out.set(String(n.params.target), String(to[0]));
      }
      return out;
    };
    const enters = val(tv, 'pointerenter');
    const clicks = val(tv, 'click');
    const city = () => String(t.get('TargetingTreasureValleyVM_targetingCitiesNum'));
    const index = () => String(t.get('MainVM_indexNum'));
    //where, on the map, each region's hover shapes are under the pointer
    const enterSet = new Set(enters.keys());
    const hits = (x: number, y: number) => t.hitsAt(tv, enterSet, x, y).map((id) => enters.get(id)!);
    const find = (want: (h: string[]) => boolean) => {
      for (let y = 3; y < 1080; y += 9) for (let x = 3; x < 1920; x += 9) if (want(hits(x, y))) return { x, y };
      throw new Error('no such point');
    };
    return { t, tv, enters, clicks, city, index, hits, find };
  }

  it('hovering a region is a hover of that region, wherever its shapes are (not their boxes), and leaving ends it', async () => {
    const m = await map();
    try {
      for (const region of ['6', '4', '3', '1']) {
        const at = m.find((h) => h.length === 1 && h[0] === region);
        await m.t.move(m.tv, at);
        await m.t.run(300);
        expect(m.city()).toBe(region);
      }
      //just off the edge of a region (inside the box that holds it): the pointer is not over it any more
      const from = m.find((h) => h.length === 1 && h[0] === '3');
      await m.t.move(m.tv, from);
      await m.t.run(300);
      expect(m.city()).toBe('3');
      let near: { x: number; y: number } | null = null;
      for (let r = 9; r < 400 && !near; r += 9) for (let a = 0; a < 360 && !near; a += 20) {
        const p = { x: from.x + r * Math.cos((a * Math.PI) / 180), y: from.y + r * Math.sin((a * Math.PI) / 180) };
        if (m.hits(p.x, p.y).length === 0) near = p;
      }
      await m.t.move(m.tv, near);
      await m.t.run(300);
      expect(m.city()).toBe('0');
      await m.t.move(m.tv, m.find((h) => h.length === 1 && h[0] === '2'));
      await m.t.run(300);
      expect(m.city()).toBe('2');
      await m.t.move(null, null);
      await m.t.run(300);
      expect(m.city()).toBe('0');
    } finally {
      m.t.player.destroy();
    }
  }, 60000);

  it('regions that overlap are each under the pointer: the one entered last of those at once is the one lowest in the layers', async () => {
    const m = await map();
    try {
      const combos = new Map<string, { x: number; y: number }>();
      const aloneIn = new Map<string, { x: number; y: number }>();
      for (let y = 3; y < 1080; y += 5) {
        for (let x = 3; x < 1920; x += 5) {
          const h = m.hits(x, y);
          if (h.length > 1 && !combos.has(h.join())) combos.set(h.join(), { x, y });
        }
      }
      //(east Boise and Garden City, Eagle and Garden City, Boise and Meridian: what the file's author drew)
      expect(combos.size).toBeGreaterThan(1);
      for (const [key, at] of combos) {
        const regions = key.split(',');
        await m.t.move(null, null);
        await m.t.run(300);
        await m.t.move(m.tv, at);
        await m.t.run(300);
        //hits come back from the back of the layers to the front: the real runtime answered with the back one, wherever the pointer came from
        expect(m.city()).toBe(regions[0]);
        //pointer already in one of them: the other one is the one that was entered
        for (const from of regions) {
          if (!aloneIn.has(from)) aloneIn.set(from, m.find((h) => h.length === 1 && h[0] === from));
          await m.t.move(m.tv, aloneIn.get(from)!);
          await m.t.run(300);
          await m.t.move(m.tv, at);
          await m.t.run(300);
          const entered = regions.filter((r) => r !== from);
          if (entered.length === 1) expect(m.city()).toBe(entered[0]);
        }
      }
    } finally {
      m.t.player.destroy();
    }
  }, 120000);

  it('a click on a hovered region opens its view, the Boise view picks its areas, and the X goes back one view at a time', async () => {
    const m = await map();
    try {
      const t = m.t;
      //the click target of the hovered region only answers once the hover has shown it
      const clickOf = (region: string) => [...m.clicks].find(([, v]) => v === region)![0];
      const hoverOf = (region: string) => [...m.enters].find(([, v]) => v === region)![0];
      const at = m.find((h) => h.length === 1 && h[0] === '6');
      await t.move(m.tv, at);
      await t.run(700);
      const both = t.spot(m.tv, [hoverOf('6'), clickOf('6')]);
      await t.press(m.tv, both);
      await t.run(3000);
      expect(m.index()).toBe('6');
      //in a region view the map's own hovers are not in the way
      await t.move(m.tv, at);
      await t.run(500);
      expect(String(t.get('TargetingTreasureValleyVM_targetingCitiesNum'))).toBe('0');
      //the Boise view's own areas: hovering one, then clicking it
      const boise = t.named('BOISE');
      const area = (v: string) => [...boise.session.artboard.logic.nodes.filter((n) => n.kind === 'event.pointer' && n.params.type === 'pointerenter')].find((n) => String(boise.session.artboard.logic.edges.filter((e) => e.from === n.id).map((e) => boise.session.artboard.logic.nodes.find((x) => x.id === e.to)!.params.value)[0]) === v)!.params.target as string;
      const south = t.spot(boise, [area('5')]);
      await t.move(boise, south);
      await t.run(500);
      expect(String(t.get('TargetingBoiseVM_targetingSuburbanNeighborhoodNum'))).toBe('5');
      await t.press(boise, south);
      await t.run(3000);
      expect(m.index()).toBe('11');
      //X: one view back each time
      const button = t.named('Button');
      const x = { x: 43, y: 43 };
      await t.press(button, x);
      await t.run(3000);
      expect(m.index()).toBe('6');
      await t.press(button, x);
      await t.run(3000);
      expect(m.index()).toBe('0');
      //and the map answers again once its intro has played
      await t.run(3000);
      const caldwell = m.find((h) => h.length === 1 && h[0] === '1');
      await t.move(m.tv, caldwell);
      await t.run(500);
      expect(m.city()).toBe('1');
    } finally {
      m.t.player.destroy();
    }
  }, 120000);

  it('keeps the pose of a state whose animation has played out, except for the ones that end the layer', async () => {
    const res = await importRive(new Uint8Array(readFileSync(tvFile)), 'tv');
    const tv = res.artboards.find((a) => a.name === 'TREASURE VALLEY')!;
    const tl = (name: string) => tv.timelines.find((x) => x.name === name)!;
    //the layer sits in the region's view until the file says otherwise
    expect(tl('BOISE').holdsEnd).toBe(true);
    expect(tl('TREASURE VALLEY_IDLE').holdsEnd).toBe(true);
    //an exit animation that ends in the layer's Exit state is done with the layer
    expect(tl('NAMPA exit').holdsEnd).toBe(false);
    //(the first layer rests in its exit state until the hover changes)
    expect(tl('Cities exit').holdsEnd).toBe(true);
  });
});

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
