//Describe it in Ctrl+K: a typed sentence gives a row that opens the behaviour dialog filled in; nothing readable says so and opens it empty.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { BehaviourHost, closeBehaviours } from '../src/components/BehaviourDialog';
import { CommandPalette } from '../src/components/CommandPalette';
import { closePalette, openPalette } from '../src/lib/command-palette';
import { describeCommand } from '../src/lib/describe-command';
import { closeHelp, HelpHost } from '../src/help/Help';
import { warmHelp } from './lazy-chunks';

beforeAll(() => warmHelp());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

function setup() {
  const p = createProject('Describe');
  p.artboards = [createArtboard({ id: 'p1', name: 'Welcome', width: 800, height: 500 }), createArtboard({ id: 'p2', name: 'Results', width: 800, height: 500, canvasX: 900 })];
  p.settings.startArtboardId = 'p1';
  const btn = createNode('button', { name: 'Go button', x: 10, y: 10, width: 100, height: 40 } as never);
  const hint = createNode('rect', { name: 'Hint', x: 10, y: 100, width: 100, height: 40 });
  p.artboards[0].children.push(btn, hint);
  p.variables.push({ id: 'vs', name: 'score', type: 'number', initial: 0 });
  const store = new EditorStore(p);
  setCurrentStore(store);
  store.set({ activeArtboardId: 'p1' });
  return { store, btn, hint };
}

describe('describeCommand', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => void (s = setup()));
  afterEach(() => void setCurrentStore(null));

  it('is only for sentences of three words or more', () => {
    s.store.select([s.btn.id], { artboardId: 'p1' });
    expect(describeCommand('grid', 0)).toBeNull();
    expect(describeCommand('add 1', 0)).toBeNull();
  });

  it('offers a row that says what it understood', () => {
    s.store.select([s.btn.id], { artboardId: 'p1' });
    const c = describeCommand('make this go to the results page', 0)!;
    expect(c.id).toBe('describe:it');
    expect(c.title).toBe('Describe it: When clicked: go to the page “Results”');
    expect(c.disabled).toBeUndefined();
  });

  it('is not usable until a layer is selected, and says so', () => {
    s.store.select([], { artboardId: 'p1' });
    const c = describeCommand('show the hint when clicked', 0)!;
    expect(c.disabled).toBe('Select the layer first');
  });

  it('does not need a layer when the sentence names it', () => {
    s.store.select([], { artboardId: 'p1' });
    expect(describeCommand('when the go button is clicked show the hint', 0)!.disabled).toBeUndefined();
  });

  it('offers the empty dialog when nothing could be read and no command matched', () => {
    s.store.select([s.btn.id], { artboardId: 'p1' });
    expect(describeCommand('sing me a lullaby tonight', 5)).toBeNull();
    const c = describeCommand('sing me a lullaby tonight', 0)!;
    expect(c.id).toBe('describe:none');
    expect(c.title).toMatch(/^I could not turn that into a behaviour/);
  });
});

describe('in the palette and the dialog', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    closeHelp();
    closePalette();
    closeBehaviours();
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    closePalette();
    closeBehaviours();
    setCurrentStore(null);
    vi.useRealTimers();
  });
  const type = (text: string) => {
    const input = document.querySelector<HTMLInputElement>('.command-palette input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };
  const enter = (input: HTMLElement) => act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })));
  const mount = () => {
    act(() =>
      root.render(
        <>
          <HelpHost />
          <CommandPalette />
          <BehaviourHost />
        </>,
      ),
    );
    act(() => void openPalette());
  };

  it('Enter on the Describe it row opens the dialog with the recipe, trigger and answers filled in, and the notes above', () => {
    const s = setup();
    s.store.select([s.btn.id], { artboardId: 'p1' });
    mount();
    const input = type('after 5 seconds go to the results page');
    expect(document.querySelector('.command-palette li.active .cmd-title')!.textContent).toMatch(/^Describe it: /);
    enter(input);
    act(() => void vi.runAllTimers());
    const dlg = document.querySelector('.behaviour-dialog')!;
    expect(dlg).toBeTruthy();
    expect(dlg.querySelector('[role=radio][aria-checked=true] .recipe-name')!.textContent).toBe('Go to a page…');
    const when = [...dlg.querySelectorAll('select')].find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === 'timer')) as HTMLSelectElement;
    expect(when.value).toBe('timer');
    expect(dlg.querySelector('.behaviour-described')!.textContent).toMatch(/^From your words: /);
    expect(dlg.querySelector('.behaviour-preview')!.textContent).toMatch(/^It will do this: /);
    //Add writes it, as one undo step
    const add = [...dlg.querySelectorAll('footer button')].find((b) => b.textContent === 'Add') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    act(() => void add.click());
    const nodes = s.store.get().project.artboards[0].logic?.nodes ?? [];
    expect(nodes.map((n) => n.kind)).toEqual(['event.timer', 'action.artboard']);
    s.store.undo();
    expect((s.store.get().project.artboards[0].logic?.nodes ?? []).length).toBe(0);
  });

  it('a sentence nothing reads says so, and the dialog opens empty', () => {
    const s = setup();
    s.store.select([s.btn.id], { artboardId: 'p1' });
    mount();
    const input = type('sing me a lullaby tonight');
    expect(document.querySelector('.command-palette li.active .cmd-title')!.textContent).toMatch(/^I could not turn that into a behaviour/);
    enter(input);
    act(() => void vi.runAllTimers());
    const dlg = document.querySelector('.behaviour-dialog')!;
    expect(dlg.querySelector('.behaviour-described')!.textContent).toMatch(/I could not read “sing me a lullaby tonight”/);
    expect(dlg.querySelector('[role=radio][aria-checked=true] .recipe-name')!.textContent).toBe('Go to the next page');
  });

  it('keeps the ordinary commands for a short search', () => {
    const s = setup();
    s.store.select([s.btn.id], { artboardId: 'p1' });
    mount();
    type('grid');
    expect(document.querySelector('.command-palette')!.textContent).not.toMatch(/Describe it|could not turn/);
  });
});
