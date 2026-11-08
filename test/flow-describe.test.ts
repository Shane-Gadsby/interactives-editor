//The flow description: what a graph does in plain sentences, from the catalog, for every kind of node.
import { describe, expect, it } from 'vitest';
import { CATALOG, createArtboard, createNode, createProject, defaultParams, type Artboard, type LogicEdge, type LogicNode } from 'interactives-player';
import { nodeLabel } from '../src/lib/plain-words';
import { buildFlow, describeNode, flowLines, flowSentence, flowsForLayer, flowsOf, isOff, looseNodes, reachable, removableWithEvent, TEMPLATED_KINDS, turnedOff, turnedOn } from '../src/lib/flow-describe';

let n = 0;
const node = (kind: string, params: Record<string, unknown> = {}, y = n): LogicNode => ({ id: `n${++n}`, kind, x: 0, y, params: { ...defaultParams(kind), ...params } });
const wire = (a: LogicNode, b: LogicNode, port = 'out'): LogicEdge => ({ id: `e${++n}`, from: a.id, fromPort: port, to: b.id, toPort: 'in' });

function setup() {
  const p = createProject('T');
  const ab = p.artboards[0];
  const btn = createNode('rect', { name: 'Next button' });
  const hint = createNode('text', { name: 'Hint text' });
  ab.children.push(btn, hint);
  p.variables.push({ id: 'vs', name: 'score', type: 'number', initial: 0 });
  p.artboards.push(createArtboard({ name: 'Quiz' }));
  ab.timelines.push({ id: 'tl1', name: 'Intro', duration: 1000, tracks: [], loop: false } as unknown as Artboard['timelines'][number]);
  return { p, ab, btn, hint };
}

