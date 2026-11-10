//The newer recipes (change a number, set a text, a layer's look, only one of a set, put values back, announce, go round a list),
//more steps in one, the other triggers, and Only if / Otherwise: what they write, and that Preview does it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_BY_KIND, Player, createArtboard, createNode, createProject, type Artboard, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { RECIPES, RECIPE_BY_ID, TRIGGERS, THIS_LAYER, applyBehaviour, buildBehaviour, defaultAnswers, defaultTriggerAnswers, incomplete, seedCondition, triggerIncomplete, triggerUnavailable, unavailable, type Answers, type Extras, type Trigger } from '../src/lib/recipes';
import { buildFlow, flowsForLayer } from '../src/lib/flow-describe';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function fixture() {
  const p = createProject('T');
  const home = p.artboards[0];
  const btn = createNode('rect', { name: 'Button', x: 10, y: 10, width: 100, height: 40 });
  const panel1 = createNode('rect', { name: 'Panel one', x: 10, y: 100, width: 100, height: 40 });
  const panel2 = createNode('rect', { name: 'Panel two', x: 10, y: 150, width: 100, height: 40 });
  const words = createNode('text', { name: 'Words', x: 10, y: 200, width: 100, height: 40 });
  home.children.push(btn, panel1, panel2, words);
  p.artboards.push(createArtboard({ name: 'Quiz' }));
  p.variables.push(
    { id: 'vs', name: 'score', type: 'number', initial: 10 },
    { id: 'vt', name: 'mood', type: 'string', initial: 'calm' },
    { id: 'vc', name: 'level', type: 'enum', initial: 'easy', options: ['easy', 'medium', 'hard'] },
    { id: 'vf', name: 'done', type: 'boolean', initial: false },
    { id: 'vl', name: 'slides', type: 'list', initial: '["a","b","c"]' },
    { id: 'vn', name: 'slide', type: 'number', initial: 1 },
  );
  return { p, home, btn, panel1, panel2, words };
}
type Fx = ReturnType<typeof fixture>;

let ids = 0;
const mk = (prefix: string) => `${prefix}${++ids}`;
const ctxOf = (f: Fx) => ({ project: f.p, ab: f.home, layerId: f.btn.id });

describe('Change a number', () => {
  it('adds, takes away, or sets, and reads that way in the sentence', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    const run = (a: Answers) => buildBehaviour(ctx, 'counter', 'click', { counter: 'vs', ...a }, mk);
    expect(run({ numhow: 'add', amount: '5' }).nodes[1].params).toMatchObject({ variable: 'vs', op: 'add', value: '5' });
    expect(run({ numhow: 'add', amount: '5' }).sentence).toBe('When clicked: add 5 to score');
    expect(run({ numhow: 'subtract', amount: '3' }).nodes[1].params).toMatchObject({ op: 'add', value: '-3' });
    expect(run({ numhow: 'subtract', amount: '3' }).sentence).toBe('When clicked: take 3 off score');
    expect(run({ numhow: 'subtract', amount: 'level * 2' }).nodes[1].params.value).toBe('-(level * 2)');
    expect(run({ numhow: 'set', amount: '100' }).nodes[1].params).toMatchObject({ op: 'set', value: '100' });
    expect(run({ numhow: 'set', amount: '100' }).sentence).toBe('When clicked: set score to 100');
    //what the old recipe wrote is still what the new one writes when nothing is changed
    expect(buildBehaviour(ctx, 'counter', 'click', defaultAnswers(RECIPE_BY_ID.counter, ctx), mk).nodes[1].params).toMatchObject({ op: 'add', value: '1' });
    expect(incomplete(RECIPE_BY_ID.counter, { counter: 'vs', amount: ' ' })).toBe('Say how much.');
  });

  it('changes the number when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const r = play(fixture(), 'counter', { counter: 'vs', numhow: 'subtract', amount: '4' });
    await r.click(r.f.btn.id);
    await r.click(r.f.btn.id);
    expect(r.player.getVariable('score')).toBe(2);
    r.player.destroy();
  });
});

