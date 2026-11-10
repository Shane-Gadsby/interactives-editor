//A variable's label shows wherever people read names; formulas keep the identifier.
import { describe, expect, it } from 'vitest';
import { createNode, createProject, defaultParams, type LogicNode } from 'interactives-player';
import { describeNode } from '../src/lib/flow-describe';
import { insertChoices } from '../src/lib/insert-value';
import { whenChoices } from '../src/lib/by-value';
import { analyzeUsage } from '../src/lib/dependencies';
import { renameVariable } from '../src/lib/rename-variable';
import type { SuggestEnv } from '../src/lib/suggest';

function setup() {
  const p = createProject('T');
  p.variables.push({ id: 'v1', name: 'quizScore', label: 'Quiz score', type: 'number', initial: 0 });
  const t = createNode('text', { id: 't1', name: 'Score text', text: 'You have {quizScore}' });
  p.artboards[0].children.push(t);
  return { p, ab: p.artboards[0] };
}

describe('variable labels where names are read', () => {
  it('the sentences say what an interaction does in the label', () => {
    const { p, ab } = setup();
    const n: LogicNode = { id: 'a', kind: 'action.setVariable', x: 0, y: 0, params: { ...defaultParams('action.setVariable'), variable: 'v1', op: 'add', value: '1' } };
    const text = describeNode(n, ab, p);
    expect(text).toContain('Quiz score');
    expect(text).not.toContain('quizScore');
  });

  it('Insert value shows the label with the name, and puts the name between the braces', () => {
    const { p } = setup();
    const env: SuggestEnv = { project: p, scope: () => ({ quizScore: 3 }), layers: () => [] };
    const row = insertChoices(env).find((c) => c.group === 'Your variables')!;
    expect(row.label).toBe('Quiz score (quizScore)');
    expect(row.expr).toBe('quizScore');
  });

  it('the By value choices lead with the words and keep the name as the value', () => {
    const { p } = setup();
    const c = whenChoices(p.variables)[0];
    expect([c.value, c.label]).toEqual(['quizScore', 'Quiz score']);
    expect(c.hint).toContain('quizScore');
  });

  it('the usage report names a variable by its label', () => {
    const { p } = setup();
    const r = analyzeUsage(p);
    expect(r.variables[0].name).toBe('Quiz score');
    expect(r.variables[0].usedBy.length).toBe(1);
  });

  it('renaming the name in formulas changes the text that uses it and keeps the label', () => {
    const { p } = setup();
    renameVariable(p, 'v1', 'points');
    const t = p.artboards[0].children[0] as { text: string };
    expect(t.text).toBe('You have {points}');
    expect(p.variables[0].label).toBe('Quiz score');
  });
});
