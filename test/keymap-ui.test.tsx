import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { setPrefs } from '../src/lib/prefs';
import { bindingsOf, forceMac, keysSuspended } from '../src/lib/keymap';
import { setLastKeyArea } from '../src/lib/key-area';
import { handleEditorKey, installEditorKeys } from '../src/lib/editor-keys';
import { installTimelineKeys } from '../src/lib/timeline-keys';
import { jumpToProperty } from '../src/lib/prop-jump';
import { closeShortcuts, openShortcuts, shortcutsOpen } from '../src/lib/shortcuts-sheet';
import { ShortcutsHost } from '../src/components/ShortcutsModal';
import { DialogHost } from '../src/components/dialogs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reset = () => setPrefs({ keymap: undefined, keymapPreset: 'default', singleKeys: true });
beforeEach(() => {
  reset();
  forceMac(false);
});
afterEach(() => {
  reset();
  forceMac(null);
  setLastKeyArea('other');
  closeShortcuts();
  vi.useRealTimers();
});

function key(init: KeyboardEventInit & { key: string }, code = '') {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(e);
  handleEditorKey(e);
  return e;
}

describe('the Timeline\'s keys', () => {
  function setup() {
    const p = createProject('T');
    const a = createNode('rect', { name: 'Ball' });
    p.artboards[0].children.push(a);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([a.id]);
    const tl = s.get().project.artboards[0];
    void tl;
    s.addTimeline();
    //two layers' worth of keys on the ball
    s.update((d) => {
      const t = d.artboards[0].timelines[0];
      t.duration = 2000;
      t.tracks.push({ id: 'tr1', nodeId: a.id, prop: 'x', keys: [{ id: 'k1', t: 0, value: 0, ease: 'linear' }, { id: 'k2', t: 500, value: 10, ease: 'linear' }, { id: 'k3', t: 1500, value: 20, ease: 'linear' }] } as never);
    });
    installEditorKeys(() => undefined);
    installTimelineKeys();
    setLastKeyArea('timeline');
    return { s, a };
  }

  it('Space plays and pauses, and K pauses again', () => {
    const { s } = setup();
    key({ key: ' ' }, 'Space');
    expect(s.get().previewPlaying).toBe(true);
    key({ key: ' ' }, 'Space');
    expect(s.get().previewPlaying).toBe(false);
    key({ key: 'l' }, 'KeyL');
    expect(s.get().previewPlaying).toBe(true);
    key({ key: 'k' }, 'KeyK');
    expect(s.get().previewPlaying).toBe(false);
  });

  it('comma and period step a frame, Shift+comma and period jump between keys, J goes to the start', () => {
    const { s } = setup();
    key({ key: '.' }, 'Period');
    expect(s.get().playhead).toBeCloseTo(33.33, 1);
    key({ key: ',' }, 'Comma');
    expect(s.get().playhead).toBe(0);
    key({ key: '>', shiftKey: true }, 'Period');
    expect(s.get().playhead).toBe(500);
    key({ key: '>', shiftKey: true }, 'Period');
    expect(s.get().playhead).toBe(1500);
    key({ key: '<', shiftKey: true }, 'Comma');
    expect(s.get().playhead).toBe(500);
    key({ key: 'End' });
    expect(s.get().playhead).toBe(2000);
    key({ key: 'j' }, 'KeyJ');
    expect(s.get().playhead).toBe(0);
  });

  it('on the canvas those same keys are not the Timeline\'s', () => {
    const { s } = setup();
    setLastKeyArea('canvas');
    key({ key: ' ' }, 'Space');
    expect(s.get().previewPlaying).toBe(false);
    key({ key: '.' }, 'Period');
    expect(s.get().playhead).toBe(0);
  });
});

