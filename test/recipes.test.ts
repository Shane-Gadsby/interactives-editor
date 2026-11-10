//Behaviour recipes: the nodes each one writes, as one undo step, and that Preview does what the sentence says.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_BY_KIND, Player, createArtboard, createNode, createProject, type Artboard, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { RECIPES, RECIPE_BY_ID, THIS_LAYER, applyBehaviour, buildBehaviour, counterChoices, defaultAnswers, incomplete, layerChoices, unavailable, type Answers, type RecipeCtx, type Trigger } from '../src/lib/recipes';
import { flowSentence, buildFlow } from '../src/lib/flow-describe';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function fixture() {
  const p = createProject('T');
  const home = p.artboards[0];
  const btn = createNode('rect', { name: 'Button', x: 10, y: 10, width: 100, height: 40 });
  const hint = createNode('rect', { name: 'Hint', x: 10, y: 100, width: 100, height: 40 });
  home.children.push(btn, hint);
  const quiz = createArtboard({ name: 'Quiz' });
  const last = createArtboard({ name: 'Last' });
  p.artboards.push(quiz, last);
  home.timelines.push({ id: 'tl1', name: 'Intro', duration: 500, tracks: [], loop: false } as unknown as Artboard['timelines'][number]);
  p.assets.push({ id: 'snd', name: 'Click sound', mime: 'audio/mpeg', size: 1, src: 'data:audio/mpeg;base64,AA==' } as unknown as Project['assets'][number]);
  return { p, home, btn, hint, quiz, last };
}

let ids = 0;
const mk = (prefix: string) => `${prefix}${++ids}`;
const ctxOf = (f: ReturnType<typeof fixture>): RecipeCtx => ({ project: f.p, ab: f.home, layerId: f.btn.id });

