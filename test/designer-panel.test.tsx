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
}));

import { DesignerChat, designerChat } from '../src/lib/designer';
import { DesignerPanel } from '../src/components/DesignerPanel';

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
    const chat = new DesignerChat(fetcher as unknown as typeof fetch);
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
    const chat = new DesignerChat(fetcher as unknown as typeof fetch);
    await chat.send('Move it', 'p1');
    expect(chat.state.undo).toEqual({ revision: 'rev9' });
    await chat.undo();
    expect(restoreRevision).toHaveBeenCalledWith('p1', 'rev9');
    expect(chat.state.undo).toBeNull();
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'note', text: expect.stringContaining('back as it was') });
  });

  it('says a refusal or the hourly limit in the server\'s own words, and marks the message as not sent when refused', async () => {
    const chat = new DesignerChat((async () => new Response(JSON.stringify({ error: 'That project belongs to someone else' }), { status: 403 })) as unknown as typeof fetch);
    await chat.send('Add a page', 'p1');
    expect(chat.state.messages[0]).toMatchObject({ from: 'me', failed: true });
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'error', text: 'That project belongs to someone else' });
    const limit = new DesignerChat((async () => streamed([lines({ type: 'error', text: 'The Activity Designer has reached its hourly limit. Try again in a little while.' }, { type: 'done', conversation: null })])) as unknown as typeof fetch);
    await limit.send('x', 'p1');
    expect(limit.state.messages.at(-1)).toMatchObject({ from: 'error', text: 'The Activity Designer has reached its hourly limit. Try again in a little while.' });
    expect(limit.state.messages[0].failed).toBeFalsy();
  });

  it('says so when the stream drops before it finished', async () => {
    const chat = new DesignerChat((async () => streamed([lines({ type: 'changed', revision: 'r' }, { type: 'status', text: 'Changing the project' })])) as unknown as typeof fetch);
    await chat.send('x', 'p1');
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'error', text: expect.stringContaining('you can undo') });
  });

  it('starts again for another project, and New chat clears it here and on the server', async () => {
    const bodies: any[] = [];
    const fetcher = async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return streamed([lines({ type: 'reply', text: 'ok' }, { type: 'done', conversation: 'c1' })]);
    };
    const chat = new DesignerChat(fetcher as unknown as typeof fetch);
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
    const chat = new DesignerChat(fetcher as unknown as typeof fetch);
    const p = chat.send('x', 'p1');
    chat.stop();
    await p;
    expect(chat.state.working).toBe(false);
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'note', text: expect.stringContaining('Stopped') });
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
    expect(bodies[0]).toEqual({ projectId: 'proj1', message: 'Add a Results page' });
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
});
