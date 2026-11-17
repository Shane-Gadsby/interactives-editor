import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const restoreRevision = vi.fn(async () => ({ rev: 5 }));
const resetDesigner = vi.fn(async () => ({ ok: true }));
vi.mock('../src/lib/db', () => ({
  apiUrl: (p: string) => `http://x.test/interactives/api/${p}`,
  restoreRevision: (...a: unknown[]) => (restoreRevision as (...a: unknown[]) => unknown)(...a),
  resetDesigner: (...a: unknown[]) => (resetDesigner as (...a: unknown[]) => unknown)(...a),
  session: async () => ({ user: null, power: false, designer: true }),
  designerStatus: async () => ({ on: true, mine: null, shared: { limit: 6, left: 4, resetsIn: 600 } }),
  designerToken: async () => ({}),
}));

import { DesignerChat, designerChat } from '../src/lib/designer';
import { DesignerPanel } from '../src/components/DesignerPanel';

//the client with no free answers and no open page, so what is asked goes to the server
const mk = (f: unknown) => new DesignerChat(f as typeof fetch, () => null, () => '');

const lines = (...events: unknown[]) => events.map((e) => JSON.stringify(e)).join('\n') + '\n';
//a streamed reply that arrives in pieces, the way the server writes it
const streamed = (chunks: string[], delay = 0) =>
  new Response(
    new ReadableStream({
      async start(c) {
        const enc = new TextEncoder();
        for (const ch of chunks) {
          if (delay) await new Promise((r) => setTimeout(r, delay));
          c.enqueue(enc.encode(ch));
        }
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  );

describe('the chat client', () => {
  it('sends the project id and message, shows status then the reply, and keeps the handle for the next request', async () => {
    const bodies: any[] = [];
    const fetcher = vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      const text = lines({ type: 'status', text: 'Reading the project' }, { type: 'reply', text: 'Done.' }, { type: 'done', conversation: 'chat1' });
      //split mid line
      return streamed([text.slice(0, 20), text.slice(20)]);
    });
    const chat = mk(fetcher);
    const seen: string[] = [];
    chat.subscribe((s) => s.working && s.status && seen.push(s.status));
    await chat.send('Add a page', 'p1');
    expect(bodies[0]).toEqual({ projectId: 'p1', message: 'Add a page' });
    expect(seen).toContain('Reading the project');
    expect(chat.state.messages.map((m) => [m.from, m.text])).toEqual([['me', 'Add a page'], ['agent', 'Done.']]);
    expect(chat.state.working).toBe(false);
    expect(chat.state.undo).toBeNull();
    await chat.send('And another', 'p1');
    expect(bodies[1]).toMatchObject({ conversation: 'chat1', message: 'And another' });
  });

  it('offers undo after a change, and undoing restores that revision and says so', async () => {
    const fetcher = vi.fn(async () => streamed([lines({ type: 'changed', revision: 'rev9' }, { type: 'reply', text: 'Moved it.' }, { type: 'done', conversation: 'c' })]));
    const chat = mk(fetcher);
    await chat.send('Move it', 'p1');
    expect(chat.state.undo).toEqual({ revision: 'rev9' });
    await chat.undo();
    expect(restoreRevision).toHaveBeenCalledWith('p1', 'rev9');
    expect(chat.state.undo).toBeNull();
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'note', text: expect.stringContaining('back as it was') });
  });

  it('says a refusal or the hourly limit in the server\'s own words, and marks the message as not sent when refused', async () => {
    const chat = mk((async () => new Response(JSON.stringify({ error: 'That project belongs to someone else' }), { status: 403 })));
    await chat.send('Add a page', 'p1');
    expect(chat.state.messages[0]).toMatchObject({ from: 'me', failed: true });
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'error', text: 'That project belongs to someone else' });
    const limit = mk((async () => streamed([lines({ type: 'error', text: 'The Activity Designer has reached its hourly limit. Try again in a little while.' }, { type: 'done', conversation: null })])));
    await limit.send('x', 'p1');
    expect(limit.state.messages.at(-1)).toMatchObject({ from: 'error', text: 'The Activity Designer has reached its hourly limit. Try again in a little while.' });
    expect(limit.state.messages[0].failed).toBeFalsy();
  });

  it('says so when the stream drops before it finished', async () => {
    const chat = mk((async () => streamed([lines({ type: 'changed', revision: 'r' }, { type: 'status', text: 'Changing the project' })])));
    await chat.send('x', 'p1');
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'error', text: expect.stringContaining('you can undo') });
  });

  it('starts again for another project, and New chat clears it here and on the server', async () => {
    const bodies: any[] = [];
    const fetcher = async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return streamed([lines({ type: 'reply', text: 'ok' }, { type: 'done', conversation: 'c1' })]);
    };
    const chat = mk(fetcher);
    await chat.send('one', 'p1');
    await chat.send('two', 'p2');
    expect(bodies[1].conversation).toBeUndefined();
    expect(chat.state.messages).toHaveLength(2);
    await chat.newChat();
    expect(chat.state.messages).toEqual([]);
    expect(resetDesigner).toHaveBeenCalledWith('p2');
    await chat.send('three', 'p2');
    expect(bodies[2].conversation).toBeUndefined();
  });

  it('stops when asked', async () => {
    const fetcher = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const chat = mk(fetcher);
    const p = chat.send('x', 'p1');
    chat.stop();
    await p;
    expect(chat.state.working).toBe(false);
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'note', text: expect.stringContaining('Stopped') });
  });
});