describe('buildBehaviour', () => {
  it('writes an On pointer event and one action, joined, nothing else, for every recipe', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    for (const r of RECIPES) {
      const answers: Answers = { ...defaultAnswers(r, ctx), link: 'https://example.com', page: f.quiz.id };
      const b = buildBehaviour(ctx, r.id, 'click', answers, mk);
      expect(b.nodes.map((n) => n.kind), r.id).toEqual(['event.pointer', expect.stringMatching(/^action\./)]);
      expect(b.nodes[0].params, r.id).toMatchObject({ target: f.btn.id, type: 'click' });
      expect(b.edges, r.id).toEqual([{ id: expect.any(String), from: b.eventId, fromPort: 'out', to: b.actionId, toPort: 'in' }]);
      // only kinds the catalog has: no hidden node types
      for (const n of b.nodes) expect(CATALOG_BY_KIND[n.kind], n.kind).toBeTruthy();
      //(Count what has been done has no trigger of its own, and its own tests in all-done.test.ts)
      if (r.id !== 'count-done') expect(b.sentence, r.id).toMatch(/^When clicked: /);
    }
  });

  it('mutes, controls a video, and runs a script, making the script when it is new', () => {
    const f = fixture();
    const film = createNode('video', { name: 'Film', x: 200, y: 10, width: 320, height: 180 } as never);
    f.home.children.push(film);
    const ctx = ctxOf(f);
    expect(buildBehaviour(ctx, 'sound-toggle', 'click', {}, mk).nodes[1]).toMatchObject({ kind: 'action.captions', params: { op: 'soundToggle' } });
    const seek = buildBehaviour(ctx, 'video-seek', 'click', { ...defaultAnswers(RECIPE_BY_ID['video-seek'], ctx), seconds: '75' }, mk);
    expect(seek.nodes[1]).toMatchObject({ kind: 'action.video', params: { target: film.id, op: 'seek', seconds: '75' } });
    expect(buildBehaviour({ ...ctx, layerId: film.id }, 'video-toggle', 'click', defaultAnswers(RECIPE_BY_ID['video-toggle'], { ...ctx, layerId: film.id }), mk).nodes[1].params).toMatchObject({ target: film.id, op: 'toggle' });
    const fresh = buildBehaviour(ctx, 'script', 'click', defaultAnswers(RECIPE_BY_ID.script, ctx), mk);
    expect(fresh.scripts).toEqual([{ id: expect.any(String), name: 'onClick', code: expect.stringContaining('clicked'), runOnStart: false }]);
    expect(fresh.nodes[1]).toMatchObject({ kind: 'action.script', params: { script: fresh.scripts[0].id } });
    const store = new EditorStore(f.p);
    applyBehaviour((r) => store.update(r), f.home.id, fresh);
    expect(store.get().project.scripts.map((x) => x.name)).toEqual(['onClick']);
    const g = fixture();
    g.p.scripts.push({ id: 'sc-old', name: 'Score', code: '', runOnStart: false });
    expect(defaultAnswers(RECIPE_BY_ID.script, ctxOf(g)).script).toBe('sc-old');
    expect(incomplete(RECIPE_BY_ID.script, { script: 'new:' })).toBe('Name the script.');
  });

  it('cannot control a video on a page that has none', () => {
    const f = fixture();
    expect(unavailable(RECIPE_BY_ID['video-toggle'], ctxOf(f))).toMatch(/no video layer/);
  });

  it('writes the settings each recipe promises', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    const act = (id: string, a: Answers = {}, t: Trigger = 'click') => buildBehaviour(ctx, id, t, a, mk).nodes[1];
    expect(act('page-next').params).toMatchObject({ to: 'next' });
    expect(act('page-previous').params).toMatchObject({ to: 'previous' });
    expect(act('page-pick', { page: f.quiz.id }).params).toMatchObject({ to: 'picked', artboard: f.quiz.id });
    expect(act('soundtrack', { sound: 'snd' }).params).toMatchObject({ asset: 'snd', loop: 'true', soundtrack: true });
    expect(act('soundtrack-stop')).toMatchObject({ kind: 'action.stopSound' });
    expect(buildBehaviour(ctx, 'soundtrack', 'click', { sound: 'snd' }, mk).sentence).toContain('as the soundtrack');
    expect(act('show', { layer: f.hint.id })).toMatchObject({ kind: 'action.visibility', params: { target: f.hint.id, op: 'show' } });
    expect(act('hide', { layer: THIS_LAYER }).params).toMatchObject({ target: f.btn.id, op: 'hide' });
    expect(act('toggle', { layer: f.hint.id }).params).toMatchObject({ op: 'toggle' });
    expect(act('animation', { timeline: 'tl1' })).toMatchObject({ kind: 'action.timeline', params: { timeline: 'tl1', op: 'play' } });
    expect(act('sound', { sound: 'snd' })).toMatchObject({ kind: 'action.sound', params: { asset: 'snd' } });
    expect(act('link', { link: 'https://example.com' }).params).toMatchObject({ url: '"https://example.com"', target: '_blank' });
    expect(act('start-over').kind).toBe('action.startOver');
    expect(act('view-layer', { layer: f.hint.id })).toMatchObject({ kind: 'action.moveView', params: { to: 'layer', target: f.hint.id, duration: 600 } });
    expect(act('view-page')).toMatchObject({ kind: 'action.moveView', params: { to: 'page' } });
    expect(buildBehaviour(ctx, 'view-layer', 'click', { layer: f.hint.id }, mk).sentence).toBe('When clicked: move the view to Hint');
    expect(buildBehaviour(ctx, 'view-page', 'click', {}, mk).sentence).toBe('When clicked: show the whole page again');
    expect(buildBehaviour(ctx, 'show', 'pointerenter', { layer: f.hint.id }, mk).nodes[0].params.type).toBe('pointerenter');
    expect(buildBehaviour(ctx, 'show', 'pointerenter', { layer: f.hint.id }, mk).sentence).toMatch(/^When hovered over: /);
  });

  it('makes a counter or a switch in plain words when there is none, and uses an existing one when there is', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    const c = buildBehaviour(ctx, 'counter', 'click', defaultAnswers(RECIPE_BY_ID.counter, ctx), mk);
    expect(c.variables).toEqual([{ id: expect.any(String), name: 'count', type: 'number', initial: 0 }]);
    expect(c.nodes[1].params).toMatchObject({ variable: c.variables[0].id, op: 'add', value: '1' });
    expect(c.sentence).toBe('When clicked: add 1 to count');
    const s = buildBehaviour(ctx, 'switch', 'click', defaultAnswers(RECIPE_BY_ID.switch, ctx), mk);
    expect(s.variables).toEqual([{ id: expect.any(String), name: 'isOn', type: 'boolean', initial: false }]);
    expect(s.sentence).toBe('When clicked: switch isOn on or off');
    // a name that is taken gets a number; a name with odd characters is made safe
    f.p.variables.push({ id: 'v1', name: 'count', type: 'number', initial: 0 });
    expect(counterChoices(f.p).map((v) => v.name)).toEqual(['count']);
    expect(defaultAnswers(RECIPE_BY_ID.counter, ctx).counter).toBe('v1');
    const named = buildBehaviour(ctx, 'counter', 'click', { counter: 'new:count' }, mk);
    expect(named.variables[0].name).toBe('count2');
    expect(buildBehaviour(ctx, 'counter', 'click', { counter: 'new:Number of clicks!' }, mk).variables[0].name).toBe('Number_of_clicks_');
    const existing = buildBehaviour(ctx, 'counter', 'click', { counter: 'v1' }, mk);
    expect(existing.variables).toEqual([]);
    expect(existing.nodes[1].params.variable).toBe('v1');
  });

  it('makes whatever a Show recipe reveals start hidden, unless it is this layer or already hidden', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    expect(buildBehaviour(ctx, 'show', 'click', { layer: f.hint.id }, mk).patches).toEqual([{ id: f.hint.id, props: { visible: false } }]);
    expect(buildBehaviour(ctx, 'show', 'click', { layer: THIS_LAYER }, mk).patches).toEqual([]);
    f.hint.visible = false;
    expect(buildBehaviour(ctx, 'show', 'click', { layer: f.hint.id }, mk).patches).toEqual([]);
    // hiding and toggling leave the layer as it is
    f.hint.visible = true;
    expect(buildBehaviour(ctx, 'hide', 'click', { layer: f.hint.id }, mk).patches).toEqual([]);
    expect(buildBehaviour(ctx, 'toggle', 'click', { layer: f.hint.id }, mk).patches).toEqual([]);
    // showing prefers a layer that is hidden already, else another layer; toggling another layer; hiding this one
    expect(defaultAnswers(RECIPE_BY_ID.show, ctx).layer).toBe(f.hint.id);
    f.hint.visible = false;
    expect(defaultAnswers(RECIPE_BY_ID.show, ctx).layer).toBe(f.hint.id);
    expect(defaultAnswers(RECIPE_BY_ID.toggle, ctx).layer).toBe(f.hint.id);
    expect(defaultAnswers(RECIPE_BY_ID.hide, ctx).layer).toBe(THIS_LAYER);
  });

  it('puts the new nodes below what is already in the graph', () => {
    const f = fixture();
    f.home.logic.nodes.push({ id: 'old', kind: 'event.start', x: 0, y: 400, params: {} });
    const b = buildBehaviour(ctxOf(f), 'page-next', 'click', {}, mk);
    expect(b.nodes[0].y).toBe(540);
    expect(b.nodes[1].y).toBe(540);
  });

  it('says why a recipe cannot go in yet, or what is still to choose', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    expect(unavailable(RECIPE_BY_ID['page-pick'], ctx)).toBeNull();
    expect(unavailable(RECIPE_BY_ID.animation, ctx)).toBeNull();
    f.home.timelines = [];
    expect(unavailable(RECIPE_BY_ID.animation, ctx)).toMatch(/no timelines/);
    f.p.artboards = [f.home];
    expect(unavailable(RECIPE_BY_ID['page-pick'], ctx)).toMatch(/no other page/);
    expect(incomplete(RECIPE_BY_ID.link, { link: '' })).toBe('Choose web address.');
    expect(incomplete(RECIPE_BY_ID.link, { link: 'example.com' })).toMatch(/starts with https/);
    expect(incomplete(RECIPE_BY_ID.link, { link: 'https://example.com' })).toBeNull();
    expect(incomplete(RECIPE_BY_ID.counter, { counter: 'new:' })).toBe('Name the counter.');
    expect(incomplete(RECIPE_BY_ID['page-next'], {})).toBeNull();
    expect(layerChoices(f.home).map((l) => l.name)).toEqual(['Button', 'Hint']);
  });

  it('throws for a recipe that does not exist', () => {
    const f = fixture();
    expect(() => buildBehaviour(ctxOf(f), 'nope', 'click', {}, mk)).toThrow();
  });
});

