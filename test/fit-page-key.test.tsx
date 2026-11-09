//Fit page to selection from the keyboard, the palette and the page menu, and a key given to a command that had none
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { setPrefs } from '../src/lib/prefs';
import { bindingsOf, forceMac } from '../src/lib/keymap';
import { setLastKeyArea } from '../src/lib/key-area';
import { handleEditorKey, installEditorKeys } from '../src/lib/editor-keys';
import { ensureCommandKeys } from '../src/lib/command-keys';
import { buildCommands } from '../src/lib/commands';
import { artboardMenuItems, fitPageCommand } from '../src/lib/artboard-commands';
import { closeShortcuts, openShortcuts } from '../src/lib/shortcuts-sheet';
import { PrefsHost as ShortcutsHost } from '../src/components/PrefsModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const build = () => {
  const p = createProject('Fit');
  const ab = p.artboards[0];
  ab.canvasX = 100;
  ab.canvasY = 50;
  ab.children.push(createNode('rect', { id: 'a', name: 'A', x: 40, y: 30, width: 100, height: 50 }), createNode('rect', { id: 'b', name: 'B', x: 200, y: 120, width: 60, height: 60 }), createNode('rect', { id: 'c', name: 'C', x: 500, y: 400, width: 20, height: 20 }));
  const s = new EditorStore(p);
  setCurrentStore(s);
  return s;
};
const press = (init: KeyboardEventInit & { key: string }, code = '') => {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(e);
  handleEditorKey(e);
  return e;
};
beforeAll(() => {
  setCurrentStore(build());
  ensureCommandKeys();
  installEditorKeys(() => undefined);
});
beforeEach(() => {
  setPrefs({ keymap: undefined, keymapPreset: 'default', singleKeys: true });
  forceMac(false);
});
afterEach(() => {
  setPrefs({ keymap: undefined, keymapPreset: 'default', singleKeys: true });
  forceMac(null);
  setLastKeyArea('other');
});

describe('Fit page to selection', () => {
  it('is on Ctrl+Alt+Shift+F, and fits the page to the picked layers in one undo step', () => {
    expect(bindingsOf('fit-page-selection')).toEqual(['Mod+Alt+Shift+F']);
    const s = build();
    s.select(['a', 'b']);
    const e = press({ key: 'f', ctrlKey: true, altKey: true, shiftKey: true }, 'KeyF');
    expect(e.defaultPrevented).toBe(true);
    const ab = s.artboard()!;
    expect([ab.width, ab.height, ab.canvasX, ab.canvasY]).toEqual([220, 150, 140, 80]);
    expect(s.get().toast?.action?.kind).toBe('undo');
    s.undo();
    expect(s.artboard()!.width).not.toBe(220);
    expect(s.artboard()!.children[0].x).toBe(40);
  });

  it('with space around leaves that many pixels on every side and keeps the layers where they were on the canvas', () => {
    const s = build();
    s.select(['a', 'b']);
    expect(s.fitArtboardToSelection({ padding: 20 })).toBe(true);
    const ab = s.artboard()!;
    expect([ab.width, ab.height, ab.canvasX, ab.canvasY]).toEqual([260, 190, 120, 60]);
    const at = (id: string) => ab.children.find((n) => n.id === id)!;
    //on the canvas A was at 140,80 and still is
    expect([ab.canvasX + at('a').x, ab.canvasY + at('a').y]).toEqual([140, 80]);
    expect([at('a').x, at('a').y]).toEqual([20, 20]);
  });

  it('can fit to every layer on the page when nothing is picked', async () => {
    const s = build();
    s.select([]);
    expect(await fitPageCommand({ layers: true })).toBe(true);
    const ab = s.artboard()!;
    expect([ab.width, ab.height, ab.canvasX, ab.canvasY]).toEqual([480, 390, 140, 80]);
    //doing it again changes nothing
    expect(await fitPageCommand({ layers: true })).toBe(false);
    expect(s.get().toast?.text).toMatch(/already fits/);
  });

  it('says what to do when nothing is picked, and changes nothing', async () => {
    const s = build();
    s.select([]);
    const before = s.artboard()!.width;
    expect(await fitPageCommand()).toBe(false);
    expect(s.get().toast?.text).toMatch(/Pick some layers first/);
    expect(s.artboard()!.width).toBe(before);
    press({ key: 'f', ctrlKey: true, altKey: true, shiftKey: true }, 'KeyF');
    expect(s.artboard()!.width).toBe(before);
  });

  it('is in the command palette (off until layers are picked) and the page menu', () => {
    const s = build();
    s.select([]);
    expect(buildCommands().find((c) => c.id === 'page:fit-selection')?.disabled).toMatch(/Select a layer/);
    s.select(['a']);
    const c = buildCommands().find((x) => x.id === 'page:fit-selection')!;
    expect(c.disabled).toBeUndefined();
    expect(c.hint).toMatch(/Shift \+ F/);
    c.run();
    expect(s.artboard()!.width).toBe(100);
    const labels = artboardMenuItems([s.artboard()!.id]).map((i) => ('label' in i ? i.label : ''));
    expect(labels).toContain('Duplicate');
  });
});

