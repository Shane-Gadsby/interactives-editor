//Rooms in the editor besides the panel: Preview's pretend room, the Send a message to a room recipe, and how the graph describes the node.
import { beforeEach, describe, expect, it } from 'vitest';
import { createNode, createProject, type Project, type RoomValue } from 'interactives-player';
import { answerPreviewProgress, forgetPreviewLearner, previewLearnerHas } from '../src/lib/preview-learner';
import { RECIPE_BY_ID, applyBehaviour, buildBehaviour, defaultAnswers, incomplete, unavailable, type RecipeCtx } from '../src/lib/recipes';
import { EditorStore } from '../src/store/store';

function roomProject(room: Record<string, unknown> = {}): Project {
  const p = createProject('R');
  p.id = 'p1';
  p.dataSources.push({ id: 'rm', name: 'chat', kind: 'json', source: 'room', room });
  return p;
}
const ask = (p: Project, op: string, body: Record<string, unknown> = {}) => answerPreviewProgress({ source: 'interactives-progress', op, rid: 'r1', project: 'p1', roomSource: 'rm', ...body }, p);
const value = (r: ReturnType<typeof ask>) => r!.data as RoomValue;

describe('Preview\'s pretend room', () => {
  beforeEach(() => localStorage.clear());

  it('is the sample messages, each from a person of its own, with you in it', () => {
    const p = roomProject({ sample: ['Hi all', 'Anyone here?'] });
    const r = ask(p, 'room-join');
    expect(r).toMatchObject({ ok: true, available: true });
    expect(value(r).ready).toBe(true);
    expect(value(r).up).toBe(true);
    expect(value(r).messages.map((m) => [m.seat, m.text, m.mine])).toEqual([['Learner 1', 'Hi all', false], ['Learner 2', 'Anyone here?', false]]);
    expect(value(r).here).toBe(2);
    expect(value(r).me).toBe('You (Preview)');
  });

  it('keeps what you send, after the samples and in the order you sent it, for the next run', () => {
    const p = roomProject({ sample: ['Hi all'] });
    ask(p, 'room-send', { text: '  first   one ' });
    const r = ask(p, 'room-send', { text: 'second one' });
    expect(value(r).messages.map((m) => [m.text, m.mine])).toEqual([['Hi all', false], ['first one', true], ['second one', true]]);
    expect(value(r).problem).toBe('');
    expect(value(ask(p, 'room-join')).messages).toHaveLength(3);
    expect(previewLearnerHas('p1')).toBe(true);
    forgetPreviewLearner('p1');
    expect(value(ask(p, 'room-join')).messages).toHaveLength(1);
    expect(previewLearnerHas('p1')).toBe(false);
  });

  it('refuses an empty message and a blocked word the way the server does, and says why', () => {
    const p = roomProject({ blocked: ['spam'] });
    expect(value(ask(p, 'room-send', { text: '   ' })).problem).toBe('empty');
    const r = ask(p, 'room-send', { text: 'SPAM here' });
    expect(value(r).problem).toBe('blocked');
    expect(value(r).messages).toEqual([]);
  });

  it('holds only the latest few', () => {
    const p = roomProject({ show: 2 });
    for (const t of ['a', 'b', 'c']) ask(p, 'room-send', { text: t });
    expect(value(ask(p, 'room-join')).messages.map((m) => m.text)).toEqual(['b', 'c']);
  });

  it('is not there for a source that is not a room', () => {
    const p = roomProject();
    expect(answerPreviewProgress({ source: 'interactives-progress', op: 'room-join', project: 'p1', roomSource: 'nothing' }, p)).toEqual({ ok: true, available: false });
  });
});

describe('Send a message to a room', () => {
  const ctxOf = (p: Project): RecipeCtx => {
    const btn = createNode('rect', { name: 'Send', x: 0, y: 0, width: 50, height: 20 });
    p.artboards[0].children.push(btn);
    return { project: p, ab: p.artboards[0], layerId: btn.id };
  };

  it('is not offered until there is a room, then starts on the first one', () => {
    const none = createProject('N');
    expect(unavailable(RECIPE_BY_ID['room-send'], ctxOf(none))).toMatch(/no room yet/);
    const p = roomProject();
    const ctx = ctxOf(p);
    expect(unavailable(RECIPE_BY_ID['room-send'], ctx)).toBeNull();
    expect(defaultAnswers(RECIPE_BY_ID['room-send'], ctx).room).toBe('rm');
  });

  it('writes Send to room, then empties the text variable, as ordinary nodes, making the variable when it is new', () => {
    const p = roomProject();
    const ctx = ctxOf(p);
    const answers = { ...defaultAnswers(RECIPE_BY_ID['room-send'], ctx), textvar: 'new:draft' };
    expect(incomplete(RECIPE_BY_ID['room-send'], answers, p, ctx.ab)).toBeNull();
    let n = 0;
    const b = buildBehaviour(ctx, 'room-send', 'click', answers, (prefix) => `${prefix}${++n}`);
    expect(b.nodes.map((x) => x.kind)).toEqual(['event.pointer', 'action.roomSend', 'action.setVariable']);
    expect(b.variables).toMatchObject([{ name: 'draft', type: 'string' }]);
    expect(b.nodes[1].params).toMatchObject({ source: 'rm', text: 'draft' });
    expect(b.nodes[2].params).toMatchObject({ variable: b.variables[0].id, op: 'set', value: '""' });
    //joined in a row: the box is emptied only when the message went
    expect(b.edges.map((e) => [e.fromPort, e.toPort])).toEqual([['out', 'in'], ['out', 'in']]);
    const store = new EditorStore(p);
    applyBehaviour((r) => store.update(r), ctx.ab.id, b);
    expect(store.get().project.variables.map((v) => v.name)).toEqual(['draft']);
    expect(store.get().project.artboards[0].logic.nodes.map((x) => x.kind)).toEqual(['event.pointer', 'action.roomSend', 'action.setVariable']);
  });

  it('says what is missing', () => {
    const p = roomProject();
    const ctx = ctxOf(p);
    expect(incomplete(RECIPE_BY_ID['room-send'], { room: '', textvar: 'new:draft' }, p, ctx.ab)).toMatch(/room/i);
    expect(incomplete(RECIPE_BY_ID['room-send'], { room: 'rm', textvar: 'new:' }, p, ctx.ab)).toMatch(/Name the variable/);
  });

  it('reads as a sentence in the graph', () => {
    const p = roomProject();
    const ctx = ctxOf(p);
    const b = buildBehaviour(ctx, 'room-send', 'click', { ...defaultAnswers(RECIPE_BY_ID['room-send'], ctx), textvar: 'new:draft' }, (prefix) => `${prefix}x`);
    expect(b.sentence).toMatch(/send draft to chat/);
  });
});