describe('applyBehaviour', () => {
  it('writes the nodes, edge, variable and hidden layer as ONE undo step, and undo takes them all back', () => {
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    const b = buildBehaviour(ctx, 'show', 'click', { layer: f.hint.id }, mk);
    const c = buildBehaviour(ctx, 'counter', 'click', { counter: 'new:hits' }, mk);
    applyBehaviour((r) => store.update(r), f.home.id, b);
    let ab = store.get().project.artboards[0];
    expect(ab.logic.nodes).toHaveLength(2);
    expect(ab.logic.edges).toHaveLength(1);
    expect(ab.children.find((n) => n.id === f.hint.id)!.visible).toBe(false);
    applyBehaviour((r) => store.update(r), f.home.id, c);
    expect(store.get().project.variables.map((v) => v.name)).toEqual(['hits']);
    expect(store.get().project.artboards[0].logic.nodes).toHaveLength(4);
    store.undo();
    ab = store.get().project.artboards[0];
    expect(store.get().project.variables).toEqual([]);
    expect(ab.logic.nodes).toHaveLength(2);
    store.undo();
    ab = store.get().project.artboards[0];
    expect(ab.logic.nodes).toHaveLength(0);
    expect(ab.logic.edges).toHaveLength(0);
    expect(ab.children.find((n) => n.id === f.hint.id)!.visible).not.toBe(false);
  });

  it('the sentence the recipe shows is what the Inspector says about the layer afterwards', () => {
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = ctxOf(f);
    const b = buildBehaviour(ctx, 'page-pick', 'click', { page: f.quiz.id }, mk);
    applyBehaviour((r) => store.update(r), f.home.id, b);
    const st = store.get().project;
    const ev = st.artboards[0].logic.nodes.find((n) => n.id === b.eventId)!;
    expect(flowSentence(buildFlow(ev, { ab: st.artboards[0], project: st, self: f.btn.id }))).toBe(b.sentence);
  });
});

