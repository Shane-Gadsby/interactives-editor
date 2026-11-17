// @vitest-environment node
//Shared responses go live: the real index.js against the in-memory mongo stand-in. A learner page opens a stream and the server says
//"changed" when somebody in the same project and course adds, takes back, hides or clears an answer. It only says that, with the
//source id: nothing from the class. Other courses and other projects hear nothing, "Only me" answers say nothing to anyone, and the
//caps and rate limit keep the streams few.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type Stream, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const sam: User = { username: 'sam', fullName: 'Sam S', course: 'MAT1000_2026_S1' };
const lee: User = { username: 'lee', fullName: 'Lee L', course: 'MAT1000_2026_S1' };
const kim: User = { username: 'kim', fullName: 'Kim K', course: 'PHY2000_2026_S1' };

const ABOUT = (id = 'ds1', who = 'class') => ({ id, name: 'responses', kind: 'json', source: 'shared', shared: { who, maxLength: 20, perPerson: 3, minCount: 1, blocked: ['spam'] } });
const project = (id: string, sources: unknown[]) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, dataSources: sources, artboards: [{ id: 'ab1', name: 'Start', width: 100, height: 100, background: '#fff', nodes: [] }], variables: [], interactions: [], timelines: [] });
const pageOf = (p: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c')}</script></body></html>`;

let h: Harness;
let token = '';
let other = '';
const PID = 'prsharedlive1';
const OTHER = 'prsharedlive2';
const open: Stream[] = [];

beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

async function shareProject(id: string, sources: unknown[]) {
  await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id, sources), rev: 0 } });
  const r = await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: pageOf(project(id, sources)), type: 'text/plain' });
  return r.json.share.token as string;
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  delete process.env.INTERACTIVES_LIVE_PER_COURSE;
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['shared-responses'], h.db['shared-hidden'], h.db.audit]) c.docs = [];
  token = await shareProject(PID, [ABOUT(), ABOUT('dsme', 'me')]);
  other = await shareProject(OTHER, [ABOUT()]);
});
afterEach(() => {
  while (open.length) open.pop()!.close();
  delete process.env.INTERACTIVES_LIVE_PER_COURSE;
});

const listen = async (user: User | null, t = token) => {
  const s = await h.stream(`/learn/${t}/shared-live`, { user });
  open.push(s);
  await s.waitFor((e) => e.event === 'hello');
  return s;
};
const changed = (s: Stream) => s.events.filter((e) => e.event === 'changed');
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const add = (user: User, answers: unknown, who = 'class', t = token, src = 'ds1') => h.call('POST', `/learn/${t}/shared/${src}`, { user, json: { who, answers } });
const take = (user: User, answers?: unknown) => h.call('POST', `/learn/${token}/shared/ds1/withdraw`, { user, json: { who: 'class', answers } });
const hide = (text: string, hidden = true, course = 'MAT1000_2026_S1') => h.call('PUT', `/api/projects/${PID}/shared/ds1/hidden`, { user: ann, json: { text, hidden, course } });
const remove = (body: Record<string, unknown>) => h.call('DELETE', `/api/projects/${PID}/shared/ds1/answers`, { user: ann, json: body });