describe('free answers and the shared allowance (client)', () => {
  it('answers a how-do-I from the help with no request to the server, and "Ask anyway" sends it', async () => {
    const bodies: any[] = [];
    const fetcher = vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return streamed([lines({ type: 'reply', text: 'Here is how.' }, { type: 'done', conversation: 'c1' })]);
    });
    const topics = [{ id: 'pages', title: 'Pages', snippet: 'A page is an artboard' }];
    const chat = new DesignerChat(fetcher as unknown as typeof fetch, () => ({ kind: 'help', topics }), () => '');
    await chat.send('How do I add a page?', 'p1');
    expect(fetcher).not.toHaveBeenCalled();
    expect(chat.state.working).toBe(false);
    expect(chat.state.messages.map((m) => m.from)).toEqual(['me', 'help']);
    expect(chat.state.messages[1]).toMatchObject({ topics, ask: 'How do I add a page?' });
    await chat.send('How do I add a page?', 'p1', { force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(bodies[0].message).toBe('How do I add a page?');
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'agent', text: 'Here is how.' });
  });

  it('says a behaviour was done without the AI, and sends nothing', async () => {
    const fetcher = vi.fn();
    const chat = new DesignerChat(fetcher as unknown as typeof fetch, () => ({ kind: 'behaviour', sentence: 'When Start is clicked, go to the next page' }), () => '');
    await chat.send('when clicked go to the next page', 'p1');
    expect(fetcher).not.toHaveBeenCalled();
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'note', text: expect.stringContaining('Done without using the AI: When Start is clicked, go to the next page') });
  });

  it('wording from the free path waits for the help when it has to load, and a second ask while it does is ignored', async () => {
    let release!: (a: any) => void;
    const slow = new Promise<any>((r) => (release = r));
    const chat = new DesignerChat((async () => new Response('')) as unknown as typeof fetch, () => slow, () => '');
    const a = chat.send('How do I add a page?', 'p1');
    const b = chat.send('How do I add a page?', 'p1');
    release({ kind: 'help', topics: [{ id: 'pages', title: 'Pages', snippet: 's' }] });
    await Promise.all([a, b]);
    expect(chat.state.messages.filter((m) => m.from === 'me')).toHaveLength(1);
  });

  it('keeps the shared allowance from the server, and offers their own when it is used up or Cogniti\'s own limit is hit', async () => {
    const out = new DesignerChat((async () => new Response(JSON.stringify({ error: 'You have used your 6 shared Activity Designer requests for this hour.', kind: 'quota', quota: { limit: 6, left: 0, resetsIn: 300 } }), { status: 429 })) as unknown as typeof fetch, () => null, () => '');
    await out.send('Add a page', 'p1');
    expect(out.state.quota).toEqual({ limit: 6, left: 0, resetsIn: 300 });
    expect(out.state.messages.at(-1)).toMatchObject({ from: 'error', allowance: true });
    //nothing to try again: the same words would be turned away
    expect(out.state.messages[0].failed).toBeFalsy();

    const done = new DesignerChat((async () => streamed([lines({ type: 'reply', text: 'ok' }, { type: 'done', conversation: 'c', quota: { limit: 6, left: 3, resetsIn: 100 } })])) as unknown as typeof fetch, () => null, () => '');
    await done.send('x', 'p1');
    expect(done.state.quota).toMatchObject({ left: 3 });

    const limit = new DesignerChat((async () => streamed([lines({ type: 'error', text: 'The Activity Designer has reached its hourly limit.', kind: 'limit' }, { type: 'done', conversation: null })])) as unknown as typeof fetch, () => null, () => '');
    await limit.send('x', 'p1');
    expect(limit.state.messages.at(-1)).toMatchObject({ allowance: true });

    //on their own token there is no shared allowance to run out
    const own = new DesignerChat((async () => streamed([lines({ type: 'error', text: 'Your own Cogniti allowance has reached its hourly limit.', kind: 'limit' }, { type: 'done', conversation: null, quota: null })])) as unknown as typeof fetch, () => null, () => '');
    await own.refreshStatus();
    expect(own.state.own).toBe(false);
  });

  it('reads the status for the panel: their share, or that they are on their own token', async () => {
    const chat = mk(async () => new Response(''));
    await chat.refreshStatus();
    expect(chat.state).toMatchObject({ own: false, quota: { limit: 6, left: 4 } });
  });
});

