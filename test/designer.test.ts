// @vitest-environment node
//The Activity Designer on its own (designer.js), with a pretend Cogniti and a pretend builder: one message holds everything and
//the agent answers with one blueprint, a restore point is saved only when something is about to change, a real leftover
//problem costs one more message (never more than three), and a person's own token is kept sealed
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const designer = createRequire(import.meta.url)('../designer.js');
const { settings, cogniti, run, parseBlueprint, buildSpec, requestMessage, quota, sealToken, openToken, secretKey, WORDS, MAX_MESSAGES } = designer;

const ndjson = (...parts: string[]) => parts.map((p) => JSON.stringify({ content: p, success: true })).join('\n') + '\n';
const bp = (o: unknown, words = 'I added the page.') => '```blueprint\n' + JSON.stringify(o) + '\n```\n' + words;

describe('settings', () => {
  it('is parked: on only with a token and INTERACTIVES_DESIGNER=on', () => {
    expect(settings({}).on).toBe(false);
    expect(settings({ COGNITI_TOKEN: 't' }).on).toBe(false);
    expect(settings({ COGNITI_TOKEN: 't', INTERACTIVES_DESIGNER: 'on' })).toMatchObject({ on: true, agent: '6af3c21c0eba26d21bfa2427', url: 'https://cogniti.unisq.edu.au', perHour: 6 });
    expect(settings({ COGNITI_TOKEN: 't', INTERACTIVES_DESIGNER: 'off' }).on).toBe(false);
    expect(settings({ COGNITI_TOKEN: 't', INTERACTIVES_DESIGNER: 'on', INTERACTIVES_DESIGNER_AGENT: 'abc', INTERACTIVES_COGNITI_URL: 'http://cog.test/' })).toMatchObject({ agent: 'abc', url: 'http://cog.test' });
  });

  it('takes the shared hourly allowance from INTERACTIVES_DESIGNER_PER_HOUR (0 or off is no limit)', () => {
    expect(settings({ INTERACTIVES_DESIGNER_PER_HOUR: '3' }).perHour).toBe(3);
    expect(settings({ INTERACTIVES_DESIGNER_PER_HOUR: '0' }).perHour).toBe(0);
    expect(settings({ INTERACTIVES_DESIGNER_PER_HOUR: 'off' }).perHour).toBe(0);
    expect(settings({ INTERACTIVES_DESIGNER_PER_HOUR: 'lots' }).perHour).toBe(6);
  });
});

describe('reading the agent', () => {
  it('finds a blueprint and the words around it, or none when it is plain words', () => {
    expect(parseBlueprint('Which page should it go on?')).toBeNull();
    expect(parseBlueprint('Here you go.\n```blueprint\n{"pages":[{"name":"Quiz"}]}\n```\nI made a Quiz page.')).toEqual({ blueprint: { pages: [{ name: 'Quiz' }] }, words: 'Here you go.\n\nI made a Quiz page.' });
    //a block marked json that holds a blueprint is one too; any other json is just words
    expect(parseBlueprint('```json\n{"pages":[]}\n```')).toMatchObject({ blueprint: { pages: [] } });
    expect(parseBlueprint('```json\n{"hello":1}\n```')).toBeNull();
  });

  it('hands a broken block back as something to tell the agent', () => {
    expect(parseBlueprint('```blueprint\n{"pages":\n```')).toMatchObject({ error: expect.stringContaining('not valid JSON') });
    expect(parseBlueprint('```blueprint\n[1]\n```')).toMatchObject({ error: expect.stringContaining('not a JSON object') });
  });

  it('puts the spec, the project and the request in one message', () => {
    const spec = buildSpec('EDIT TOOL TEXT');
    expect(spec).toContain('# The blueprint format');
    expect(spec).toContain('"type":"question"');
    expect(spec).toContain('EDIT TOOL TEXT');
    const m = requestMessage({ spec, projectId: 'p1', projectName: 'Water', firstName: 'Ann', context: '# Where things stand\nPage 1', message: 'Add a page' });
    for (const part of ['# Blueprint spec', 'id p1', '"Water"', 'Page 1', 'Ann', '# Request\nAdd a page']) expect(m).toContain(part);
    //a few thousand characters of spec, not the ~100k building guide
    expect(buildSpec().length).toBeLessThan(6000);
  });
});

