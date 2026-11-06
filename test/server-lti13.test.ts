// @vitest-environment node
//LTI 1.3: the real index.js and lti13.js against the in-memory mongo stand-in, with a fake platform. The platform here is
//this file: a key pair it made, a JWKS it serves (through a fetch spy), and id_tokens it signs by hand.
import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';

const realFetch = globalThis.fetch.bind(globalThis);
const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
const DL = 'https://purl.imsglobal.org/spec/lti-dl/claim/';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob', fullName: 'Bob B' };
const root: User = { username: 'root', power: true };

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
const makeKey = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sign = (payload: object, key: crypto.KeyObject, header: object = { alg: 'RS256', typ: 'JWT', kid: 'plat-1' }) => {
  const signed = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  return `${signed}.${b64(crypto.sign('RSA-SHA256', Buffer.from(signed), key))}`;
};

const platformKey = makeKey();
const otherKey = makeKey();
const platformJwks = { keys: [{ ...platformKey.publicKey.export({ format: 'jwk' }), kid: 'plat-1', use: 'sig', alg: 'RS256' }] };

const project = (id: string) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [] }] });

let h: Harness;
let launchURL = '';
let tokenA = '';
let tokenB = '';
let tokenBob = '';
let jwksFetches = 0;

const share = async (id: string, user: User) => {
  await h.call('PUT', `/api/projects/${id}`, { user, json: { project: project(id), rev: 0 } });
  return (await h.call('PUT', `/api/projects/${id}/share`, { user, body: '<html><body>shared</body></html>', type: 'text/plain' })).json.share.token as string;
};

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
  jwksFetches = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    if (String(input) === 'https://lms.test/jwks') {
      jwksFetches++;
      return new Response(JSON.stringify(platformJwks), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(input, init);
  });
  for (const c of ['projects', 'revisions', 'prefs', 'libraries', 'interactives-user-data', 'interactives-activity-user-data', 'lti13-platforms', 'lti13-state', 'lti13-sessions', 'lti13-links']) (h.db as any)[c].docs = [];
  tokenA = await share('prlti13a01', ann);
  tokenB = await share('prlti13b01', ann);
  tokenBob = await share('prlti13c01', bob);
  //an unshared project of ann's
  await h.call('PUT', '/api/projects/prlti13d01', { user: ann, json: { project: project('prlti13d01'), rev: 0 } });
  const r = await h.call('PUT', '/api/lti13/platforms/fake-lms', {
    user: root,
    json: { name: 'Fake LMS', issuer: 'https://lms.test', clientId: 'client-1', deploymentIds: ['dep-1'], authLoginUrl: 'https://lms.test/auth', jwksUrl: 'https://lms.test/jwks', tokenUrl: 'https://lms.test/token' },
  });
  expect(r.status).toBe(200);
});
afterEach(() => {
  vi.restoreAllMocks();
});

//The browser's side: manual redirects, so the Location is visible
const raw = (method: string, url: string, opts: { form?: Record<string, string>; headers?: Record<string, string> } = {}) =>
  realFetch(url, { method, redirect: 'manual', headers: { ...(opts.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...opts.headers }, body: opts.form ? new URLSearchParams(opts.form).toString() : undefined });

const startLogin = async (extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ iss: 'https://lms.test', login_hint: 'hint-1', target_link_uri: `${launchURL}?t=${tokenA}`, lti_message_hint: 'mh', client_id: 'client-1', lti_deployment_id: 'dep-1', ...extra });
  const res = await raw('GET', `${h.base}/lti13/login?${q}`);
  return { res, status: res.status, location: res.headers.get('location') ?? '', cookies: res.headers.getSetCookie() };
};

//A whole OIDC login, ready to launch with
const login = async (extra: Record<string, string> = {}) => {
  const l = await startLogin(extra);
  expect(l.status).toBe(302);
  const to = new URL(l.location);
  const state = to.searchParams.get('state')!;
  const nonce = to.searchParams.get('nonce')!;
  const cookie = l.cookies[0].split(';')[0];
  return { state, nonce, cookie, target: extra.target_link_uri ?? `${launchURL}?t=${tokenA}` };
};