describe('Set a text or choice', () => {
  it('writes the text as a quoted value, makes a new text variable, and keeps a choice to its options', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    const t = buildBehaviour(ctx, 'text-set', 'click', { textvar: 'vt', textvalue: 'happy now' }, mk);
    expect(t.nodes[1].params).toMatchObject({ variable: 'vt', op: 'set', value: '"happy now"' });
    expect(t.sentence).toBe('When clicked: set mood to “happy now”');
    expect(buildBehaviour(ctx, 'text-set', 'click', { textvar: 'vc', textvalue: 'hard' }, mk).nodes[1].params.value).toBe('"hard"');
    //a value that is not one of the choices is the first choice
    expect(buildBehaviour(ctx, 'text-set', 'click', { textvar: 'vc', textvalue: 'nonsense' }, mk).nodes[1].params.value).toBe('"easy"');
    const fresh = buildBehaviour(ctx, 'text-set', 'click', { textvar: 'new:Chosen topic', textvalue: 'Maths' }, mk);
    expect(fresh.variables).toEqual([{ id: expect.any(String), name: 'chosenTopic', label: 'Chosen topic', type: 'string', initial: '' }]);
    expect(fresh.nodes[1].params).toMatchObject({ variable: fresh.variables[0].id, value: '"Maths"' });
    //the first text variable is the one it starts on, and a choice starts on its first option
    expect(defaultAnswers(RECIPE_BY_ID['text-set'], ctx).textvar).toBe('vt');
    f.p.variables = f.p.variables.filter((v) => v.id !== 'vt');
    expect(defaultAnswers(RECIPE_BY_ID['text-set'], ctx)).toMatchObject({ textvar: 'vc', textvalue: 'easy' });
  });

  it('sets the text when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const r = play(fixture(), 'text-set', { textvar: 'vt', textvalue: 'excited' });
    await r.click(r.f.btn.id);
    expect(r.player.getVariable('mood')).toBe('excited');
    r.player.destroy();
  });
});

describe('Change a layer’s look', () => {
  const props = (f: Fx, a: Answers) => buildBehaviour(ctxOf(f), 'look', 'click', { layer: THIS_LAYER, ...a }, mk).nodes.slice(1).map((n) => [n.kind, n.params.target, n.params.prop, n.params.value]);

  it('writes the colour, text, opacity or size as an ordinary Change a layer’s setting', () => {
    const f = fixture();
    expect(props(f, { what: 'colour', colour: '#ff0000' })).toEqual([['action.setProperty', f.btn.id, 'fill.color', '"#ff0000"']]);
    //a text layer's colour is its text colour
    expect(buildBehaviour(ctxOf(f), 'look', 'click', { layer: f.words.id, what: 'colour', colour: '#00ff00' }, mk).nodes[1].params).toMatchObject({ prop: 'color', value: '"#00ff00"' });
    expect(buildBehaviour(ctxOf(f), 'look', 'click', { layer: f.words.id, what: 'text', words: 'Well done' }, mk).nodes[1].params).toMatchObject({ target: f.words.id, prop: 'text', value: '"Well done"' });
    expect(props(f, { what: 'opacity', percent: '50' })).toEqual([['action.setProperty', f.btn.id, 'opacity', '0.5']]);
    expect(props(f, { what: 'opacity', percent: '35' })[0][3]).toBe('0.35');
    expect(props(f, { what: 'size', width: '300', height: '' })).toEqual([['action.setProperty', f.btn.id, 'width', '300']]);
    expect(props(f, { what: 'size', width: '300', height: '80' })).toEqual([
      ['action.setProperty', f.btn.id, 'width', '300'],
      ['action.setProperty', f.btn.id, 'height', '80'],
    ]);
  });

  it('says what is missing and starts the colour where the layer is', () => {
    const f = fixture();
    const look = RECIPE_BY_ID.look;
    expect(incomplete(look, { layer: THIS_LAYER, what: 'size', width: '', height: '' })).toBe('Give a width or a height.');
    expect(incomplete(look, { layer: THIS_LAYER, what: 'size', width: 'wide' })).toMatch(/numbers/);
    expect(incomplete(look, { layer: THIS_LAYER, what: 'opacity', percent: '120' })).toBe('Opacity is a number from 0 to 100.');
    expect(incomplete(look, { layer: THIS_LAYER, what: 'text', words: '' })).toBeNull();
    expect(incomplete(look, { layer: THIS_LAYER, what: 'colour', colour: '#fff' })).toBeNull();
    expect(defaultAnswers(look, ctxOf(f)).what).toBe('colour');
    expect(defaultAnswers(look, ctxOf(f)).colour).toMatch(/^#|rgb/);
  });

  it('changes the layer when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const r = play(fixture(), 'look', { layer: THIS_LAYER, what: 'opacity', percent: '25' });
    await r.click(r.f.btn.id);
    expect(r.player.node(r.f.btn.id)!.get('opacity')).toBe(0.25);
    r.player.destroy();
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const s = play(fixture(), 'look', { layer: THIS_LAYER, what: 'size', width: '300', height: '90' });
    await s.click(s.f.btn.id);
    expect(s.player.node(s.f.btn.id)!.get('width')).toBe(300);
    expect(s.player.node(s.f.btn.id)!.get('height')).toBe(90);
    s.player.destroy();
  });
});