describe('the panel', () => {
  let host: HTMLDivElement;
  let root: Root;
  let st: EditorStore;
  beforeEach(() => {
    const p = createProject('Panel');
    p.id = 'proj1';
    st = new EditorStore(p);
    setCurrentStore(st);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    restoreRevision.mockClear();
    resetDesigner.mockClear();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  const type = (el: HTMLTextAreaElement, text: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('streams progress and the reply, then offers undo that calls the restore, and New chat starts again', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const bodies: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          new ReadableStream({
            async start(c) {
              const enc = new TextEncoder();
              c.enqueue(enc.encode(lines({ type: 'status', text: 'Changing the project' })));
              await hold;
              c.enqueue(enc.encode(lines({ type: 'changed', revision: 'rev1' }, { type: 'reply', text: 'I added a **Results** page.' }, { type: 'done', conversation: 'c1' })));
              c.close();
            },
          }),
        );
      }),
    );
    await act(async () => root.render(<DesignerPanel open onClose={() => undefined} />));
    expect(host.textContent).toContain('It builds in your project as you watch. Check what it made; you can undo it.');
    expect(host.textContent).not.toMatch(/Copilot/);
    const box = host.querySelector('textarea')!;
    type(box, 'Add a Results page');
    await act(async () => {
      (host.querySelector('button[type=submit]') as HTMLButtonElement).click();
    });
    expect(bodies[0]).toEqual({ projectId: 'proj1', artboardId: st.artboard()!.id, message: 'Add a Results page' });
    expect(host.querySelector('.designer-progress')?.textContent).toContain('Changing the project…');
    expect(host.textContent).not.toContain('Undo what the Activity Designer did');
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(host.querySelector('.designer-progress')).toBeNull();
    expect(host.querySelector('.designer-msg.agent')?.innerHTML).toContain('<strong>Results</strong>');
    const undoBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Undo what the Activity Designer did')!;
    expect(undoBtn).toBeTruthy();
    // a live tab hears about the restore from the server, so give it a live status and it doesn't reload itself
    st.set({ live: { status: 'live' } });
    await act(async () => undoBtn.click());
    expect(restoreRevision).toHaveBeenCalledWith('proj1', 'rev1');
    expect(host.textContent).not.toContain('Undo what the Activity Designer did');
    expect(host.textContent).toContain('Your project is back as it was');

    await act(async () => ([...host.querySelectorAll('button')].find((b) => b.textContent === 'New chat') as HTMLButtonElement).click());
    expect(host.querySelectorAll('.designer-msg')).toHaveLength(0);
    expect(resetDesigner).toHaveBeenCalledWith('proj1');
    vi.unstubAllGlobals();
    designerChat().newChat();
  });

  it('shows how many shared requests are left this hour, and a link to their own allowance', async () => {
    await act(async () => root.render(<DesignerPanel open onClose={() => undefined} />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(host.querySelector('.designer-quota')?.textContent).toContain('4 of 6 shared requests left this hour');
    const link = [...host.querySelectorAll('.designer-quota button')].find((b) => b.textContent === 'Use my own Cogniti allowance') as HTMLButtonElement;
    expect(link).toBeTruthy();
    await act(async () => link.click());
    const { prefsWindow } = await import('../src/lib/prefs-window');
    expect(prefsWindow()).toMatchObject({ open: true, page: 'general', setting: 'designerAllowance' });
  });

  it('answers a how-do-I from the help with the top topics as links and an Ask anyway button that spends a request', async () => {
    const bodies: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return streamed([lines({ type: 'reply', text: 'Sure.' }, { type: 'done', conversation: 'c2' })]);
      }),
    );
    designerChat().newChat();
    await act(async () => root.render(<DesignerPanel open onClose={() => undefined} />));
    const box = host.querySelector('textarea')!;
    type(box, 'How do I add a multiple choice question?');
    await act(async () => {
      (host.querySelector('button[type=submit]') as HTMLButtonElement).click();
    });
    //the help is a chunk of its own: it loads on the first question
    await act(async () => {
      await vi.waitFor(() => expect(designerChat().state.messages.some((m) => m.from === 'help')).toBe(true), { timeout: 8000 });
    });
    //no request went to the server
    expect(bodies).toEqual([]);
    const help = host.querySelector('.designer-msg.help')!;
    expect(help.textContent).toContain('Nothing was sent to the Activity Designer');
    expect(help.querySelectorAll('.designer-topics button').length).toBeGreaterThan(0);
    const anyway = [...help.querySelectorAll('button')].find((b) => b.textContent === 'Ask the Activity Designer anyway') as HTMLButtonElement;
    expect(anyway).toBeTruthy();
    await act(async () => {
      anyway.click();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ message: 'How do I add a multiple choice question?' });
    expect(host.querySelector('.designer-msg.agent')?.textContent).toContain('Sure.');
    vi.unstubAllGlobals();
    designerChat().newChat();
  });
});
