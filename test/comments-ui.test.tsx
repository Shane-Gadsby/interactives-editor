//The comment pieces on screen: the panel and its filters, a conversation (resolve, assign, reply, @ mentions), the
//new comment box, a guest being asked for a name, and the pin on the canvas not being in the preview.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { comments } from '../src/lib/comments';
import { CommentsPanel } from '../src/panels/CommentsPanel';
import { DraftCard, ThreadCard, Pin, timeAgo } from '../src/components/CommentUI';
import { CommentLayer } from '../src/canvas/CommentLayer';
import type { Thread } from '../shared/comments.mjs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const calls: { url: string; method: string; body: any }[] = [];
let respond: (url: string, method: string, body: any) => unknown = () => ({});

class FakeES {
  addEventListener() {}
  close() {}
  onerror = null;
}

const t = (id: string, n: number, extra: Partial<Thread> = {}): Thread => ({
  id,
  n,
  anchor: { artboardId: 'ab1', layerId: null, x: 100, y: 50 },
  ctx: { artboard: 'Main', layer: '' },
  status: 'open',
  assignee: null,
  resolved: null,
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  comments: [{ id, by: { username: 'bob', name: 'Bob B' }, text: `Note ${n} about the title`, mentions: [], created: new Date().toISOString(), edited: null }],
  ...extra,
});

const project = () => {
  const p = createProject('P');
  p.artboards[0].id = 'ab1';
  p.artboards[0].name = 'Main';
  p.artboards[0].children = [createNode('rect', { name: 'Panel', x: 0, y: 0, width: 50, height: 50 })];
  return p;
};

const start = async (me: any, threads: Thread[], mode: 'editor' | 'review' = 'editor') => {
  respond = (url) => (url.endsWith('/comments') ? { threads, people: [{ username: 'ann', name: 'Ann A' }, { username: 'bob', name: 'Bob B' }], me } : {});
  if (mode === 'editor') await act(async () => comments.startEditor('pr1'));
  else await act(async () => comments.startReview('tok', { threads, people: [{ username: 'ann', name: 'Ann A' }, { username: 'bob', name: 'Bob B' }], me }));
};