describe('Switch something on or off', () => {
  it('flips unless told to turn it on or off, and reads as switching it', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    expect(buildBehaviour(ctx, 'switch', 'click', { switch: 'vf' }, mk).nodes[1].params).toMatchObject({ op: 'toggle' });
    const on = buildBehaviour(ctx, 'switch', 'click', { switch: 'vf', how: 'on' }, mk);
    expect(on.nodes[1].params).toMatchObject({ op: 'set', value: 'true' });
    expect(on.sentence).toBe('When clicked: switch done on');
    const off = buildBehaviour(ctx, 'switch', 'click', { switch: 'vf', how: 'off' }, mk);
    expect(off.nodes[1].params).toMatchObject({ op: 'set', value: 'false' });
    expect(off.sentence).toBe('When clicked: switch done off');
    expect(defaultAnswers(RECIPE_BY_ID.switch, ctx).how).toBe('flip');
  });

  it('turns it on when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const r = play(fixture(), 'switch', { switch: 'vf', how: 'on' });
    await r.click(r.f.btn.id);
    await r.click(r.f.btn.id);
    expect(r.player.getVariable('done')).toBe(true);
    r.player.destroy();
  });
});

describe('Show only one of a set', () => {
  it('hides the others in the set, then shows the one, all ordinary Show or hide nodes', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'only-one', 'click', { layer: f.panel1.id, set: `${f.panel1.id}|${f.panel2.id}` }, mk);
    expect(b.nodes.map((n) => [n.kind, n.params.target, n.params.op])).toEqual([
      ['event.pointer', f.btn.id, undefined],
      ['action.visibility', f.panel2.id, 'hide'],
      ['action.visibility', f.panel1.id, 'show'],
    ]);
    expect(b.edges).toHaveLength(2);
    expect(b.sentence).toBe('When clicked: hide Panel two, then show Panel one');
    expect(incomplete(RECIPE_BY_ID['only-one'], { layer: f.panel1.id, set: '' })).toBe('Tick the layers to hide.');
  });

  it('shows one panel and hides the other when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const f = fixture();
    f.panel1.visible = false;
    const r = play(f, 'only-one', { layer: f.panel1.id, set: `${f.panel1.id}|${f.panel2.id}` });
    await r.click(f.btn.id);
    expect(r.player.node(f.panel1.id)!.get('visible')).toBe(true);
    expect(r.player.node(f.panel2.id)!.get('visible')).toBe(false);
    r.player.destroy();
  });
});