describe('property keys', () => {
  let host: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    host.innerHTML = `
      <aside class="inspector"><section class="section" data-section="layer-selection"><div class="section-body">
        <label data-prop="x-position"><input id="x"></label><label data-prop="rotation"><input id="rot"></label><label data-prop="opacity"><input id="op"></label>
        <label data-prop="scale-w"><input id="sc"></label><div data-prop="pivot"><button id="pv">dot</button></div>
      </div></section></aside>
      <div class="timeline"><div class="track-label" data-track-prop="rotation" data-track-node="n1"></div></div>`;
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  const setup = () => {
    const p = createProject('T');
    const a = createNode('rect', { id: 'n1', name: 'Ball' });
    p.artboards[0].children.push(a);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([a.id]);
    return s;
  };

  it('moves focus to the layer\'s field and marks it, with its Timeline track', () => {
    setup();
    expect(jumpToProperty('rotation')).toBe(true);
    vi.advanceTimersByTime(60);
    expect(document.activeElement?.id).toBe('rot');
    expect(host.querySelector('[data-prop="rotation"]')!.classList.contains('prop-jumped')).toBe(true);
    expect(host.querySelector('.track-label')!.classList.contains('prop-jumped')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(host.querySelector('.prop-jumped')).toBeNull();
  });

  it('goes to each of the five', () => {
    setup();
    for (const [prop, id] of [['position', 'x'], ['scale', 'sc'], ['opacity', 'op'], ['anchor', 'pv']] as const) {
      jumpToProperty(prop);
      vi.advanceTimersByTime(60);
      expect(document.activeElement?.id, prop).toBe(id);
    }
  });

  it('says so when nothing is picked', () => {
    const s = setup();
    s.select([]);
    expect(jumpToProperty('scale')).toBe(true);
    expect(s.get().toast?.text).toMatch(/Pick a layer first/);
  });

  it('is the P key in the Timeline', () => {
    const s = setup();
    installEditorKeys(() => undefined);
    installTimelineKeys();
    setLastKeyArea('timeline');
    key({ key: 'r' }, 'KeyR');
    vi.advanceTimersByTime(60);
    expect(document.activeElement?.id).toBe('rot');
    expect(s.get().tool).toBe('select');
  });
});

describe('the shortcuts sheet', () => {
  let root: Root;
  let host: HTMLElement;
  const mount = () => {
    setCurrentStore(new EditorStore(createProject('S')));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root.render(
        <>
          <ShortcutsHost />
          <DialogHost />
        </>,
      ),
    );
    act(() => openShortcuts(false));
  };
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const rowFor = (name: string) => [...document.querySelectorAll<HTMLTableRowElement>('.keys-group tr')].find((r) => r.querySelector('.keys-name')?.textContent === name)!;
  const btn = (row: Element, text: RegExp) => [...row.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '') || text.test(b.getAttribute('aria-label') ?? ''))! as HTMLButtonElement;
  const press = (init: KeyboardEventInit & { key: string }, code = '') => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init })));

  it('lists every command with its keys, grouped, and holds the editor\'s own keys still while open', () => {
    mount();
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    expect(rowFor('Duplicate').querySelector('kbd')?.textContent).toBe('Ctrl + D');
    expect(rowFor('Pen tool').querySelector('kbd')?.textContent).toBe('P');
    expect(keysSuspended()).toBe(true);
    expect([...document.querySelectorAll('.keys-group h3')].map((h) => h.textContent)).toContain('Timeline');
    act(() => closeShortcuts());
    expect(keysSuspended()).toBe(false);
  });

  it('searches by name', () => {
    mount();
    const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'frame');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = [...document.querySelectorAll('.keys-name')].map((n) => n.textContent);
    expect(names).toContain('Frame tool');
    expect(names).toContain('Step forward a frame');
    expect(names).not.toContain('Duplicate');
  });

  it('finds what a pressed key does', () => {
    mount();
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.keys-search button')].find((b) => b.textContent === 'Find a key')!.click());
    press({ key: 'p' }, 'KeyP');
    const names = [...document.querySelectorAll('.keys-name')].map((n) => n.textContent);
    expect(names).toEqual(expect.arrayContaining(['Pen tool', 'Go to Position']));
    expect(names).not.toContain('Duplicate');
  });

  it('records a new key for a command, and Reset puts the default back', () => {
    mount();
    act(() => btn(rowFor('Rectangle tool'), /Add a key/).click());
    expect(rowFor('Rectangle tool').textContent).toContain('Press the new keys');
    press({ key: 'x' }, 'KeyX');
    expect(bindingsOf('tool.rect')).toEqual(['R', 'X']);
    act(() => btn(rowFor('Rectangle tool'), /back to its default/).click());
    expect(bindingsOf('tool.rect')).toEqual(['R']);
  });

  it('Escape while listening cancels the recording and does not close the sheet', () => {
    mount();
    act(() => btn(rowFor('Rectangle tool'), /Add a key/).click());
    press({ key: 'Escape' });
    expect(bindingsOf('tool.rect')).toEqual(['R']);
    expect(shortcutsOpen()).toBe(true);
    expect(rowFor('Rectangle tool').textContent).not.toContain('Press the new keys');
    press({ key: 'Escape' });
    expect(shortcutsOpen()).toBe(false);
  });

  it('asks before taking a key another command uses, and can leave it', () => {
    mount();
    act(() => btn(rowFor('Rectangle tool'), /Add a key/).click());
    press({ key: 'p' }, 'KeyP');
    const alert = document.querySelector('.keys-pending')!;
    expect(alert.textContent).toContain('Pen tool');
    expect(bindingsOf('tool.rect')).toEqual(['R']);
    act(() => void [...alert.querySelectorAll('button')].find((b) => /Keep it/.test(b.textContent ?? ''))!.click());
    expect(document.querySelector('.keys-pending')).toBeNull();
    expect(bindingsOf('tool.pen')).toEqual(['P']);
    //and this time take it
    act(() => btn(rowFor('Rectangle tool'), /Add a key/).click());
    press({ key: 'p' }, 'KeyP');
    act(() => void [...document.querySelectorAll<HTMLButtonElement>('.keys-pending button')].find((b) => /Use it here/.test(b.textContent ?? ''))!.click());
    expect(bindingsOf('tool.rect')).toEqual(['R', 'P']);
    expect(bindingsOf('tool.pen')).toEqual([]);
    expect(document.querySelector('.keys-clash')).toBeNull();
  });

  it('takes a key off with its cross, and shows a clash if two commands share one', () => {
    mount();
    act(() => void rowFor('Delete').querySelector<HTMLButtonElement>('.keys-x')!.click());
    expect(bindingsOf('delete')).toEqual(['Backspace']);
    act(() => setPrefs({ keymap: { 'tool.rect': ['P'] } }));
    expect(document.querySelector('.keys-clash')?.textContent).toContain('used twice');
  });

  it('does not offer a Change for a key that belongs to the browser', () => {
    mount();
    expect(rowFor('Copy').textContent).toContain('Fixed');
    expect(rowFor('Copy').querySelector('button')).toBeNull();
  });

  it('has the one-key switch', () => {
    mount();
    const box = document.querySelector<HTMLInputElement>('.keys-controls input[type="checkbox"]')!;
    expect(box.checked).toBe(true);
    act(() => box.click());
    expect(bindingsOf('tool.pen')).toEqual(['P']);
    expect(document.querySelector<HTMLInputElement>('.keys-controls input[type="checkbox"]')!.checked).toBe(false);
  });
});
