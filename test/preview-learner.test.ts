//Preview answers the player's progress messages, so Save user data and remembered progress last between Preview runs
import { beforeEach, describe, expect, it } from 'vitest';
import { answerPreviewProgress, forgetPreviewLearner, previewLearnerHas } from '../src/lib/preview-learner';

const ask = (op: string, body: Record<string, unknown> = {}) => answerPreviewProgress({ source: 'interactives-progress', op, rid: 'r1', project: 'p1', ...body });

describe('Preview learner record', () => {
  beforeEach(() => localStorage.clear());

  it('keeps saved user data for the next run, merging saves and returning only what is asked for', () => {
    expect(ask('userdata-load', { names: ['circlePos'] })).toEqual({ ok: true, available: true, data: {} });
    expect(ask('userdata-save', { variables: { circlePos: 120 } })).toEqual({ ok: true, available: true });
    ask('userdata-save', { variables: { other: 'x' } });
    expect(ask('userdata-load', { names: ['circlePos'] })!.data).toEqual({ circlePos: 120 });
    expect(previewLearnerHas('p1')).toBe(true);
    //another project keeps its own
    expect(answerPreviewProgress({ source: 'interactives-progress', op: 'userdata-load', project: 'p2', names: ['circlePos'] })!.data).toEqual({});
  });

  it('keeps remembered progress, says there is no context or marking here, and ignores other messages', () => {
    ask('save', { data: { variables: { a: 1 }, artboard: 'ab1', attempts: 1, completed: false } });
    expect(ask('load')!.data).toMatchObject({ artboard: 'ab1' });
    expect(ask('context')).toEqual({ ok: true, available: false });
    expect(ask('mark')).toEqual({ ok: true, available: false });
    expect(answerPreviewProgress({ source: 'interactives', op: 'load' })).toBeNull();
    expect(ask('report')).toBeNull();
  });

  it('forgets it all', () => {
    ask('userdata-save', { variables: { circlePos: 5 } });
    forgetPreviewLearner('p1');
    expect(previewLearnerHas('p1')).toBe(false);
    expect(ask('userdata-load', { names: ['circlePos'] })!.data).toEqual({});
  });
});
