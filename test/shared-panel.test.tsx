//The Data panel's Shared responses source: adding one, its settings, the switch (a fixed setting, or a variable), the canvas showing the
//author's sample answers, and the owner's moderation list against a fake server.
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
let answers = [
  { text: 'alpha', count: 3, hidden: false, blocked: false, shown: true },
  { text: 'spamish', count: 1, hidden: false, blocked: true, shown: false },
];

function project(): Project {
  const p = createProject('Shared');
  p.id = 'prshpanel01';
  p.variables.push({ id: 'vwho', name: 'whoSees', type: 'enum', initial: 'Only me', options: ['Only me', 'Everyone in this class'] } as Project['variables'][number], { id: 'vn', name: 'count', type: 'number', initial: 1 });
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
  answers = [
    { text: 'alpha', count: 3, hidden: false, blocked: false, shown: true },
    { text: 'spamish', count: 1, hidden: false, blocked: true, shown: false },
  ];
  dataCache.clear();
  vi.stubGlobal('fetch', async (url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method ?? 'GET', url: String(url), body });
    const json = (j: unknown) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => j, text: async () => JSON.stringify(j) });
    if (String(url).endsWith('/shared') && !init.method) {
      return json({ sources: [{ source: s.get().project.dataSources[0].id, name: 'responses', declared: { who: 'class', byVariable: false, minCount: 2, perPerson: 5, maxLength: 40, blocked: ['spamish'] }, courses: [{ course: 'MAT1000_26S1', people: 4, answers }, { course: 'PHY2000_26S1', people: 1, answers: [{ text: 'other', count: 1, hidden: false, blocked: false, shown: false }] }] }] });
    }
    return json({ ok: true, people: 1, hidden: true });
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
const setText = (el: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
};

describe('adding one', () => {
  it('+ Shared responses makes a source with the defaults, named responses, as JSON', () => {
    mount();
    click(byText('button.link-btn', '+ Shared responses'));
    const ds = s.get().project.dataSources[0];
    expect(ds).toMatchObject({ name: 'responses', kind: 'json', source: 'shared', shared: { who: 'class', maxLength: 40, perPerson: 5, minCount: 1, refresh: 10 } });
    expect([...host.querySelectorAll('.script-list .badge')].map((b) => b.textContent)).toEqual(['built in', 'shared']);
    expect(host.textContent).toContain('Who sees it');
    expect(host.textContent).toContain('Blocked words');
    expect(host.textContent).not.toContain('Reload');
  });

  it('turns an existing source into one from the From list, and back', () => {
    mount();
    click(byText('button.link-btn', '+ From URL'));
    const from = [...host.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'shared'))!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(from, 'shared');
      from.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.dataSources[0]).toMatchObject({ source: 'shared', kind: 'json', shared: { who: 'class' } });
  });
});

describe('the settings', () => {
  const mountShared = () => {
    mount();
    click(byText('button.link-btn', '+ Shared responses'));
  };
  const field = (label: string) => [...host.querySelectorAll<HTMLElement>('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.includes(label))!;

  it('switches who sees it, directly or by a variable', () => {
    mountShared();
    const who = field('Who sees it').querySelector('select')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(who, 'me');
      who.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.dataSources[0].shared?.who).toBe('me');
    const sw = field('Switch with').querySelector('select')!;
    //only text and choice variables are offered
    expect([...sw.options].map((o) => o.textContent)).toEqual(['Nothing (use the setting above)', 'whoSees']);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sw, 'vwho');
      sw.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.dataSources[0].shared?.whoVariable).toBe('vwho');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sw, '');
      sw.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.dataSources[0].shared?.whoVariable).toBeUndefined();
  });

  it('keeps the blocklist and sample answers one a line, and the limits as numbers', () => {
    mountShared();
    setText(field('Blocked words').querySelector('textarea')!, 'spam\nbad phrase, rude\n');
    expect(s.get().project.dataSources[0].shared?.blocked).toEqual(['spam', 'bad phrase', 'rude']);
    setText(field('Sample answers').querySelector('textarea')!, 'sleep\nfocus\nsleep');
    expect(s.get().project.dataSources[0].shared?.sample).toEqual(['sleep', 'focus', 'sleep']);
    setText(field('Answers each').querySelector('input')!, '3');
    expect(s.get().project.dataSources[0].shared?.perPerson).toBe(3);
  });

  it('shows the canvas the sample answers, counted, and nothing when there are none', async () => {
    mountShared();
    const ds = s.get().project.dataSources[0];
    dataCache.sync(s.get().project);
    await flush();
    expect((previewScope(s.get().project).responses as any).ready).toBe(false);
    setText(field('Sample answers').querySelector('textarea')!, 'sleep\nfocus\nsleep');
    dataCache.sync(s.get().project);
    await flush();
    const v = previewScope(s.get().project).responses as any;
    expect(v.ready).toBe(true);
    expect(v.answers.map((a: any) => [a.text, a.count])).toEqual([['sleep', 2], ['focus', 1]]);
    expect(ds.name).toBe('responses');
  });
});

describe('moderating', () => {
  async function open() {
    mount();
    click(byText('button.link-btn', '+ Shared responses'));
    await flush();
    await flush();
  }

  it('lists what the class has said for the first course, with why an answer is not showing', async () => {
    await open();
    const rows = [...host.querySelectorAll('.shared-answers tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(0, 3).map((c) => c.textContent));
    expect(rows).toEqual([['alpha', '3', 'Yes'], ['spamish', '1', 'Blocked word']]);
    expect(host.textContent).toContain('MAT1000_26S1: 4 people, 2 different answers');
    expect(calls[0].url).toMatch(/projects\/prshpanel01\/shared$/);
  });

  it('hides and shows an answer through the server, and refreshes', async () => {
    await open();
    click(host.querySelector('button[aria-label="Hide alpha"]')!);
    await flush();
    await flush();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toMatch(/shared\/.+\/hidden$/);
    expect(put?.body).toEqual({ course: 'MAT1000_26S1', text: 'alpha', hidden: true });
    //it asked the list again afterwards
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });

  it('switches course', async () => {
    await open();
    const sel = [...host.querySelectorAll<HTMLSelectElement>('.shared-mod select')][0];
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'PHY2000_26S1');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect([...host.querySelectorAll('.shared-answers tbody tr td:first-child')].map((c) => c.textContent)).toEqual(['other']);
    expect(host.textContent).toContain('Waiting for 2 people');
  });

  it('says what to do when the project has not been shared with the source in it, or the server refuses', async () => {
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
