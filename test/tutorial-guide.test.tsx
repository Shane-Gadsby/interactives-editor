import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, normalizeProject, sanitizeProject, type Project } from 'interactives-player';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { closeHelp, HelpHost, openHelp } from '../src/help/Help';
import { CelebrationHost } from '../src/components/Celebration';
import { dismissCheer } from '../src/lib/celebrate';
import { prefs, setPrefs } from '../src/lib/prefs';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { setPreviewOpen } from '../src/lib/overlays';
import { hideTour, tourActive } from '../src/lib/tour';
import { clearHolds } from '../src/lib/tutorial-hold';
import { warmHelp } from './lazy-chunks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(() => warmHelp());

let root: Root;
let host: HTMLElement;
let store: EditorStore | null = null;
const ticks = () => [...document.querySelectorAll<HTMLInputElement>('.help-article input.step-tick')];
const shows = () => [...document.querySelectorAll<HTMLButtonElement>('.help-article .step-show')];
const click = (el: Element) => act(() => void (el as HTMLElement).click());
const later = (ms = 400) => act(() => void vi.advanceTimersByTime(ms));
const ticked = (id: string) => prefs().tutorialProgress?.[id]?.steps ?? [];
const withStore = (p: Project) => {
  store = new EditorStore(p);
  act(() => setCurrentStore(store));
  return store;
};
const rect = () => createNode('rect', { name: 'Box', x: 10, y: 10, width: 80, height: 80 });
const blank = () => createProject('Untitled project');
const finished = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', key, 'project.json'), 'utf8'))));
const reset = () => setPrefs({ tutorialProgress: undefined, tutorialBadges: true, tutorialSound: false });

beforeEach(() => {
  vi.useFakeTimers();
  reset();
  clearHolds();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <>
        <HelpHost />
        <CelebrationHost />
      </>,
    ),
  );
});
afterEach(() => {
  act(() => hideTour());
  act(() => dismissCheer());
  act(() => closeHelp());
  act(() => setCurrentStore(null));
  store = null;
  act(() => root.unmount());
  host.remove();
  document.body.querySelectorAll('[data-tour]').forEach((e) => e.remove());
  reset();
  vi.useRealTimers();
});

describe('a tutorial that ticks its own steps', () => {
  it('ticks the step when its check becomes true, with the same cheer as a tick by hand', () => {
    const s = withStore(blank());
    act(() => openHelp('tutorial-first-animation'));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([]);
    act(() => s.addNodes([rect()]));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([2]);
    expect(ticks()[1].checked).toBe(true);
    expect(document.querySelector('.cheer-line')!.textContent).toContain('Step 2 done. 5 to go.');
  });

  it('does not look at every change: once per short wait', () => {
    const s = withStore(blank());
    act(() => openHelp('tutorial-first-animation'));
    later();
    act(() => s.addNodes([rect()]));
    act(() => void vi.advanceTimersByTime(100));
    expect(ticked('tutorial-first-animation')).toEqual([]);
    later(300);
    expect(ticked('tutorial-first-animation')).toEqual([2]);
  });

  it('leaves a step alone that the person unticked, until its check has gone false and come true again', () => {
    const s = withStore(blank());
    act(() => openHelp('tutorial-first-animation'));
    act(() => s.addNodes([rect()]));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([2]);
    click(ticks()[1]);
    expect(ticked('tutorial-first-animation')).toEqual([]);
    //more edits while the rectangle is still there: no fighting
    act(() => s.update((d) => void (d.artboards[0].children[0].x = 50)));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([]);
    //the rectangle goes, and later comes back: that is doing it again
    act(() => s.update((d) => void (d.artboards[0].children.length = 0)));
    later();
    act(() => s.addNodes([rect()]));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([2]);
  });

  it('Start again does not tick back what the project already has', () => {
    const s = withStore(finished('first-animation'));
    act(() => openHelp('tutorial-first-animation'));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([1, 2, 3, 4]);
    click([...document.querySelectorAll<HTMLButtonElement>('.tutorial-bar button')].find((b) => b.textContent === 'Start again')!);
    later();
    expect(ticked('tutorial-first-animation')).toEqual([]);
    //but a step done after that does
    act(() => void (s.get().recording, s.set({ previewPlaying: true })));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([5]);
  });

  it('several steps already true tick together with one line, for the last', () => {
    withStore(finished('first-animation'));
    act(() => openHelp('tutorial-first-animation'));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([1, 2, 3, 4]);
    expect(document.querySelectorAll('.cheer-line')).toHaveLength(1);
    expect(document.querySelector('.cheer-line')!.textContent).toContain('Step 4 done. 2 to go.');
  });

  it('notices what the project cannot say afterwards: it was played, Preview was opened', () => {
    const s = withStore(finished('first-interaction'));
    act(() => openHelp('tutorial-first-interaction'));
    later();
    expect(ticked('tutorial-first-interaction')).toEqual([1, 2, 3]);
    act(() => setPreviewOpen(true));
    later();
    act(() => setPreviewOpen(false));
    expect(ticked('tutorial-first-interaction')).toEqual([1, 2, 3, 6]);
    s.set({ previewPlaying: true });
  });

  it('does nothing while the help is not on the tutorial, or with the cheers and badges switched off', () => {
    const s = withStore(blank());
    act(() => openHelp('shapes'));
    act(() => s.addNodes([rect()]));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([]);
    act(() => setPrefs({ tutorialBadges: false }));
    act(() => openHelp('tutorial-first-animation'));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([]);
  });

  it('with no project open there is nothing to watch: no Show me, a line saying so, and ticking by hand as ever', () => {
    act(() => openHelp('tutorial-first-animation'));
    later();
    expect(shows()).toHaveLength(0);
    expect(document.querySelector('.tutorial-guided')!.textContent).toContain('Open a project');
    click(ticks()[0]);
    expect(ticked('tutorial-first-animation')).toEqual([1]);
  });

  it('follows a project opened after the help (and stops when it is closed)', () => {
    act(() => openHelp('tutorial-first-animation'));
    later();
    const s = withStore(blank());
    act(() => s.addNodes([rect()]));
    later();
    expect(ticked('tutorial-first-animation')).toEqual([2]);
    act(() => setCurrentStore(null));
    expect(document.querySelectorAll('.step-show')).toHaveLength(0);
  });
});