describe('Put values back to the start, and Say something', () => {
  it('writes the ticked values, all of them to begin with', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    expect(defaultAnswers(RECIPE_BY_ID.reset, ctx).vars.split('|')).toEqual(['vs', 'vt', 'vc', 'vf', 'vl', 'vn']);
    const b = buildBehaviour(ctx, 'reset', 'click', { vars: 'vs|vt' }, mk);
    expect(b.nodes[1]).toMatchObject({ kind: 'action.resetVariables', params: { variables: ['vs', 'vt'] } });
    expect(b.sentence).toBe('When clicked: put score, mood back to the starting values');
    expect(incomplete(RECIPE_BY_ID.reset, { vars: '' })).toBe('Tick the values to put back.');
    f.p.variables = [];
    expect(unavailable(RECIPE_BY_ID.reset, ctx)).toMatch(/no values/);
  });

  it('puts the ticked values back when played, leaving the rest', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const r = play(fixture(), 'reset', { vars: 'vs' });
    r.player.setVariable('score', 99);
    r.player.setVariable('mood', 'angry');
    await r.click(r.f.btn.id);
    expect(r.player.getVariable('score')).toBe(10);
    expect(r.player.getVariable('mood')).toBe('angry');
    r.player.destroy();
  });

  it('announces what was typed', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'Saved, 3 of 5' }, mk);
    expect(b.nodes[1]).toMatchObject({ kind: 'action.announce', params: { text: '"Saved, 3 of 5"', politeness: 'polite' } });
    expect(b.sentence).toBe('When clicked: tell screen readers “Saved, 3 of 5”');
    expect(incomplete(RECIPE_BY_ID.announce, { words: '' })).toBe('Write what to say.');
  });
});

describe('Next item and Previous item', () => {
  it('writes a Change a value in next or previous mode with the range the answers give', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    const next = (a: Answers) => buildBehaviour(ctx, 'item-next', 'click', { counter: 'vn', startat: '1', ends: 'round', ...a }, mk);
    expect(next({ last: 'list:vl' }).nodes[1].params).toMatchObject({ variable: 'vn', op: 'next', first: '1', last: 'slides.length', ends: 'round' });
    expect(next({ last: 'list:vl', startat: '0' }).nodes[1].params).toMatchObject({ first: '0', last: 'slides.length - 1' });
    expect(next({ last: '5' }).nodes[1].params).toMatchObject({ first: '1', last: '5' });
    expect(next({ last: '5', startat: '0' }).nodes[1].params.last).toBe('4');
    expect(next({ last: 'count', startat: '0' }).nodes[1].params.last).toBe('(count) - 1');
    expect(next({ last: '5', ends: 'stop' }).nodes[1].params.ends).toBe('stop');
    const prev = buildBehaviour(ctx, 'item-previous', 'click', { counter: 'vn', startat: '1', last: 'list:vl', ends: 'round' }, mk);
    expect(prev.nodes[1].params.op).toBe('previous');
    expect(prev.sentence).toBe('When clicked: go to the previous slide (1 to slides.length, going round at the ends)');
    expect(next({ last: '5', ends: 'stop' }).sentence).toBe('When clicked: go to the next slide (1 to 5, stopping at the ends)');
  });

  it('starts a new number on the first item, and a list is the usual length', () => {
    const f = fixture();
    f.p.variables = f.p.variables.filter((v) => v.type !== 'number');
    const ctx = ctxOf(f);
    const d = defaultAnswers(RECIPE_BY_ID['item-next'], ctx);
    expect(d).toMatchObject({ counter: 'new:slide', startat: '1', last: 'list:vl', ends: 'round' });
    const b = buildBehaviour(ctx, 'item-next', 'click', d, mk);
    expect(b.variables).toEqual([{ id: expect.any(String), name: 'slide', type: 'number', initial: 1 }]);
    expect(buildBehaviour(ctx, 'item-next', 'click', { ...d, startat: '0' }, mk).variables[0].initial).toBe(0);
    f.p.variables = [];
    expect(defaultAnswers(RECIPE_BY_ID['item-next'], ctx).last).toBe('3');
    expect(incomplete(RECIPE_BY_ID['item-next'], { ...d, last: '' })).toBe('Say how many items.');
  });

  it('goes round a list with Next and Previous buttons when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const f = fixture();
    const prevBtn = createNode('rect', { name: 'Back', x: 200, y: 10, width: 100, height: 40 });
    f.home.children.push(prevBtn);
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'item-next', 'click', { counter: 'vn', startat: '1', last: 'list:vl', ends: 'round' }, mk));
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour({ ...ctx, project: store.get().project, ab: store.get().project.artboards[0], layerId: prevBtn.id }, 'item-previous', 'click', { counter: 'vn', startat: '1', last: 'list:vl', ends: 'round' }, mk));
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(store.get().project)) as Project, { loadData: false });
    const click = async (id: string) => {
      document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    const seen: unknown[] = [];
    for (const id of [f.btn.id, f.btn.id, f.btn.id, prevBtn.id]) {
      await click(id);
      seen.push(player.getVariable('slide'));
    }
    expect(seen).toEqual([2, 3, 1, 3]);
    player.destroy();
  });
});

