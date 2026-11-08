//Preview answers the player's progress messages, so Save user data and remembered progress last between Preview runs
import { beforeEach, describe, expect, it } from 'vitest';
import { answerPreviewProgress, forgetPreviewCourse, forgetPreviewLearner, previewCourseHas, previewLearnerHas, usesCourseCollections } from '../src/lib/preview-learner';

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

describe('Preview and shared responses', () => {
  beforeEach(() => localStorage.clear());
  const project = (shared: Record<string, unknown>) => ({ dataSources: [{ id: 'ds1', name: 'responses', kind: 'json', source: 'shared', shared }] }) as unknown as Parameters<typeof answerPreviewProgress>[1];
  const shared = (doc: ReturnType<typeof project>, op: string, body: Record<string, unknown> = {}) => answerPreviewProgress({ source: 'interactives-progress', op, rid: 'r', project: 'p1', sharedSource: 'ds1', who: 'class', ...body }, doc);

  it('makes the class from the sample answers and what the previewer adds, within the limits and blocklist', () => {
    const doc = project({ sample: ['sleep', 'sleep', 'focus'], perPerson: 2, blocked: ['spam'], minCount: 1 });
    expect((shared(doc, 'shared-read')!.data as any).answers.map((a: any) => [a.text, a.count])).toEqual([['sleep', 2], ['focus', 1]]);
    const added = shared(doc, 'shared-add', { answers: ['Sleep', 'spam', 'new', 'third'] })!;
    expect(added.data).toMatchObject({ kept: 2, problem: 'full', mine: ['Sleep', 'new'] });
    expect((added.data as any).answers.map((a: any) => [a.text, a.count])).toEqual([['sleep', 3], ['focus', 1], ['new', 1]]);
    expect(previewLearnerHas('p1')).toBe(true);
    expect((shared(doc, 'shared-withdraw', { answers: ['new'] })!.data as any).mine).toEqual(['Sleep']);
    expect((shared(doc, 'shared-withdraw')!.data as any).mine).toEqual([]);
  });

  it('keeps Only me to the previewer\'s own answers, and holds a minimum for the class', () => {
    const doc = project({ sample: ['a', 'b', 'b'], minCount: 2 });
    expect((shared(doc, 'shared-read')!.data as any).answers.map((a: any) => a.text)).toEqual(['b']);
    shared(doc, 'shared-add', { who: 'me', answers: ['private'] });
    const me = shared(doc, 'shared-read', { who: 'me' })!.data as any;
    expect(me.answers.map((a: any) => a.text)).toEqual(['private']);
    expect(me.who).toBe('me');
  });

  it('says there is nothing here for a source the project does not have, and forgets the lot', () => {
    expect(shared(project({}), 'shared-read', { sharedSource: 'nope' })).toEqual({ ok: true, available: false });
    shared(project({}), 'shared-add', { answers: ['x'] });
    forgetPreviewLearner('p1');
    expect(previewLearnerHas('p1')).toBe(false);
  });
});

describe('Preview and course collections', () => {
  beforeEach(() => localStorage.clear());
  const course = (op: string, body: Record<string, unknown> = {}, project = 'p1') => answerPreviewProgress({ source: 'interactives-progress', op, rid: 'r', project, collection: 'Passport', ...body });

  it('keeps a collection in this browser, says it is not the course\'s, and merges like the server', () => {
    expect(course('course-read')).toEqual({ ok: true, available: true, data: { stamps: [], counts: {}, course: false } });
    expect(course('course-add', { stamps: ['Gold star', 'gold star'], counts: { quizzes: 3 } })!.data).toMatchObject({ stamps: ['Gold star'], counts: { quizzes: 3 }, course: false, changed: 2 });
    expect(course('course-add', { stamps: ['GOLD STAR'], counts: { quizzes: 1 } })!.data).toMatchObject({ changed: 0, counts: { quizzes: 3 } });
    expect(previewCourseHas()).toBe(true);
  });

  it('is shared by every project previewed here that uses the name, and has none for no name', () => {
    course('course-add', { stamps: ['One'] }, 'p1');
    expect((course('course-read', {}, 'p2')!.data as { stamps: string[] }).stamps).toEqual(['One']);
    expect(course('course-read', { collection: '$$' })).toEqual({ ok: true, available: false });
  });

  it('is forgotten on its own, apart from a project\'s saved data', () => {
    ask('userdata-save', { variables: { a: 1 } });
    course('course-add', { stamps: ['x'] });
    forgetPreviewCourse();
    expect(previewCourseHas()).toBe(false);
    expect(previewLearnerHas('p1')).toBe(true);
    expect((course('course-read')!.data as { stamps: string[] }).stamps).toEqual([]);
  });

  it('knows whether a project uses collections, by a node or a script', () => {
    const base = { artboards: [{ logic: { nodes: [{ kind: 'action.emit' }] } }], scripts: [] };
    expect(usesCourseCollections(base as never)).toBe(false);
    expect(usesCourseCollections({ ...base, artboards: [{ logic: { nodes: [{ kind: 'action.courseCheck' }] } }] } as never)).toBe(true);
    expect(usesCourseCollections({ ...base, scripts: [{ code: "await ix.course.stamp('p', 'x')" }] } as never)).toBe(true);
  });
});