describe('describeNode', () => {
  it('reads every kind in the catalog as a phrase, with its default settings, in an empty project', () => {
    const p = createProject('T');
    for (const d of CATALOG) {
      const text = describeNode(node(d.kind), p.artboards[0], p);
      expect(text, d.kind).toBeTruthy();
      expect(text, d.kind).not.toMatch(/undefined|\[object|NaN|null/);
      // phrases are sentences' middles: no full stop, and only events start with a capital
      expect(text, d.kind).not.toMatch(/\.$/);
      if (!d.kind.startsWith('event.')) expect(text[0], `${d.kind}: ${text}`).toBe(text[0].toLowerCase());
    }
  });

  it('has a template of its own for every kind it says it does, and every one is a real kind', () => {
    const kinds = new Set(CATALOG.map((d) => d.kind));
    for (const k of TEMPLATED_KINDS) expect(kinds.has(k), k).toBe(true);
    // the commonest ones all read in words and not as "Control timeline (…)"
    for (const k of ['event.pointer', 'action.visibility', 'action.setVariable', 'action.artboard', 'action.timeline', 'action.sound', 'action.url', 'action.delay', 'logic.if', 'action.startOver']) expect(TEMPLATED_KINDS).toContain(k);
  });

  it('every other kind says its (plain) name and what it is set to, and carries the catalog summary on the line', () => {
    const { p, ab } = setup();
    const flowOf = (kind: string) => {
      const e = node('event.start');
      const a = node(kind);
      return buildFlow(e, { ab: { ...ab, logic: { nodes: [e, a], edges: [wire(e, a)] } }, project: p });
    };
    for (const d of CATALOG.filter((x) => x.category !== 'event' && !TEMPLATED_KINDS.includes(x.kind))) {
      const f = flowOf(d.kind);
      expect(f.steps[0].summary, d.kind).toBe(d.summary);
      expect(f.steps[0].text.toLowerCase(), d.kind).toContain(nodeLabel(d).toLowerCase());
    }
  });

  it('says what an action does to what, by name', () => {
    const { p, ab, btn, hint } = setup();
    const t = (kind: string, params: Record<string, unknown>) => describeNode(node(kind, params), ab, p);
    expect(t('action.visibility', { target: hint.id, op: 'show' })).toBe('show Hint text');
    expect(t('action.visibility', { target: hint.id, op: 'hide' })).toBe('hide Hint text');
    expect(t('action.visibility', { target: hint.id, op: 'toggle' })).toBe('show or hide Hint text');
    expect(t('action.visibility', { target: '' })).toBe('show or hide a layer');
    expect(t('action.visibility', { target: 'gone', op: 'show' })).toBe('show a layer that is missing');
    expect(t('action.artboard', { to: 'next' })).toBe('go to the next page');
    expect(t('action.artboard', { to: 'previous' })).toBe('go to the previous page');
    expect(t('action.artboard', { to: 'picked', artboard: p.artboards[1].id })).toBe('go to the page “Quiz”');
    expect(t('action.setVariable', { variable: 'vs', op: 'add', value: '1' })).toBe('add 1 to score');
    expect(t('action.setVariable', { variable: 'vs', op: 'set', value: '"x"' })).toBe('set score to “x”');
    expect(t('action.setVariable', { variable: 'vs', op: 'toggle' })).toBe('switch score on or off');
    expect(t('action.timeline', { timeline: 'tl1', op: 'play' })).toBe('play “Intro”');
    expect(t('action.delay', { ms: '2000' })).toBe('wait 2 s');
    expect(t('action.delay', { ms: '500' })).toBe('wait 0.5 s');
    expect(t('action.delay', { ms: 'pause * 2' })).toBe('wait pause * 2 ms');
    expect(t('action.url', { url: '"https://example.com"' })).toBe('open the link “https://example.com”');
    expect(t('action.setProperty', { target: btn.id, prop: 'opacity', value: '0.5' })).toBe('set Next button’s opacity to 0.5');
    expect(t('action.startOver', {})).toBe('start over');
  });

  it('says when something is clicked, hovered or keyed, and who it is', () => {
    const { p, ab, btn } = setup();
    const e = (params: Record<string, unknown>, kind = 'event.pointer') => describeNode(node(kind, params), ab, p);
    expect(e({ target: btn.id, type: 'click' })).toBe('When Next button is clicked');
    expect(e({ target: btn.id, type: 'pointerenter' })).toBe('When the pointer moves onto Next button');
    expect(e({ target: '', type: 'click' })).toBe('When any layer is clicked');
    expect(describeNode(node('event.pointer', { target: btn.id, type: 'click' }), ab, p, btn.id)).toBe('When clicked');
    expect(describeNode(node('event.pointer', { target: btn.id, type: 'pointerenter' }), ab, p, btn.id)).toBe('When hovered over');
    expect(e({}, 'event.start')).toBe('When this page is shown');
    expect(e({ key: 'Enter', ctrl: true }, 'event.key')).toBe('When Ctrl+Enter is pressed');
    expect(e({ ms: '3000', repeat: false }, 'event.timer')).toBe('After 3 s');
    expect(e({ ms: '1000', repeat: true }, 'event.timer')).toBe('Every 1 s');
    expect(e({ variable: 'vs' }, 'event.variable')).toBe('When score changes');
  });
});

describe('flows', () => {
  function chain() {
    const { p, ab, btn, hint } = setup();
    const ev = node('event.pointer', { target: btn.id, type: 'click' });
    const a = node('action.visibility', { target: hint.id, op: 'show' });
    const w = node('action.delay', { ms: '2000' });
    const b = node('action.visibility', { target: hint.id, op: 'hide' });
    ab.logic.nodes.push(ev, a, w, b);
    ab.logic.edges.push(wire(ev, a), wire(a, w), wire(w, b));
    return { p, ab, btn, hint, ev, a, w, b };
  }

  it('reads a chain as one sentence', () => {
    const { p, ab, ev } = chain();
    const f = buildFlow(ev, { ab, project: p });
    expect(flowSentence(f)).toBe('When Next button is clicked: show Hint text, then wait 2 s, then hide Hint text');
    expect(flowSentence(buildFlow(ev, { ab, project: p, self: ev.params.target as string }))).toBe('When clicked: show Hint text, then wait 2 s, then hide Hint text');
  });

  it('says so when nothing is joined to an event', () => {
    const { p, ab, btn } = setup();
    const ev = node('event.pointer', { target: btn.id });
    ab.logic.nodes.push(ev);
    expect(flowSentence(buildFlow(ev, { ab, project: p }))).toBe('When Next button is clicked: nothing happens yet, no step is joined to it');
    expect(flowLines(buildFlow(ev, { ab, project: p })).map((l) => l.kind)).toEqual(['event', 'more']);
  });

  it('puts the condition on the event, in words, and says when it is turned off', () => {
    const { p, ab, ev } = chain();
    ev.params.onlyIf = 'score >= 5';
    expect(buildFlow(ev, { ab, project: p }).when).toBe('When Next button is clicked, only if score is at least 5');
    ev.params.onlyIf = turnedOff('score >= 5');
    const f = buildFlow(ev, { ab, project: p });
    expect(f.off).toBe(true);
    expect(f.when).toBe('When Next button is clicked, only if score is at least 5');
    expect(flowSentence(f)).toContain('(turned off)');
  });

  it('cuts a long chain short and says how many steps were left out', () => {
    const { p, ab, ev } = chain();
    let last = ab.logic.nodes[ab.logic.nodes.length - 1];
    for (let i = 0; i < 7; i++) {
      const next = node('action.delay', { ms: '100' });
      ab.logic.nodes.push(next);
      ab.logic.edges.push(wire(last, next));
      last = next;
    }
    const f = buildFlow(ev, { ab, project: p }, { limit: 6 });
    expect(f.more).toBe(4);
    expect(flowSentence(f)).toMatch(/, and 4 more steps$/);
    expect(flowLines(f).at(-1)!.text).toBe('… and 4 more steps');
    // a big enough limit shows it all
    const all = buildFlow(ev, { ab, project: p }, { limit: 40 });
    expect(all.more).toBe(0);
  });

  it('shows the two ways out of a check, and the ways out of a question', () => {
    const { p, ab, btn, hint } = setup();
    const ev = node('event.pointer', { target: btn.id });
    const q = node('logic.if', { condition: 'score >= 5' });
    const yes = node('action.visibility', { target: hint.id, op: 'show' });
    const no = node('action.artboard', { to: 'previous' });
    ab.logic.nodes.push(ev, q, yes, no);
    ab.logic.edges.push(wire(ev, q), wire(q, yes, 'true'), wire(q, no, 'false'));
    const f = buildFlow(ev, { ab, project: p });
    expect(flowSentence(f)).toBe('When Next button is clicked: check whether score is at least 5 (if so: show Hint text; if not: go to the previous page)');
    const lines = flowLines(f);
    expect(lines.map((l) => `${l.depth}${l.kind[0]} ${l.text}`)).toEqual(['0e When Next button is clicked', '1s check whether score is at least 5', '2b if so:', '3s show Hint text', '2b if not:', '3s go to the previous page']);
  });

  it('reads several things started together, and survives a loop', () => {
    const { p, ab, btn, hint } = setup();
    const ev = node('event.pointer', { target: btn.id });
    const a = node('action.visibility', { target: hint.id, op: 'show' });
    const b = node('action.delay', { ms: '1000' });
    ab.logic.nodes.push(ev, a, b);
    ab.logic.edges.push(wire(ev, a), wire(ev, b), wire(b, a), wire(a, b));
    const text = flowSentence(buildFlow(ev, { ab, project: p }));
    expect(text).toContain('do all of these (first:');
    expect(text).toContain('go back to');
  });

  it('finds the flows on a layer, or on the whole artboard, and the nodes nothing starts', () => {
    const { p, ab, btn, hint, ev } = chain();
    const other = node('event.pointer', { target: hint.id, type: 'pointerenter' }, 900);
    const loose = node('action.delay', {}, 1000);
    ab.logic.nodes.push(other, loose);
    expect(flowsForLayer({ ab, project: p }, btn.id).map((f) => f.event.id)).toEqual([ev.id]);
    expect(flowsOf({ ab, project: p }).map((f) => f.event.id)).toEqual([ev.id, other.id]);
    expect(looseNodes(ab).map((x) => x.id)).toEqual([loose.id]);
  });
});

describe('turning a flow off and on', () => {
  it('keeps the old condition behind the false and brings it back', () => {
    expect(turnedOff('')).toBe('false');
    expect(turnedOn('false')).toBe('');
    expect(turnedOff('score > 1')).toBe('false && (score > 1)');
    expect(turnedOn('false && (score > 1)')).toBe('score > 1');
    expect(turnedOff(turnedOff('score > 1'))).toBe('false && (score > 1)');
    expect(turnedOn('score > 1')).toBe('score > 1');
    expect(isOff(node('event.start', { onlyIf: 'false' }))).toBe(true);
    expect(isOff(node('event.start', { onlyIf: 'false && (a > 1)' }))).toBe(true);
    expect(isOff(node('event.start', { onlyIf: 'a > 1' }))).toBe(false);
  });
});

describe('removing a flow', () => {
  it('takes the event and the steps only it reaches, and leaves a step another flow also reaches', () => {
    const { p, ab, btn, hint } = setup();
    void p;
    const e1 = node('event.pointer', { target: btn.id });
    const e2 = node('event.pointer', { target: hint.id });
    const a = node('action.delay', {});
    const shared = node('action.visibility', { target: hint.id, op: 'hide' });
    const b = node('action.delay', {});
    ab.logic.nodes.push(e1, e2, a, shared, b);
    ab.logic.edges.push(wire(e1, a), wire(a, shared), wire(e2, shared), wire(e2, b));
    expect([...removableWithEvent(ab, e1.id)].sort()).toEqual([e1.id, a.id].sort());
    expect([...removableWithEvent(ab, e2.id)].sort()).toEqual([e2.id, b.id].sort());
    expect(reachable(ab, e1.id).size).toBe(3);
  });

  it('keeps a step that something outside the flow is wired into', () => {
    const { ab, btn } = setup();
    const e1 = node('event.pointer', { target: btn.id });
    const a = node('action.delay', {});
    const b = node('action.delay', {});
    const stray = node('action.delay', {});
    ab.logic.nodes.push(e1, a, b, stray);
    ab.logic.edges.push(wire(e1, a), wire(a, b), wire(stray, b));
    expect([...removableWithEvent(ab, e1.id)].sort()).toEqual([e1.id, a.id].sort());
  });
});

