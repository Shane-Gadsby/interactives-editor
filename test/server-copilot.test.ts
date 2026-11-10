// @vitest-environment node
//The Activity Designer's token route: the secret never leaves the server, the person's username is hashed, the
//button only shows with a secret set, and off takes it away
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness } from './helpers/server-harness';

let h: Harness;
const realFetch = globalThis.fetch;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  delete process.env.INTERACTIVES_COPILOT_SECRET1;
  delete process.env.INTERACTIVES_COPILOT;
  globalThis.fetch = realFetch;
  await h.close();
});

const ann = { username: 'ann' };

describe('Ask the Activity Designer', () => {
  it('is hidden without a secret', async () => {
    delete process.env.INTERACTIVES_COPILOT_SECRET1;
    expect((await h.call('GET', '/api/session', { user: ann })).json.copilot).toBe(false);
    expect((await h.call('POST', '/api/copilot/token', { user: ann })).status).toBe(404);
  });

  it('swaps the secret for a token as the person, without handing the secret out', async () => {
    process.env.INTERACTIVES_COPILOT_SECRET1 = 'very-secret';
    expect((await h.call('GET', '/api/session', { user: ann })).json.copilot).toBe(true);
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).startsWith('https://directline.botframework.com/')) {
        calls.push({ url: String(url), init: init! });
        return new Response(JSON.stringify({ conversationId: 'c1', token: 'tok', expires_in: 3600 }));
      }
      return realFetch(url as string, init);
    }) as typeof fetch;
    const r = await h.call('POST', '/api/copilot/token', { user: ann });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ token: 'tok', conversationId: 'c1', expiresIn: 3600 });
    expect(JSON.stringify(r.json)).not.toContain('very-secret');
    expect(calls).toHaveLength(1);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer very-secret');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.user.id).toMatch(/^dl_ix-[0-9a-f]{24}$/);
    expect(body.user.id).not.toContain('ann');
    expect(r.json.userId).toBe(body.user.id);
    globalThis.fetch = realFetch;
  });

  it('is switched off with INTERACTIVES_COPILOT=off', async () => {
    process.env.INTERACTIVES_COPILOT_SECRET1 = 'very-secret';
    process.env.INTERACTIVES_COPILOT = 'off';
    expect((await h.call('GET', '/api/session', { user: ann })).json.copilot).toBe(false);
    expect((await h.call('POST', '/api/copilot/token', { user: ann })).status).toBe(404);
    delete process.env.INTERACTIVES_COPILOT;
  });
});