describe('the Cogniti client', () => {
  const cfg = { token: 'secret-token', agent: 'ag1', url: 'http://cog.test' };

  it('joins streamed lines, including ones split between chunks, and sends the token as a bearer', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const body = ndjson('Hello ', 'there');
    const half = Math.floor(body.length / 2);
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      const enc = new TextEncoder();
      return new Response(new ReadableStream({ start: (c) => (c.enqueue(enc.encode(body.slice(0, half))), c.enqueue(enc.encode(body.slice(half))), c.close()) }));
    });
    const reply = await cogniti(cfg, fetcher).send('c1', 'hi', [{ role: 'user', content: 'x', uuid: 'u' }]);
    expect(reply).toBe('Hello there');
    expect(seen[0].url).toBe('http://cog.test/api/v1/chat/message');
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(String(seen[0].init.body))).toMatchObject({ agent_id: 'ag1', conversation_id: 'c1', messages: [{ content: 'hi' }], chat_history: [{ role: 'user', content: 'x', uuid: 'u' }] });
    expect(JSON.parse(String(seen[0].init.body)).conversation_operation_id).toBeTruthy();
  });

  it('turns each failure into plain words, and says it differently to someone on their own token', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const say = (status: number, c = cfg) => cogniti(c, async () => new Response(JSON.stringify({ message: 'secret detail' }), { status })).send('c', 'x', []).catch((e: Error) => e);
    expect((await say(429)).message).toBe('The Activity Designer has reached its hourly limit. Try again in a little while.');
    expect((await say(406)).message).toBe(WORDS.blocked);
    expect((await say(413)).message).toBe(WORDS.tooLong);
    expect((await say(403)).message).toBe(WORDS.forbidden);
    expect((await say(503)).message).toBe(WORDS.unavailable);
    expect((await say(429, { ...cfg, own: true } as any)).message).toBe(WORDS.limitOwn);
    expect((await say(403, { ...cfg, own: true } as any)).message).toBe(WORDS.forbiddenOwn);
    expect((await say(401, { ...cfg, own: true } as any)).message).toMatch(/own token/);
    expect((await cogniti(cfg, async () => { throw new Error('ECONNRESET'); }).send('c', 'x', []).catch((e: Error) => e)).message).toBe(WORDS.unavailable);
    expect((await cogniti(cfg, async () => new Response('')).send('c', 'x', []).catch((e: Error) => e)).message).toBe(WORDS.empty);
  });

  it('checks a token once: it gets in, and it can chat with the agent', async () => {
    const list = (agents: unknown, status = 200) => cogniti(cfg, async () => new Response(JSON.stringify(agents), { status })).checkAccess();
    expect(await list([{ id: 'ag1', can_chat: true }, { id: 'other' }])).toEqual({ ok: true });
    expect(await list([{ id: 'other', can_chat: true }])).toEqual({ ok: false, why: 'notShared' });
    expect(await list([{ id: 'ag1', can_chat: false }])).toEqual({ ok: false, why: 'notShared' });
    expect(await list({ message: 'no' }, 401)).toEqual({ ok: false, why: 'refused' });
    expect(await list({ message: 'no' }, 500)).toEqual({ ok: false, why: 'unreachable' });
    expect(await cogniti(cfg, async () => { throw new Error('down'); }).checkAccess()).toEqual({ ok: false, why: 'unreachable' });
  });
});

