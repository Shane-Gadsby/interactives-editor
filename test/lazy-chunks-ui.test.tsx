import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { closeHelp, HelpHost, HelpLink, openHelp } from '../src/help/Help';
import { helpTopics, helpViews } from '../src/help/lazy';
import { CodeEditor, codeMirror } from '../src/components/CodeEditor';
import { brandedStarters } from '../src/lib/branded-lazy';
import { pickForKey } from '../src/lib/starter-pick';
import { resetWarm, warmLater } from '../src/lib/warm';
import { warmPlayerSource } from '../src/lib/player-source';
import { standaloneHtml } from '../src/lib/export';
import { createProject } from 'interactives-player';

// Nothing here warms a chunk up first: this file is about what shows while one comes in, and that it is right once it has.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => closeHelp());
  act(() => root.unmount());
  host.remove();
});

describe('help, which is a chunk of its own', () => {
  it('has no title for a "?" until the topics are in, and never starts them itself', async () => {
    expect(helpTopics.get()).toBeNull();
    act(() => root.render(<HelpLink topic="layers-panel" />));
    const btn = host.querySelector<HTMLButtonElement>('.help-link')!;
    expect(btn.getAttribute('aria-label')).toBe('Help');
    expect(btn.title).toBe('Help');
    expect(helpTopics.get()).toBeNull();
    //hovering is a hint it will be wanted
    act(() => void btn.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    await act(async () => void (await vi.waitFor(() => expect(helpTopics.get()).not.toBeNull(), { timeout: 5000 })));
    expect(btn.getAttribute('aria-label')).toMatch(/^Help: .+/);
    expect(btn.title).toMatch(/: /);
  });

  it('opens the drawer at once with a quiet line, then fills it with the article when its chunk is in', async () => {
    expect(helpViews.get()).toBeNull();
    act(() => root.render(<HelpHost />));
    act(() => openHelp('welcome'));
    const drawer = host.querySelector('.help-drawer')!;
    expect(drawer.textContent).toContain('Loading help');
    expect(drawer.querySelector('input')).toBeNull();
    await act(async () => void (await helpViews.ensure()));
    expect(host.querySelector('.help-drawer .help-search')).not.toBeNull();
    expect(host.querySelector('.help-drawer')!.textContent).not.toContain('Loading help');
    expect(host.querySelector('.help-drawer')!.textContent).toContain('Welcome to Interactives');
  });
});

describe('the code box, which is CodeMirror in a chunk of its own', () => {
  it('shows the text read-only in the same space until CodeMirror is in, then the real editor with the same text', async () => {
    expect(codeMirror.get()).toBeNull();
    act(() => root.render(<CodeEditor value={'let a = 1;'} onChange={() => undefined} height={200} />));
    const box = host.querySelector<HTMLElement>('.code-editor')!;
    expect(box.style.height).toBe('200px');
    expect(box.textContent).toBe('let a = 1;');
    expect(host.querySelector('.cm-editor')).toBeNull();
    await act(async () => void (await codeMirror.ensure()));
    expect(host.querySelector('.cm-editor')).not.toBeNull();
    expect(host.querySelector('.cm-content')!.textContent).toBe('let a = 1;');
  });
});

describe('the starter sets, a chunk of their own', () => {
  it('finds a branded starter by its key only once they are in', async () => {
    expect(brandedStarters.get()).toBeNull();
    expect(pickForKey('assessment/multi-page-quiz')).toBeNull();
    //the plain starters never wait for them
    expect(pickForKey('blank')?.kind ?? 'builtin').toBeDefined();
    await brandedStarters.ensure();
    expect(pickForKey('assessment/multi-page-quiz')?.kind).toBe('branded');
  });
});

describe('the player, which Preview, Share and Export wait for', () => {
  it('is fetched once however it is warmed, and an export builds with it', async () => {
    await Promise.all([warmPlayerSource(), warmPlayerSource()]);
    const html = await standaloneHtml(createProject('Warm'), { bytesFor: async () => null });
    expect(html).toContain('<!doctype html');
    expect(html.length).toBeGreaterThan(200_000);
  });
});

describe('the warm-up', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetWarm();
  });
  it('runs its steps one at a time, only when the browser is idle, and only once', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const step = (name: string) => () => (order.push(name), Promise.resolve());
    warmLater([step('player'), step('help'), step('graph')]);
    warmLater([step('again')]);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(900);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1500 + 100);
    expect(order).toEqual(['player']);
    await vi.advanceTimersByTimeAsync(1600);
    expect(order).toEqual(['player', 'help']);
    await vi.advanceTimersByTimeAsync(3200);
    expect(order).toEqual(['player', 'help', 'graph']);
  });

  it('keeps its hands off for someone saving data', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    const run = vi.fn(() => Promise.resolve());
    warmLater([run]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).not.toHaveBeenCalled();
    delete (navigator as unknown as { connection?: unknown }).connection;
  });
});
