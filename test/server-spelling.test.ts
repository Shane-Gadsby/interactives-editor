// @vitest-environment node
//A spelling test end to end: the real index.js and lti13.js against the in-memory mongo stand-in, with a fake LMS (this file). The
//shared page has no spelling and no audio file name in it, the server marks the words, retakes and the kept score work, and the
//score goes to the LMS gradebook through Assignment and Grade Services: a token asked for with our signed assertion, then a score
//posted to the launch's line item.
import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
import { newQuestion, questionVars, type Question } from 'interactives-player';
// @ts-expect-error plain CommonJS shared with index.js
import audio from '../shared/audio-clean.cjs';

//The retry timer is for the real thing; a test asks for the retry itself
process.env.IX_GRADE_RETRY_MS = '0';

const realFetch = globalThis.fetch.bind(globalThis);
const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
const AGS = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
const SCORE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
const ann: User = { username: 'ann', fullName: 'Ann A' };
const root: User = { username: 'root', power: true };
const LINEITEM = 'https://lms.test/api/lineitems/7/lineitem?type_id=1';

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
const platformKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const platformJwks = { keys: [{ ...platformKey.publicKey.export({ format: 'jwk' }), kid: 'plat-1', use: 'sig', alg: 'RS256' }] };
const sign = (payload: object) => {
  const signed = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'plat-1' }))}.${b64(JSON.stringify(payload))}`;
  return `${signed}.${b64(crypto.sign('RSA-SHA256', Buffer.from(signed), platformKey.privateKey))}`;
};

const WORDS = ['colour', 'organise', 'theatre'];
const word = (w: string, n: number): Question => ({
  ...newQuestion('blank', `w${n}`),
  serverMarked: true,
  attempts: 1,
  points: 1,
  partial: false,
  reveal: true,
  prompt: 'Spell the word you hear.',
  blanks: [{ id: 'b1', label: 'Word', answers: [w], spelling: true, usSpelling: true }],
  retake: { limit: 1, keep: 'best' },
});

//An mp3 with an ID3v2 tag that names the word, a frame of "audio", and an ID3v1 tag at the back that names it too
const id3 = (title: string) => {
  const frame = Buffer.concat([Buffer.from('TIT2'), Buffer.from([0, 0, 0, title.length + 1, 0, 0, 0]), Buffer.from(title)]);
  const size = frame.length;
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]), frame]);
};
const MP3_FRAME = Buffer.alloc(200, 0xaa);
const mp3With = (title: string) => Buffer.concat([id3(title), MP3_FRAME, Buffer.from('TAG' + title.padEnd(125, '\0'))]);
const asset = (n: number, w: string) => {
  const bytes = mp3With(w);
  return { id: `as${n}`, name: `${w}.mp3`, mime: 'audio/mpeg', size: bytes.length, src: `data:audio/mpeg;base64,${bytes.toString('base64')}` };
};

const projectOf = (id: string, retake?: Question['retake']) => ({
  format: 'interactives',
  id,
  name: `Spelling ${id}`,
  settings: { reporting: { passMark: 60 } },
  assets: WORDS.map((w, i) => asset(i + 1, w)),
  variables: WORDS.map((_, i) => ({ id: `v${i}`, name: `w${i + 1}_items`, type: 'list', initial: questionVars(word('x', i + 1)).find((v) => v.suffix === 'items')!.initial })),
  artboards: [
    {
      id: 'ab1',
      name: 'Main',
      width: 800,
      height: 600,
      background: { type: 'solid', color: '#123456' },
      logic: { nodes: [], edges: [] },
      children: WORDS.map((w, i) => ({ id: `f${i + 1}`, type: 'frame', name: `Word ${i + 1}`, x: 0, y: 0, width: 100, height: 100, children: [], question: { ...word(w, i + 1), ...(retake ? { retake } : {}) } })),
    },
  ],
});
const pageOf = (project: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(project).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>player()</script></body></html>`;
const projectIn = (html: string) => JSON.parse(html.split('id="ix-project">')[1].split('</script>')[0]);