//a scripted agent and builder around the real run
const harness = (replies: (string | Error)[], builds: { changed?: boolean; notes?: string[]; warnings?: string[]; problems?: string[]; known?: string[] }[] = []) => {
  const sent: string[] = [];
  const events: any[] = [];
  const ai = {
    newConversation: async () => 'conv1',
    send: async (_c: string, text: string) => {
      sent.push(text);
      const r = replies.shift() ?? 'done';
      if (r instanceof Error) throw r;
      return r;
    },
  };
  const built: unknown[] = [];
  const deps = {
    cogniti: ai,
    spec: 'SPEC',
    context: async () => '# Where things stand\nJoined "Water".',
    build: vi.fn(async (b: unknown, _known?: string[] | null) => {
      built.push(b);
      return { changed: true, notes: ['Added the page Quiz (3 layers)'], warnings: [], problems: [], known: ['old problem'], ...(builds.shift() ?? {}) };
    }),
    beforeEdit: vi.fn(async () => 'rev1'),
    emit: (e: unknown) => events.push(e),
    signal: undefined as AbortSignal | undefined,
  };
  const state = { conversation: null as string | null, history: [] as { role: string; content: string }[] };
  const go = (message = 'Add a page', signal?: AbortSignal) => run({ ...deps, signal }, { projectId: 'p1', projectName: 'Water', firstName: 'Ann', message, state });
  return { deps, sent, events, built, state, go };
};

describe('one message a request', () => {
  it('sends the spec, project and request once, builds the blueprint locally and replies: exactly one Cogniti message', async () => {
    const h = harness([bp({ pages: [{ name: 'Quiz' }] }, 'I made a Quiz page.')]);
    const r = await h.go('Add a page with a question');
    expect(r).toEqual({ outcome: 'replied', rounds: 1, changed: true });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toContain('SPEC');
    expect(h.sent[0]).toContain('id p1');
    expect(h.sent[0]).toContain('Joined "Water".');
    expect(h.sent[0]).toContain('Add a page with a question');
    expect(h.built).toEqual([{ pages: [{ name: 'Quiz' }] }]);
    expect(h.events.filter((e) => e.type === 'reply')).toEqual([{ type: 'reply', text: 'I made a Quiz page.' }]);
    expect(h.events.filter((e) => e.type === 'changed')).toEqual([{ type: 'changed', revision: 'rev1' }]);
    for (const e of h.events.filter((x) => x.type === 'status')) expect(e.text).not.toMatch(/blueprint|json|tool|_/i);
  });

  it('keeps only the request in the chat history, not the project that goes stale', async () => {
    const h = harness([bp({ pages: [] })]);
    await h.go('Add a page');
    expect(h.state.history.map((x) => x.role)).toEqual(['user', 'ai']);
    expect(h.state.history[0].content).toBe('# Request\nAdd a page');
  });

  it('answers a plain question with plain words: no build, no restore point', async () => {
    const h = harness(['What would you like on the Results page?']);
    const r = await h.go('Add a page');
    expect(r).toEqual({ outcome: 'replied', rounds: 1, changed: false });
    expect(h.deps.build).not.toHaveBeenCalled();
    expect(h.deps.beforeEdit).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toEqual({ type: 'reply', text: 'What would you like on the Results page?' });
  });

  it('hands the first build\'s list of what was already wrong to the next one, so old problems stay old', async () => {
    const h = harness([bp({ pages: [] }), bp({ pages: [] })], [{ problems: ['x'], known: ['was already broken'] }, {}]);
    await h.go();
    expect(h.deps.build.mock.calls.map((c: any[]) => c[1])).toEqual([null, ['was already broken']]);
  });

  it('saves one restore point, and says nothing changed when the build changed nothing', async () => {
    const h = harness([bp({ pages: [] })], [{ changed: false, notes: [] }]);
    const r = await h.go();
    expect(r.changed).toBe(false);
    expect(h.deps.beforeEdit).toHaveBeenCalledTimes(1);
    expect(h.events.some((e) => e.type === 'changed')).toBe(false);
    expect(h.events.at(-1).text).toBe('I added the page.');
  });

  it('stops without changing anything when a restore point cannot be saved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness([bp({ pages: [] })]);
    h.deps.beforeEdit.mockRejectedValueOnce(new Error('disk'));
    const r = await h.go();
    expect(r.outcome).toBe('error');
    expect(h.deps.build).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toMatchObject({ type: 'error', text: expect.stringContaining('could not save a copy') });
  });

  it('adds the build\'s own warnings to the reply, and writes one itself when the agent said nothing', async () => {
    const h = harness(['```blueprint\n{"pages":[]}\n```'], [{ warnings: ['What was added to Quiz runs past the bottom of the page'] }]);
    await h.go();
    const text = h.events.at(-1).text;
    expect(text).toContain('Done. Added the page Quiz (3 layers).');
    expect(text).toContain('Worth a look: What was added to Quiz runs past the bottom of the page.');
  });
});