describe('a key for a command that had none', () => {
  it('runs the same thing the palette does, and says why when it cannot', () => {
    const s = build();
    setPrefs({ keymap: { 'panel.data': ['Mod+Alt+D'], 'behaviour.click': ['Mod+Alt+B'] } });
    s.set({ bottomTab: 'timeline' });
    press({ key: 'd', ctrlKey: true, altKey: true }, 'KeyD');
    expect(s.get().bottomTab).toBe('data');
    s.select([]);
    press({ key: 'b', ctrlKey: true, altKey: true }, 'KeyB');
    expect(s.get().toast?.text).toMatch(/Select one layer first/);
  });

  it('Hide and Lock have the keys other editors use, and toggle', () => {
    const s = build();
    expect(bindingsOf('hide-layers')).toEqual(['Mod+Shift+H']);
    expect(bindingsOf('lock-layers')).toEqual(['Mod+Shift+L']);
    s.select(['a']);
    press({ key: 'h', ctrlKey: true, shiftKey: true }, 'KeyH');
    expect(s.artboard()!.children[0].visible).toBe(false);
    press({ key: 'h', ctrlKey: true, shiftKey: true }, 'KeyH');
    expect(s.artboard()!.children[0].visible).not.toBe(false);
    press({ key: 'l', ctrlKey: true, shiftKey: true }, 'KeyL');
    expect(s.artboard()!.children[0].locked).toBe(true);
  });
});

describe('the sheet', () => {
  it('lists the new groups, every command can be given a key, and Only ones with a key hides the rest', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<ShortcutsHost />));
    act(() => openShortcuts(false));
    const heads = () => [...document.querySelectorAll('.keys-group h4')].map((h) => h.textContent);
    expect(heads()).toEqual(expect.arrayContaining(['Add', 'Pages', 'Panels and help', 'Workspaces', 'Behaviours', 'Questions', 'Animate']));
    const names = () => [...document.querySelectorAll('.keys-name')].map((n) => n.textContent);
    expect(names()).toEqual(expect.arrayContaining(['Fit page to selection', 'Open Assets', 'Add rectangle']));
    const row = [...document.querySelectorAll<HTMLTableRowElement>('.keys-group tr')].find((r) => r.querySelector('.keys-name')?.textContent === 'Open Assets')!;
    expect(row.textContent).toContain('No key');
    expect(row.querySelector('button')?.textContent).toBe('Set key');
    const only = [...document.querySelectorAll<HTMLInputElement>('.keys-controls input[type="checkbox"]')].find((i) => i.closest('label')?.textContent?.includes('Only ones with a key'))!;
    act(() => only.click());
    expect(names()).not.toContain('Open Assets');
    expect(names()).toContain('Fit page to selection');
    act(() => closeShortcuts());
    act(() => root.unmount());
    host.remove();
  });
});
