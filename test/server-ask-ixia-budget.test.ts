// @vitest-environment node
//Ask Ixia's spending guards on the real route (index.js with designer-openrouter.js), with OpenRouter pretended: a request's
//tokens and dollars land in its audit row, the day's budget turns the next request away before anything is spent, and one
//request stops when it has cost its share
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject } from '../../interactives-player/src/format';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const realFetch = globalThis.fetch;
let h: Harness;
let n = 0;
let id = '';
//what each pretend OpenRouter turn says and costs, and how many it was asked for
let script: { message: Record<string, unknown>; cost: number }[] = [];
let asked = 0;

const words = (text: string, cost: number) => ({ message: { role: 'assistant', content: text }, cost });
const reads = (cost: number) => ({ message: { role: 'assistant', content: null, tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name: 'validate', arguments: '{}' } }] }, cost });

beforeAll(async () => {
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  process.env.INTERACTIVES_DESIGNER = 'on';
  process.env.INTERACTIVES_DESIGNER_PER_HOUR = '0';
  process.env.INTERACTIVES_DESIGNER_DAILY_USD = '0.05';
  process.env.INTERACTIVES_DESIGNER_REQUEST_USD = '0.03';
  h = await startServer();
  globalThis.fetch = vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://openrouter.ai/')) {
      asked++;
      const next = script.shift() ?? words('Nothing more to say.', 0.001);
      return new Response(JSON.stringify({ provider: 'Test host', choices: [{ finish_reason: 'stop', message: next.message }], usage: { prompt_tokens: 1000, completion_tokens: 100, cost: next.cost } }));
    }
    return realFetch(u.replace('http://127.0.0.1:3048/interactives', h.base), init);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const k of ['OPENROUTER_API_KEY', 'INTERACTIVES_DESIGNER', 'INTERACTIVES_DESIGNER_PER_HOUR', 'INTERACTIVES_DESIGNER_DAILY_USD', 'INTERACTIVES_DESIGNER_REQUEST_USD']) delete process.env[k];
});
beforeEach(async () => {
  script = [];
  asked = 0;
  id = `prbud${String(++n).padStart(5, '0')}`;
  const p = createProject('Budget');
  p.id = id;
  p.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', x: 10, y: 20, width: 100, height: 50 }));
  expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: p, rev: 0 } })).status).toBe(200);
});

const ask = async (message: string) => {
  const r = await h.call('POST', '/api/designer/chat', { user: ann, json: { projectId: id, message } });
  const events = r.status === 200 ? r.text.split('\n').filter(Boolean).map((l: string) => JSON.parse(l)) : [];
  return { ...r, events };
};
const runs = () => h.db.audit.docs.filter((d: any) => d.event === 'designer-run');

describe("Ask Ixia's spending guards", () => {
  it('keeps what a request used in its audit row, and stops one request at its own ceiling', async () => {
    // three cents is the ceiling: two turns of two cents pass it, so the third is never asked for
    script = [reads(0.02), reads(0.02), reads(0.02), words('Done.', 0.02)];
    const r = await ask('Check my project');
    expect(r.status).toBe(200);
    expect(asked).toBe(2);
    expect(r.events.find((e: any) => e.type === 'reply').text).toContain("as far as I can get in one go");
    const row = runs().at(-1)!;
    expect(row.detail).toMatchObject({ via: 'openrouter', model: 'anthropic/claude-haiku-5.5', usage: { input: 2000, output: 200, host: 'Test host' } });
    expect(row.detail.usage.cost).toBeCloseTo(0.04);
    // never the key or the words
    expect(JSON.stringify(row)).not.toMatch(/or-test-key|Check my project/);
  });

  it("turns the next request away once the day's budget is spent, before anything more is spent", async () => {
    // four cents went in the test above; this one takes the day to six, past the five cent budget
    script = [words('Here you go.', 0.02)];
    expect((await ask('One more')).status).toBe(200);
    asked = 0;
    const refused = await ask('And another');
    expect(refused.status).toBe(429);
    expect(refused.json).toMatchObject({ kind: 'wait', error: 'Ixia has done all it can for today. It will be back tomorrow.' });
    expect(asked).toBe(0);
    expect(h.db.audit.docs.some((d: any) => d.event === 'designer-budget')).toBe(true);
  });
});