describe('real problems cost one more message, never more than three', () => {
  it('sends only the problems back, builds the fix, and reports both in one reply: two messages', async () => {
    const h = harness([bp({ pages: [{ name: 'Quiz' }] }, 'I made the page.'), bp({ behaviours: [{ on: 'Start', does: 'go to the Quiz page' }] }, 'Fixed the button.')], [{ problems: ['Page 1: could not set up "go to Quiz" on Start (not found)'] }, {}]);
    const r = await h.go();
    expect(r).toEqual({ outcome: 'replied', rounds: 2, changed: true });
    expect(h.sent[1]).toMatch(/^# Problems/);
    expect(h.sent[1]).toContain('could not set up "go to Quiz"');
    //the second message is short: no spec, no project again
    expect(h.sent[1]).not.toContain('SPEC');
    expect(h.sent[1].length).toBeLessThan(1500);
    expect(h.deps.beforeEdit).toHaveBeenCalledTimes(1);
    expect(h.events.filter((e) => e.type === 'changed')).toHaveLength(1);
    const reply = h.events.at(-1).text;
    expect(reply).toContain('I made the page.');
    expect(reply).toContain('Fixed the button.');
  });

  it('tells the agent when its blueprint was not valid JSON and takes the corrected one', async () => {
    const h = harness(['```blueprint\n{"pages":\n```', bp({ pages: [{ name: 'Quiz' }] })]);
    const r = await h.go();
    expect(r.rounds).toBe(2);
    expect(h.sent[1]).toContain('not valid JSON');
    expect(h.built).toHaveLength(1);
  });

  it('stops at three messages and says plainly what is still wrong', async () => {
    const h = harness(Array.from({ length: 6 }, () => bp({ pages: [] })), Array.from({ length: 6 }, () => ({ problems: ['a button points at nothing'] })));
    const r = await h.go();
    expect(r).toMatchObject({ outcome: 'replied', rounds: MAX_MESSAGES });
    expect(MAX_MESSAGES).toBe(3);
    expect(h.sent).toHaveLength(3);
    expect(h.events.at(-1).text).toContain("couldn't finish everything");
    expect(h.events.at(-1).text).toContain('a button points at nothing');
  });

  it('takes plain words after a problem as the agent\'s last word', async () => {
    const h = harness([bp({ pages: [] }, 'Made it.'), 'I could not link that button because the page does not exist yet.'], [{ problems: ['x'] }]);
    await h.go();
    expect(h.events.at(-1).text).toBe('Made it.\n\nI could not link that button because the page does not exist yet.');
  });
});

describe('when things go wrong', () => {
  it('says the hourly limit kindly, tells the panel what kind of error it was, and forgets a chat that got too long', async () => {
    const h = harness([new designer.DesignerError('limit', WORDS.limit)]);
    expect(await h.go()).toMatchObject({ outcome: 'limit', rounds: 0 });
    expect(h.events.at(-1)).toEqual({ type: 'error', text: 'The Activity Designer has reached its hourly limit. Try again in a little while.', kind: 'limit' });
    const long = harness([new designer.DesignerError('tooLong', WORDS.tooLong)]);
    long.state.conversation = 'old';
    await long.go();
    expect(long.state.conversation).toBeNull();
  });

  it('stops before building when the browser goes', async () => {
    const ctl = new AbortController();
    const h = harness([bp({ pages: [] })]);
    const send = h.deps.cogniti.send;
    h.deps.cogniti.send = async (c: string, t: string) => {
      const out = await send(c, t);
      ctl.abort();
      return out;
    };
    const r = await h.go('x', ctl.signal);
    expect(r.outcome).toBe('cancelled');
    expect(h.deps.build).not.toHaveBeenCalled();
  });

  it('carries a follow-up on in the same conversation', async () => {
    const h = harness(['One.', 'Two.']);
    await h.go('first');
    await h.go('second');
    expect(h.sent[1]).toContain('second');
    expect(h.state.history).toHaveLength(4);
    expect(h.state.conversation).toBe('conv1');
  });
});

describe('a fair share of the shared token', () => {
  it('counts a person\'s requests in the last hour, and gives the oldest back after it', () => {
    let t = 0;
    const q = quota(3, () => t);
    expect(q.status('ann')).toEqual({ limit: 3, left: 3, resetsIn: 0 });
    expect(q.take('ann')).toBe(true);
    t = 60_000;
    expect(q.take('ann')).toBe(true);
    expect(q.take('ann')).toBe(true);
    expect(q.take('ann')).toBe(false);
    expect(q.status('ann')).toMatchObject({ left: 0, resetsIn: 3540 });
    //someone else has their own
    expect(q.status('bob').left).toBe(3);
    t = 60 * 60 * 1000 + 1;
    expect(q.status('ann').left).toBe(1);
    expect(q.take('ann')).toBe(true);
  });

  it('gives one back for a request that never got a message through, and has no limit at 0', () => {
    const q = quota(2);
    q.take('ann');
    q.take('ann');
    q.refund('ann');
    expect(q.status('ann').left).toBe(1);
    const free = quota(0);
    expect(free.take('ann')).toBe(true);
    expect(free.status('ann')).toBeNull();
  });
});

describe('a person\'s own token, kept sealed', () => {
  const key = secretKey(fs.mkdtempSync(path.join(os.tmpdir(), 'ix-designer-')));

  it('opens only for the person it was sealed for, and never holds the token in the clear', () => {
    const row = sealToken('cog_live_abcdef123456', 'ann', key);
    expect(JSON.stringify(row)).not.toContain('cog_live_abcdef123456');
    expect(openToken(row, 'ann', key)).toBe('cog_live_abcdef123456');
    expect(openToken(row, 'bob', key)).toBeNull();
    expect(openToken({ ...row, data: Buffer.from('tampered').toString('base64') }, 'ann', key)).toBeNull();
    expect(openToken(row, 'ann', Buffer.alloc(32, 1))).toBeNull();
    //a fresh seal each time
    expect(sealToken('cog_live_abcdef123456', 'ann', key).data).not.toBe(row.data);
  });

  it('takes the key from INTERACTIVES_SECRET_KEY, or makes one once and keeps it in storage', () => {
    const env = { INTERACTIVES_SECRET_KEY: 'a long secret from the environment' };
    expect(secretKey('/nowhere', env)).toHaveLength(32);
    expect(secretKey('/nowhere', env).equals(secretKey('/elsewhere', env))).toBe(true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-designer-key-'));
    const a = secretKey(dir, {});
    expect(a).toHaveLength(32);
    expect(fs.readFileSync(path.join(dir, '.designer-key'), 'utf8').trim().length).toBeGreaterThanOrEqual(32);
    expect(secretKey(dir, {}).equals(a)).toBe(true);
  });
});