const claims = (l: { nonce: string; target: string }, over: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://lms.test',
    aud: 'client-1',
    sub: 'user-42',
    name: 'Lena Learner',
    iat: now,
    exp: now + 300,
    nonce: l.nonce,
    [`${CLAIM}message_type`]: 'LtiResourceLinkRequest',
    [`${CLAIM}version`]: '1.3.0',
    [`${CLAIM}deployment_id`]: 'dep-1',
    [`${CLAIM}target_link_uri`]: l.target,
    [`${CLAIM}resource_link`]: { id: 'rl-1' },
    [`${CLAIM}roles`]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    [`${CLAIM}context`]: { id: 'ctx-9', label: 'MAT1000', title: 'Maths one' },
    ...over,
  };
};

const launch = (l: { state: string; cookie: string }, idToken: string, over: { state?: string; cookie?: string | null } = {}) =>
  raw('POST', launchURL, { form: { state: over.state ?? l.state, id_token: idToken }, headers: over.cookie === null ? {} : { cookie: over.cookie ?? l.cookie } });

const body = async (r: Response) => (await r.text()).slice(0, 4000);

describe('registering the platform', () => {
  it('is for power users, and refuses anything that is not usable', async () => {
    const fields = { name: 'X', issuer: 'https://other.test', clientId: 'c', deploymentIds: ['d'], authLoginUrl: 'https://other.test/auth', jwksUrl: 'https://other.test/jwks' };
    expect((await h.call('PUT', '/api/lti13/platforms/other', { user: ann, json: fields })).status).toBe(403);
    expect((await h.call('PUT', '/api/lti13/platforms/other', { user: root, json: { ...fields, jwksUrl: 'http://other.test/jwks' } })).status).toBe(400);
    expect((await h.call('PUT', '/api/lti13/platforms/other', { user: root, json: { ...fields, authLoginUrl: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await h.call('PUT', '/api/lti13/platforms/other', { user: root, json: { ...fields, deploymentIds: [] } })).status).toBe(400);
    expect((await h.call('PUT', '/api/lti13/platforms/Bad Id', { user: root, json: fields })).status).toBe(400);
    expect((await h.call('PUT', '/api/lti13/platforms/other', { user: root, json: fields })).status).toBe(200);
    //the same issuer and client id twice is a mistake
    expect((await h.call('PUT', '/api/lti13/platforms/other-again', { user: root, json: fields })).status).toBe(409);
  });

  it('tells the platform admin what to enter, and never shows a private key', async () => {
    expect((await h.call('GET', '/api/lti13', { user: ann })).status).toBe(403);
    const r = await h.call('GET', '/api/lti13', { user: root });
    expect(r.json.urls).toMatchObject({ login: `${h.base}/lti13/login`, launch: launchURL, jwks: `${h.base}/lti13/jwks`, deepLinking: launchURL });
    expect(r.json.platforms.map((p: any) => p._id)).toEqual(['fake-lms']);
    expect(r.json.keys).toHaveLength(1);
    expect(r.text).not.toMatch(/PRIVATE KEY|privatePem/);
  });
});

describe('our keys', () => {
  it('serves public keys only, made on first start', async () => {
    const r = await h.call('GET', '/lti13/jwks');
    expect(r.status).toBe(200);
    expect(r.json.keys).toHaveLength(1);
    expect(r.json.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
    expect(r.json.keys[0].d).toBeUndefined();
    expect(r.text).not.toMatch(/PRIVATE KEY/);
    const stored = (h.db as any)['lti13-keys'].docs[0];
    expect(stored.privatePem).toContain('PRIVATE KEY');
  });

  it('rotates: a new key signs, the old one stays published until deleted, the signing one cannot be deleted', async () => {
    const first = (await h.call('GET', '/lti13/jwks')).json.keys[0].kid;
    const rotated = await h.call('POST', '/api/lti13/keys/rotate', { user: root });
    expect(rotated.status).toBe(200);
    const kids = (await h.call('GET', '/lti13/jwks')).json.keys.map((k: any) => k.kid);
    expect(kids).toHaveLength(2);
    expect(kids).toContain(first);
    expect((await h.call('DELETE', `/api/lti13/keys/${rotated.json.kid}`, { user: root })).status).toBe(409);
    expect((await h.call('DELETE', `/api/lti13/keys/${first}`, { user: root })).status).toBe(200);
    expect((await h.call('GET', '/lti13/jwks')).json.keys.map((k: any) => k.kid)).toEqual([rotated.json.kid]);
  });
});

describe('login initiation', () => {
  it('sends the browser to the platform with a state, a nonce and a cookie for that state', async () => {
    const l = await startLogin();
    expect(l.status).toBe(302);
    const to = new URL(l.location);
    expect(`${to.origin}${to.pathname}`).toBe('https://lms.test/auth');
    expect(Object.fromEntries(to.searchParams)).toMatchObject({ scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none', client_id: 'client-1', redirect_uri: launchURL, login_hint: 'hint-1', lti_message_hint: 'mh' });
    expect(to.searchParams.get('state')!.length).toBeGreaterThan(20);
    expect(to.searchParams.get('nonce')).not.toBe(to.searchParams.get('state'));
    expect(l.cookies).toHaveLength(1);
    expect(l.cookies[0]).toContain(`=${to.searchParams.get('state')}`);
    expect(l.cookies[0]).toMatch(/SameSite=None/);
    expect(l.cookies[0]).toMatch(/Secure/);
    expect(l.cookies[0]).toMatch(/HttpOnly/);
    expect(l.cookies[0]).toMatch(/Path=\/interactives\/lti13/);
  });

  it('works as a POST too, and makes a different state and nonce every time', async () => {
    const a = await login();
    const b = await login();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    const post = await raw('POST', `${h.base}/lti13/login`, { form: { iss: 'https://lms.test', login_hint: 'x', target_link_uri: launchURL } });
    expect(post.status).toBe(302);
  });

  it('refuses a platform nobody registered, a missing login hint, a deployment it does not know', async () => {
    expect((await startLogin({ iss: 'https://evil.test' })).status).toBe(400);
    expect((await startLogin({ client_id: 'someone-elses' })).status).toBe(400);
    expect((await startLogin({ login_hint: '' })).status).toBe(400);
    expect((await startLogin({ lti_deployment_id: 'dep-x' })).status).toBe(403);
  });

  it('is not an open redirect: the target link has to be this tool', async () => {
    expect((await startLogin({ target_link_uri: 'https://evil.test/lti13/launch' })).status).toBe(400);
    expect((await startLogin({ target_link_uri: `${h.base}/api/projects` })).status).toBe(400);
    expect((await startLogin({ target_link_uri: 'not a url' })).status).toBe(400);
    const ok = await startLogin({ target_link_uri: `${launchURL}?t=${tokenB}` });
    expect(ok.status).toBe(302);
    //and the platform's own login url is only ever the registered one
    expect(new URL(ok.location).origin).toBe('https://lms.test');
  });
});

describe('a resource link launch', () => {
  it('opens the project learner page and keeps the learner out of the url, in a session', async () => {
    const l = await login();
    const r = await launch(l, sign(claims(l), platformKey.privateKey));
    expect(r.status).toBe(303);
    const to = r.headers.get('location')!;
    expect(to).toMatch(new RegExp(`^/interactives/play/${tokenA}#lti=[\\w-]{40,}$`));
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    const sid = to.split('#lti=')[1];
    const row = (h.db as any)['lti13-sessions'].docs.find((d: any) => d._id === sid);
    expect(row.learner).toMatchObject({ username: 'lti:fake-lms:user-42', name: 'Lena Learner', course: 'ctx-9', courseLabel: 'MAT1000', courseTitle: 'Maths one', lmsURL: 'https://lms.test' });
    expect(row.learner.roles).toEqual(['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']);
    //the learner page it lands on exists and knows to take the fragment
    const page = await h.call('GET', `/play/${tokenA}`, { user: null });
    expect(page.status).toBe(200);
    expect(page.text).toContain('X-LTI-Session');
  });

  it('takes the project from the custom parameter when the url lost its query', async () => {
    const l = await login({ target_link_uri: launchURL });
    const r = await launch(l, sign(claims(l, { [`${CLAIM}custom`]: { ix_project: tokenB } }), platformKey.privateKey));
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toContain(`/play/${tokenB}#lti=`);
  });

  it('files the learner records under the LTI identity and the course, only for the project they were launched into', async () => {
    const l = await login();
    const sid = (await launch(l, sign(claims(l), platformKey.privateKey))).headers.get('location')!.split('#lti=')[1];
    const headers = { 'x-lti-session': sid };
    expect((await h.call('PUT', `/learn/${tokenA}/progress`, { user: null, headers, json: { variables: { page: 3 }, attempts: 1 } })).json).toEqual({ available: true, ok: true });
    expect((await h.call('POST', `/learn/${tokenA}/report`, { user: null, headers, json: { result: { completed: true, score: 8, max: 10 } } })).json.available).toBe(true);
    const rows = (h.db as any)['interactives-user-data'].docs;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: 'lti:fake-lms:user-42', course: 'ctx-9', name: 'Lena Learner', courseLabel: 'MAT1000', lmsURL: 'https://lms.test' });
    expect((await h.call('GET', `/learn/${tokenA}/progress`, { user: null, headers })).json.progress.variables).toEqual({ page: 3 });
    //another project's route, or no session header: nothing is read or kept
    expect((await h.call('GET', `/learn/${tokenB}/progress`, { user: null, headers })).json).toEqual({ available: false });
    expect((await h.call('GET', `/learn/${tokenA}/progress`, { user: null })).json).toEqual({ available: false });
    expect((await h.call('GET', `/learn/${tokenA}/progress`, { user: null, headers: { 'x-lti-session': 'made-up-session-id' } })).json).toEqual({ available: false });
    expect(rows).toHaveLength(1);
  });

  it('stops honouring a session once it is old', async () => {
    const l = await login();
    const sid = (await launch(l, sign(claims(l), platformKey.privateKey))).headers.get('location')!.split('#lti=')[1];
    (h.db as any)['lti13-sessions'].docs.find((d: any) => d._id === sid).expires = new Date(Date.now() - 1000);
    expect((await h.call('GET', `/learn/${tokenA}/progress`, { user: null, headers: { 'x-lti-session': sid } })).json).toEqual({ available: false });
  });

  it('says so when the project is no longer shared', async () => {
    const l = await login({ target_link_uri: `${launchURL}?t=${'x'.repeat(24)}` });
    const r = await launch(l, sign(claims(l), platformKey.privateKey));
    expect(r.status).toBe(404);
  });

  it('reads the platform keys once and reuses them', async () => {
    for (let i = 0; i < 3; i++) {
      const l = await login();
      expect((await launch(l, sign(claims(l), platformKey.privateKey))).status).toBe(303);
    }
    expect(jwksFetches).toBe(1);
  });
});

describe('every way a launch gets refused', () => {
  const refused = async (make: (l: Awaited<ReturnType<typeof login>>) => string, over: { state?: string; cookie?: string | null } = {}, status = 401) => {
    const l = await login();
    const r = await launch(l, make(l), over);
    expect(r.status).toBe(status);
    expect(r.headers.get('location')).toBeNull();
    expect((h.db as any)['lti13-sessions'].docs).toHaveLength(0);
    return { l, text: await body(r) };
  };

  it('a signature from some other key', async () => {
    const r = await refused((l) => sign(claims(l), otherKey.privateKey));
    expect(r.text).toMatch(/signature/);
  });
  it('a key id the platform never published', async () => {
    await refused((l) => sign(claims(l), platformKey.privateKey, { alg: 'RS256', kid: 'nope' }));
  });
  it('a different algorithm, including none', async () => {
    await refused((l) => sign(claims(l), platformKey.privateKey, { alg: 'RS512', kid: 'plat-1' }));
    //alg none has no signature part at all, so it is not even a well formed JWT
    await refused((l) => `${b64(JSON.stringify({ alg: 'none' }))}.${b64(JSON.stringify(claims(l)))}.`, {}, 400);
    await refused((l) => `${b64(JSON.stringify({ alg: 'none' }))}.${b64(JSON.stringify(claims(l)))}.AAAA`);
    //HS256 with the platform's public key as the secret
    await refused((l) => {
      const signed = `${b64(JSON.stringify({ alg: 'HS256', kid: 'plat-1' }))}.${b64(JSON.stringify(claims(l)))}`;
      return `${signed}.${b64(crypto.createHmac('sha256', JSON.stringify(platformJwks.keys[0])).update(signed).digest())}`;
    });
  });
  it('a token that is not a JWT at all', async () => {
    await refused(() => 'not.a.jwt!', {}, 400);
    await refused(() => 'abc', {}, 400);
  });
  it('the wrong audience', async () => {
    const r = await refused((l) => sign(claims(l, { aud: 'client-2' }), platformKey.privateKey));
    expect(r.text).toMatch(/audience/);
  });
  it('several audiences without our client id as the authorized party', async () => {
    await refused((l) => sign(claims(l, { aud: ['client-1', 'other'] }), platformKey.privateKey));
    await refused((l) => sign(claims(l, { aud: ['client-1', 'other'], azp: 'other' }), platformKey.privateKey));
    await refused((l) => sign(claims(l, { azp: 'other' }), platformKey.privateKey));
  });
  it('the wrong issuer', async () => {
    await refused((l) => sign(claims(l, { iss: 'https://evil.test' }), platformKey.privateKey));
  });
  it('an expired token', async () => {
    const r = await refused((l) => sign(claims(l, { exp: Math.floor(Date.now() / 1000) - 600, iat: Math.floor(Date.now() / 1000) - 900 }), platformKey.privateKey));
    expect(r.text).toMatch(/expired/);
  });
  it('a token from the future, or not valid yet', async () => {
    await refused((l) => sign(claims(l, { iat: Math.floor(Date.now() / 1000) + 3600, exp: Math.floor(Date.now() / 1000) + 7200 }), platformKey.privateKey));
    await refused((l) => sign(claims(l, { nbf: Math.floor(Date.now() / 1000) + 3600 }), platformKey.privateKey));
  });
  it('a token with no expiry', async () => {
    await refused((l) => sign({ ...claims(l), exp: undefined }, platformKey.privateKey));
  });
  it('the wrong nonce', async () => {
    const r = await refused((l) => sign(claims({ ...l, nonce: 'someone-elses-nonce' }), platformKey.privateKey));
    expect(r.text).toMatch(/nonce/);
  });
  it('a replayed launch: the same state and token twice', async () => {
    const l = await login();
    const token = sign(claims(l), platformKey.privateKey);
    expect((await launch(l, token)).status).toBe(303);
    const again = await launch(l, token);
    expect(again.status).toBe(401);
    expect(await body(again)).toMatch(/already used/);
    expect((h.db as any)['lti13-sessions'].docs).toHaveLength(1);
  });
  it('a refused launch still uses the login up, so the token cannot be fixed and tried again', async () => {
    const l = await login();
    expect((await launch(l, sign(claims(l), otherKey.privateKey))).status).toBe(401);
    expect((await launch(l, sign(claims(l), platformKey.privateKey))).status).toBe(401);
  });
  it('a state nobody made, no state, or one that has expired', async () => {
    await refused((l) => sign(claims(l), platformKey.privateKey), { state: 'made-up-state-value-xx', cookie: 'x=y' });
    const l = await login();
    (h.db as any)['lti13-state'].docs.find((d: any) => d._id === l.state).expires = new Date(Date.now() - 1000);
    expect((await launch(l, sign(claims(l), platformKey.privateKey))).status).toBe(401);
    const r = await raw('POST', launchURL, { form: { id_token: 'a.b.c' } });
    expect(r.status).toBe(400);
  });
  it('no state cookie, or someone else\'s', async () => {
    const r = await refused((l) => sign(claims(l), platformKey.privateKey), { cookie: null });
    expect(r.text).toMatch(/cookie/);
    const other = await login();
    const l = await login();
    const swapped = await launch(l, sign(claims(l), platformKey.privateKey), { cookie: other.cookie });
    expect(swapped.status).toBe(401);
  });
  it('a deployment that is not registered, or an old LTI version', async () => {
    await refused((l) => sign(claims(l, { [`${CLAIM}deployment_id`]: 'dep-x' }), platformKey.privateKey), {}, 403);
    await refused((l) => sign(claims(l, { [`${CLAIM}version`]: '1.1.0' }), platformKey.privateKey), {}, 400);
  });
  it('a target link that is not the one the login started with, or not this tool', async () => {
    await refused((l) => sign(claims(l, { [`${CLAIM}target_link_uri`]: `${launchURL}?t=${tokenB}` }), platformKey.privateKey), {}, 400);
    const l = await login();
    const evil = await launch(l, sign(claims({ ...l, target: 'https://evil.test/' }), platformKey.privateKey));
    expect(evil.status).toBe(400);
  });
  it('a message type it does not do, a resource link with no learner, or one with no resource link', async () => {
    await refused((l) => sign(claims(l, { [`${CLAIM}message_type`]: 'LtiSubmissionReviewRequest' }), platformKey.privateKey), {}, 400);
    await refused((l) => sign(claims(l, { sub: undefined }), platformKey.privateKey), {}, 400);
    await refused((l) => sign(claims(l, { [`${CLAIM}resource_link`]: undefined }), platformKey.privateKey), {}, 400);
  });
  it('reports a platform whose keys cannot be read as a gateway error, not a crash', async () => {
    (globalThis.fetch as any).mockImplementation(async (input: any, init?: any) => (String(input) === 'https://lms.test/jwks' ? new Response('nope', { status: 500 }) : realFetch(input, init)));
    const l = await login();
    const r = await launch(l, sign(claims(l), platformKey.privateKey, { alg: 'RS256', kid: 'brand-new-kid' }));
    expect(r.status).toBe(502);
  });
});

describe('deep linking', () => {
  const dlClaims = (l: { nonce: string; target: string }, over: Record<string, unknown> = {}) =>
    claims(l, {
      [`${CLAIM}message_type`]: 'LtiDeepLinkingRequest',
      [`${CLAIM}resource_link`]: undefined,
      [`${DL}deep_linking_settings`]: { deep_link_return_url: 'https://lms.test/return', accept_types: ['ltiResourceLink'], accept_presentation_document_targets: ['iframe'], accept_multiple: true, data: 'opaque-data-123' },
      ...over,
    });

  const open = async (over: Record<string, unknown> = {}) => {
    const l = await login({ target_link_uri: launchURL });
    const r = await launch(l, sign(dlClaims(l, over), platformKey.privateKey));
    return { r, html: await r.text() };
  };
  const sidOf = (html: string) => /name="sid" value="([^"]+)"/.exec(html)![1];
  const link = (sub = 'user-42', username = 'ann') => h.call('PUT', '/api/lti13/links', { user: root, json: { platform: 'fake-lms', sub, username } });

  it('shows an unlinked person how to get linked, and lists nothing', async () => {
    const { r, html } = await open();
    expect(r.status).toBe(200);
    expect(html).toContain('not linked');
    expect(html).toContain('fake-lms');
    expect(html).toContain('user-42');
    expect(html).not.toContain(tokenA);
  });

  it('lists the linked person\'s own shared projects, and nobody else\'s, nor ones with no link', async () => {
    expect((await link()).status).toBe(200);
    const { r, html } = await open();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain(`value="${tokenA}"`);
    expect(html).toContain(`value="${tokenB}"`);
    expect(html).not.toContain(tokenBob);
    expect(html).not.toContain('Project prlti13d01');
    expect(html).toContain('type="checkbox"');
  });

  it('uses radio buttons when the platform takes one item', async () => {
    await link();
    const { html } = await open({ [`${DL}deep_linking_settings`]: { deep_link_return_url: 'https://lms.test/return', accept_types: ['ltiResourceLink'] } });
    expect(html).toContain('type="radio"');
  });

  it('answers with a signed LtiDeepLinkingResponse carrying a resource link per project, and echoes data', async () => {
    await link();
    const { html } = await open();
    const sid = sidOf(html);
    const form = new URLSearchParams();
    form.append('sid', sid);
    form.append('project', tokenA);
    form.append('project', tokenB);
    const r = await realFetch(`${h.base}/lti13/pick`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    expect(r.status).toBe(200);
    const page = await r.text();
    expect(page).toContain('action="https://lms.test/return"');
    const jwt = /name="JWT" value="([^"]+)"/.exec(page)![1];

    //checked the way the platform would: against our published keys
    const jwks = (await h.call('GET', '/lti13/jwks')).json.keys;
    const [head, payload, sig] = jwt.split('.');
    const header = JSON.parse(Buffer.from(head, 'base64url').toString());
    expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT' });
    const key = crypto.createPublicKey({ key: jwks.find((k: any) => k.kid === header.kid), format: 'jwk' });
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${head}.${payload}`), key, Buffer.from(sig, 'base64url'))).toBe(true);

    const c = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(c).toMatchObject({ iss: 'client-1', aud: 'https://lms.test', [`${CLAIM}message_type`]: 'LtiDeepLinkingResponse', [`${CLAIM}version`]: '1.3.0', [`${CLAIM}deployment_id`]: 'dep-1', [`${DL}data`]: 'opaque-data-123' });
    expect(c.exp).toBeGreaterThan(c.iat);
    expect(c.nonce).toBeTruthy();
    const items = c[`${DL}content_items`];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'ltiResourceLink', url: expect.stringMatching(new RegExp(`^${launchURL.replace(/[/.]/g, '\\$&')}\\?t=`)) });
    expect(items.map((i: any) => i.url).sort()).toEqual([`${launchURL}?t=${tokenA}`, `${launchURL}?t=${tokenB}`].sort());
    expect(items[0].title).toMatch(/^Project /);

    //and an item it made launches: the platform sends it back as a resource link
    const l = await login({ target_link_uri: items[0].url });
    const back = await launch(l, sign(claims(l), platformKey.privateKey));
    expect(back.status).toBe(303);
  });

  it('takes no more than one item when the platform said so, and only ever the person\'s own', async () => {
    await link();
    const { html } = await open({ [`${DL}deep_linking_settings`]: { deep_link_return_url: 'https://lms.test/return', accept_types: ['ltiResourceLink'] } });
    const form = new URLSearchParams();
    form.append('sid', sidOf(html));
    form.append('project', tokenA);
    form.append('project', tokenB);
    const page = await (await realFetch(`${h.base}/lti13/pick`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })).text();
    const items = JSON.parse(Buffer.from(/name="JWT" value="[^.]+\.([^."]+)/.exec(page)![1], 'base64url').toString())[`${DL}content_items`];
    expect(items).toHaveLength(1);
  });

  it('refuses a project that is someone else\'s, even though the form is just a form', async () => {
    await link();
    const { html } = await open();
    const r = await realFetch(`${h.base}/lti13/pick`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ sid: sidOf(html), project: tokenBob }).toString() });
    expect(r.status).toBe(400);
  });

  it('is single use, and needs a real session', async () => {
    await link();
    const sid = sidOf((await open()).html);
    const pick = (s: string) => realFetch(`${h.base}/lti13/pick`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ sid: s, project: tokenA }).toString() });
    expect((await pick(sid)).status).toBe(200);
    expect((await pick(sid)).status).toBe(401);
    expect((await pick('nothing-like-a-session')).status).toBe(401);
    //a resource link session is not a picker session
    const l = await login();
    const lsid = (await launch(l, sign(claims(l), platformKey.privateKey))).headers.get('location')!.split('#lti=')[1];
    expect((await pick(lsid)).status).toBe(401);
  });

  it('refuses a request that has nowhere to return to, or does not take resource links', async () => {
    expect((await open({ [`${DL}deep_linking_settings`]: { deep_link_return_url: 'javascript:alert(1)', accept_types: ['ltiResourceLink'] } })).r.status).toBe(400);
    expect((await open({ [`${DL}deep_linking_settings`]: { deep_link_return_url: 'http://lms.test/return', accept_types: ['ltiResourceLink'] } })).r.status).toBe(400);
    expect((await open({ [`${DL}deep_linking_settings`]: { deep_link_return_url: 'https://lms.test/return', accept_types: ['file'] } })).r.status).toBe(400);
    expect((await open({ [`${DL}deep_linking_settings`]: undefined })).r.status).toBe(400);
  });

  it('is cleared with the link: unlinking stops the picker listing projects', async () => {
    await link();
    expect((await h.call('DELETE', '/api/lti13/links?platform=fake-lms&sub=user-42', { user: root })).status).toBe(200);
    expect((await open()).html).toContain('not linked');
  });
});