beforeEach(() => {
  calls.length = 0;
  (globalThis as any).EventSource = FakeES;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: URL | string, init: RequestInit = {}) => {
      const url = String(u).replace(/^https?:\/\/[^/]+\/?/, '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init.method ?? 'GET', body });
      return new Response(JSON.stringify(respond(url, init.method ?? 'GET', body)), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  comments.stop();
  vi.unstubAllGlobals();
});

const render = (el: React.ReactElement) => act(async () => root.render(el));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
const buttons = (label: string | RegExp) => [...host.querySelectorAll('button')].filter((b) => (typeof label === 'string' ? b.textContent?.trim() === label : label.test(b.textContent ?? '')));
const type = (el: HTMLTextAreaElement | HTMLInputElement, value: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.setSelectionRange?.(value.length, value.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

const ann = { username: 'ann', name: 'Ann A' };

describe('the Comments panel', () => {
  it('lists open conversations with where they are and who wrote them, and counts them', async () => {
    await start(ann, [t('cm1', 1), t('cm2', 2, { status: 'resolved' }), t('cm3', 3, { assignee: { username: 'ann', name: 'Ann A' } })]);
    await render(<CommentsPanel project={project()} onJump={() => {}} />);
    const rows = [...host.querySelectorAll('.cm-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Note 1 about the title');
    expect(rows[0].textContent).toContain('Main');
    expect(rows[0].textContent).toContain('Bob B');
    expect(rows[1].textContent).toContain('for you');
    expect(host.querySelector('.cm-panel-head .badge')?.textContent).toBe('2');
  });

  it('filters by status and whose, and says so when nothing matches', async () => {
    await start(ann, [t('cm1', 1), t('cm2', 2, { status: 'resolved' }), t('cm3', 3, { assignee: { username: 'ann', name: 'Ann A' } })]);
    await render(<CommentsPanel project={project()} onJump={() => {}} />);
    await click(buttons(/^Resolved/)[0]);
    expect(host.querySelectorAll('.cm-row')).toHaveLength(1);
    await click(buttons('All')[0]);
    expect(host.querySelectorAll('.cm-row')).toHaveLength(3);
    const scope = host.querySelector('select[aria-label="Whose"]') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(scope, 'assigned');
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelectorAll('.cm-row')).toHaveLength(1);
    await click(buttons(/^Open/)[0]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(scope, 'mine');
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('.cm-empty')?.textContent).toMatch(/No comments match/);
  });

  it('goes to a comment when its row is clicked', async () => {
    await start(ann, [t('cm1', 1)]);
    const jump = vi.fn();
    await render(<CommentsPanel project={project()} onJump={jump} />);
    await click(host.querySelector('.cm-row'));
    expect(jump).toHaveBeenCalledWith(expect.objectContaining({ id: 'cm1' }));
  });

  it('only offers Mine and Assigned to me to somebody signed in', async () => {
    await start(null, [t('cm1', 1)], 'review');
    await render(<CommentsPanel project={project()} onJump={() => {}} />);
    const opts = [...host.querySelectorAll('select[aria-label="Whose"] option')].map((o) => o.textContent);
    expect(opts).toEqual(['Everyone']);
  });

  it('hides and shows the pins from its eye button', async () => {
    await start(ann, [t('cm1', 1)]);
    await render(<CommentsPanel project={project()} onJump={() => {}} />);
    expect(comments.get().showPins).toBe(true);
    await click(host.querySelector('button[aria-label="Show pins"]'));
    expect(comments.get().showPins).toBe(false);
    comments.setShowPins(true);
  });
});

describe('a conversation', () => {
  it('resolves and reopens', async () => {
    await start(ann, [t('cm1', 1)]);
    respond = () => ({ thread: t('cm1', 1, { status: 'resolved', resolved: { by: ann, at: 'x' } }) });
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    await click(buttons('Resolve')[0]);
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm1', method: 'PATCH', body: { status: 'resolved' } });
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    expect(buttons('Reopen')).toHaveLength(1);
    expect(host.textContent).toContain('Resolved by Ann A');
  });

  it('lets the owner assign it from the people it knows, and a reviewer only reads who has it', async () => {
    await start(ann, [t('cm1', 1)]);
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    const sel = host.querySelector('.cm-assign select') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Nobody', 'Ann A', 'Bob B']);
    respond = () => ({ thread: t('cm1', 1, { assignee: { username: 'bob', name: 'Bob B' } }) });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'bob');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { assignee: { username: 'bob', name: 'Bob B' } } });
    comments.stop();
    await start({ username: 'cat', name: 'Cat' }, [t('cm1', 1, { assignee: { username: 'bob', name: 'Bob B' } })], 'review');
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    expect(host.querySelector('.cm-assign select')).toBeNull();
    expect(host.textContent).toContain('Assigned to Bob B');
  });

  it('replies with Ctrl+Enter and sends the people named with @', async () => {
    await start(ann, [t('cm1', 1)]);
    respond = () => ({ thread: t('cm1', 1) });
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    const box = host.querySelector('.cm-composer textarea') as HTMLTextAreaElement;
    await type(box, 'Thanks @bob and @nobody');
    await act(async () => void box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })));
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm1/replies', body: { text: 'Thanks @bob and @nobody', mentions: ['bob'] } });
    expect(box.value).toBe('');
  });

  it('offers the people when @ is typed, and Tab puts the first in', async () => {
    await start(ann, [t('cm1', 1)]);
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    const box = host.querySelector('.cm-composer textarea') as HTMLTextAreaElement;
    await type(box, 'Hi @bo');
    expect([...host.querySelectorAll('.cm-people button')].map((b) => b.textContent)).toEqual(['Bob B @bob']);
    await act(async () => void box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(box.value).toBe('Hi @bob ');
  });

  it('lets only the author edit, and the owner delete any message', async () => {
    await start(ann, [t('cm1', 1)]);
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    expect(host.querySelector('button[aria-label="Edit"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Delete"]')).not.toBeNull();
    comments.stop();
    await start({ username: 'bob', name: 'Bob B' }, [t('cm1', 1)], 'review');
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    expect(host.querySelector('button[aria-label="Edit"]')).not.toBeNull();
    comments.stop();
    await start({ username: 'cat', name: 'Cat' }, [t('cm1', 1)], 'review');
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    expect(host.querySelector('button[aria-label="Edit"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Delete"]')).toBeNull();
  });
});

describe('a guest on the review page', () => {
  it('is asked for a name, which stays in its box while typed, and cannot send without one', async () => {
    await start(null, [t('cm1', 1)], 'review');
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    expect(host.querySelector('button[aria-label="Delete"]')).toBeNull();
    expect(buttons('Resolve')).toHaveLength(0);
    const name = host.querySelector('.cm-name input') as HTMLInputElement;
    const box = host.querySelector('.cm-composer textarea') as HTMLTextAreaElement;
    await type(box, 'A note');
    expect((buttons('Reply')[0] as HTMLButtonElement).disabled).toBe(true);
    await type(name, 'D');
    await type(name, 'Dr Nair');
    expect(host.querySelector('.cm-name input')).toBe(name);
    expect(comments.get().guestName).toBe('Dr Nair');
    expect((buttons('Reply')[0] as HTMLButtonElement).disabled).toBe(false);
    localStorage.removeItem('ix-review-name');
  });

  it('cannot mention anybody', async () => {
    await start(null, [t('cm1', 1)], 'review');
    await render(<ThreadCard thread={comments.get().threads[0]} where="Main" />);
    const box = host.querySelector('.cm-composer textarea') as HTMLTextAreaElement;
    await type(box, 'Hi @bo');
    expect(host.querySelector('.cm-people')).toBeNull();
    expect(box.placeholder).not.toMatch(/mention/);
  });
});

