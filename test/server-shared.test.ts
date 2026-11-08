// @vitest-environment node
//Shared responses: the real index.js against the in-memory mongo stand-in. A shared page declares its sources when it is shared, and
//the learner routes hold to that: identity off the session, a class is a project + course, counts come back and never names, limits and
//the blocklist are the owner's, a person's Only me answers stay apart from the class's, and only the owner (or a power user) can hide,
//remove or clear.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { cleanDeclaration, declaredShared, effectiveWho, planAdd, planWithdraw, tally, valueFor } from '../shared/responses.mjs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const pat: User = { username: 'pat', fullName: 'Pat Power', power: true };
const sam: User = { username: 'sam', fullName: 'Sam S', course: 'MAT1000_2026_S1' };
const lee: User = { username: 'lee', fullName: 'Lee L', course: 'MAT1000_2026_S1' };
const kim: User = { username: 'kim', fullName: 'Kim K', course: 'MAT1000_2026_S1' };
const lee2: User = { username: 'lee', fullName: 'Lee L', course: 'PHY2000_2026_S1' };

const ABOUT = (extra: Record<string, unknown> = {}) => ({ id: 'ds1', name: 'responses', kind: 'json', source: 'shared', shared: { who: 'class', maxLength: 20, perPerson: 3, minCount: 1, blocked: ['spam'], ...extra } });

