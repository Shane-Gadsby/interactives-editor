import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { buildCommands, registerCommandProvider, searchCommands, suggestedCommands, PANEL_NAMES, type Command } from '../src/lib/commands';
import { ALL_PANELS } from '../src/lib/dock';
import { APP_ACTION_EVENT } from '../src/lib/app-actions';
import { prefs, setPrefs } from '../src/lib/prefs';
import { closeHelp, HelpHost } from '../src/help/Help';
import { CommandPalette } from '../src/components/CommandPalette';
import { closePalette, openPalette } from '../src/lib/command-palette';
import { COMMANDS } from '../src/lib/keymap';
import { RECIPES } from '../src/lib/recipes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function project() {
  const p = createProject('Palette');
  p.artboards = [createArtboard({ id: 'p1', name: 'Welcome', width: 800, height: 500 }), createArtboard({ id: 'p2', name: 'Quiz', width: 800, height: 500, canvasX: 900 })];
  p.settings.startArtboardId = 'p1';
  p.artboards[0].children.push(createNode('rect', { name: 'Hero box', x: 10, y: 10, width: 100, height: 60 }));
  return p;
}
const by = (list: Command[], id: string) => list.find((c) => c.id === id)!;

describe('the command list', () => {
  let store: EditorStore;
  beforeEach(() => {
    store = new EditorStore(project());
    setCurrentStore(store);
    store.set({ activeArtboardId: 'p1' });
  });

  it('has a command for every layer type, panel, tool, workspace and recipe, and every page and layer', () => {
    const ids = buildCommands().map((c) => c.id);
    for (const t of ['rect', 'ellipse', 'text', 'frame', 'button', 'input', 'link', 'embed', 'video', 'draw', 'shader', 'progress', 'chart']) expect(ids, t).toContain(`add:${t}`);
    for (const p of ALL_PANELS) {
      expect(ids).toContain(`panel:${p}`);
      expect(PANEL_NAMES[p]).toBeTruthy();
    }
    for (const c of COMMANDS.filter((x) => x.id.startsWith('tool.'))) expect(ids).toContain(`tool:${c.id.slice(5)}`);
    for (const w of ['standard', 'animate', 'interactions']) expect(ids).toContain(`workspace:${w}`);
    for (const r of RECIPES) expect(ids).toContain(`behaviour:${r.id}`);
    expect(ids).toEqual(expect.arrayContaining(['page:p1', 'page:p2'].map((x) => x)));
    expect(ids.some((i) => i.startsWith('layer:'))).toBe(true);
    for (const a of ['fadeIn', 'slideIn', 'pop', 'pulse', 'shake', 'fadeOut']) expect(ids).toContain(`animate:${a}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds a layer in the middle of the open page and selects it', () => {
    by(buildCommands(), 'add:button').run();
    const ab = store.get().project.artboards[0];
    const b = ab.children.find((c) => c.type === 'button')!;
    expect(b).toBeTruthy();
    expect(Math.round(b.x + b.width / 2)).toBe(400);
    expect(Math.round(b.y + b.height / 2)).toBe(250);
    expect(store.get().selection).toEqual([b.id]);
    store.undo();
    expect(store.get().project.artboards[0].children.some((c) => c.type === 'button')).toBe(false);
  });

  it('goes to a page and makes it the open one', () => {
    by(buildCommands(), 'page:p2').run();
    expect(store.get().activeArtboardId).toBe('p2');
    expect(store.get().artboardSelected).toBe(true);
  });

  it('makes a page the start page, and says so when it already is', () => {
    expect(by(buildCommands(), 'page:start').disabled).toBe('It already is');
    store.set({ activeArtboardId: 'p2' });
    const c = by(buildCommands(), 'page:start');
    expect(c.disabled).toBeUndefined();
    c.run();
    expect(store.get().project.settings.startArtboardId).toBe('p2');
  });

  it('says why a selection command cannot run, then runs it with a selection', () => {
    const none = buildCommands();
    expect(by(none, 'sel:duplicate').disabled).toMatch(/Select a layer/);
    expect(by(none, 'behaviour:page-next').disabled).toMatch(/Select one layer/);
    expect(by(none, 'animate:fadeIn').disabled).toBeTruthy();
    const id = store.get().project.artboards[0].children[0].id;
    store.select([id]);
    const some = buildCommands();
    expect(by(some, 'sel:duplicate').disabled).toBeUndefined();
    by(some, 'sel:duplicate').run();
    expect(store.get().project.artboards[0].children).toHaveLength(2);
  });

  it('runs an animation preset on the selection', () => {
    store.select([store.get().project.artboards[0].children[0].id]);
    by(buildCommands(), 'animate:pop').run();
    expect(store.get().project.artboards[0].timelines.map((t) => t.name)).toEqual(['Hero box: pop']);
  });

  it('picks a tool, toggles preferences and says which are on', () => {
    by(buildCommands(), 'tool:rect').run();
    expect(store.get().tool).toBe('rect');
    const before = prefs().showGrid;
    expect(by(buildCommands(), 'view:grid').on).toBe(before);
    by(buildCommands(), 'view:grid').run();
    expect(prefs().showGrid).toBe(!before);
    expect(by(buildCommands(), 'view:grid').on).toBe(!before);
    setPrefs({ showGrid: before });
    const snap = prefs().snapOn;
    by(buildCommands(), 'snap:on').run();
    expect(prefs().snapOn).toBe(!snap);
    setPrefs({ snapOn: snap });
  });

  it('asks the top bar for the things only it can do', () => {
    const got: string[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener(APP_ACTION_EVENT, on);
    for (const id of ['project:preview', 'project:share', 'project:export-html', 'project:motion']) by(buildCommands(), id).run();
    window.removeEventListener(APP_ACTION_EVENT, on);
    expect(got).toEqual(['preview', 'share', 'export-html', 'motion']);
  });

  it('lets a provider add commands, and survives one that breaks', () => {
    const off = [
      registerCommandProvider(() => [{ id: 'x:hello', title: 'Say hello', group: 'Project', run: () => undefined }]),
      registerCommandProvider(() => {
        throw new Error('broken');
      }),
    ];
    expect(buildCommands().some((c) => c.id === 'x:hello')).toBe(true);
    off.forEach((f) => f());
    expect(buildCommands().some((c) => c.id === 'x:hello')).toBe(false);
  });

  it('finds commands by words in any order, in the title first, and by their extra words', () => {
    const list = buildCommands();
    const top = (q: string) => searchCommands(list, q, 3).map((c) => c.id);
    expect(top('add button')[0]).toBe('add:button');
    expect(top('button add')[0]).toBe('add:button');
    expect(top('grid')[0]).toBe('view:grid');
    expect(top('go to quiz')[0]).toBe('page:p2');
    expect(top('circle')[0]).toBe('add:ellipse');
    expect(top('zzzzqqq')).toEqual([]);
    expect(top('')).toEqual([]);
  });

  it('suggests something before anything is typed', () => {
    expect(suggestedCommands(buildCommands()).length).toBeGreaterThan(3);
  });
});

describe('Ctrl+K and F1', () => {
  let root: Root;
  let host: HTMLElement;
  const key = (init: KeyboardEventInit, target: EventTarget = window) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })));
  beforeEach(() => {
    closeHelp();
    closePalette();
    setCurrentStore(new EditorStore(project()));
    setCurrentStore(new EditorStore(project()));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    closePalette();
    closeHelp();
    vi.unstubAllGlobals();
  });
  const mount = (palette: boolean) =>
    act(() =>
      root.render(
        <>
          <HelpHost />
          {palette && <CommandPalette />}
        </>,
      ),
    );

  it('Ctrl+K opens the command palette, not the help search, and F1 opens the help search', () => {
    mount(true);
    key({ key: 'k', ctrlKey: true });
    expect(document.querySelector('.command-palette')).toBeTruthy();
    expect(document.querySelector('.quick-help-backdrop:not(:has(.command-palette))')).toBeNull();
    key({ key: 'k', ctrlKey: true }, document.querySelector('.command-palette input')!);
    expect(document.querySelector('.command-palette')).toBeNull();
    key({ key: 'F1' });
    expect(document.querySelector('.quick-help-backdrop')).toBeTruthy();
    expect(document.querySelector('.command-palette')).toBeNull();
  });

  it('Cmd+K does the same on a Mac', () => {
    mount(true);
    key({ key: 'k', metaKey: true });
    expect(document.querySelector('.command-palette')).toBeTruthy();
  });

  it('leaves Ctrl+K alone while editing text (the link shortcut)', () => {
    mount(true);
    const ed = document.createElement('div');
    ed.className = 'text-editor';
    document.body.appendChild(ed);
    key({ key: 'k', ctrlKey: true }, ed);
    expect(document.querySelector('.command-palette')).toBeNull();
    expect(document.querySelector('.quick-help-backdrop')).toBeNull();
    ed.remove();
  });

  it('falls back to the help search where there is no palette (the projects page)', () => {
    mount(false);
    expect(openPalette()).toBe(false);
    key({ key: 'k', ctrlKey: true });
    expect(document.querySelector('.quick-help-backdrop')).toBeTruthy();
    expect(document.querySelector('.command-palette')).toBeNull();
  });
});

describe('the palette', () => {
  let root: Root;
  let host: HTMLElement;
  let store: EditorStore;
  beforeEach(() => {
    store = new EditorStore(project());
    setCurrentStore(store);
    store.set({ activeArtboardId: 'p1' });
    closePalette();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<CommandPalette />));
    act(() => void openPalette());
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    closePalette();
    vi.useRealTimers();
  });
  const input = () => document.querySelector<HTMLInputElement>('.command-palette input')!;
  const type = (v: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), v);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  const press = (k: string) => act(() => void input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
  const rows = () => [...document.querySelectorAll('.command-palette li.cmd')].map((li) => li.textContent ?? '');

  it('shows suggestions first, then the best match for what is typed, with its shortcut or group', () => {
    expect(document.querySelector('.cmd-head')!.textContent).toBe('Suggestions');
    type('duplicate page');
    expect(rows()[0]).toMatch(/^Duplicate this page/);
    type('group');
    expect(rows().some((r) => /Group.*Ctrl\+G|Ctrl\+G/.test(r))).toBe(true);
  });

  it('lists help results under the commands, and Enter on one opens that page', async () => {
    type('timeline keyframes');
    const head = [...document.querySelectorAll('.cmd-head')].map((h) => h.textContent);
    expect(head).toContain('Help');
    const all = rows();
    const firstHelp = all.findIndex((r) => r.startsWith('Help:'));
    expect(firstHelp).toBeGreaterThan(0);
    expect(all.slice(0, firstHelp).every((r) => !r.startsWith('Help:'))).toBe(true);
    const { helpHistory } = await import('../src/help/Help');
    for (let i = 0; i < firstHelp; i++) press('ArrowDown');
    press('Enter');
    expect(document.querySelector('.command-palette')).toBeNull();
    expect(helpHistory.current?.id).toBeTruthy();
  });

  it('Enter runs the chosen command and closes the palette; Escape closes without running', () => {
    vi.useFakeTimers();
    type('add rectangle');
    press('Enter');
    expect(document.querySelector('.command-palette')).toBeNull();
    act(() => void vi.runAllTimers());
    expect(store.get().project.artboards[0].children.some((c) => c.type === 'rect' && c.name !== 'Hero box')).toBe(true);
    act(() => void openPalette());
    type('add ellipse');
    press('Escape');
    act(() => void vi.runAllTimers());
    expect(store.get().project.artboards[0].children.some((c) => c.type === 'ellipse')).toBe(false);
  });

  it('a command that cannot run says why and does nothing on Enter', () => {
    vi.useFakeTimers();
    type('bring to front');
    expect(rows()[0]).toMatch(/Select a layer first/);
    expect(document.querySelector('.command-palette li.off')).toBeTruthy();
    press('Enter');
    expect(document.querySelector('.command-palette')).toBeTruthy();
  });

  it('is a labelled combobox over a listbox, with the chosen row announced', () => {
    type('grid');
    expect(input().getAttribute('role')).toBe('combobox');
    const list = document.querySelector('[role="listbox"]')!;
    expect(list.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-row-0');
    expect(list.querySelector('#palette-row-0')!.getAttribute('aria-selected')).toBe('true');
    press('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-row-1');
  });

  it('says when nothing matches', () => {
    type('qqqqzzzz');
    expect(document.querySelector('.cmd-empty')!.textContent).toMatch(/Nothing matches/);
  });
});
