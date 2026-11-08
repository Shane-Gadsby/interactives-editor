import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Project } from 'interactives-player';
import { accept, findSlot, suggest, type SuggestEnv } from '../src/lib/suggest';
import { previewScope } from '../src/lib/data';

function setup(): { project: Project; env: SuggestEnv } {
  const project = createProject('T');
  project.variables.push(
    { id: 'v1', name: 'score', type: 'number', initial: 7 },
    { id: 'v2', name: 'scoreboard', type: 'string', initial: 'hi' },
    { id: 'v3', name: 'isReady', type: 'boolean', initial: true },
    { id: 'v4', name: 'words', type: 'list', initial: '["a","b"]' },
  );
  project.artboards[0].children.push(createNode('rect', { name: 'Knob' }), createNode('text', { name: 'Title' }));
  const board = project.artboards[0];
  const env: SuggestEnv = {
    project,
    scope: () => previewScope(project, board),
    layers: () => [
      { name: 'Knob', type: 'rect' },
      { name: 'Title', type: 'text' },
    ],
    locals: ['event', 'ix'],
  };
  return { project, env };
}

const at = (text: string, env: SuggestEnv, template = false) => suggest(text, text.length, env, template);
const labels = (r: ReturnType<typeof suggest>) => r?.items.map((i) => i.label) ?? [];

describe('findSlot', () => {
  it('finds the word being typed, and nothing in empty space or a number', () => {
    expect(findSlot('sc', 2)).toMatchObject({ kind: 'name', prefix: 'sc', start: 0, end: 2 });
    expect(findSlot('a + sc', 6)).toMatchObject({ kind: 'name', prefix: 'sc', start: 4 });
    expect(findSlot('', 0)).toBeNull();
    expect(findSlot('a + ', 4)).toBeNull();
    expect(findSlot('12px', 4)).toBeNull();
    expect(findSlot('1.', 2)).toBeNull();
  });

  it('finds a member after a dot, with the chain in front of it', () => {
    expect(findSlot('context.', 8)).toMatchObject({ kind: 'member', prefix: '', path: 'context' });
    expect(findSlot('context.fi', 10)).toMatchObject({ kind: 'member', prefix: 'fi', path: 'context' });
    expect(findSlot('items[0].na', 11)).toMatchObject({ kind: 'member', path: 'items[0]' });
    expect(findSlot('layer("Knob").wi', 16)).toMatchObject({ kind: 'member', path: 'layer("Knob")', prefix: 'wi' });
    expect(findSlot('a?.b', 4)).toMatchObject({ kind: 'member', path: 'a' });
  });

  it('suggests layer names only inside layer("...")', () => {
    expect(findSlot('layer("Kn', 9)).toMatchObject({ kind: 'layer', prefix: 'Kn', quote: '"' });
    expect(findSlot("layer('", 7)).toMatchObject({ kind: 'layer', prefix: '', quote: "'" });
    expect(findSlot('"Kn', 3)).toBeNull();
    expect(findSlot('fmt("sc', 7)).toBeNull();
  });

  it('inside a template, only within the braces', () => {
    expect(findSlot('Score: sc', 9, true)).toBeNull();
    expect(findSlot('Score: {sc', 10, true)).toMatchObject({ kind: 'name', prefix: 'sc', start: 8 });
    expect(findSlot('Score: {score} sc', 17, true)).toBeNull();
    expect(findSlot('{{sc', 4, true)).toBeNull();
    expect(findSlot('a {score + sc', 13, true)).toMatchObject({ prefix: 'sc' });
    expect(findSlot('{context.fi', 11, true)).toMatchObject({ kind: 'member', path: 'context' });
  });
});