describe('who is nudged', () => {
  it('tells learners in the same project and course that something changed, and nobody else', async () => {
    const mine = await listen(sam);
    const mate = await listen(lee);
    const otherCourse = await listen(kim);
    const otherProject = await listen(sam, other);
    await add(sam, ['secret answer']);
    await mate.waitFor((e) => e.event === 'changed');
    await mine.waitFor((e) => e.event === 'changed');
    //the other course and the other project get the chance to hear, and do not
    await pause(150);
    expect(changed(otherCourse)).toHaveLength(0);
    expect(changed(otherProject)).toHaveLength(0);
    expect(changed(mate)).toHaveLength(1);
  });

  it('says only which source, never an answer, a name or a count', async () => {
    const mate = await listen(lee);
    await add(sam, ['secret answer', 'other secret']);
    const hit = await mate.waitFor((e) => e.event === 'changed');
    expect(hit.data).toEqual({ source: 'ds1' });
    const all = JSON.stringify(mate.events);
    expect(all).not.toMatch(/secret|sam|Sam|lee|Lee|count|total|people/);
  });

  it('says nothing for an answer kept to Only me, or one that was refused', async () => {
    const mate = await listen(lee);
    //a source the author fixed to Only me keeps its answers to the person
    await add(sam, ['private'], 'me', token, 'dsme');
    await add(sam, ['spam word']);
    await add(sam, ['']);
    await pause(150);
    expect(changed(mate)).toHaveLength(0);
    await add(sam, ['public']);
    await mate.waitFor((e) => e.event === 'changed');
    expect(changed(mate)).toHaveLength(1);
  });

  it('says so when an answer is taken back, hidden, shown again, removed or the course cleared', async () => {
    await add(sam, ['alpha', 'beta']);
    await add(lee, ['alpha']);
    const mate = await listen(lee);
    const kimmy = await listen(kim);
    let seen = 0;
    const next = async (go: () => Promise<unknown>) => {
      await pause(450);
      await go();
      await mate.waitFor(() => changed(mate).length > seen);
      seen = changed(mate).length;
    };
    await next(() => take(sam, ['beta']));
    await next(() => hide('alpha'));
    await next(() => hide('alpha', false));
    await next(() => remove({ text: 'alpha', course: 'MAT1000_2026_S1' }));
    await next(() => remove({ course: 'MAT1000_2026_S1' }));
    expect(seen).toBe(5);
    expect(changed(kimmy)).toHaveLength(0);
  });

  it('puts a burst of adds into a few nudges, not one each', async () => {
    const mate = await listen(lee);
    await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((w, i) => add({ username: `p${i}`, course: sam.course } as User, [w])));
    await mate.waitFor(() => changed(mate).length >= 1);
    await pause(700);
    const n = changed(mate).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThan(4);
  });
});

describe('when there is nothing to listen for', () => {
  it('answers plainly with no session, for a project with nothing shared, and for a token that is not a share', async () => {
    expect((await h.call('GET', `/learn/${token}/shared-live`, { user: null })).json).toEqual({ available: false });
    const bare = await shareProject('prsharedlive3', []);
    expect((await h.call('GET', `/learn/${bare}/shared-live`, { user: sam })).json).toEqual({ available: false });
    expect((await h.call('GET', `/learn/${'a'.repeat(20)}/shared-live`, { user: sam })).status).toBe(404);
    expect((await h.call('GET', `/learn/short/shared-live`, { user: sam })).status).toBe(404);
  });

  it('turns a project\'s streams off when its share link goes off, so the pages are back to polling', async () => {
    const s = await listen(sam);
    await h.call('DELETE', `/api/projects/${PID}/share`, { user: ann });
    await s.waitFor((e) => e.event === 'bye');
  });
});

describe('how many streams there are', () => {
  it('holds a course to its cap and takes a slot back when a page leaves', async () => {
    process.env.INTERACTIVES_LIVE_PER_COURSE = '2';
    const a = await listen({ username: 'u1', course: sam.course } as User);
    await listen({ username: 'u2', course: sam.course } as User);
    const full = await h.call('GET', `/learn/${token}/shared-live`, { user: { username: 'u3', course: sam.course } as User });
    expect(full.status).toBe(503);
    expect(full.json).toMatchObject({ live: false, problem: 'full' });
    //another course has its own room
    await listen(kim);
    a.close();
    await pause(100);
    await listen({ username: 'u3', course: sam.course } as User);
  });

  it('lets a person have three, and the oldest gives way to a fourth', async () => {
    const ctl = new AbortController();
    const header = JSON.stringify({ user: { username: 'sam', fullName: 'Sam S', userID: 1 }, access: { power: false }, activity: { courseLabel: sam.course, courseCode: 'MAT1000', lmsURL: 'https://lms.example' } });
    const raw = async () => {
      const res = await fetch(`${h.base}/learn/${token}/shared-live`, { headers: { 'x-test-session': header }, signal: ctl.signal });
      const reader = res.body!.getReader();
      const ended = (async () => {
        try {
          for (;;) if ((await reader.read()).done) return true;
        } catch {
          return false;
        }
      })();
      return { status: res.status, ended };
    };
    const first = await raw();
    const rest = [await raw(), await raw(), await raw()];
    expect(rest.every((r) => r.status === 200)).toBe(true);
    expect(await Promise.race([first.ended, pause(1500).then(() => false)])).toBe(true);
    expect(await Promise.race([rest[0].ended, pause(200).then(() => false)])).toBe(false);
    ctl.abort();
  });

  it('limits how fast one person can open them', async () => {
    const quick = { username: 'quick', course: sam.course } as User;
    for (let i = 0; i < 12; i++) (await listen(quick)).close();
    const r = await h.call('GET', `/learn/${token}/shared-live`, { user: quick });
    expect(r.status).toBe(429);
    expect(r.json).toMatchObject({ live: false });
  });
});

