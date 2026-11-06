//Attributions and references: the edits, the panel, the marker in the Assets panel, what exports and shares carry, undo, and the help
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, normalizeProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { CreditsPanel } from '../src/panels/CreditsPanel';
import { LeftPanel } from '../src/panels/LeftPanel';
import { addAttribution, addForUncovered, attributionForAsset, forgetAssets, kindForAsset, linkAsset, moveAttribution, removeAttribution, setAttribution, setCredits, unlinkAsset } from '../src/lib/attributions';
import { standaloneHtml } from '../src/lib/export';
import { ALL_PANELS, defaultLayout } from '../src/lib/dock';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function project(): Project {
  const p = createProject('Credits');
  p.assets.push(
    { id: 'a1', name: 'sunset.png', mime: 'image/png', size: 1 },
    { id: 'a2', name: 'voice.mp3', mime: 'audio/mpeg', size: 1 },
    { id: 'a3', name: 'rows.csv', mime: 'text/csv', size: 1 },
  );
  return p;
}

describe('editing attributions', () => {
  it('adds, edits (empty clears an optional field), moves and removes entries, and leaves nothing behind when empty', () => {
    const p = project();
    const a = addAttribution(p, { kind: 'image', title: 'Sunset' });
    const b = addAttribution(p, { kind: 'reference', title: 'A book' });
    setAttribution(p, a, { creator: 'Jane', licence: 'CC0', year: '2021', url: 'https://x.org', notes: 'asked' });
    expect(p.attributions![0]).toMatchObject({ creator: 'Jane', licence: 'CC0', year: '2021', url: 'https://x.org', notes: 'asked' });
    setAttribution(p, a, { creator: '  ', notes: '', kind: 'media', title: '' });
    expect(p.attributions![0].creator).toBeUndefined();
    expect(p.attributions![0].notes).toBeUndefined();
    expect(p.attributions![0].kind).toBe('media');
    expect(p.attributions![0].title).toBe('');
    moveAttribution(p, a, 1);
    expect(p.attributions!.map((e) => e.id)).toEqual([b, a]);
    moveAttribution(p, a, 1);
    expect(p.attributions!.map((e) => e.id)).toEqual([b, a]);
    removeAttribution(p, a);
    removeAttribution(p, b);
    expect(p.attributions).toBeUndefined();
  });

  it('links and unlinks assets that exist, once each', () => {
    const p = project();
    const id = addAttribution(p, { title: 'x' });
    linkAsset(p, id, 'a1');
    linkAsset(p, id, 'a1');
    linkAsset(p, id, 'nope');
    expect(p.attributions![0].assetIds).toEqual(['a1']);
    unlinkAsset(p, id, 'a1');
    expect(p.attributions![0].assetIds).toBeUndefined();
  });

  it('makes an entry for a file named after it, and finds the one that already covers it', () => {
    const p = project();
    const id = attributionForAsset(p, 'a1')!;
    expect(p.attributions![0]).toMatchObject({ kind: 'image', title: 'sunset', assetIds: ['a1'] });
    expect(attributionForAsset(p, 'a1')).toBe(id);
    expect(p.attributions).toHaveLength(1);
    expect(attributionForAsset(p, 'gone')).toBeNull();
    expect(kindForAsset(p.assets[1])).toBe('media');
    expect(kindForAsset(p.assets[2])).toBe('data');
  });

  it('adds one entry per file that has none, and takes a deleted file off the entries', () => {
    const p = project();
    attributionForAsset(p, 'a1');
    expect(addForUncovered(p)).toBe(2);
    expect(addForUncovered(p)).toBe(0);
    expect(p.attributions!.map((e) => e.title)).toEqual(['sunset', 'voice', 'rows']);
    forgetAssets(p, ['a2']);
    expect(p.attributions![1].assetIds).toBeUndefined();
    expect(p.attributions![0].assetIds).toEqual(['a1']);
  });

  it('sets the credits options and takes the block out of the document when all are off', () => {
    const p = project();
    setCredits(p, { button: true, heading: 'Sources' });
    expect(p.settings.credits).toEqual({ button: true, heading: 'Sources' });
    setCredits(p, { heading: '' });
    setCredits(p, { inExports: true });
    expect(p.settings.credits).toEqual({ button: true, inExports: true });
    setCredits(p, { button: false, inExports: false });
    expect(p.settings.credits).toBeUndefined();
  });
});