describe('suggest', () => {
  it('lists variables with their type and value, prefix matches first', () => {
    const { env } = setup();
    const r = at('sc', env);
    expect(labels(r).slice(0, 2)).toEqual(['score', 'scoreboard']);
    const score = r!.items[0];
    expect(score).toMatchObject({ kind: 'variable', type: 'number', detail: '7' });
    expect(r!.items[1]).toMatchObject({ type: 'text', detail: '“hi”' });
    expect(at('isR', env)!.items[0]).toMatchObject({ label: 'isReady', type: 'true/false', detail: 'true' });
    expect(at('words', env)!.items[0]).toMatchObject({ type: 'list', detail: '2 items' });
  });

  it('offers the built-in context, the player scope names, helpers and locals', () => {
    const { env } = setup();
    expect(labels(at('cont', env))).toContain('context');
    expect(labels(at('reduced', env))).toEqual(['reducedMotion']);
    expect(labels(at('voice', env))).toEqual(['voiceAvailable']);
    expect(labels(at('micL', env))).toEqual(['micLevel']);
    expect(labels(at('download', env))).toEqual(['downloadSize']);
    expect(at('fm', env)!.items[0]).toMatchObject({ label: 'fmt', insert: 'fmt(', kind: 'function' });
    expect(at('fm', env)!.items[0].detail).toContain('fmt(n, decimals, thousands)');
    expect(labels(at('eve', env))[0]).toBe('event');
    expect(labels(at('Mat', env))).toContain('Math');
  });

  it('does not offer locals the field does not have', () => {
    const { env } = setup();
    expect(labels(at('pointer', env))).not.toContain('pointer');
    expect(labels(at('self', env))).not.toContain('self');
  });

  it('lists the fields of context, with what each is', () => {
    const { env } = setup();
    const r = at('context.fi', env)!;
    expect(r.items[0]).toMatchObject({ label: 'firstName', kind: 'field', type: 'text' });
    expect(r.items[0].detail).toContain("first name");
    expect(labels(at('context.', env))).toContain('courseLabel');
    expect(labels(suggest('context.', 8, env))).toContain('isStaff');
  });

  it('lists methods after a text or list value and namespaces like Math', () => {
    const { env } = setup();
    expect(labels(at('scoreboard.toUp', env))).toEqual(['toUpperCase']);
    expect(at('scoreboard.toUp', env)!.items[0]).toMatchObject({ insert: 'toUpperCase(', kind: 'method' });
    expect(labels(at('words.fil', env))).toEqual(['filter']);
    expect(at('words.len', env)!.items[0]).toMatchObject({ label: 'length', insert: 'length', type: 'number' });
    expect(labels(at('Math.ro', env))[0]).toBe('round');
    expect(at('Math.PI', env)).toBeNull();
  });

  it('follows self and layer("...") to the layer settings', () => {
    const { env } = setup();
    const knob = env.project.artboards[0].children[0];
    const withSelf: SuggestEnv = { ...env, locals: ['self'], localValues: { self: { width: 40, opacity: 1, name: knob.name } } };
    expect(labels(at('self.wi', withSelf))).toEqual(['width']);
    expect(at('self.wi', withSelf)!.items[0].detail).toBe('40');
    expect(labels(at('layer("Knob").opa', env))).toEqual(['opacity']);
  });

  it('suggests layer names inside layer("")', () => {
    const { env } = setup();
    expect(labels(at('layer("', env))).toEqual(['Knob', 'Title']);
    expect(labels(at('layer("ti', env))).toEqual(['Title']);
    expect(labels(at('instanceInput("', env))).toEqual(['Knob', 'Title']);
  });

  it('has nothing to say when what is typed is all there is, or nothing matches', () => {
    const { env } = setup();
    expect(at('zzzqq', env)).toBeNull();
    expect(at('isReady', env)).toBeNull();
    expect(at('1 + ', env)).toBeNull();
    expect(at('Score {sc', env, true)!.items[0].label).toBe('score');
    expect(at('Score sc', env, true)).toBeNull();
  });

  it('caps the list', () => {
    const { env } = setup();
    expect(at('a', env)!.items.length).toBeLessThanOrEqual(12);
  });
});

describe('accept', () => {
  it('replaces the typed word, and the rest of the word the caret was in', () => {
    const { env } = setup();
    const text = 'a + scxx';
    const r = suggest(text, 6, env)!;
    expect(accept(text, r.slot, r.items[0])).toEqual({ text: 'a + score', caret: 9 });
  });

  it('a function gets its bracket, once', () => {
    const { env } = setup();
    const r = at('fm', env)!;
    expect(accept('fm', r.slot, r.items[0])).toEqual({ text: 'fmt(', caret: 4 });
    const t = 'fm(1)';
    const r2 = suggest(t, 2, env)!;
    expect(accept(t, r2.slot, r2.items[0])).toEqual({ text: 'fmt(1)', caret: 4 });
  });

  it('puts a member after the dot', () => {
    const { env } = setup();
    const r = at('context.fi', env)!;
    expect(accept('context.fi', r.slot, r.items[0]).text).toBe('context.firstName');
  });

  it('closes the quote of a layer name', () => {
    const { env } = setup();
    const r = at('layer("Kn', env)!;
    expect(accept('layer("Kn', r.slot, r.items[0])).toEqual({ text: 'layer("Knob"', caret: 12 });
    const t = 'layer("Kn")';
    const r2 = suggest(t, 9, env)!;
    expect(accept(t, r2.slot, r2.items[0])).toEqual({ text: 'layer("Knob")', caret: 12 });
  });

  it('inside braces leaves the rest of the text alone', () => {
    const { env } = setup();
    const t = 'Score: {sc} points';
    const r = suggest(t, 10, env, true)!;
    expect(accept(t, r.slot, r.items[0]).text).toBe('Score: {score} points');
  });
});
