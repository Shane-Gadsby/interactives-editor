// @vitest-environment node
//Marking on the server: the real index.js against the in-memory mongo stand-in. The share page for a project with server-marked
//questions has its answers taken out, a learner's checks are marked here against the answer key, the record is written by the
//server alone (what the browser says about a score is dropped), and checking is rate limited.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
import { newQuestion, questionVars, type Question } from 'interactives-player';
// @ts-expect-error plain ESM shared with index.js
import * as kit from '../shared/marking-kit.mjs';
// @ts-expect-error plain ESM, the same list the bundle is built from
import { sourcesHash } from '../scripts/marking-sources.mjs';
import { readFileSync } from 'node:fs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const course = 'MAT1000_2026_S1';
const learnerN = (n: string): User => ({ username: `learner-${n}`, fullName: `Learner ${n}`, course });

const secretQuestion = (): Question => ({
  ...newQuestion('single', 'q1'),
  serverMarked: true,
  attempts: 2,
  points: 4,
  hints: ['SECRET-hint'],
  feedbackCorrect: 'SECRET-well done',
  feedbackIncorrect: 'Not that one',
  options: [
    { id: 'o1', text: '9' },
    { id: 'o2', text: '11', correct: true, feedback: 'SECRET-prime' },
    { id: 'o3', text: '15' },
  ],
});
const fillInTheBlank = (): Question => ({ ...newQuestion('blank', 'q2'), serverMarked: true, points: 2, blanks: [{ id: 'b1', label: 'Capital', answers: ['SECRET-Paris', '/^SECRET-par.s$/i'] }] });
const matching = (): Question => ({ ...newQuestion('matching', 'q3'), serverMarked: true });

