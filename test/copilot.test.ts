import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ copilotToken: vi.fn(async () => ({ token: 'tok', conversationId: 'c1', expiresIn: 3600, userId: 'dl_me' })) }));
import { CopilotChat } from '../src/lib/copilot';

function fakeDirectLine(replies: unknown[][]) {
  const sent: { method: string; url: string; body: unknown }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ method: String(init.method), url, body });
    if (url.endsWith('/conversations')) return new Response(JSON.stringify({ conversationId: 'c1', expires_in: 3600 }));
    if (init.method === 'GET') return new Response(JSON.stringify({ activities: replies.shift() ?? [], watermark: String(sent.length) }));
    return new Response(JSON.stringify({ id: 'x' }));
  });
  return { sent, fetcher: fetcher as unknown as typeof fetch };
}

describe('Activity Designer chat', () => {
  it('opens a conversation, says hello with the project, and shows the greeting', async () => {
    vi.useFakeTimers();
    const dl = fakeDirectLine([[{ id: 'a1', type: 'message', text: 'Hi! What are you building?', from: { id: 'bot', role: 'bot' } }, { id: 'a2', type: 'event', name: 'turn.complete', from: { id: 'bot' } }]]);
    const chat = new CopilotChat(dl.fetcher);
    await chat.start({ projectName: 'Water cycle' });
    expect(dl.sent[1]).toMatchObject({ method: 'POST', body: { type: 'event', name: 'startConversation', value: { projectName: 'Water cycle' } } });
    expect(chat.state.typing).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(chat.state.messages).toEqual([expect.objectContaining({ from: 'agent', text: 'Hi! What are you building?' })]);
    expect(chat.state.typing).toBe(false);
    chat.close();
    vi.useRealTimers();
  });

  it('sends what was typed, skips its own echo, and offers suggested actions as buttons', async () => {
    vi.useFakeTimers();
    const dl = fakeDirectLine([[], [{ id: 'm1', type: 'message', text: 'hello', from: { id: 'dl_me' } }, { id: 'm2', type: 'message', text: 'Which kind?', from: { id: 'bot' }, suggestedActions: { actions: [{ title: 'Quiz', value: 'quiz' }] } }]]);
    const chat = new CopilotChat(dl.fetcher);
    await chat.start();
    await vi.advanceTimersByTimeAsync(1000);
    await chat.send('hello');
    expect(dl.sent.find((s) => (s.body as { type?: string })?.type === 'message')?.body).toMatchObject({ text: 'hello', from: { id: 'dl_me' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(chat.state.messages.map((m) => [m.from, m.text])).toEqual([['me', 'hello'], ['agent', 'Which kind?']]);
    expect(chat.state.messages[1].actions).toEqual([{ title: 'Quiz', value: 'quiz' }]);
    chat.close();
    expect(chat.state.messages).toEqual([]);
    vi.useRealTimers();
  });

  it('marks a message that could not be sent', async () => {
    const dl = fakeDirectLine([]);
    const chat = new CopilotChat(dl.fetcher);
    await chat.start();
    (dl.fetcher as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => new Response('', { status: 500 }));
    await chat.send('anyone there?');
    expect(chat.state.messages.at(-1)).toMatchObject({ from: 'me', failed: true });
    chat.close();
  });
});