describe('a new comment', () => {
  it('shows where it is pinned, sends with the anchor, and closes the draft', async () => {
    await start(ann, []);
    comments.startDraft({ anchor: { artboardId: 'ab1', layerId: 'n1', lx: 1, ly: 2, x: 3, y: 4 }, context: { artboard: 'Main', layer: 'Panel' } });
    respond = () => ({ thread: t('cm7', 1) });
    await render(<DraftCard where="Main › Panel" onClose={() => comments.startDraft(null)} />);
    expect(host.textContent).toContain('Main › Panel');
    await type(host.querySelector('textarea') as HTMLTextAreaElement, 'Make this bigger');
    await click(buttons('Comment')[0]);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: 'api/projects/pr1/comments', body: { text: 'Make this bigger', anchor: { layerId: 'n1' } } });
    expect(comments.get().draft).toBeNull();
    expect(comments.get().openId).toBe('cm7');
  });

  it('Cancel discards it', async () => {
    await start(ann, []);
    comments.startDraft({ anchor: { artboardId: 'ab1', layerId: null, x: 3, y: 4 }, context: { artboard: 'Main', layer: '' } });
    await render(<DraftCard where="Main" onClose={() => comments.startDraft(null)} />);
    await click(buttons('Cancel')[0]);
    expect(comments.get().draft).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});

describe('pins on the canvas', () => {
  it('sit at the spot, follow the filters, and are not drawn while the timeline plays', async () => {
    await start(ann, [t('cm1', 1), t('cm2', 2, { status: 'resolved', anchor: { artboardId: 'ab1', layerId: null, x: 200, y: 80 } })]);
    const p = project();
    await render(<CommentLayer project={p} zoom={2} panX={10} panY={20} />);
    const pins = [...host.querySelectorAll<HTMLElement>('.cm-layer [data-pin]')];
    expect(pins).toHaveLength(1);
    expect(pins[0].style.left).toBe(`${10 + (p.artboards[0].canvasX + 100) * 2}px`);
    expect(pins[0].style.top).toBe(`${20 + (p.artboards[0].canvasY + 50) * 2}px`);
    comments.setFilter({ status: 'all' });
    await render(<CommentLayer project={p} zoom={2} panX={10} panY={20} />);
    expect(host.querySelectorAll('.cm-layer [data-pin]')).toHaveLength(2);
    await render(<CommentLayer project={p} zoom={2} panX={10} panY={20} hidden />);
    expect(host.querySelector('.cm-layer')).toBeNull();
    comments.setShowPins(false);
    await render(<CommentLayer project={p} zoom={2} panX={10} panY={20} />);
    expect(host.querySelectorAll('.cm-layer [data-pin]')).toHaveLength(0);
    comments.setShowPins(true);
  });

  it('opens a conversation next to its pin on click, and Escape puts it away', async () => {
    await start(ann, [t('cm1', 1)]);
    await render(<CommentLayer project={project()} zoom={1} panX={0} panY={0} />);
    await click(host.querySelector('.cm-layer [data-pin]'));
    expect(host.querySelector('.cm-card')?.textContent).toContain('Note 1 about the title');
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(host.querySelector('.cm-card')).toBeNull();
  });

  it('keeps a pin whose layer was deleted where it was, drawn dashed', async () => {
    await start(ann, [t('cm1', 1, { anchor: { artboardId: 'ab1', layerId: 'gone', lx: 1, ly: 1, x: 40, y: 60 } })]);
    await render(<CommentLayer project={project()} zoom={1} panX={0} panY={0} />);
    expect(host.querySelector('.cm-pin')?.classList.contains('detached')).toBe(true);
  });
});

describe('small things', () => {
  it('words how long ago', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(timeAgo('2026-11-04T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-11-04T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-11-04T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-01T12:00:00Z', now)).toBe('3 d ago');
  });

  it('a pin says its number, who wrote it, its replies and whether it is resolved, for a screen reader', async () => {
    await render(<Pin thread={t('cm1', 4, { status: 'resolved', comments: [t('x', 1).comments[0], t('y', 1).comments[0]] })} />);
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Comment 4 by Bob B, 1 reply, resolved');
  });
});