const project = (id: string, sources: unknown[] = [ABOUT()]) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, dataSources: sources, artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [], timelines: [], logic: { nodes: [], edges: [] } }], variables: [], scripts: [], assets: [], fonts: [] });
const pageOf = (p: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>player()</script></body></html>`;

let h: Harness;
let token = '';
const PID = 'prshared001';

beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

async function shareWith(sources: unknown[] = [ABOUT()]) {
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['interactives-user-data'], h.db['shared-responses'], h.db['shared-hidden'], h.db.audit]) c.docs = [];
  await h.call('PUT', `/api/projects/${PID}`, { user: ann, json: { project: project(PID, sources), rev: 0 } });
  const r = await h.call('PUT', `/api/projects/${PID}/share`, { user: ann, body: pageOf(project(PID, sources)), type: 'text/plain' });
  token = r.json.share.token;
  return r;
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  await shareWith();
});

const read = (user: User | null, who = 'class', src = 'ds1', t = token) => h.call('GET', `/learn/${t}/shared/${src}?who=${who}`, { user });
const add = (user: User | null, answers: unknown, who = 'class', src = 'ds1', t = token) => h.call('POST', `/learn/${t}/shared/${src}`, { user, json: { who, answers } });
const take = (user: User | null, answers?: unknown, who = 'class', src = 'ds1') => h.call('POST', `/learn/${token}/shared/${src}/withdraw`, { user, json: { who, answers } });
const rows = () => h.db['shared-responses'].docs;
const texts = (r: { json: any }) => r.json.value.answers.map((a: any) => [a.text, a.count]);

describe('the declaration', () => {
  it('is kept on the share record when the page is shared, with the settings in range and no sample answers', async () => {
    const r = await shareWith([ABOUT({ maxLength: 9999, perPerson: 0, sample: ['x'], whoVariable: 'v1' })]);
    expect(r.json.share.shared).toEqual({ ds1: { who: 'class', byVariable: true, maxLength: 120, perPerson: 1, minCount: 1, blocked: ['spam'], name: 'responses' } });
  });

  it('is absent for a page with no shared source', async () => {
    const r = await shareWith([]);
    expect(r.json.share.shared).toBeUndefined();
    expect((await read(sam)).status).toBe(404);
  });

  it('reads sources out of a page, and only well formed ones', () => {
    expect(declaredShared('<html>nothing</html>')).toEqual({});
    expect(Object.keys(declaredShared(pageOf(project('x', [ABOUT(), { ...ABOUT(), id: 'bad id!' }, { id: 'f', name: 'f', source: 'url' }]))))).toEqual(['ds1']);
    expect(declaredShared('<script id="ix-project">{broken "source":"shared"</script>')).toEqual({});
    expect(cleanDeclaration(undefined)).toMatchObject({ who: 'class', perPerson: 5, maxLength: 40 });
  });

  it('a project shared before the feature has none, so its routes say so', async () => {
    h.db.projects.docs.forEach((d: any) => delete d.share.shared);
    const r = await read(sam);
    expect(r.status).toBe(404);
    expect(r.json.error).toMatch(/share it again/i);
  });

  it('survives a revert to the previous page', async () => {
    const withTwo = await h.call('PUT', `/api/projects/${PID}/share`, { user: ann, body: pageOf(project(PID, [ABOUT(), { ...ABOUT(), id: 'ds2', name: 'second' }])), type: 'text/plain' });
    expect(Object.keys(withTwo.json.share.shared)).toEqual(['ds1', 'ds2']);
    const back = await h.call('POST', `/api/projects/${PID}/share/revert`, { user: ann });
    expect(Object.keys(back.json.share.shared)).toEqual(['ds1']);
  });
});

describe('adding and reading', () => {
  it('starts empty, then counts what people add, never naming them', async () => {
    expect((await read(sam)).json).toMatchObject({ available: true, ok: true, value: { ready: true, who: 'class', answers: [], left: 3, limit: 3, people: 0 } });
    expect((await add(sam, ['Focus', 'sleep'])).json).toMatchObject({ ok: true, kept: 2 });
    await add(lee, ['focus ']);
    await add(kim, ['FOCUS', 'coffee']);
    const r = await read(sam);
    expect(texts(r)).toEqual([['Focus', 3], ['coffee', 1], ['sleep', 1]]);
    expect(r.json.value).toMatchObject({ total: 5, people: 3, mine: ['Focus', 'sleep'], left: 1 });
    expect(JSON.stringify(r.json)).not.toMatch(/"(sam|lee|kim)"|username/);
  });

  it('keeps one list per person per course, and a class is a course', async () => {
    await add(lee, ['shared word']);
    await add(lee2, ['other course']);
    await add(sam, ['shared word']);
    expect(rows()).toHaveLength(3);
    expect(texts(await read(sam))).toEqual([['shared word', 2]]);
    expect(texts(await read(lee2))).toEqual([['other course', 1]]);
  });

  it('takes who from the session, never the request', async () => {
    await add(sam, ['mine']);
    expect(rows()[0]).toMatchObject({ username: 'sam', course: 'MAT1000_2026_S1', source: 'ds1' });
    //a body that claims to be someone else is just a body
    const r = await h.call('POST', `/learn/${token}/shared/ds1`, { user: lee, json: { who: 'class', answers: ['x'], username: 'sam', course: 'PHY2000_2026_S1' } });
    expect(r.json.kept).toBe(1);
    expect(rows().find((d: any) => d.username === 'lee')).toMatchObject({ course: 'MAT1000_2026_S1' });
    expect(rows().find((d: any) => d.username === 'sam').answers.map((a: any) => a.text)).toEqual(['mine']);
  });

  it('says it is not available with no session, and nothing is written', async () => {
    expect((await read(null)).json).toEqual({ available: false });
    expect((await add(null, ['x'])).json).toEqual({ available: false });
    expect(rows()).toHaveLength(0);
  });

  it('is a 404 for a source the page never declared, and for a token that is not a share', async () => {
    expect((await read(sam, 'class', 'nope')).status).toBe(404);
    expect((await add(sam, ['x'], 'class', 'nope')).status).toBe(404);
    expect((await read(sam, 'class', 'ds1', 'a'.repeat(20))).status).toBe(404);
    expect((await read(sam, 'class', 'ds1', 'short')).status).toBe(404);
  });

  it('counts a repeat from one person once', async () => {
    await add(sam, ['same']);
    expect((await add(sam, ['Same', ' same '])).json.kept).toBe(0);
    await add(lee, ['same']);
    expect(texts(await read(sam))).toEqual([['same', 2]]);
  });
});

describe('limits', () => {
  it('cuts an answer to the length and drops control characters', async () => {
    await add(sam, ['x'.repeat(50)]);
    await add(lee, ['hello\u0000\u200b   world']);
    const answers = (await read(sam)).json.value.answers.map((a: any) => a.text);
    expect(answers).toContain('x'.repeat(20));
    expect(answers).toContain('hello world');
  });

  it('holds a person to their allowance and says so', async () => {
    const r = await add(sam, ['a', 'b', 'c', 'd', 'e']);
    expect(r.json).toMatchObject({ kept: 3, value: { left: 0, problem: 'full', mine: ['a', 'b', 'c'] } });
    expect((await add(sam, ['f'])).json).toMatchObject({ kept: 0, value: { problem: 'full' } });
    expect(rows()[0].answers).toHaveLength(3);
  });

  it('ignores empty and wrongly typed answers', async () => {
    expect((await add(sam, ['', '   ', null, { a: 1 }, [], 7])).json.kept).toBe(1);
    expect((await add(sam, 'a single text')).json.kept).toBe(1);
    expect((await add(sam, undefined)).json.kept).toBe(0);
  });

  it('refuses a huge body', async () => {
    const r = await h.call('POST', `/learn/${token}/shared/ds1`, { user: sam, json: { answers: ['x'.repeat(10000)] } });
    expect(r.status).toBe(413);
  });

  it('slows someone who adds too fast, and still answers', async () => {
    const quick: User = { username: 'quick', course: 'MAT1000_2026_S1' };
    let busy = 0;
    for (let i = 0; i < 40; i++) {
      const r = await add(quick, [`w${i}`]);
      if (r.json.value.problem === 'busy') busy++;
    }
    expect(busy).toBeGreaterThan(0);
    expect(rows().find((d: any) => d.username === 'quick').answers.length).toBeLessThanOrEqual(3);
  });
});

describe('moderation by the author', () => {
  it('refuses blocked words as whole words and says why', async () => {
    const r = await add(sam, ['Spam', 'you spam you', 'spamalot', 'class']);
    expect(r.json).toMatchObject({ kept: 2, value: { problem: 'blocked', mine: ['spamalot', 'class'] } });
  });

  it('does not show an answer until enough people gave it', async () => {
    await shareWith([ABOUT({ minCount: 2 })]);
    await add(sam, ['rare', 'common']);
    await add(lee, ['common']);
    const r = await read(kim);
    expect(texts(r)).toEqual([['common', 2]]);
    //the giver still sees their own list, so the page can say what they added
    expect((await read(sam)).json.value.mine).toEqual(['rare', 'common']);
  });

  it('a word blocked after people added it stops showing', async () => {
    await add(sam, ['later']);
    h.db.projects.docs.forEach((d: any) => (d.share.shared.ds1.blocked = ['later']));
    expect((await read(lee)).json.value.answers).toEqual([]);
  });
});

describe('Only me and the class', () => {
  it('keeps what a person adds for themselves apart from what the class sees', async () => {
    await shareWith([ABOUT({ who: 'me' })]);
    await add(sam, ['private thought']);
    await add(lee, ['mine too']);
    expect(texts(await read(sam))).toEqual([['private thought', 1]]);
    expect((await read(sam)).json.value).toMatchObject({ who: 'me', people: 1, mine: ['private thought'] });
    expect(rows()[0].own).toBeTruthy();
    expect(rows()[0].answers).toBeUndefined();
  });

  it('a fixed setting wins over what the page asks for', async () => {
    await shareWith([ABOUT({ who: 'me' })]);
    await add(sam, ['quiet']);
    const r = await read(lee, 'class');
    expect(r.json.value).toMatchObject({ who: 'me', answers: [] });
    expect(effectiveWho({ byVariable: false, who: 'me' }, 'class')).toBe('me');
  });

  it('switches by the page\'s variable when the source hangs on one, and the two never mix', async () => {
    await shareWith([ABOUT({ whoVariable: 'vwho', who: 'class' })]);
    await add(sam, ['solo'], 'me');
    await add(sam, ['together'], 'class');
    await add(lee, ['crowd'], 'class');
    expect(texts(await read(sam, 'me'))).toEqual([['solo', 1]]);
    expect(texts(await read(sam, 'class'))).toEqual([['crowd', 1], ['together', 1]]);
    //flipping a project to the class later does not reveal what was kept for oneself
    expect(texts(await read(lee, 'class')).flat()).not.toContain('solo');
    expect(effectiveWho({ byVariable: true, who: 'class' }, 'me')).toBe('me');
    expect(effectiveWho({ byVariable: true, who: 'class' }, 'rubbish')).toBe('class');
  });
});

describe('taking answers back', () => {
  it('takes one of a person\'s answers, or all of theirs, and nobody else\'s', async () => {
    await add(sam, ['one', 'two']);
    await add(lee, ['one']);
    expect(texts((await take(sam, 'ONE')).json && await read(kim))).toEqual([['one', 1], ['two', 1]]);
    expect((await take(sam)).json.value.mine).toEqual([]);
    expect(texts(await read(kim))).toEqual([['one', 1]]);
  });

  it('only touches the caller\'s own list, whatever the request says', async () => {
    await add(sam, ['keep me']);
    await h.call('POST', `/learn/${token}/shared/ds1/withdraw`, { user: lee, json: { answers: ['keep me'], username: 'sam' } });
    expect(texts(await read(kim))).toEqual([['keep me', 1]]);
  });
});

describe('what the owner sees and does', () => {
  const view = (user: User | null = ann) => h.call('GET', `/api/projects/${PID}/shared`, { user });
  const hide = (text: string, hidden = true, course = 'MAT1000_2026_S1', user: User | null = ann) => h.call('PUT', `/api/projects/${PID}/shared/ds1/hidden`, { user, json: { text, hidden, course } });
  const remove = (body: Record<string, unknown>, user: User | null = ann) => h.call('DELETE', `/api/projects/${PID}/shared/ds1/answers`, { user, json: body });

  beforeEach(async () => {
    await add(sam, ['alpha', 'beta']);
    await add(lee, ['alpha']);
    await add(lee2, ['elsewhere']);
  });

  it('lists each course with every answer and its count, and what is not showing', async () => {
    //words the owner blocks after people added them are still listed, marked, so they can be cleared
    await add(lee, ['spamish']);
    h.db.projects.docs.forEach((d: any) => (d.share.shared.ds1.blocked = ['spamish']));
    const r = await view();
    const [src] = r.json.sources;
    expect(src).toMatchObject({ source: 'ds1', name: 'responses', declared: { who: 'class', blocked: ['spamish'] } });
    const mat = src.courses.find((c: any) => c.course === 'MAT1000_2026_S1');
    expect(mat.people).toBe(2);
    expect(mat.answers.map((a: any) => [a.text, a.count, a.shown, a.blocked])).toEqual([['alpha', 2, true, false], ['beta', 1, true, false], ['spamish', 1, false, true]]);
    expect(src.courses.map((c: any) => c.course)).toEqual(['MAT1000_2026_S1', 'PHY2000_2026_S1'].sort());
    expect(JSON.stringify(r.json)).not.toMatch(/"username"|"sam"|"lee"/);
  });

  it('hides an answer from the class, and brings it back', async () => {
    await shareWith();
    await add(sam, ['alpha', 'beta']);
    expect((await hide('Alpha')).json).toMatchObject({ ok: true, hidden: true });
    expect(texts(await read(kim)).map((t: any) => t[0])).toEqual(['beta']);
    //another course is its own class
    await add(lee2, ['alpha']);
    expect(texts(await read(lee2))).toEqual([['alpha', 1]]);
    expect((await hide('alpha', false)).json.hidden).toBe(false);
    expect(texts(await read(kim)).map((t: any) => t[0])).toEqual(['alpha', 'beta']);
  });

  it('removes an answer from everyone\'s lists, in that course only', async () => {
    expect((await remove({ text: 'alpha', course: 'MAT1000_2026_S1' })).json).toMatchObject({ ok: true, people: 2 });
    expect(texts(await read(kim)).map((t: any) => t[0])).toEqual(['beta']);
    await add(lee2, ['alpha']);
    expect(texts(await read(lee2)).map((t: any) => t[0])).toEqual(['elsewhere', 'alpha'].sort());
  });

  it('clears a course, and leaves what people kept for themselves', async () => {
    await shareWith([ABOUT({ whoVariable: 'vwho' })]);
    await add(sam, ['for me'], 'me');
    await add(sam, ['for all'], 'class');
    await add(lee, ['for all too'], 'class');
    expect((await remove({ course: 'MAT1000_2026_S1' })).json.ok).toBe(true);
    expect((await read(kim, 'class')).json.value.answers).toEqual([]);
    expect((await read(sam, 'me')).json.value.mine).toEqual(['for me']);
    expect((await read(sam, 'class')).json.value.mine).toEqual([]);
    //the person can add again afterwards
    expect((await add(sam, ['again'], 'class')).json.kept).toBe(1);
  });

  it('is the owner\'s call, or a power user\'s, and not a collaborator\'s or a stranger\'s', async () => {
    const stranger: User = { username: 'zed' };
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await view(stranger)).status).toBe(403);
    expect((await hide('alpha', true, 'MAT1000_2026_S1', stranger)).status).toBe(403);
    expect((await remove({ course: 'MAT1000_2026_S1' }, stranger)).status).toBe(403);
    await h.call('POST', `/api/projects/${PID}/collaborators`, { user: ann, json: { username: 'cole', name: 'Cole' } });
    const cole: User = { username: 'cole' };
    expect((await view(cole)).status).toBe(403);
    expect((await view(pat)).status).toBe(200);
    expect((await remove({ text: 'beta', course: 'MAT1000_2026_S1' }, pat)).json.ok).toBe(true);
    expect(texts(await read(kim)).map((t: any) => t[0])).not.toContain('beta');
    process.env.SUITE_SESSION_ENFORCE = '';
  });

  it('asks which answer to hide, and answers 404 for a source the page never declared', async () => {
    expect((await hide('')).status).toBe(400);
    expect((await h.call('PUT', `/api/projects/${PID}/shared/zzz/hidden`, { user: ann, json: { text: 'x' } })).status).toBe(404);
    expect((await h.call('GET', `/api/projects/prnone0001/shared`, { user: ann })).status).toBe(404);
  });

  it('writes what the owner did to the audit log', async () => {
    await hide('alpha');
    await remove({ course: 'MAT1000_2026_S1' });
    const events = h.db.audit.docs.map((d: any) => d.event);
    expect(events).toContain('shared-hide');
    expect(events).toContain('shared-cleared');
  });
});

describe('what happens to the answers with the project', () => {
  it('goes when the project is deleted for good', async () => {
    await add(sam, ['x']);
    await h.call('PUT', `/api/projects/${PID}`, { user: ann, json: { project: project(PID), rev: 1 } });
    await h.call('DELETE', `/api/projects/${PID}`, { user: ann });
    const bin = await h.call('DELETE', `/api/bin/${PID}`, { user: ann });
    expect(bin.status).toBe(200);
    expect(rows()).toHaveLength(0);
  });

  it('is gone from the learner routes once the share link is off', async () => {
    await add(sam, ['x']);
    await h.call('DELETE', `/api/projects/${PID}/share`, { user: ann });
    expect((await read(sam)).status).toBe(404);
  });
});

describe('the counting rules', () => {
  const declared = { who: 'class', byVariable: false, maxLength: 20, perPerson: 2, minCount: 1, blocked: [] };

  it('plans an add and a withdraw', () => {
    const a = planAdd([{ text: 'a' }], ['A', 'b', 'c'], declared);
    expect(a.list.map((x: any) => x.text)).toEqual(['a', 'b']);
    expect(a).toMatchObject({ kept: 1, problem: 'full' });
    expect(planWithdraw(a.list, ['B'], declared).map((x: any) => x.text)).toEqual(['a']);
    expect(planWithdraw(a.list, undefined, declared)).toEqual([]);
  });

  it('gives people the same value whichever route made it', () => {
    const v = valueFor({ declared, who: 'class', docs: [{ answers: [{ text: 'x' }] }, { answers: [{ text: 'x' }, { text: 'y' }] }], mine: ['x'], hidden: new Set(['y']) });
    expect(v).toMatchObject({ ready: true, total: 2, people: 2, left: 1, limit: 2 });
    expect(v.answers).toEqual([{ text: 'x', count: 2, weight: 2 }]);
    expect(tally([['a'], ['b']], { minCount: 2 })).toEqual([]);
  });
});

describe('the learner page passes the player\'s requests on', () => {
  it('turns the player\'s shared messages into the shared routes, with the session id and the source named', async () => {
    const { JSDOM } = await import('jsdom');
    const page = (await h.call('GET', `/play/${token}`)).text;
    const calls: { url: string; method: string; body: any; headers: Record<string, string> }[] = [];
    const dom = new JSDOM(page, {
      url: 'http://127.0.0.1/interactives/play/x?sessionID=abc',
      runScripts: 'dangerously',
      beforeParse(win: any) {
        win.fetch = async (url: string, init: any) => {
          calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
          return { ok: true, status: 200, json: async () => ({ available: true, ok: true, kept: 1, value: { ready: true, answers: [{ text: 'x', count: 1, weight: 1 }] } }) };
        };
      },
    });
    const win: any = dom.window;
    const frame = win.document.getElementById('project');
    const replies: any[] = [];
    //the player's frame is where the page sends its answers
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: (m: any) => replies.push(m) } });
    //the page only listens to its own frame
    const send = (m: Record<string, unknown>) => {
      const ev = new win.MessageEvent('message', { data: { source: 'interactives-progress', ...m }, source: frame.contentWindow });
      win.dispatchEvent(ev);
    };
    send({ op: 'shared-read', rid: 'r1', sharedSource: 'ds1', who: 'class' });
    send({ op: 'shared-add', rid: 'r2', sharedSource: 'ds1', who: 'class', answers: ['x'] });
    send({ op: 'shared-withdraw', rid: 'r3', sharedSource: 'ds1', who: 'me', answers: ['x'] });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.map((c) => [c.method, c.url.replace(/^.*\/learn\//, '')])).toEqual([
      ['GET', `${token}/shared/ds1?who=class`],
      ['POST', `${token}/shared/ds1`],
      ['POST', `${token}/shared/ds1/withdraw`],
    ]);
    expect(calls[1].body).toEqual({ who: 'class', answers: ['x'] });
    expect(calls[0].headers['X-Session-ID']).toBe('abc');
    expect(replies.map((r) => [r.rid, r.ok, r.available])).toEqual([['r1', true, true], ['r2', true, true], ['r3', true, true]]);
    expect(replies[1].data).toMatchObject({ kept: 1, ready: true });
    delete frame.contentWindow;
    win.close();
  });
});