describe('the learner page', () => {
  //The page in jsdom with a fetch that plays the server: the stream says what the test pushes
  async function pageWith(streamFor: (push: (text: string) => void, end: () => void) => void, onCall?: (url: string, init: any) => void) {
    // @ts-expect-error jsdom ships no types here
    const { JSDOM } = await import('jsdom');
    const page = (await h.call('GET', `/play/${token}`)).text;
    const calls: { url: string; init: any }[] = [];
    const told: any[] = [];
    const enc = new TextEncoder();
    const dom = new JSDOM(page, {
      url: 'http://127.0.0.1/interactives/play/x?sessionID=abc',
      runScripts: 'dangerously',
      beforeParse(win: any) {
        win.TextDecoder = TextDecoder;
        win.fetch = async (url: string, init: any) => {
          calls.push({ url, init });
          onCall?.(url, init);
          if (!url.endsWith('/shared-live')) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ available: true, ok: true, value: { ready: true } }) };
          let next: ((v: { done: boolean; value?: Uint8Array }) => void) | null = null;
          const queue: Uint8Array[] = [];
          let done = false;
          const wake = () => {
            if (next && (queue.length || done)) {
              const n = next;
              next = null;
              n(queue.length ? { done: false, value: queue.shift() } : { done: true });
            }
          };
          streamFor(
            (text) => {
              queue.push(enc.encode(text));
              wake();
            },
            () => {
              done = true;
              wake();
            },
          );
          return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: () => new Promise((r) => { next = r; wake(); }) }) } };
        };
      },
    });
    const win: any = dom.window;
    const frame = win.document.getElementById('project');
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: (m: any) => told.push(m) } });
    const read = (who: string) => win.dispatchEvent(new win.MessageEvent('message', { data: { source: 'interactives-progress', op: 'shared-read', rid: 'r', sharedSource: 'ds1', who }, source: frame.contentWindow }));
    const close = () => {
      delete frame.contentWindow;
      win.close();
    };
    return { win, calls, told, read, close };
  }

  it('opens the link when the project reads a class, sends the session, and passes a nudge to the player as only its source', async () => {
    let push: (t: string) => void = () => {};
    const p = await pageWith((pu) => (push = pu));
    p.read('class');
    await pause(30);
    expect(p.calls.filter((c) => c.url.endsWith('/shared-live'))).toHaveLength(1);
    expect(p.calls.find((c) => c.url.endsWith('/shared-live'))!.init.headers['X-Session-ID']).toBe('abc');
    push(': ok\n\nevent: hello\ndata: {"live":true}\n\n');
    push('event: changed\ndata: {"source":"ds1"}\n\n');
    //a nudge split across two chunks still arrives whole
    push('event: changed\ndata: {"sou');
    push('rce":"ds1"}\n\n');
    await pause(30);
    expect(p.told.filter((m) => m.type === 'shared-live')).toEqual([
      { target: 'interactives', type: 'shared-live', up: true },
      { target: 'interactives', type: 'shared-live', changed: true, source: 'ds1' },
      { target: 'interactives', type: 'shared-live', changed: true, source: 'ds1' },
    ]);
    //a second read does not open a second link
    p.read('class');
    await pause(30);
    expect(p.calls.filter((c) => c.url.endsWith('/shared-live'))).toHaveLength(1);
    p.close();
  });

  it('does not open a link for Only me, tells the player when it drops, and closes when the page goes', async () => {
    let end: () => void = () => {};
    let signal: AbortSignal | undefined;
    const p = await pageWith((_pu, e) => (end = e), (url, init) => url.endsWith('/shared-live') && (signal = init.signal));
    p.read('me');
    await pause(30);
    expect(p.calls.filter((c) => c.url.endsWith('/shared-live'))).toHaveLength(0);
    p.read('class');
    await pause(30);
    end();
    await pause(30);
    expect(p.told.filter((m) => m.type === 'shared-live')).toEqual([{ target: 'interactives', type: 'shared-live', up: true }, { target: 'interactives', type: 'shared-live', up: false }]);
    p.win.dispatchEvent(new p.win.Event('pagehide'));
    expect(signal?.aborted).toBe(true);
    p.close();
  });
});