describe('the Attributions panel', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  const mount = (p: Project = project()) => {
    s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<CreditsPanel />));
  };
  const btn = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
  const list = () => s.get().project.attributions;
  const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) =>
    act(() => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const field = (label: string) => Array.from(host.querySelectorAll('label.field')).find((l) => l.querySelector('.field-label')?.textContent?.startsWith(label))!.querySelector('input, textarea, select') as HTMLInputElement;
  const pick = (el: HTMLSelectElement, v: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
    vi.restoreAllMocks();
  });

  it('starts with an explanation and adds an entry that takes the typed details', () => {
    mount();
    expect(host.querySelector('.cr-empty')).not.toBeNull();
    act(() => btn('Add entry')!.click());
    expect(list()).toHaveLength(1);
    expect(host.querySelector('.cr-empty')).toBeNull();
    type(field('Title'), 'Sunset over the bay');
    type(field('Creator'), 'Jane Smith');
    type(field('Year'), '2021');
    type(field('Licence'), 'CC BY 4.0');
    type(field('Source link'), 'https://example.com/sunset');
    type(field('Notes'), 'private note');
    expect(list()![0]).toMatchObject({ kind: 'image', title: 'Sunset over the bay', creator: 'Jane Smith', year: '2021', licence: 'CC BY 4.0', url: 'https://example.com/sunset', notes: 'private note' });
    expect(host.querySelector('.cr-preview')!.textContent).toContain('Jane Smith (2021). Sunset over the bay [Image]. Licence: CC BY 4.0.');
    expect(host.querySelector('.cr-preview')!.textContent).toContain('https://example.com/sunset');
    expect(host.querySelector('.cr-preview')!.textContent).not.toContain('private note');
  });

  it('puts a suggested licence in the field, and warns about a link that is not an address', () => {
    mount();
    act(() => btn('Add entry')!.click());
    pick(field('Suggestions') as unknown as HTMLSelectElement, 'CC0');
    expect(list()![0].licence).toBe('CC0');
    type(field('Source link'), 'page 12');
    expect(host.querySelector('.cr-warn')).not.toBeNull();
  });

  it('links files from the Assets list, shows them as chips, and counts the files covered', () => {
    mount();
    act(() => btn('Add entry')!.click());
    expect(host.querySelector('.cr-count')!.textContent).toContain('0 of 3 files covered');
    pick([...host.querySelectorAll('select')].find((x) => x.textContent?.includes('Link a file'))!, 'a2');
    expect(list()![0].assetIds).toEqual(['a2']);
    expect(host.querySelector('.cr-chip')!.textContent).toContain('voice.mp3');
    expect(host.querySelector('.cr-count')!.textContent).toContain('1 of 3 files covered');
    act(() => (host.querySelector('.cr-chip button') as HTMLElement).click());
    expect(list()![0].assetIds).toBeUndefined();
  });

  it('adds entries for files without one', () => {
    mount();
    act(() => btn('Add for files without one (3)')!.click());
    expect(list()!.map((e) => e.title)).toEqual(['sunset', 'voice', 'rows']);
    expect(btn('Add for files without one')).toBeUndefined();
  });

  it('turns the Credits button on, which also keeps the list in exports, and undo takes it back', () => {
    mount();
    act(() => btn('Add entry')!.click());
    const box = (label: string) => Array.from(host.querySelectorAll('label.check-field')).find((l) => l.textContent?.includes(label))!.querySelector('input') as HTMLInputElement;
    expect(box('Show a Credits button').checked).toBe(false);
    act(() => box('Show a Credits button').click());
    expect(s.get().project.settings.credits).toEqual({ button: true });
    expect(box('Keep the list in exported').checked).toBe(true);
    expect(host.textContent).toContain('learners get no Credits button until one does');
    act(() => s.undo());
    expect(s.get().project.settings.credits).toBeUndefined();
  });

  it('deleting a list entry is one undo', () => {
    mount();
    act(() => btn('Add entry')!.click());
    act(() => (host.querySelector('.cr-actions button[title="Delete this entry"], .cr-actions button[data-tip="Delete this entry"]') as HTMLElement).click());
    expect(list()).toBeUndefined();
    act(() => s.undo());
    expect(list()).toHaveLength(1);
  });
});