const projectWith = (id: string, qs: Question[], passMark?: number) => {
  const frames = qs.map((q, i) => ({ id: `f${i + 1}`, type: 'frame', name: `Question ${i + 1}`, x: 0, y: 0, width: 100, height: 100, children: [], question: q }));
  return {
    format: 'interactives',
    id,
    name: `Project ${id}`,
    settings: { reporting: passMark === undefined ? {} : { passMark } },
    variables: qs.map((q) => ({ id: `v-${q.prefix}`, name: `${q.prefix}_items`, type: 'list', initial: questionVars(q).find((v) => v.suffix === 'items')!.initial })),
    artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: frames, logic: { nodes: [], edges: [] } }],
  };
};
//The page the editor builds: the project as JSON in a script element, escaped the way the player's builder does it
const pageOf = (project: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(project).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>player()</script></body></html>`;
const projectIn = (html: string) => JSON.parse(html.split('id="ix-project">')[1].split('</script>')[0]);

let h: Harness;
let token = '';
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['interactives-user-data'], h.db['interactives-activity-user-data']]) c.docs = [];
});

const records = () => h.db['interactives-user-data'].docs;
async function share(qs: Question[], passMark?: number) {
  const project = projectWith('prmark001', qs, passMark);
  await h.call('PUT', '/api/projects/prmark001', { user: ann, json: { project, rev: 0 } });
  const r = await h.call('PUT', '/api/projects/prmark001/share', { user: ann, body: pageOf(project), type: 'text/html' });
  token = r.json.share.token;
  return r;
}
const check = (user: User | null, answer: unknown, question = 'f1') => h.call('POST', `/learn/${token}/check`, { user, json: { action: 'check', question, answer } });
const act = (user: User | null, action: string, question = 'f1') => h.call('POST', `/learn/${token}/check`, { user, json: { action, question } });
const report = (user: User | null, result: unknown) => h.call('POST', `/learn/${token}/report`, { user, json: { result } });

describe('the page served to learners', () => {
  it('has the answers taken out, in the share link and so in the Link for StudyDesk', async () => {
    const r = await share([secretQuestion(), fillInTheBlank()]);
    expect(r.json.marking).toEqual({ questions: 2, skipped: [] });
    const page = (await h.call('GET', `/s/${token}`)).text;
    expect(page).not.toContain('SECRET');
    expect(page).not.toContain('"correct":true');
    expect(page).toContain('player()');
    const served = projectIn(page);
    const q = served.artboards[0].children[0].question;
    expect(q).toMatchObject({ answersOnServer: true, serverMarked: true, kind: 'single', hintTotal: 1, prompt: expect.any(String) });
    expect(q.options.map((o: { text: string }) => o.text)).toEqual(['9', '11', '15']);
    expect(served.artboards[0].children[1].question.blanks[0].answers).toEqual([]);
  });

  it('keeps the answer key on the project, and none of it in the results the owner sees', async () => {
    await share([secretQuestion()]);
    const doc = h.db.projects.docs[0] as { marking: { questions: Record<string, Question>; salt: string } };
    expect(doc.marking.questions.f1.options[1].correct).toBe(true);
    expect(doc.marking.salt).toMatch(/^[0-9a-f]{32}$/);
    await check(learnerN('own'), { selected: ['o2'] });
    const results = await h.call('GET', '/api/projects/prmark001/results', { user: ann });
    expect(JSON.stringify(results.json)).not.toContain('SECRET');
    const csv = await h.call('GET', '/api/projects/prmark001/results.csv', { user: ann });
    expect(csv.text).not.toContain('SECRET');
  });

  it('keeps the same secret when the link is updated, so ordering ids learners already have still mean the same', async () => {
    await share([secretQuestion()]);
    const salt = (h.db.projects.docs[0] as { marking: { salt: string } }).marking.salt;
    await share([secretQuestion()]);
    expect((h.db.projects.docs[0] as { marking: { salt: string } }).marking.salt).toBe(salt);
  });

  it('leaves a page with nothing set to be marked there exactly as it was', async () => {
    const plain = { ...secretQuestion(), serverMarked: undefined };
    const project = projectWith('prmark001', [plain]);
    await h.call('PUT', '/api/projects/prmark001', { user: ann, json: { project, rev: 0 } });
    const html = pageOf(project);
    const r = await h.call('PUT', '/api/projects/prmark001/share', { user: ann, body: html, type: 'text/html' });
    expect(r.json.marking).toBeNull();
    expect((await h.call('GET', `/s/${r.json.share.token}`)).text).toBe(html);
    expect((h.db.projects.docs[0] as { marking?: unknown }).marking).toBeUndefined();
  });

  it('serves a question that cannot be marked there as it is, and says so', async () => {
    const r = await share([secretQuestion(), matching()]);
    expect(r.json.marking.questions).toBe(1);
    expect(r.json.marking.skipped).toEqual([{ frame: 'f2', name: 'Question 2', reason: expect.stringMatching(/Matching/) }]);
    const served = projectIn((await h.call('GET', `/s/${token}`)).text);
    expect(served.artboards[0].children[1].question.pairs).toHaveLength(4);
  });

  it('refuses to keep a page that says it has server-marked questions but whose project cannot be read', async () => {
    const project = projectWith('prmark001', [secretQuestion()]);
    await h.call('PUT', '/api/projects/prmark001', { user: ann, json: { project, rev: 0 } });
    const r = await h.call('PUT', '/api/projects/prmark001/share', { user: ann, body: '<html><body>"serverMarked":true</body></html>', type: 'text/html' });
    expect(r.status).toBe(400);
    expect((h.db.projects.docs[0] as { share?: unknown }).share).toBeUndefined();
  });

  it('drops the answer key with the link, and when the questions stop being marked there', async () => {
    await share([secretQuestion()]);
    const project = projectWith('prmark001', [{ ...secretQuestion(), serverMarked: undefined }]);
    await h.call('PUT', '/api/projects/prmark001/share', { user: ann, body: pageOf(project), type: 'text/html' });
    expect((h.db.projects.docs[0] as { marking?: unknown }).marking).toBeUndefined();
    await share([secretQuestion()]);
    await h.call('DELETE', '/api/projects/prmark001/share', { user: ann });
    expect((h.db.projects.docs[0] as { marking?: unknown }).marking).toBeUndefined();
  });
});

describe('marking a check', () => {
  it('marks wrong then right against the key, with the question\'s own tries, score and feedback', async () => {
    await share([secretQuestion()]);
    const sam = learnerN('sam');
    const wrong = await check(sam, { selected: ['o1'] });
    expect(wrong.json).toMatchObject({ available: true, status: 'ok', marking: { correct: false, locked: false, attempts: 1, triesLeft: 1, feedback: 'Not that one' } });
    expect(JSON.stringify(wrong.json)).not.toContain('SECRET');
    const right = await check(sam, { selected: ['o2'] });
    expect(right.json.marking).toMatchObject({ correct: true, locked: true, attempts: 2, score: 4, feedback: 'SECRET-well done SECRET-prime' });
  });

  it('writes the record itself: the mark that counts, completion and the pass', async () => {
    await share([secretQuestion(), fillInTheBlank()], 50);
    const sam = learnerN('rec');
    await check(sam, { selected: ['o2'] });
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ username: 'learner-rec', course, bestScore: 4, bestMax: 6, lastScore: 4, passed: true, reports: 1 });
    expect(records()[0].completed).toBeUndefined();
    await check(sam, { values: ['secret-paris'] }, 'f2');
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ bestScore: 6, bestMax: 6, bestPercent: 100, completed: true, attemptCompleted: true, passed: true, reports: 2 });
  });

  it('marks wrong answers wrong and counts a failed question as finished', async () => {
    await share([secretQuestion()], 80);
    const sam = learnerN('fail');
    await check(sam, { selected: ['o1'] });
    const last = await check(sam, { selected: ['o3'] });
    expect(last.json.marking).toMatchObject({ locked: true, correct: false, score: 0, reveal: true });
    expect(last.json.marking.states).toEqual({ o1: '', o2: 'missed', o3: 'wrong' });
    expect(records()[0]).toMatchObject({ bestScore: 0, bestMax: 4, completed: true, passed: false });
  });

  it('ignores what the browser reports as its result', async () => {
    await share([secretQuestion()]);
    const sam = learnerN('cheat');
    await check(sam, { selected: ['o1'] });
    const r = await report(sam, { completed: true, score: 100, max: 100, percent: 100, passed: true });
    expect(r.json).toEqual({ available: true, ok: true, ignored: true });
    expect(records()[0].bestScore).toBeUndefined();
    expect(records()[0].passed).toBeFalsy();
    expect(records()[0].completed).toBeUndefined();
    //and a report from someone with no record at all makes none
    await report(learnerN('nobody'), { completed: true, score: 100, max: 100 });
    expect(records()).toHaveLength(1);
  });

  it('still takes a browser report for a project with nothing marked on the server', async () => {
    const plain = { ...secretQuestion(), serverMarked: undefined };
    const project = projectWith('prmark001', [plain]);
    await h.call('PUT', '/api/projects/prmark001', { user: ann, json: { project, rev: 0 } });
    token = (await h.call('PUT', '/api/projects/prmark001/share', { user: ann, body: pageOf(project), type: 'text/html' })).json.share.token;
    await report(learnerN('plain'), { completed: true, score: 3, max: 4 });
    expect(records()[0]).toMatchObject({ bestScore: 3, completed: true });
  });

  it('keeps the tries on the server, so a page that starts again does not get a fresh set', async () => {
    await share([secretQuestion()]);
    const sam = learnerN('tries');
    await check(sam, { selected: ['o1'] });
    expect((await act(sam, 'reset')).json.state).toMatchObject({ attempts: 1, triesLeft: 1, locked: false });
    const last = await check(sam, { selected: ['o3'] });
    expect(last.json.marking.locked).toBe(true);
    //a finished question checked again gets its finished marking back and no more tries
    const again = await check(sam, { selected: ['o2'] });
    expect(again.json).toMatchObject({ replay: true, marking: { correct: false, locked: true, attempts: 2 } });
    //starting it again is practice: the mark that counts does not move
    await act(sam, 'reset');
    const practice = await check(sam, { selected: ['o2'] });
    expect(practice.json.marking.correct).toBe(true);
    expect(records()[0]).toMatchObject({ bestScore: 0, reports: 1 });
  });

  it('gives hints from the server, in order, and counts them', async () => {
    await share([{ ...secretQuestion(), hintPenalty: 0.5, hints: ['SECRET-hint', 'SECRET-two'] }]);
    const sam = learnerN('hint');
    expect((await act(sam, 'hint')).json).toMatchObject({ status: 'ok', hint: 'SECRET-hint', state: { hintsUsed: 1, hintsLeft: 1 } });
    expect((await act(sam, 'hint')).json.hint).toBe('SECRET-two');
    expect((await act(sam, 'hint')).json.hint).toBe('');
    expect((await check(sam, { selected: ['o2'] })).json.marking.score).toBe(0);
  });

  it('does not use a try for an empty answer', async () => {
    await share([secretQuestion()]);
    const sam = learnerN('empty');
    const r = await check(sam, { selected: [] });
    expect(r.json).toMatchObject({ status: 'empty', say: 'Choose an answer first.' });
    expect(records()).toHaveLength(0);
  });

  it('turns away a question it does not know, an answer that does not fit and a request it cannot read', async () => {
    await share([secretQuestion()]);
    const sam = learnerN('bad');
    expect((await check(sam, { selected: ['o2'] }, 'nope')).status).toBe(400);
    expect((await check(sam, { selected: ['zzz'] })).status).toBe(400);
    expect((await h.call('POST', `/learn/${token}/check`, { user: sam, json: { action: 'win', question: 'f1' } })).status).toBe(400);
    expect((await h.call('POST', `/learn/${token}/check`, { user: sam, json: 'nonsense' })).status).toBe(400);
    expect(records()).toHaveLength(0);
  });

  it('has nowhere to mark without a session, and for a project with nothing marked there', async () => {
    await share([secretQuestion()]);
    expect((await check(null, { selected: ['o2'] })).json).toEqual({ available: false });
    expect(records()).toHaveLength(0);
    const plain = { ...secretQuestion(), serverMarked: undefined };
    const project = projectWith('prmark001', [plain]);
    token = (await h.call('PUT', '/api/projects/prmark001/share', { user: ann, body: pageOf(project), type: 'text/html' })).json.share.token;
    expect((await check(learnerN('x'), { selected: ['o2'] })).status).toBe(404);
  });

  it('keeps each learner and each course apart', async () => {
    await share([secretQuestion()]);
    await check(learnerN('a'), { selected: ['o2'] });
    await check(learnerN('b'), { selected: ['o1'] });
    await check({ ...learnerN('a'), course: 'PHY2000_2026_S1' }, { selected: ['o1'] });
    expect(records().map((r: any) => [r.username, r.course, r.lastScore])).toEqual([
      ['learner-a', course, 4],
      ['learner-b', course, undefined],
      ['learner-a', 'PHY2000_2026_S1', undefined],
    ]);
  });

  it('cannot be got past the tries by sending checks at the same moment', async () => {
    await share([{ ...secretQuestion(), attempts: 2 }]);
    const sam = learnerN('race');
    await check(sam, { selected: ['o1'] });
    const replies = await Promise.all(Array.from({ length: 6 }, () => check(sam, { selected: ['o1'] })));
    const marked = replies.filter((r) => r.json.status === 'ok' && !r.json.replay && r.json.marking);
    expect(marked.length).toBe(1);
    expect(replies.every((r) => ['ok', 'busy'].includes(r.json.status))).toBe(true);
    const state = JSON.parse(records()[0].marked).f1;
    expect(state.attempts).toBe(2);
    expect(records()).toHaveLength(1);
  });
});

describe('the rate limit', () => {
  it('lets a learner check 30 times a minute and then asks them to wait, for them alone', async () => {
    await share([{ ...secretQuestion(), attempts: 0 }]);
    const sam = learnerN('fast');
    let limited: { json: any } | null = null;
    for (let i = 0; i < 31; i++) {
      const r = await check(sam, { selected: ['o1'] });
      if (r.json.status === 'limited') {
        limited = r;
        expect(i).toBe(30);
        break;
      }
    }
    expect(limited?.json).toMatchObject({ available: true, status: 'limited', retryAfter: expect.any(Number) });
    expect((await act(sam, 'hint')).json.status).toBe('limited');
    //starting a question again only reads where it stands, and is not held up
    expect((await act(sam, 'reset')).json.status).toBe('ok');
    //someone else is not affected
    expect((await check(learnerN('calm'), { selected: ['o1'] })).json.status).toBe('ok');
  });
});

describe('the learner page', () => {
  it('passes a mark request from the project to the check route', async () => {
    await share([secretQuestion()]);
    const page = (await h.call('GET', `/play/${token}`)).text;
    expect(page).toContain("m.op === 'mark'");
    expect(page).toContain("call('POST', 'check'");
  });
});

describe('the bundle the server marks with', () => {
  it('is built from the player as it is now', () => {
    const head = readFileSync(new URL('../shared/marking-kit.mjs', import.meta.url), 'utf8').split('\n')[0];
    expect(head).toBe(`/*! built from the player's marking sources ${sourcesHash()} */`);
  });
  it('exports what index.js uses', () => {
    for (const name of ['stripProject', 'stepMarking', 'cleanMarkRequest', 'resultOf', 'parseStates', 'pruneStates', 'makeLimiter', 'RATE_LIMITED']) expect(kit[name], name).toBeDefined();
  });
});
