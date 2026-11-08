import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type FontRef, type TextNode } from 'interactives-player';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => [{ id: 'a', name: 'Existing', folder: null, tags: [], updated: '2026-01-01T00:00:00Z', artboards: 1 }],
  session: async () => ({ user: { username: 'me' } }),
  createProjectRecord: vi.fn(async () => undefined),
}));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import * as db from '../src/lib/db';
import { FontPicker, type FontPick } from '../src/components/FontPicker';
import { PrefsModal } from '../src/components/PrefsModal';
import { Home } from '../src/Home';
import { Inspector } from '../src/panels/Inspector';
import { loadCatalog } from '../src/lib/font-catalog';
import { prefs, setPrefs } from '../src/lib/prefs';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TOPICS, topicBody } from '../src/help/topics';
import { FIELD_TIPS } from '../src/components/tips';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeAll(async () => {
  await loadCatalog();
});
beforeEach(() => {
  //nothing here talks to a server: the preference save and the notice bell just see it offline
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.head.querySelectorAll('link[data-font-preview]').forEach((l) => l.remove());
  setPrefs({ defaultFont: 'Open Sans' });
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const combo = () => host.querySelector<HTMLInputElement>('[role=combobox]')!;
const options = () => [...host.querySelectorAll<HTMLElement>('[role=option]')];
const names = () => options().map((o) => o.querySelector('.font-opt-name')!.textContent);
const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const key = (el: Element, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
const focus = (el: HTMLElement) => act(() => el.focus());

function mountPicker(props: Partial<Parameters<typeof FontPicker>[0]> = {}, onKey?: (k: string) => void) {
  const picks: FontPick[] = [];
  act(() =>
    root.render(
      <div onKeyDown={(e) => onKey?.(e.key)}>
        <FontPicker ariaLabel="Font" value='"Open Sans", system-ui, sans-serif' onPick={(o) => picks.push(o)} {...props} />
      </div>,
    ),
  );
  return picks;
}

describe('FontPicker as a combobox', () => {
  it('is an ARIA combobox that controls a listbox, closed until focused', () => {
    mountPicker();
    const c = combo();
    expect(c.getAttribute('aria-expanded')).toBe('false');
    expect(c.getAttribute('aria-autocomplete')).toBe('list');
    expect(c.getAttribute('aria-label')).toBe('Font');
    expect(c.value).toBe('Open Sans');
    expect(host.querySelector('[role=listbox]')).toBeNull();
    focus(c);
    expect(c.getAttribute('aria-expanded')).toBe('true');
    const lb = host.querySelector('[role=listbox]')!;
    expect(c.getAttribute('aria-controls')).toBe(lb.id);
    expect(lb.getAttribute('aria-label')).toMatch(/^Font, \d+ fonts$/);
  });

  it('opens on the current font, and the active option is the one aria-activedescendant names', () => {
    mountPicker();
    focus(combo());
    const active = options().find((o) => o.id === combo().getAttribute('aria-activedescendant'))!;
    expect(active.textContent).toContain('Open Sans');
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.getAttribute('aria-posinset')).toBeTruthy();
    expect(active.getAttribute('aria-setsize')).toBeTruthy();
  });

  it('typing filters the families, best match first, and rows are drawn in their own font', () => {
    mountPicker();
    focus(combo());
    typeInto(combo(), 'playfair');
    expect(names()).toContain('Playfair Display');
    expect(names()[0]).toMatch(/^Playfair/);
    expect(names().every((n) => /playfair/i.test(n!) || /Use /.test(n!))).toBe(true);
    expect(options().find((o) => o.textContent?.startsWith('Playfair Display'))!.querySelector<HTMLElement>('.font-opt-name')!.style.fontFamily).toContain('Playfair Display');
    // a family that is not on the list can be used as typed
    typeInto(combo(), 'zzzqqq');
    expect(names()).toEqual(['Use “zzzqqq” as typed']);
  });

  it('arrows move, Enter picks the active row and closes, keeping the focus', () => {
    const picks = mountPicker();
    focus(combo());
    typeInto(combo(), 'roboto');
    const second = names()[1];
    key(combo(), 'ArrowDown');
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    key(combo(), 'ArrowUp');
    expect(combo().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    key(combo(), 'ArrowDown');
    key(combo(), 'Enter');
    expect(picks).toHaveLength(1);
    expect(picks[0].family).toBe(second);
    expect(picks[0].stack).toContain(picks[0].family);
    expect(combo().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(combo());
  });

  it('Escape closes the list without picking, and only then lets Escape through to a dialog', () => {
    const seen: string[] = [];
    const picks = mountPicker({}, (k) => seen.push(k));
    focus(combo());
    typeInto(combo(), 'lato');
    key(combo(), 'Escape');
    expect(combo().getAttribute('aria-expanded')).toBe('false');
    expect(combo().value).toBe('Open Sans');
    expect(picks).toEqual([]);
    expect(seen).not.toContain('Escape');
    key(combo(), 'Escape');
    expect(seen).toContain('Escape');
    // typing letters never reaches the shortcuts around it
    key(combo(), 'v');
    expect(seen).not.toContain('v');
  });

  it('ArrowDown opens a closed list; clicking a row picks it', () => {
    const picks = mountPicker();
    focus(combo());
    key(combo(), 'Escape');
    key(combo(), 'ArrowDown');
    expect(combo().getAttribute('aria-expanded')).toBe('true');
    const row = options().find((o) => o.textContent?.startsWith('Open Sans'))!;
    act(() => row.click());
    expect(picks.map((p) => p.family)).toEqual(['Open Sans']);
  });

  it('the category chips narrow the list', () => {
    mountPicker();
    focus(combo());
    const chip = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.font-cats button')].find((b) => b.textContent === label)!;
    expect([...host.querySelectorAll('.font-cats button')].map((b) => b.textContent)).toEqual(['All', 'Sans', 'Serif', 'Display', 'Handwriting', 'Mono']);
    act(() => chip('Mono').click());
    expect(chip('Mono').getAttribute('aria-pressed')).toBe('true');
    expect(options().length).toBeGreaterThan(3);
    expect(options().every((o) => ['Mono', 'System'].includes(o.querySelector('.font-opt-tag')!.textContent!))).toBe(true);
    expect(options().some((o) => o.querySelector('.font-opt-tag')!.textContent === 'Mono')).toBe(true);
    act(() => chip('Mono').click());
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the project fonts first, tagged, and a mixed selection as Mixed', () => {
    const project: FontRef[] = [
      { family: 'Brand Face', source: 'asset', assetId: 'x' },
      { family: 'Lato', source: 'google', weights: [400] },
    ];
    mountPicker({ project, value: 'Georgia, serif' });
    focus(combo());
    // opens on Georgia (a system font), but scrolled list still starts with the project's fonts
    act(() => {
      host.querySelector<HTMLElement>('.font-list')!.scrollTop = 0;
      host.querySelector<HTMLElement>('.font-list')!.dispatchEvent(new Event('scroll'));
    });
    expect(options().slice(0, 2).map((o) => [o.querySelector('.font-opt-name')!.textContent, o.querySelector('.font-opt-tag')!.textContent])).toEqual([
      ['Brand Face', 'Uploaded'],
      ['Lato', 'In project'],
    ]);
    act(() => root.render(<FontPicker ariaLabel="Font" value="Georgia, serif" mixed onPick={() => undefined} />));
    expect(combo().placeholder).toBe('Mixed');
  });

  it('only builds the rows on screen', () => {
    mountPicker();
    focus(combo());
    expect(options().length).toBeGreaterThan(5);
    expect(options().length).toBeLessThan(40);
    expect(host.querySelector<HTMLElement>('.font-spacer')!.style.height).toMatch(/^\d{5,}px$/);
  });

  it('asks the font route (Google through it) for the names of the rows on screen in their own font, after scrolling settles', () => {
    vi.useFakeTimers();
    mountPicker({ project: [{ family: 'Open Sans', source: 'google', weights: [400] }] });
    focus(combo());
    expect(document.head.querySelector('link[data-font-preview]')).toBeNull();
    act(() => void vi.advanceTimersByTime(150));
    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[data-font-preview]')];
    expect(links.length).toBeGreaterThan(3);
    expect(links.length).toBeLessThan(40);
    expect(links.every((l) => /\/fonts\/css2\?family=[^&]+&text=[^&]+$/.test(l.href))).toBe(true);
    // the project loads Open Sans in full: a name-only copy of it must not follow
    expect(links.some((l) => l.dataset.fontPreview === 'Open Sans')).toBe(false);
  });

  it('clearOnPick leaves the box empty for the next one', () => {
    const picks = mountPicker({ clearOnPick: true, value: '', placeholder: 'Add a font…' });
    expect(combo().value).toBe('');
    focus(combo());
    typeInto(combo(), 'caveat');
    key(combo(), 'Enter');
    expect(picks.map((p) => p.family)).toEqual(['Caveat']);
    expect(combo().value).toBe('');
  });
});

describe('the text layer font field', () => {
  function mountInspector(font = '"Open Sans", system-ui, sans-serif', weight = 400) {
    const p = createProject('T');
    p.fonts.push({ family: 'Open Sans', source: 'google', weights: [400, 600, 700] });
    const t = createNode('text', { name: 'Hello', text: 'Hi', fontFamily: font, fontWeight: weight }) as TextNode;
    p.artboards[0].children.push(t);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([t.id]);
    act(() => root.render(<Inspector />));
    return { s, t };
  }
  const fontInput = () => [...host.querySelectorAll<HTMLInputElement>('.inspector [role=combobox]')].find((i) => i.getAttribute('aria-label') === 'Font')!;
  const textNode = (s: EditorStore, id: string) => s.get().project.artboards[0].children.find((n) => n.id === id) as TextNode;

  it('shows the layer font, and picking a Google font sets it and adds it to the project with the weights in use', () => {
    const { s, t } = mountInspector('"Open Sans", system-ui, sans-serif', 600);
    expect(fontInput().value).toBe('Open Sans');
    focus(fontInput());
    typeInto(fontInput(), 'Poppins');
    key(fontInput(), 'Enter');
    expect(textNode(s, t.id).fontFamily).toBe('Poppins, system-ui, sans-serif');
    expect(s.get().project.fonts.find((f) => f.family === 'Poppins')).toEqual({ family: 'Poppins', source: 'google', weights: [400, 600, 700] });
    // one undo puts both back
    act(() => s.undo());
    expect(textNode(s, t.id).fontFamily).toBe('"Open Sans", system-ui, sans-serif');
    expect(s.get().project.fonts.map((f) => f.family)).toEqual(['Open Sans']);
  });

  it('a font the project already has is not added twice, and a system font is not added at all', () => {
    const { s, t } = mountInspector();
    focus(fontInput());
    typeInto(fontInput(), 'open sans');
    key(fontInput(), 'Enter');
    expect(s.get().project.fonts).toHaveLength(1);
    focus(fontInput());
    typeInto(fontInput(), 'georgia');
    key(fontInput(), 'Enter');
    expect(textNode(s, t.id).fontFamily).toBe('Georgia, serif');
    expect(s.get().project.fonts).toHaveLength(1);
  });

  it('changing the weight loads that weight of a Google font the project has', () => {
    const { s, t } = mountInspector('"Open Sans", system-ui, sans-serif', 400);
    const weight = [...host.querySelectorAll('label')].find((l) => l.querySelector('.field-label')?.textContent === 'Weight')!.querySelector('select')!;
    act(() => {
      weight.value = '800';
      weight.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(textNode(s, t.id).fontWeight).toBe(800);
    expect(s.get().project.fonts[0].weights).toEqual([400, 600, 700, 800]);
  });

  it('the project Fonts section adds any Google font from its box', () => {
    const { s } = mountInspector();
    // select nothing so the project (artboard) inspector shows
    act(() => s.select([]));
    act(() => s.set({ artboardSelected: true }));
    const add = [...host.querySelectorAll<HTMLInputElement>('.inspector [role=combobox]')].find((i) => i.getAttribute('aria-label') === 'Add a font');
    if (!add) throw new Error('no Add a font box');
    focus(add);
    typeInto(add, 'Fraunces');
    key(add, 'Enter');
    expect(s.get().project.fonts.map((f) => f.family)).toEqual(['Open Sans', 'Fraunces']);
    expect(s.get().project.fonts[1]).toMatchObject({ source: 'google', weights: expect.arrayContaining([400, 700]) });
    expect(add.value).toBe('');
    // a name the list doesn't have is still allowed (it may be newer than the list)
    focus(add);
    typeInto(add, 'Brand New Face');
    key(add, 'Enter');
    expect(s.get().project.fonts.map((f) => f.family)).toEqual(['Open Sans', 'Fraunces', 'Brand New Face']);
  });
});

describe('Preferences default font', () => {
  it('searches the Google fonts and saves the pick', () => {
    act(() => root.render(<PrefsModal onClose={() => undefined} />));
    const c = [...host.querySelectorAll<HTMLInputElement>('[role=combobox]')].find((i) => i.getAttribute('aria-label') === 'Default font')!;
    expect(c.value).toBe('Open Sans');
    focus(c);
    typeInto(c, 'merriweather');
    key(c, 'Enter');
    expect(prefs().defaultFont).toBe('Merriweather');
    expect(c.value).toBe('Merriweather');
  });
  it('Escape closes the list first, the dialog second', () => {
    const onClose = vi.fn();
    act(() => root.render(<PrefsModal onClose={onClose} />));
    const c = [...host.querySelectorAll<HTMLInputElement>('[role=combobox]')][0];
    focus(c);
    act(() => void c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onClose).not.toHaveBeenCalled();
    act(() => void c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('new projects start in Open Sans', () => {
  const created = () => vi.mocked(db.createProjectRecord).mock.calls.map((c) => c[0]);
  it('lists Open Sans as a Google font, with regular, semibold and bold', async () => {
    vi.mocked(db.createProjectRecord).mockClear();
    await act(async () => root.render(<Home open={() => undefined} />));
    await flush();
    await act(async () => host.querySelector<HTMLElement>('.new-thumb')!.click());
    await flush();
    await act(async () => host.querySelector<HTMLElement>('.np-buttons .btn.primary')!.click());
    await flush();
    expect(created()).toHaveLength(1);
    expect(created()[0].fonts).toEqual([{ family: 'Open Sans', source: 'google', weights: [400, 600, 700] }]);
  });
  it('follows the default font preference, with the weights that font has', async () => {
    setPrefs({ defaultFont: 'Lato' });
    vi.mocked(db.createProjectRecord).mockClear();
    await act(async () => root.render(<Home open={() => undefined} />));
    await flush();
    await act(async () => host.querySelector<HTMLElement>('.new-thumb')!.click());
    await flush();
    await act(async () => host.querySelector<HTMLElement>('.np-buttons .btn.primary')!.click());
    await flush();
    expect(created()[0].fonts).toEqual([{ family: 'Lato', source: 'google', weights: [400, 700] }]);
  });
});

describe('help and tooltips', () => {
  const body = (id: string) => topicBody(TOPICS.find((t) => t.id === id)!);
  it('the text, project settings and preferences topics describe the picker', () => {
    expect(body('text')).toMatch(/every Google font/i);
    expect(body('text')).toMatch(/Sans, Serif, Display, Handwriting/);
    expect(body('project-settings')).toMatch(/Add a Google font/);
    expect(body('preferences')).toMatch(/Open Sans/);
    expect(body('preferences')).toMatch(/search/i);
  });
  it('the Font tooltip says what picking does', () => {
    expect(FIELD_TIPS.Font).toMatch(/search/i);
    expect(FIELD_TIPS.Font).toMatch(/added to the project/i);
  });
});