describe('Show me', () => {
  const target = (id: string, rectOf = { left: 20, top: 40, width: 60, height: 30 }) => {
    const b = document.createElement('button');
    b.setAttribute('data-tour', id);
    b.getBoundingClientRect = () => ({ ...rectOf, right: rectOf.left + rectOf.width, bottom: rectOf.top + rectOf.height, x: rectOf.left, y: rectOf.top, toJSON: () => ({}) });
    document.body.appendChild(b);
    return b;
  };

  it('is on the steps that have a target, with a name for a screen reader, and not on the others', () => {
    withStore(blank());
    act(() => openHelp('tutorial-first-animation'));
    //five of its six steps have a target
    expect(shows()).toHaveLength(5);
    expect(shows()[0].getAttribute('aria-label')).toBe('Show me where, for step 1');
    expect(shows()[0].closest('.help-step')!.textContent).toContain('Make a project');
  });

  it('rings the control and names it, and never takes a click', () => {
    withStore(blank());
    target('tool-rect');
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[1]);
    const ring = document.querySelector<HTMLElement>('.tour-ring')!;
    expect(ring).not.toBeNull();
    expect(document.querySelector('.tour-label')!.textContent).toBe('Rectangle tool (R)');
    //(jsdom has no stylesheet: read the rule itself)
    const css = readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8');
    for (const rule of ['.tour-layer', '.tour-ring', '.tour-label']) expect(new RegExp(`${rule.replace('.', '\\.')} \\{[^}]*pointer-events: none`).test(css), rule).toBe(true);
    expect(css.match(/animation: tour-pulse/g)).toHaveLength(1);
    expect(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.tour-ring \{\s*animation/.test(css)).toBe(true);
  });

  it('says where the control is when it is not on screen', () => {
    withStore(blank());
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[1]);
    expect(document.querySelector('.tour-ring')).toBeNull();
    expect(document.querySelector('.tour-note')!.textContent).toContain('tool bar down the left edge');
  });

  it('tries the next target when the first is not there', () => {
    withStore(blank());
    target('panel-timeline');
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[2]);
    expect(document.querySelector('.tour-label')!.textContent).toBe('The Timeline tab');
  });

  it('goes on Esc, and that Esc leaves the help open', () => {
    withStore(blank());
    target('tool-rect');
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[1]);
    expect(tourActive()).toBe(true);
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(tourActive()).toBe(false);
    expect(document.querySelector('.tour-ring')).toBeNull();
    expect(document.querySelector('.help-drawer')).not.toBeNull();
  });

  it('goes on the next click or key press, which still go through', () => {
    withStore(blank());
    const t = target('tool-rect');
    let clicked = 0;
    t.addEventListener('click', () => clicked++);
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[1]);
    expect(tourActive()).toBe(true);
    act(() => void t.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    t.click();
    expect(tourActive()).toBe(false);
    expect(clicked).toBe(1);
    click(shows()[1]);
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true })));
    expect(tourActive()).toBe(true);
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })));
    expect(tourActive()).toBe(false);
  });

  it('goes with the tutorial, and by itself after a while', () => {
    withStore(blank());
    target('tool-rect');
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[1]);
    act(() => closeHelp());
    expect(tourActive()).toBe(false);
    act(() => openHelp('tutorial-first-animation'));
    click(shows()[1]);
    later(16000);
    expect(tourActive()).toBe(false);
  });

  it('is there from the Tutorials window too: it opens the tutorial in this same help', () => {
    //(the window's Start button calls openHelp, which is all the guidance needs)
    const s = withStore(blank());
    act(() => openHelp('tutorial-mcq'));
    later();
    expect(shows().length).toBeGreaterThan(0);
    act(() => s.set({ tool: 'rect' }));
  });
});
