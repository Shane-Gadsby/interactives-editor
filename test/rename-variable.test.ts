import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, uid, type LogicNode, type Project } from 'interactives-player';
import { analyzeUsage } from '../src/lib/dependencies';
import { changedLines, renameInCode, renameInExpr, renameInTemplate, renameVariable } from '../src/lib/rename-variable';
import { planRename } from '../src/lib/rename-plan';

const logic = (kind: string, params: Record<string, unknown>): LogicNode => ({ id: uid('ln'), kind, x: 0, y: 0, params });

describe('rewriting text', () => {
  it('expressions: whole names only, not after a dot, not in strings', () => {
    expect(renameInExpr('score + 1', 'score', 'points')).toBe('points + 1');
    expect(renameInExpr('score2 + myscore + score', 'score', 'points')).toBe('score2 + myscore + points');
    expect(renameInExpr('item.score + score', 'score', 'points')).toBe('item.score + points');
    expect(renameInExpr(`score == "score" || 'score' == \`score\``, 'score', 'points')).toBe(`points == "score" || 'score' == \`score\``);
    expect(renameInExpr('max(score, best) > $score', 'score', 'points')).toBe('max(points, best) > $score');
  });
  it('templates: only inside slots, literal braces left alone', () => {
    expect(renameInTemplate('Your score is {score} of {max(score, 10)}', 'score', 'points')).toBe('Your score is {points} of {max(points, 10)}');
    expect(renameInTemplate('{{score}} and score', 'score', 'points')).toBe('{{score}} and score');
  });
  it('code: bare names, vars.name and a string that is exactly the name', () => {
    expect(renameInCode(`ix.set('score', score + 1); vars.score; obj.score; "my score"`, 'score', 'points')).toBe(`ix.set('points', points + 1); vars.points; obj.score; "my score"`);
    expect(renameInCode('myvars.score', 'score', 'points')).toBe('myvars.score');
    expect(changedLines('let a = 1\nix.get("score")\nreturn a', 'score', 'points')).toEqual(['ix.get("score")']);
  });
});

/** A project naming `score` in every by-name place there is. */
function everywhere(): Project {
  const p = createProject('T');
  const home = p.artboards[0];
  const inner = createArtboard({ name: 'Inner' });
  p.artboards.push(inner);
  p.variables.push({ id: 'vs', name: 'score', type: 'number', initial: 0, persist: true }, { id: 'vd', name: 'double', type: 'number', initial: 0, formula: 'score * 2' });
  const text = createNode('text', { name: 'Says', text: 'Score: {score}' });
  const box = createNode('rect', { name: 'Box' });
  box.bindings = { x: 'score * 10' };
  box.converters = { opacity: [{ type: 'expr', expr: 'score / 10' }] } as never;
  const btn = createNode('button', { name: 'Go', label: 'Add {score}' });
  const list = createNode('frame', { name: 'List' });
  (list as { repeat?: unknown }).repeat = { items: 'range(score)' };
  const inst = createNode('instance', { name: 'Inst', artboardId: inner.id });
  (inst as { inputs?: unknown }).inputs = { score: 3 };
  const draw = createNode('draw', { name: 'Sketch' });
  (draw as { code: string }).code = 'draw = () => ix.get("score")';
  home.children.push(text, box, btn, list, inst, draw);
  home.logic.nodes.push(logic('logic.if', { condition: 'score > 1' }), logic('action.code', { code: 'vars.score += 1' }), logic('action.setVariable', { variable: 'vs' }));
  p.scripts.push({ id: 'sc', name: 'Main', code: 'ix.set("score", 5)', runOnStart: true });
  return p;
}

describe('renaming a variable', () => {
  it('renames every place, and the usage report finds the same places under the new name with nothing missing', () => {
    const p = everywhere();
    const before = analyzeUsage(p).variables.find((v) => v.id === 'vs')!.usedBy.length;
    const plan = planRename(p, 'vs', 'points');
    expect(plan.error).toBeUndefined();
    expect(plan.used.length).toBe(before);
    expect(plan.scripts.map((s) => s.where).sort()).toEqual(['Code snippet on Home', 'Script Main', 'Sketch on Home']);
    expect(plan.saved).toBe(true);
    renameVariable(p, 'vs', 'points');
    const after = analyzeUsage(p);
    expect(after.variables.find((v) => v.id === 'vs')!.usedBy.length).toBe(before);
    expect(after.missing.filter((m) => m.what === 'variable')).toEqual([]);
    const json = JSON.stringify({ artboards: p.artboards, scripts: p.scripts, formula: p.variables[1].formula });
    expect(json).not.toMatch(/\bscore\b/);
    expect(p.variables[0]).toMatchObject({ name: 'points', formerNames: ['score'] });
  });
  it('leaves scripts alone when asked', () => {
    const p = everywhere();
    renameVariable(p, 'vs', 'points', { scripts: false });
    expect(p.scripts[0].code).toBe('ix.set("score", 5)');
    expect((p.artboards[0].children[0] as { text: string }).text).toBe('Score: {points}');
  });
  it('refuses a taken name or a bad one', () => {
    const p = everywhere();
    p.dataSources.push({ id: 'd', name: 'rows', source: 'inline', format: 'json', content: '[]' } as never);
    expect(planRename(p, 'vs', 'double').error).toMatch(/already called double/);
    expect(planRename(p, 'vs', 'rows').error).toMatch(/data source/);
    expect(planRename(p, 'vs', '2x').error).toMatch(/letters/);
  });
  it('only keeps a former name for variables with saved values, and not the one it goes back to', () => {
    const p = everywhere();
    renameVariable(p, 'vd', 'twice');
    expect(p.variables[1].formerNames).toBeUndefined();
    renameVariable(p, 'vs', 'points');
    renameVariable(p, 'vs', 'score');
    expect(p.variables[0].formerNames).toEqual(['points']);
  });
});