let h: Harness;
let launchURL = '';
let token = '';
let scorePosts: { url: string; auth: string; type: string; body: any }[] = [];
let tokenPosts: URLSearchParams[] = [];
let scoreStatus = 200;
let lineitemClaim: string | null = LINEITEM;

beforeAll(async () => {
  h = await startServer();
  launchURL = `${h.base}/lti13/launch`;
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  scorePosts = [];
  tokenPosts = [];
  scoreStatus = 200;
  lineitemClaim = LINEITEM;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    if (url === 'https://lms.test/jwks') return new Response(JSON.stringify(platformJwks), { status: 200 });
    if (url === 'https://lms.test/token') {
      tokenPosts.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ access_token: `tok-${tokenPosts.length}`, token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
    }
    if (url.startsWith('https://lms.test/api/lineitems/')) {
      scorePosts.push({ url, auth: init.headers.authorization, type: init.headers['content-type'], body: JSON.parse(init.body) });
      return new Response('', { status: scoreStatus });
    }
    return realFetch(input, init);
  });
  for (const c of ['projects', 'revisions', 'prefs', 'libraries', 'interactives-user-data', 'interactives-activity-user-data', 'lti13-platforms', 'lti13-state', 'lti13-sessions', 'lti13-links']) (h.db as any)[c].docs = [];
  const r = await h.call('PUT', '/api/lti13/platforms/fake-lms', {
    user: root,
    json: { name: 'Fake LMS', issuer: 'https://lms.test', clientId: 'client-1', deploymentIds: ['dep-1'], authLoginUrl: 'https://lms.test/auth', jwksUrl: 'https://lms.test/jwks', tokenUrl: 'https://lms.test/token' },
  });
  expect(r.status).toBe(200);
});
afterEach(() => vi.restoreAllMocks());

async function share(id = 'prspell001', retake?: Question['retake']) {
  const project = projectOf(id, retake);
  const put = await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project, rev: 0 } });
  expect(put.status).toBe(200);
  const r = await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: pageOf(project), type: 'text/html' });
  token = r.json.share.token;
  return r;
}

const raw = (method: string, url: string, opts: { form?: Record<string, string>; headers?: Record<string, string> } = {}) =>
  realFetch(url, { method, redirect: 'manual', headers: { ...(opts.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...opts.headers }, body: opts.form ? new URLSearchParams(opts.form).toString() : undefined });

//A whole LTI 1.3 launch of the shared project, giving back the session the learner page would send
async function launchAs(sub: string, extra: Record<string, unknown> = {}) {
  const target = `${launchURL}?t=${token}`;
  const q = new URLSearchParams({ iss: 'https://lms.test', login_hint: 'hint', target_link_uri: target, client_id: 'client-1', lti_deployment_id: 'dep-1' });
  const login = await raw('GET', `${h.base}/lti13/login?${q}`);
  const to = new URL(login.headers.get('location')!);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://lms.test',
    aud: 'client-1',
    sub,
    name: 'Lena Learner',
    iat: now,
    exp: now + 300,
    nonce: to.searchParams.get('nonce'),
    [`${CLAIM}message_type`]: 'LtiResourceLinkRequest',
    [`${CLAIM}version`]: '1.3.0',
    [`${CLAIM}deployment_id`]: 'dep-1',
    [`${CLAIM}target_link_uri`]: target,
    [`${CLAIM}resource_link`]: { id: 'rl-1' },
    [`${CLAIM}context`]: { id: 'ctx-9', label: 'ENG1000', title: 'English' },
    ...(lineitemClaim ? { [AGS]: { scope: [SCORE], lineitem: lineitemClaim, lineitems: 'https://lms.test/api/lineitems' } } : {}),
    ...extra,
  };
  const r = await raw('POST', launchURL, { form: { state: to.searchParams.get('state')!, id_token: sign(claims) }, headers: { cookie: login.headers.getSetCookie()[0].split(';')[0] } });
  expect(r.status).toBe(303);
  return r.headers.get('location')!.split('#lti=')[1];
}

