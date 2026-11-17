import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { APP_ACTION_EVENT } from '../src/lib/app-actions';
import { BeforeShareLine, BeforeYouShareModal } from '../src/components/BeforeShare';
import { ExportShareHint, rememberedWhere, ShareWhere } from '../src/components/ShareWhere';
import type { ShareInfo } from '../src/lib/db';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function messy(): Project {
  const p = createProject('Fractions lab');
  p.artboards = [createArtboard({ id: 'p1', name: 'Welcome', width: 800, height: 500 }), createArtboard({ id: 'p2', name: 'Quiz', width: 800, height: 500, canvasX: 900 })];
  p.settings.startArtboardId = 'p1';
  p.artboards[0].children.push(createNode('button', { name: 'Go', label: 'Go', x: 10, y: 10, width: 100, height: 40 } as never), createNode('image', { name: 'Photo', assetId: 'x', x: 0, y: 100, width: 100, height: 100 } as never));
  p.assets.push({ id: 'x', name: 'photo.png', mime: 'image/png', size: 10 } as never);
  return p;
}

const text = (el: Element | null) => el?.textContent ?? '';
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click());
const byText = (root: ParentNode, sel: string, t: RegExp) => [...root.querySelectorAll(sel)].find((e) => t.test(e.textContent ?? ''));
/** A group starts as one line: open it to see what is in it. */
const opened = (root: ParentNode, id: string) => {
  const g = root.querySelector(`[data-check="${id}"]`)!;
  const t = g.querySelector<HTMLButtonElement>('.share-group-toggle')!;
  if (t.getAttribute('aria-expanded') !== 'true') click(t);
  return g;
};

