//The Data panel's Room source: adding one, its settings, the canvas showing the author's sample messages, and the moderation list
//(Hide and Show) against a fake server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DataPanel } from '../src/panels/DataPanel';
import { dataCache, previewScope } from '../src/lib/data';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let calls: { method: string; url: string; body?: any }[] = [];

const rows = () => [
  { id: 'aaa000000000000001', seat: 'Quiet Otter 41', username: 'sam', text: 'hello class', at: Date.UTC(2026, 10, 11, 1, 0), hidden: false, hiddenBy: null },
  { id: 'aaa000000000000002', seat: 'Brave Emu 12', username: 'lee', text: 'rude one', at: Date.UTC(2026, 10, 11, 1, 5), hidden: true, hiddenBy: 'ann' },
];

function project(): Project {
  const p = createProject('Rooms');
  p.id = 'prroompanel1';
  return p;
}
function mount(p = project()) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<DataPanel />));
}
beforeEach(() => {
  calls = [];
  dataCache.clear();
  vi.stubGlobal('fetch', async (url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method ?? 'GET', url: String(url), body });
    const json = (j: unknown) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => j, text: async () => JSON.stringify(j) });
    if (String(url).endsWith('/rooms') && !init.method) {
      return json({
        sources: [
          {
            source: s.get().project.dataSources[0].id,
            name: 'chat',
            declared: { names: 'seat', show: 100, blocked: ['spam'] },
            courses: [
              { course: 'MAT1000_26S1', here: 3, messages: rows() },
              { course: 'PHY2000_26S1', here: 0, messages: [{ id: 'bbb000000000000001', seat: 'Calm Kiwi 77', username: 'kim', text: 'from physics', at: 1, hidden: false, hiddenBy: null }] },
            ],
          },
        ],
      });
    }
    return json({ ok: true, hidden: true });
  });
  vi.stubGlobal('document', document);
});
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

const click = (el: Element) => act(() => (el as HTMLElement).click());
const byText = (sel: string, text: string) => [...host.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.trim() === text)!;
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const field = (label: string) => [...host.querySelectorAll<HTMLElement>('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.includes(label))!;
const setText = (el: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
};
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

describe('adding a room', () => {
  it('+ Room makes a source with the defaults, named chat, as JSON, with its own badge and no Reload', () => {
    mount();
    click(byText('button.link-btn', '+ Room'));
    expect(s.get().project.dataSources[0]).toMatchObject({ name: 'chat', kind: 'json', source: 'room', room: { names: 'seat', show: 100, blocked: [], sample: [] } });
    expect([...host.querySelectorAll('.script-list .badge')].map((b) => b.textContent)).toEqual(['built in', 'room']);
    expect(host.textContent).toContain('People show as');
    expect(host.textContent).toContain('Messages in view');
    expect(host.textContent).toContain('Blocked words');
    expect(host.textContent).not.toContain('Reload');
    expect(host.textContent).not.toContain('Format');
  });

  it('turns an existing source into one from the From list', () => {
    mount();
    click(byText('button.link-btn', '+ From URL'));
    const from = [...host.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'room'))!;
    choose(from, 'room');
    expect(s.get().project.dataSources[0]).toMatchObject({ source: 'room', kind: 'json', room: { names: 'seat' } });
  });
});

describe('the settings', () => {
  const mountRoom = () => {
    mount();
    click(byText('button.link-btn', '+ Room'));
  };

  it('picks how people show, keeps the number of messages in range, and the blocklist and samples one a line', () => {
    mountRoom();
    choose(field('People show as').querySelector('select')!, 'first');
    expect(s.get().project.dataSources[0].room?.names).toBe('first');
    setText(field('Messages in view').querySelector('input')!, '40');
    expect(s.get().project.dataSources[0].room?.show).toBe(40);
    setText(field('Blocked words').querySelector('textarea')!, 'spam\nbad phrase, rude\n');
    expect(s.get().project.dataSources[0].room?.blocked).toEqual(['spam', 'bad phrase', 'rude']);
    setText(field('Sample messages').querySelector('textarea')!, 'Hi all\nAnyone here?');
    expect(s.get().project.dataSources[0].room?.sample).toEqual(['Hi all', 'Anyone here?']);
  });

  it('shows the canvas the sample messages, each from a person, and nothing when there are none', async () => {
    mountRoom();
    dataCache.sync(s.get().project);
    await flush();
    expect((previewScope(s.get().project).chat as any).ready).toBe(false);
    setText(field('Sample messages').querySelector('textarea')!, 'Hi all\nAnyone here?');
    dataCache.sync(s.get().project);
    await flush();
    const v = previewScope(s.get().project).chat as any;
    expect(v.ready).toBe(true);
    expect(v.messages.map((m: any) => [m.seat, m.text])).toEqual([['Learner 1', 'Hi all'], ['Learner 2', 'Anyone here?']]);
    expect(v.here).toBe(2);
  });

  it('says how to use it in expressions', () => {
    mountRoom();
    expect(host.textContent).toContain('chat.messages');
    expect(host.textContent).toContain('chat.here');
  });
});

describe('moderating', () => {
  async function open() {
    mount();
    click(byText('button.link-btn', '+ Room'));
    await flush();
    await flush();
  }

  it('lists what the first course has said, newest first as the server sent it, with who sent it and which are hidden', async () => {
    await open();
    const table = [...host.querySelectorAll('.shared-answers tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(0, 3).map((c) => c.textContent));
    expect(table).toEqual([['hello class', 'Quiet Otter 41', 'sam'], ['rude one', 'Brave Emu 12', 'lee']]);
    expect([...host.querySelectorAll('.shared-answers tbody tr')].map((r) => r.className)).toEqual(['', 'muted']);
    expect(host.textContent).toContain('MAT1000_26S1: 3 here now, the latest 2 messages');
    expect(calls[0].url).toMatch(/projects\/prroompanel1\/rooms$/);
    expect(byText('.shared-answers button', 'Hide')).toBeTruthy();
    expect(byText('.shared-answers button', 'Show')).toBeTruthy();
  });

  it('hides a message through the server and asks for the list again', async () => {
    await open();
    click(byText('.shared-answers button', 'Hide'));
    await flush();
    await flush();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toMatch(/rooms\/.+\/messages\/aaa000000000000001\/hidden$/);
    expect(put?.body).toEqual({ hidden: true });
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a hidden one again', async () => {
    await open();
    click(byText('.shared-answers button', 'Show'));
    await flush();
    await flush();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toMatch(/messages\/aaa000000000000002\/hidden$/);
    expect(put?.body).toEqual({ hidden: false });
  });

  it('gives each button a name that says whose message it is, for a screen reader', async () => {
    await open();
    const names = [...host.querySelectorAll('.shared-answers button')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Hide the message from Quiet Otter 41: hello class', 'Show the message from Brave Emu 12: rude one']);
  });

  it('switches course', async () => {
    await open();
    const sel = [...host.querySelectorAll<HTMLSelectElement>('.shared-mod select')][0];
    choose(sel, 'PHY2000_26S1');
    expect([...host.querySelectorAll('.shared-answers tbody tr td:first-child')].map((c) => c.textContent)).toEqual(['from physics']);
  });

  it('says what to do when the project has not been shared with the room in it, or the server refuses', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ sources: [] }), text: async () => '{}' }));
    await open();
    expect(host.textContent).toContain('Nothing to moderate yet');
    act(() => root.unmount());
    host.remove();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 403, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ error: 'Not yours' }), text: async () => '{}' }));
    await open();
    expect(host.querySelector('.shared-mod .error')?.textContent).toBe('Not yours');
  });
});