const as = (sid: string) => ({ user: null, headers: { 'x-lti-session': sid } });
const check = (sid: string, n: number, typed: string) => h.call('POST', `/learn/${token}/check`, { ...as(sid), json: { action: 'check', question: `f${n}`, answer: { values: [typed] } } });
const reset = (sid: string, n: number, retake = false) => h.call('POST', `/learn/${token}/check`, { ...as(sid), json: { action: 'reset', question: `f${n}`, ...(retake ? { retake: true } : {}) } });
const round = async (sid: string, typed: string[]) => {
  let last: any = null;
  for (const [i, t] of typed.entries()) last = (await check(sid, i + 1, t)).json;
  return last;
};
//The passback is not awaited by the check, so wait for it
const until = async (what: () => boolean) => {
  for (let i = 0; i < 200 && !what(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(what()).toBe(true);
};
const record = () => (h.db as any)['interactives-user-data'].docs[0];

describe('the page served to learners', () => {
  it('has no word in it: not in the questions, the audio file names or the tags inside the audio', async () => {
    const r = await share();
    expect(r.json.marking.questions).toBe(3);
    expect(r.json.marking.audioNotes).toBeUndefined();
    const page = (await h.call('GET', `/s/${token}`)).text;
    for (const w of WORDS) expect(page.toLowerCase(), w).not.toContain(w);
    for (const w of ['colour.mp3', 'TIT2', 'TAG']) expect(page).not.toContain(w);
    const served = projectIn(page);
    expect(served.assets.map((a: any) => a.name)).toEqual(['audio-1.mp3', 'audio-2.mp3', 'audio-3.mp3']);
    //the audio itself is still there, as the frame between the tags
    expect(Buffer.from(served.assets[0].src.split(',')[1], 'base64').equals(MP3_FRAME)).toBe(true);
    const q = served.artboards[0].children[0].question;
    expect(q).toMatchObject({ answersOnServer: true, retake: { limit: 1, keep: 'best' } });
    expect(q.blanks[0].answers).toEqual([]);
  });

  it('keeps the words only on the server, on the project the owner owns', async () => {
    await share();
    const key = (h.db.projects.docs[0] as any).marking.questions;
    expect(key.f1.blanks[0].answers).toEqual(['colour']);
    const results = await h.call('GET', '/api/projects/prspell001/results', { user: ann });
    expect(JSON.stringify(results.json).toLowerCase()).not.toMatch(/colour|organise|theatre/);
  });

  it('says which audio it could not clean', async () => {
    const project = projectOf('prspell002');
    project.assets.push({ id: 'as9', name: 'word.ogg', mime: 'audio/ogg', size: 4, src: 'data:audio/ogg;base64,T2dnUw==' });
    await h.call('PUT', '/api/projects/prspell002', { user: ann, json: { project, rev: 0 } });
    const r = await h.call('PUT', '/api/projects/prspell002/share', { user: ann, body: pageOf(project), type: 'text/html' });
    expect(r.json.marking.audioNotes).toEqual([expect.stringMatching(/word\.ogg.*\.ogg file.*tags/)]);
    expect(projectIn((await h.call('GET', `/s/${r.json.share.token}`)).text).assets[3].name).toBe('audio-4.ogg');
  });

  it('leaves audio alone in a project with no spelling question', async () => {
    const project = projectOf('prspell003');
    for (const f of project.artboards[0].children) (f.question as any).blanks[0].spelling = undefined;
    await h.call('PUT', '/api/projects/prspell003', { user: ann, json: { project, rev: 0 } });
    const r = await h.call('PUT', '/api/projects/prspell003/share', { user: ann, body: pageOf(project), type: 'text/html' });
    expect(projectIn((await h.call('GET', `/s/${r.json.share.token}`)).text).assets[0].name).toBe('colour.mp3');
  });
});

describe('cleaning audio', () => {
  it('cuts the tags out of an mp3 and the extra chunks out of a wav', () => {
    expect(Buffer.from(audio.cleanMp3(new Uint8Array(mp3With('colour')))).equals(MP3_FRAME)).toBe(true);
    const chunk = (id: string, body: Buffer) => Buffer.concat([Buffer.from(id), Buffer.from(new Uint32Array([body.length]).buffer), body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    const fmt = chunk('fmt ', Buffer.alloc(16, 1));
    const data = chunk('data', Buffer.alloc(8, 2));
    const info = chunk('LIST', Buffer.concat([Buffer.from('INFO'), chunk('INAM', Buffer.from('colour\0'))]));
    const wav = (parts: Buffer[]) => {
      const body = Buffer.concat(parts);
      return Buffer.concat([Buffer.from('RIFF'), Buffer.from(new Uint32Array([4 + body.length]).buffer), Buffer.from('WAVE'), body]);
    };
    const cleaned = Buffer.from(audio.cleanWav(new Uint8Array(wav([fmt, info, data]))));
    expect(cleaned.equals(wav([fmt, data]))).toBe(true);
    expect(cleaned.includes('colour')).toBe(false);
    expect(audio.cleanWav(new Uint8Array(Buffer.from('not a wav at all')))).toBeNull();
  });
});

describe('marking the words', () => {
  it('needs an identity: no session, no marking', async () => {
    await share();
    const r = await h.call('POST', `/learn/${token}/check`, { user: null, json: { action: 'check', question: 'f1', answer: { values: ['colour'] } } });
    expect(r.json).toEqual({ available: false });
  });

  it('marks exactly, takes the American spelling, and keeps the score and the round on the learner record', async () => {
    await share();
    const sid = await launchAs('user-42');
    const a = (await check(sid, 1, 'color')).json;
    expect(a.marking).toMatchObject({ correct: true, locked: true, score: 1 });
    expect(a.state).toMatchObject({ round: 1, retakesLeft: 1, kept: 1, keptMax: 3 });
    expect((await check(sid, 2, 'organize')).json.marking.correct).toBe(true);
    const last = (await check(sid, 3, 'theatr')).json;
    expect(last.marking).toMatchObject({ correct: false, locked: true, reveal: false });
    expect(JSON.stringify(last)).not.toMatch(/theatre/);
    expect(record()).toMatchObject({ username: 'lti:fake-lms:user-42', course: 'ctx-9', lastScore: 2, lastMax: 3, completed: true });
    expect(JSON.parse(record().marked).f1.scores).toEqual([1]);
  });

  it('retakes the whole test, keeps the best round, and refuses a go past the limit', async () => {
    await share();
    const sid = await launchAs('user-42');
    await round(sid, ['colour', 'organise', 'theatr']);
    //opening a word again uses up nothing
    expect((await reset(sid, 1)).json.state).toMatchObject({ locked: true, round: 1, retakesLeft: 1 });
    expect((await reset(sid, 3, true)).json.state).toMatchObject({ locked: false, round: 2, retakesLeft: 0 });
    const r2 = await round(sid, ['x', 'y', 'z']);
    expect(r2.state).toMatchObject({ round: 2, retakesLeft: 0, kept: 2, keptMax: 3 });
    expect(record()).toMatchObject({ lastScore: 2, lastMax: 3 });
    const again = (await reset(sid, 1, true)).json;
    expect(again).toMatchObject({ say: expect.stringMatching(/no more/), state: { locked: true, round: 2 } });
    //a revealed spelling only on the last go
    expect(r2.marking).toMatchObject({ reveal: true, answers: { b1: 'theatre' } });
  });
});

describe('sending the grade to the LMS', () => {
  it('posts the score, with its maximum, to the launch line item once every word is finished', async () => {
    await share();
    const sid = await launchAs('user-42');
    await check(sid, 1, 'colour');
    await check(sid, 2, 'organise');
    await new Promise((r) => setTimeout(r, 30));
    expect(scorePosts).toHaveLength(0);
    await check(sid, 3, 'theatr');
    await until(() => scorePosts.length === 1);
    expect(scorePosts[0]).toMatchObject({
      url: 'https://lms.test/api/lineitems/7/lineitem/scores?type_id=1',
      auth: 'Bearer tok-1',
      type: 'application/vnd.ims.lis.v1.score+json',
      body: { userId: 'user-42', scoreGiven: 2, scoreMaximum: 3, activityProgress: 'Completed', gradingProgress: 'FullyGraded' },
    });
    expect(new Date(scorePosts[0].body.timestamp).getTime()).toBeGreaterThan(Date.now() - 10000);
    await until(() => record().grade?.ok === true);
    expect(record().grade).toMatchObject({ score: 2, max: 3, ok: true });
  });

  it('asks for the token with an assertion signed by our key, for the score scope only', async () => {
    await share();
    const sid = await launchAs('user-42');
    await round(sid, ['colour', 'organise', 'theatre']);
    await until(() => scorePosts.length === 1);
    const t = tokenPosts[0];
    expect(t.get('grant_type')).toBe('client_credentials');
    expect(t.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    expect(t.get('scope')).toBe(SCORE);
    const [head, payload, sig] = t.get('client_assertion')!.split('.');
    const jwks = (await h.call('GET', '/lti13/jwks')).json.keys;
    const kid = JSON.parse(Buffer.from(head, 'base64url').toString()).kid;
    const key = crypto.createPublicKey({ key: jwks.find((k: any) => k.kid === kid), format: 'jwk' });
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${head}.${payload}`), key, Buffer.from(sig, 'base64url'))).toBe(true);
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(c).toMatchObject({ iss: 'client-1', sub: 'client-1', aud: 'https://lms.test/token' });
    expect(c.exp - c.iat).toBeLessThanOrEqual(300);
    expect(c.jti).toBeTruthy();
  });

  it('reuses the token, sends a better score after a retake, and nothing when the kept score did not move', async () => {
    await share();
    const sid = await launchAs('user-42');
    await round(sid, ['colour', 'organise', 'theatr']);
    await until(() => scorePosts.length === 1);
    await reset(sid, 1, true);
    await round(sid, ['x', 'y', 'z']);
    await new Promise((r) => setTimeout(r, 50));
    expect(scorePosts).toHaveLength(1);
    expect(tokenPosts).toHaveLength(1);

    //no retake left in that one, so use a fresh learner for the better round
    const sid2 = await launchAs('user-43');
    await round(sid2, ['colr', 'y', 'z']);
    await until(() => scorePosts.length === 2);
    expect(scorePosts[1].body).toMatchObject({ userId: 'user-43', scoreGiven: 0, scoreMaximum: 3 });
    await reset(sid2, 1, true);
    await round(sid2, ['colour', 'organise', 'theatre']);
    await until(() => scorePosts.length === 3);
    expect(scorePosts[2].body).toMatchObject({ userId: 'user-43', scoreGiven: 3, scoreMaximum: 3 });
    expect(tokenPosts).toHaveLength(1);
  });

  it('sends the latest round when the test keeps that one, even when it is lower', async () => {
    await share('prspell004', { limit: -1, keep: 'latest' });
    const sid = await launchAs('user-42');
    await round(sid, ['colour', 'organise', 'theatre']);
    await until(() => scorePosts.length === 1);
    await reset(sid, 1, true);
    await round(sid, ['colour', 'x', 'y']);
    await until(() => scorePosts.length === 2);
    expect(scorePosts[1].body).toMatchObject({ scoreGiven: 1, scoreMaximum: 3 });
  });

  it('records a refusal, and sends again with the learner\'s next request', async () => {
    await share();
    const sid = await launchAs('user-42');
    scoreStatus = 500;
    await round(sid, ['colour', 'organise', 'theatre']);
    await until(() => record().grade?.ok === false);
    expect(record().grade).toMatchObject({ score: 3, max: 3, ok: false, why: expect.stringMatching(/refused the score \(status 500\)/) });
    scoreStatus = 200;
    //the same failure is not hammered: opening a page straight away leaves it for later
    const before = scorePosts.length;
    await reset(sid, 1);
    await new Promise((r) => setTimeout(r, 40));
    expect(scorePosts.length).toBe(before);
    (h.db as any)['interactives-user-data'].docs[0].grade.at = new Date(Date.now() - 60000);
    await reset(sid, 1);
    await until(() => record().grade?.ok === true);
    expect(scorePosts.length).toBe(before + 1);
  });

  it('sends nothing when the launch had no line item, and nothing for a learner who is not over LTI 1.3', async () => {
    await share();
    lineitemClaim = null;
    const sid = await launchAs('user-42');
    await round(sid, ['colour', 'organise', 'theatre']);
    await new Promise((r) => setTimeout(r, 50));
    expect(scorePosts).toHaveLength(0);
    expect(tokenPosts).toHaveLength(0);
    expect(record()).toMatchObject({ completed: true });

    const suite: User = { username: 'stud', fullName: 'Stud', course: 'ENG1000' };
    for (const [i, t] of WORDS.entries()) await h.call('POST', `/learn/${token}/check`, { user: suite, json: { action: 'check', question: `f${i + 1}`, answer: { values: [t] } } });
    await new Promise((r) => setTimeout(r, 50));
    expect(scorePosts).toHaveLength(0);
  });

  it('does not send a score the platform has no scope for, or to a line item that is not https', async () => {
    await share();
    const sid = await launchAs('user-42', { [AGS]: { scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'], lineitem: LINEITEM } });
    await round(sid, ['colour', 'organise', 'theatre']);
    const sid2 = await launchAs('user-43', { [AGS]: { scope: [SCORE], lineitem: 'http://lms.test/api/lineitems/7/lineitem' } });
    await round(sid2, ['colour', 'organise', 'theatre']);
    await new Promise((r) => setTimeout(r, 50));
    expect(scorePosts).toHaveLength(0);
  });

  it('is not fooled by what the page says: a reported score is still ignored', async () => {
    await share();
    const sid = await launchAs('user-42');
    const r = await h.call('POST', `/learn/${token}/report`, { ...as(sid), json: { result: { completed: true, score: 3, max: 3 } } });
    expect(r.json).toMatchObject({ ignored: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(scorePosts).toHaveLength(0);
  });
});

describe('deep linking a graded project', () => {
  it('asks the course for a grade item for a project the server marks, and not for one it does not', async () => {
    await share('prspell005');
    const plain = projectOf('prplain01');
    for (const f of plain.artboards[0].children) (f.question as any).serverMarked = undefined;
    await h.call('PUT', '/api/projects/prplain01', { user: ann, json: { project: plain, rev: 0 } });
    const plainToken = (await h.call('PUT', '/api/projects/prplain01/share', { user: ann, body: pageOf(plain), type: 'text/html' })).json.share.token;
    await h.call('PUT', '/api/lti13/links', { user: root, json: { platform: 'fake-lms', sub: 'user-42', username: 'ann' } });
    const q = new URLSearchParams({ iss: 'https://lms.test', login_hint: 'hint', target_link_uri: launchURL, client_id: 'client-1', lti_deployment_id: 'dep-1' });
    const login = await raw('GET', `${h.base}/lti13/login?${q}`);
    const to = new URL(login.headers.get('location')!);
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: 'https://lms.test', aud: 'client-1', sub: 'user-42', iat: now, exp: now + 300, nonce: to.searchParams.get('nonce'),
      [`${CLAIM}message_type`]: 'LtiDeepLinkingRequest', [`${CLAIM}version`]: '1.3.0', [`${CLAIM}deployment_id`]: 'dep-1', [`${CLAIM}target_link_uri`]: launchURL,
      'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': { deep_link_return_url: 'https://lms.test/return', accept_types: ['ltiResourceLink'], accept_multiple: true },
    };
    const page = await (await raw('POST', launchURL, { form: { state: to.searchParams.get('state')!, id_token: sign(claims) }, headers: { cookie: login.headers.getSetCookie()[0].split(';')[0] } })).text();
    const sid = /name="sid" value="([^"]+)"/.exec(page)![1];
    const form = new URLSearchParams();
    form.append('sid', sid);
    form.append('project', token);
    form.append('project', plainToken);
    const back = await (await realFetch(`${h.base}/lti13/pick`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })).text();
    const jwt = /name="JWT" value="([^"]+)"/.exec(back)![1];
    const items = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'];
    const graded = items.find((i: any) => i.url.endsWith(token));
    const ungraded = items.find((i: any) => i.url.endsWith(plainToken));
    expect(graded.lineItem).toMatchObject({ scoreMaximum: 100, label: 'Spelling prspell005', resourceId: token });
    expect(ungraded.lineItem).toBeUndefined();
  });
});