describe('More than one step', () => {
  it('joins the extra steps after the first, in order, with one wire between each', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'counter', 'click', { counter: 'vs', numhow: 'add', amount: '1' }, mk, {
      then: [
        { recipe: 'show', answers: { layer: f.panel1.id } },
        { recipe: 'announce', answers: { words: 'Scored' } },
      ],
    });
    expect(b.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.setVariable', 'action.visibility', 'action.announce']);
    expect(b.edges.map((e) => [e.from, e.to])).toEqual([
      [b.nodes[0].id, b.nodes[1].id],
      [b.nodes[1].id, b.nodes[2].id],
      [b.nodes[2].id, b.nodes[3].id],
    ]);
    expect(b.sentence).toBe('When clicked: add 1 to score, then show Panel one, then tell screen readers “Scored”');
    //the thing it shows starts hidden, as with a recipe on its own
    expect(b.patches).toEqual([{ id: f.panel1.id, props: { visible: false } }]);
    expect(b.actionId).toBe(b.nodes[1].id);
  });

  it('makes each new variable once, even when two steps ask for the same name', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'counter', 'click', { counter: 'new:taps', amount: '1' }, mk, { then: [{ recipe: 'counter', answers: { counter: 'new:taps', amount: '2' } }] });
    expect(b.variables.map((v) => v.name)).toEqual(['taps', 'taps2']);
  });

  it('is one undo step, and runs every step when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'counter', 'click', { counter: 'vs', numhow: 'set', amount: '50' }, mk, { then: [{ recipe: 'text-set', answers: { textvar: 'vt', textvalue: 'done' } }] }));
    expect(store.get().project.artboards[0].logic.nodes).toHaveLength(3);
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(store.get().project)) as Project, { loadData: false });
    document.querySelector<HTMLElement>(`[data-ix-id="${f.btn.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect([player.getVariable('score'), player.getVariable('mood')]).toEqual([50, 'done']);
    player.destroy();
    store.undo();
    expect(store.get().project.artboards[0].logic.nodes).toHaveLength(0);
  });
});

describe('Other triggers', () => {
  const build = (trigger: Trigger, when: Answers, f = fixture(), recipe = 'announce') => ({ f, b: buildBehaviour(ctxOf(f), recipe, trigger, { words: 'Hi' }, mk, { when }) });

  it('is clicked unless said otherwise, and the list covers the ones the graph already has', () => {
    expect(TRIGGERS.map((t) => t.id)).toEqual(['click', 'pointerenter', 'start', 'timer', 'value', 'all', 'drop', 'key', 'video']);
    //(All of these are done needs layers ticked, and has its own tests in all-done.test.ts)
    for (const t of TRIGGERS.filter((x) => x.id !== 'all')) expect(CATALOG_BY_KIND[buildBehaviour(ctxOf(fixture()), 'start-over', t.id, {}, mk, { when: defaultTriggerAnswers(t.id, ctxOf(videoFixture())) }).nodes[0].kind]).toBeTruthy();
    const f = fixture();
    expect(buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'x' }, mk).nodes[0]).toMatchObject({ kind: 'event.pointer', params: { target: f.btn.id, type: 'click' } });
  });

  function videoFixture() {
    const f = fixture();
    f.home.children.push(createNode('video', { name: 'Film', x: 0, y: 300, width: 320, height: 180 } as never));
    return f;
  }

  it('when the page is shown', () => {
    const { b } = build('start', {});
    expect(b.nodes[0].kind).toBe('event.start');
    expect(b.sentence).toBe('When this page is shown: tell screen readers “Hi”');
  });

  it('after some seconds, once', () => {
    const { b } = build('timer', { delay: '2.5' });
    expect(b.nodes[0]).toMatchObject({ kind: 'event.timer', params: { ms: '2500', repeat: false } });
    expect(b.sentence).toBe('After 2.5 s: tell screen readers “Hi”');
    expect(triggerIncomplete('timer', { delay: '0' })).toBe('Say how many seconds, as a number.');
    expect(triggerIncomplete('timer', { delay: '5' })).toBeNull();
  });

  it('when a value reaches something: a value change with an Only if', () => {
    const f = fixture();
    const { b } = build('value', { watch: 'vs', reachop: 'atleast', reachto: '20' }, f);
    expect(b.nodes[0]).toMatchObject({ kind: 'event.variable', params: { variable: 'vs', onlyIf: 'score >= 20' } });
    expect(b.sentence).toBe('When score changes, only if score is at least 20: tell screen readers “Hi”');
    expect(build('value', { watch: 'vf', reachop: 'true' }, f).b.nodes[0].params.onlyIf).toBe('done');
    expect(build('value', { watch: 'vt', reachop: 'is', reachto: 'calm' }, f).b.nodes[0].params.onlyIf).toBe('mood == "calm"');
    expect(triggerIncomplete('value', { watch: 'vs', reachop: 'atleast', reachto: '' }, f.p)).toBe('Say the number it reaches.');
    expect(defaultTriggerAnswers('value', ctxOf(f))).toMatchObject({ watch: 'vs', reachop: 'atleast' });
    f.p.variables = [];
    expect(triggerUnavailable('value', ctxOf(f))).toMatch(/no values/);
  });

  it('when this is dropped on something', () => {
    const f = fixture();
    const { b } = build('drop', { zone: f.panel1.id }, f);
    expect(b.nodes[0]).toMatchObject({ kind: 'event.drop', params: { target: f.panel1.id, layer: f.btn.id, result: 'accepted' } });
    expect(b.sentence).toBe('When this layer is dropped on Panel one: tell screen readers “Hi”');
    expect(build('drop', { zone: '' }, f).b.nodes[0].params).toMatchObject({ target: '', layer: f.btn.id });
    //any drop zone is a fine answer
    expect(triggerIncomplete('drop', { zone: '' })).toBeNull();
    //the dragged layer's own Inspector lists it
    const st = { ...f.home, logic: { nodes: b.nodes, edges: b.edges } } as Artboard;
    expect(flowsForLayer({ ab: st, project: f.p }, f.btn.id).map((x) => x.when)).toEqual(['When this layer is dropped on Panel one']);
  });

  it('when a key is pressed', () => {
    const { b } = build('key', { key: 'ArrowRight' });
    expect(b.nodes[0]).toMatchObject({ kind: 'event.key', params: { key: 'ArrowRight', type: 'keydown' } });
    expect(b.sentence).toBe('When ArrowRight is pressed: tell screen readers “Hi”');
    expect(triggerIncomplete('key', { key: '' })).toBe('Choose which key.');
  });

  it('at a video time: adds a cue to the video, or uses the one that is there', () => {
    const f = videoFixture();
    const film = f.home.children.find((n) => n.type === 'video')!;
    const { b } = build('video', { video: film.id, cuetime: '75' }, f);
    expect(b.nodes[0]).toMatchObject({ kind: 'event.videoCue', params: { target: film.id, name: 'At 1:15' } });
    expect(b.patches).toEqual([{ id: film.id, props: { cues: [{ id: expect.any(String), time: 75, name: 'At 1:15' }] } }]);
    expect(b.sentence).toBe('When Film reaches “At 1:15”: tell screen readers “Hi”');
    (film as unknown as { cues: unknown[] }).cues = [{ id: 'c1', time: 75, name: 'Intro ends' }];
    const again = build('video', { video: film.id, cuetime: '75' }, f).b;
    expect(again.nodes[0].params.name).toBe('Intro ends');
    expect(again.patches).toEqual([]);
    expect(triggerUnavailable('video', ctxOf(fixture()))).toMatch(/no video layer/);
    expect(triggerUnavailable('video', ctxOf(f))).toBeNull();
    expect(triggerIncomplete('video', { video: film.id, cuetime: '' })).toBe('Say how many seconds in, as a number.');
  });

  it('a video cue is written onto the video layer when applied, and undone with it', () => {
    const f = videoFixture();
    const film = f.home.children.find((n) => n.type === 'video')!;
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'announce', 'video', { words: 'Hi' }, mk, { when: { video: film.id, cuetime: '10' } }));
    const written = store.get().project.artboards[0].children.find((n) => n.id === film.id) as unknown as { cues: { time: number }[] };
    expect(written.cues.map((c) => c.time)).toEqual([10]);
    store.undo();
    expect((store.get().project.artboards[0].children.find((n) => n.id === film.id) as unknown as { cues?: unknown[] }).cues).toBeUndefined();
  });

  it('When the page is shown and When a value reaches run when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'text-set', 'start', { textvar: 'vt', textvalue: 'opened' }, mk));
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour({ ...ctx, project: store.get().project, ab: store.get().project.artboards[0] }, 'text-set', 'value', { textvar: 'vt', textvalue: 'high' }, mk, { when: { watch: 'vs', reachop: 'atleast', reachto: '20' } }));
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(store.get().project)) as Project, { loadData: false });
    await flush();
    expect(player.getVariable('mood')).toBe('opened');
    player.setVariable('score', 12);
    expect(player.getVariable('mood')).toBe('opened');
    player.setVariable('score', 25);
    expect(player.getVariable('mood')).toBe('high');
    player.destroy();
  });
});

describe('Only if and Otherwise', () => {
  const extras = (): Extras => ({ only: 'score >= 20', otherwise: { recipe: 'text-set', answers: { textvar: 'vt', textvalue: 'not yet' } }, then: [] });

  it('an Only if with nothing else is the event’s own Only if, one ordinary event and its steps', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'Hi' }, mk, { only: 'score >= 20' });
    expect(b.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'action.announce']);
    expect(b.nodes[0].params.onlyIf).toBe('score >= 20');
    expect(b.sentence).toBe('When clicked, only if score is at least 20: tell screen readers “Hi”');
    //nothing is written for an empty one
    expect(buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'Hi' }, mk, { only: '  ' }).nodes[0].params.onlyIf).toBe('');
  });

  it('an Otherwise makes a Check a condition with a true way and a false way', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'Yes' }, mk, extras());
    expect(b.nodes.map((n) => n.kind)).toEqual(['event.pointer', 'logic.if', 'action.announce', 'action.setVariable']);
    expect(b.nodes[1].params.condition).toBe('score >= 20');
    expect(b.nodes[0].params.onlyIf).toBe('');
    expect(b.edges.map((e) => [e.from, e.fromPort, e.to])).toEqual([
      [b.nodes[0].id, 'out', b.nodes[1].id],
      [b.nodes[1].id, 'true', b.nodes[2].id],
      [b.nodes[1].id, 'false', b.nodes[3].id],
    ]);
    expect(b.sentence).toBe('When clicked: check whether score is at least 20 (if so: tell screen readers “Yes”; if not: set mood to “not yet”)');
    for (const n of b.nodes) expect(CATALOG_BY_KIND[n.kind]).toBeTruthy();
    //the false row sits under the true row
    expect(b.nodes[3].y).toBeGreaterThan(b.nodes[2].y);
    //an Otherwise with no Only if is left out
    expect(buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'Yes' }, mk, { otherwise: extras().otherwise }).nodes).toHaveLength(2);
  });

  it('a value trigger and an Only if are both kept', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'announce', 'value', { words: 'Hi' }, mk, { when: { watch: 'vs', reachop: 'atleast', reachto: '5' }, only: 'done == false' });
    expect(b.nodes[0].params.onlyIf).toBe('(score >= 5) && (done == false)');
  });

  it('chooses the right way when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'text-set', 'click', { textvar: 'vt', textvalue: 'passed' }, mk, { only: 'score >= 20', otherwise: { recipe: 'text-set', answers: { textvar: 'vt', textvalue: 'failed' } } }));
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(store.get().project)) as Project, { loadData: false });
    const click = async () => {
      document.querySelector<HTMLElement>(`[data-ix-id="${f.btn.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    await click();
    expect(player.getVariable('mood')).toBe('failed');
    player.setVariable('score', 30);
    await click();
    expect(player.getVariable('mood')).toBe('passed');
    player.destroy();
  });

  it('starts an Only if as a real sentence about the first value', () => {
    const f = fixture();
    expect(seedCondition(f.p)).toBe('score >= 1');
    f.p.variables = [];
    expect(seedCondition(f.p)).toBe('');
  });

  it('shows in the layer’s own sentence list', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'announce', 'click', { words: 'Hi' }, mk, { only: 'done' });
    const ab = { ...f.home, logic: { nodes: b.nodes, edges: b.edges } } as Artboard;
    expect(buildFlow(b.nodes[0], { ab, project: f.p, self: f.btn.id }).when).toBe('When clicked, only if done is on');
  });
});