describe('Before you share (the list)', () => {
  let root: Root;
  let host: HTMLElement;
  let store: EditorStore;
  beforeEach(() => {
    localStorage.clear();
    store = new EditorStore(messy());
    setCurrentStore(store);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });
  const show = (props: { onGo?: () => void; onClose?: () => void } = {}) => act(() => root.render(<BeforeYouShareModal what="share" onGo={props.onGo} onClose={props.onClose ?? (() => undefined)} />));

  it('says how many things to look at and lists each group with what is wrong', () => {
    show();
    expect(text(host.querySelector('.share-body p'))).toMatch(/3 things to look at/);
    const groups = [...host.querySelectorAll('.share-group')].map((g) => g.getAttribute('data-check'));
    expect(groups).toEqual(['dead-buttons', 'unreachable-pages', 'alt-text']);
    expect(text(host.querySelector('[data-check="dead-buttons"]'))).toMatch(/1 button does nothing when clicked/);
  });

  it('shows one line per group, with the details behind a click', () => {
    show();
    const g = host.querySelector('[data-check="dead-buttons"]')!;
    const t = g.querySelector('.share-group-toggle')!;
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(g.querySelector('.share-items')).toBeNull();
    click(t);
    expect(t.getAttribute('aria-expanded')).toBe('true');
    expect(g.querySelector(`#${t.getAttribute('aria-controls')} .share-items`)).toBeTruthy();
    click(t);
    expect(g.querySelector('.share-items')).toBeNull();
  });

  it('Go there closes the list and selects the layer on its page', () => {
    const closed = vi.fn();
    show({ onClose: closed });
    click(byText(opened(host, 'dead-buttons'), 'button', /Go there/));
    expect(closed).toHaveBeenCalled();
    expect(store.get().activeArtboardId).toBe('p1');
    expect(store.get().selection).toEqual([store.get().project.artboards[0].children[0].id]);
  });

  it('adds a description to a picture straight from the list, and the group goes', () => {
    show();
    const group = opened(host, 'alt-text');
    const input = group.querySelector<HTMLInputElement>('.share-describe input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'A pie cut in four');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(byText(group, 'button', /Add it/));
    const img = store.get().project.artboards[0].children.find((c) => c.type === 'image')!;
    expect(img.ariaLabel).toBe('A pie cut in four');
    expect(host.querySelector('[data-check="alt-text"]')).toBeNull();
    store.undo();
    expect(store.get().project.artboards[0].children.find((c) => c.type === 'image')!.ariaLabel).toBeFalsy();
  });

  it('"This is fine" takes an item off the list and Forget puts it back', () => {
    show();
    click(byText(opened(host, 'dead-buttons'), 'button', /This is fine/));
    expect(host.querySelector('[data-check="dead-buttons"]')).toBeNull();
    expect(text(host.querySelector('.share-body p'))).toMatch(/2 things to look at/);
    click(byText(host, 'button', /Forget what I marked as fine \(1\)/));
    expect(host.querySelector('[data-check="dead-buttons"]')).toBeTruthy();
  });

  it('Choose what it does opens the behaviour chooser for the button', async () => {
    const { BehaviourHost } = await import('../src/components/BehaviourDialog');
    act(() => root.render(<><BehaviourHost /><BeforeYouShareModal what="share" onClose={() => undefined} /></>));
    click(byText(opened(host, 'dead-buttons'), 'button', /Choose what it does/));
    expect(document.querySelector('#behaviour-title')).toBeTruthy();
  });

  it('Share anyway carries on, and an all-clear project says so and offers to carry on', () => {
    const go = vi.fn();
    show({ onGo: go });
    click(byText(host, 'button', /^Share anyway$/));
    expect(go).toHaveBeenCalledTimes(1);
    const clean = new EditorStore(createProject('Clean'));
    setCurrentStore(clean);
    show({ onGo: go });
    expect(text(host)).toMatch(/Nothing to look at/);
    expect(byText(host, 'button', /Carry on to Share/)).toBeTruthy();
  });

  it('is a labelled dialog with a help link and keyboard reachable buttons', () => {
    show();
    for (const id of ['dead-buttons', 'unreachable-pages', 'alt-text']) opened(host, id);
    for (const b of host.querySelectorAll('.share-group button')) expect((b as HTMLButtonElement).type).not.toBe('');
    expect(host.querySelector('.share-group .help-link')!.getAttribute('aria-label')).toMatch(/^Help:/);
  });

  it('the one-line summary says how it stands', () => {
    act(() => root.render(<BeforeShareLine onOpen={() => undefined} />));
    expect(text(host)).toMatch(/3 things to look at first/);
    setCurrentStore(new EditorStore(createProject('Clean')));
    act(() => root.render(<BeforeShareLine onOpen={() => undefined} />));
    expect(text(host)).toMatch(/Nothing to look at before sharing/);
  });
});

describe('Share: where will people use it', () => {
  let root: Root;
  let host: HTMLElement;
  const share = (extra: Partial<ShareInfo> = {}): ShareInfo => ({ token: 'tok_abc123', created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', ...extra });
  beforeEach(() => {
    localStorage.clear();
    const p = messy();
    setCurrentStore(new EditorStore(p));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  const show = (s: ShareInfo | null | undefined, publish = () => undefined, marked = 0) => act(() => root.render(<ShareWhere projectId="proj1" share={s} busy={null} publish={publish} embedId={42} marked={marked} />));
  const choose = (label: RegExp) => click(byText(host, 'label.share-choice', label)!.querySelector('input'));

  it('opens on the question with five choices in plain words, the first one chosen', () => {
    show(share());
    expect(text(host.querySelector('h3'))).toBe('Where will people use it?');
    const labels = [...host.querySelectorAll('.share-choice strong')].map((e) => e.textContent);
    expect(labels).toEqual(['In a StudyDesk page, and keep learners’ results', 'In a StudyDesk page, no results needed', 'In the StudyDesk gradebook, with a mark', 'Anyone with a link', 'As a file to download']);
    expect(host.querySelector<HTMLInputElement>('input[type="radio"]:checked')!.value).toBe('studydesk');
  });

  it('keeping results shows the iframe on the learner link, with two lines on what to do', () => {
    show(share());
    const code = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Embed code"]')!.value;
    expect(code).toMatch(/^<iframe /);
    expect(code).toContain('/play/tok_abc123?title=Fractions%20lab');
    expect(code).toContain('data-cdt-id="42"');
    expect(host.querySelectorAll('.share-steps li')).toHaveLength(2);
    expect(text(host.querySelector('.share-steps'))).toMatch(/Source code/);
  });

  it('no results shows the same iframe around the plain share link', () => {
    show(share());
    choose(/no results needed/);
    const code = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Embed code"]')!.value;
    expect(code).toContain('/s/tok_abc123?title=');
    expect(code).not.toContain('/play/');
  });

  it('a project that uses the microphone gets the permission added, and is told no-results will not work', () => {
    show(share({ sensors: { microphone: true } }));
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Embed code"]')!.value).toContain('allow="autoplay; fullscreen; microphone"');
    expect(text(host.querySelector('.share-thing'))).toMatch(/microphone/);
    choose(/no results needed/);
    expect(host.querySelector('textarea[aria-label="Embed code"]')).toBeNull();
    expect(text(host.querySelector('.share-warn'))).toMatch(/only works with results kept/);
  });

  it('the gradebook choice gives the project name to pick and says whether any question sends a mark', () => {
    show(share(), undefined, 0);
    choose(/gradebook/);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Project name to pick"]')!.value).toBe('Fractions lab');
    expect(text(host.querySelector('.share-warn'))).toMatch(/Mark answers on the server/);
    show(share(), undefined, 2);
    expect(host.querySelector('.share-warn')).toBeNull();
    expect(text(host.querySelector('.share-thing'))).toMatch(/2 questions mark/);
  });

  it('a link shows the share link with Copy and Open, and a file offers downloads that ask the top bar', () => {
    show(share());
    choose(/Anyone with a link/);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Share link"]')!.value).toMatch(/\/s\/tok_abc123$/);
    expect(host.querySelector('a.btn')!.getAttribute('target')).toBe('_blank');
    choose(/As a file/);
    const got: string[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener(APP_ACTION_EVENT, on);
    click(byText(host, 'button', /single HTML file/));
    click(byText(host, 'button', /project package/));
    window.removeEventListener(APP_ACTION_EVENT, on);
    expect(got).toEqual(['export-html-now', 'export-package-now']);
  });

  it('with no link yet it offers to make one (not for a file), and the choice is remembered', () => {
    const publish = vi.fn();
    show(null, publish);
    expect(byText(host, 'button', /Create the link/)).toBeTruthy();
    click(byText(host, 'button', /Create the link/));
    expect(publish).toHaveBeenCalled();
    choose(/As a file/);
    expect(byText(host, 'button', /Create the link/)).toBeUndefined();
    expect(rememberedWhere('proj1')).toBe('file');
    expect(rememberedWhere('other')).toBe('studydesk');
  });

  it('Update to the latest version is under the thing to copy', () => {
    const publish = vi.fn();
    show(share(), publish);
    click(byText(host, 'button', /Update to the latest version/));
    expect(publish).toHaveBeenCalled();
  });
});

describe('Export points to Share', () => {
  it('has a line at the top of the Export menu that opens Share, and says why', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onShare = vi.fn();
    act(() => root.render(<ExportShareHint onShare={onShare} />));
    const b = host.querySelector<HTMLButtonElement>('button.menu-share-hint')!;
    expect(b.textContent).toContain('Want a link instead of a file?');
    expect(b.textContent).toContain('where people will use it');
    click(b);
    expect(onShare).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
  });
});