describe('Preview does what each recipe says', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const stage = () => document.getElementById('stage')!;
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
  //Drawn state: a hidden layer is display: none in the player once it has had a frame to draw it
  let current: Player | null = null;
  const hiddenNow = (id: string) => {
    current!.step(20);
    for (let e: HTMLElement | null = el(id); e && e !== stage(); e = e.parentElement) if (e.style.display === 'none') return true;
    return false;
  };

  /** A project with the recipe written into it by the real code path, played in jsdom. */
  function play(recipe: string, trigger: Trigger, pick: (f: ReturnType<typeof fixture>) => Answers) {
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    const answers = pick(f);
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, recipe, trigger, answers, mk));
    const project = JSON.parse(JSON.stringify(store.get().project)) as Project;
    const player = new Player(stage(), project, { loadData: false });
    current = player;
    return { f, player, project };
  }
  const fire = async (id: string, type: string) => {
    el(id).dispatchEvent(new MouseEvent(type, { bubbles: true }));
    await flush();
  };

  it('Go to the next page / previous page / a page', async () => {
    let r = play('page-next', 'click', () => ({}));
    expect(r.player.artboard.name).toBe('Home');
    await fire(r.f.btn.id, 'click');
    await flush(400);
    expect(r.player.artboard.name).toBe('Quiz');
    r.player.destroy?.();
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    r = play('page-pick', 'click', (f) => ({ page: f.last.id }));
    await fire(r.f.btn.id, 'click');
    await flush(400);
    expect(r.player.artboard.name).toBe('Last');
  });

  it('Show a layer: it starts hidden, and clicking shows it', async () => {
    const { f, player } = play('show', 'click', (x) => ({ layer: x.hint.id }));
    expect(hiddenNow(f.hint.id)).toBe(true);
    await fire(f.btn.id, 'click');
    expect(hiddenNow(f.hint.id)).toBe(false);
    player.destroy?.();
  });

  it('Hide a layer, and Show or hide a layer', async () => {
    let r = play('hide', 'click', (x) => ({ layer: x.hint.id }));
    expect(hiddenNow(r.f.hint.id)).toBe(false);
    await fire(r.f.btn.id, 'click');
    expect(hiddenNow(r.f.hint.id)).toBe(true);
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    r = play('toggle', 'click', (x) => ({ layer: x.hint.id }));
    await fire(r.f.btn.id, 'click');
    expect(hiddenNow(r.f.hint.id)).toBe(true);
    await fire(r.f.btn.id, 'click');
    expect(hiddenNow(r.f.hint.id)).toBe(false);
  });

  it('Add 1 to a counter, and Switch something on or off', async () => {
    let r = play('counter', 'click', () => ({ counter: 'new:taps' }));
    expect(r.player.getVariable('taps')).toBe(0);
    await fire(r.f.btn.id, 'click');
    await fire(r.f.btn.id, 'click');
    expect(r.player.getVariable('taps')).toBe(2);
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    r = play('switch', 'click', () => ({ switch: 'new:soundOn' }));
    expect(r.player.getVariable('soundOn')).toBe(false);
    await fire(r.f.btn.id, 'click');
    expect(r.player.getVariable('soundOn')).toBe(true);
    await fire(r.f.btn.id, 'click');
    expect(r.player.getVariable('soundOn')).toBe(false);
  });

  it('When hovered over runs on the pointer entering, not on a click', async () => {
    const { f, player } = play('counter', 'pointerenter', () => ({ counter: 'new:hovers' }));
    await fire(f.btn.id, 'click');
    expect(player.getVariable('hovers')).toBe(0);
    await fire(f.btn.id, 'pointerover');
    expect(player.getVariable('hovers')).toBe(1);
  });

  it('Open a link opens it in a new tab', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { f } = play('link', 'click', () => ({ link: 'https://example.com/page' }));
    await fire(f.btn.id, 'click');
    expect(open).toHaveBeenCalledWith('https://example.com/page', '_blank', 'noopener');
  });

  it('Start over puts the counter and the page back', async () => {
    const f = fixture();
    f.p.variables.push({ id: 'vc', name: 'taps', type: 'number', initial: 0 });
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'start-over', 'click', {}, mk));
    const project = JSON.parse(JSON.stringify(store.get().project)) as Project;
    const player = new Player(stage(), project, { loadData: false });
    player.setVariable?.('vc', 5);
    expect(player.getVariable('taps')).toBe(5);
    await fire(f.btn.id, 'click');
    expect(player.getVariable('taps')).toBe(0);
  });

  it('Play an animation starts the timeline, and Play a sound plays the file', async () => {
    const a = play('animation', 'click', () => ({ timeline: 'tl1' }));
    await fire(a.f.btn.id, 'click');
    expect(a.player.debugState().timelines.some((t) => t.name === 'Intro')).toBe(true);
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const s = play('sound', 'click', () => ({ sound: 'snd' }));
    const played = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    await fire(s.f.btn.id, 'click');
    expect(played).toHaveBeenCalled();
  });
});