describe('every recipe still works from the list', () => {
  it('is available or says why, and writes only catalog nodes', () => {
    const f = fixture();
    const ctx = ctxOf(f);
    for (const r of RECIPES) {
      const why = unavailable(r, ctx);
      if (why) continue;
      const d = { ...defaultAnswers(r, ctx), link: 'https://example.com', page: f.p.artboards[1].id, set: f.panel2.id, words: 'Hello' };
      const b = buildBehaviour(ctx, r.id, 'click', d, mk);
      for (const n of b.nodes) expect(CATALOG_BY_KIND[n.kind], `${r.id}: ${n.kind}`).toBeTruthy();
      //(Count what has been done has no trigger of its own, and its own tests in all-done.test.ts)
      if (r.id !== 'count-done') expect(b.sentence, r.id).toMatch(/^When clicked: /);
    }
  });
});

// ---------------------------------------------------------------- helpers

function play(f: Fx, recipe: string, answers: Answers, trigger: Trigger = 'click') {
  const store = new EditorStore(f.p);
  const ctx = { project: store.get().project, ab: store.get().project.artboards[0], layerId: f.btn.id };
  applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, recipe, trigger, answers, mk));
  const project = JSON.parse(JSON.stringify(store.get().project)) as Project;
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  const click = async (id: string) => {
    document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  return { f, player, click };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());