describe('the Assets panel', () => {
  let root: Root;
  let host: HTMLElement;
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
  });
  const mount = (p: Project) => {
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<LeftPanel />));
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Assets')!.click());
    return s;
  };

  it('says nothing about attributions in a project that has none', () => {
    mount(project());
    expect(host.textContent).not.toContain('No attribution');
    expect(host.textContent).not.toContain('no attribution');
  });

  it('marks the files no entry covers, and the Credit button makes an entry and opens the tab', () => {
    const p = project();
    addAttribution(p, { title: 'Sunset', assetIds: ['a1'] });
    const s = mount(p);
    expect(host.querySelectorAll('.asset-nocredit')).toHaveLength(2);
    expect(host.querySelector('.asset-credit-note')!.textContent).toContain('2 files have no attribution yet');
    const credit = [...host.querySelectorAll<HTMLElement>('.asset-card')].find((c) => c.textContent?.includes('rows.csv'))!.querySelector('[title^="Add an attribution"], [data-tip^="Add an attribution"]') as HTMLElement;
    act(() => credit.click());
    expect(s.get().project.attributions!.map((e) => e.title)).toEqual(['Sunset', 'rows']);
    expect(s.get().bottomTab).toBe('credits');
    expect(host.querySelectorAll('.asset-nocredit')).toHaveLength(1);
  });

  it('takes a deleted file off the entries', () => {
    const p = project();
    addAttribution(p, { title: 'Sunset', assetIds: ['a1'] });
    const s = new EditorStore(p);
    s.update((d) => void forgetAssets(d as Project, ['a1']));
    expect(s.get().project.attributions![0].assetIds).toBeUndefined();
  });
});

describe('what a page for learners carries', () => {
  const credited = (): Project => {
    const p = project();
    addAttribution(p, { kind: 'image', title: 'Sunset', creator: 'Jane', notes: 'SECRET-NOTE', assetIds: ['a1'] });
    return p;
  };
  const embedded = (html: string) => (html.match(/"attributions":/g) ?? []).length;

  it('leaves the list out unless the button or the exports option asks, and never has the notes', async () => {
    const p = credited();
    expect(embedded(await standaloneHtml(p))).toBe(0);
    setCredits(p, { inExports: true });
    const html = await standaloneHtml(p);
    expect(embedded(html)).toBe(1);
    expect(html).toContain('Sunset');
    expect(html).not.toContain('SECRET-NOTE');
    setCredits(p, { inExports: false, button: true });
    const withButton = await standaloneHtml(p);
    expect(embedded(withButton)).toBe(1);
    expect(withButton).not.toContain('SECRET-NOTE');
  });

  it('keeps everything in the project itself, notes included', () => {
    const p = credited();
    const back = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(back.attributions![0]).toMatchObject({ notes: 'SECRET-NOTE', assetIds: ['a1'] });
  });
});

describe('the tab and the help', () => {
  it('is one of the dock panels, in the bottom area', () => {
    expect(ALL_PANELS).toContain('credits');
    expect(defaultLayout().zones.bottom.tabs).toContain('credits');
  });

  it('has a topic that the Assets and Project settings topics link to', () => {
    const t = TOPICS.find((x) => x.id === 'attributions')!;
    expect(t).toBeTruthy();
    const body = topicBody(t);
    expect(body).toContain('Credits');
    expect(body).toContain('CC BY 4.0');
    for (const id of ['assets', 'project-settings']) expect(topicBody(TOPICS.find((x) => x.id === id)!)).toContain('(attributions');
  });
});
