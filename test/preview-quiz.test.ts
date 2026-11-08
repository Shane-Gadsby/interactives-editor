//The canvas preview has `quiz` like the player does at the start, so a results page shows numbers and not its raw formula
import { describe, expect, it } from 'vitest';
import { BRANDED_STARTERS, projectFromBrandedStarter } from '../src/lib/branded';
import { previewScope } from '../src/lib/data';

describe('previewScope quiz', () => {
  it('is there for a project with questions, with the total of their points', () => {
    const p = projectFromBrandedStarter(BRANDED_STARTERS.find((x) => x.key === 'assessment/spelling-test')!);
    const result = p.artboards.find((a) => a.name === 'Your result')!;
    const quiz = previewScope(p, result).quiz as { score: number; max: number; questions: unknown[] };
    expect(quiz.score).toBe(0);
    expect(quiz.max).toBeGreaterThan(0);
    expect(quiz.questions.length).toBe(6);
  });

  it('gives way to a variable called quiz', () => {
    const p = projectFromBrandedStarter(BRANDED_STARTERS.find((x) => x.key === 'assessment/spelling-test')!);
    p.variables.push({ id: 'vq', name: 'quiz', type: 'string', initial: 'mine' });
    expect(previewScope(p, p.artboards[0]).quiz).toBe('mine');
  });
});
