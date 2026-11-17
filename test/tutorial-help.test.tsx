import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { closeHelp, HelpHost, HelpPage, openHelp } from '../src/help/Help';
import { CelebrationHost } from '../src/components/Celebration';
import { dismissCheer, lastCheer } from '../src/lib/celebrate';
import { prefs, setPrefs } from '../src/lib/prefs';
import { warmHelp } from './lazy-chunks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(() => warmHelp());

let root: Root;
let host: HTMLElement;
const ticks = () => [...document.querySelectorAll<HTMLInputElement>('.help-article input.step-tick')];
const click = (el: Element) => act(() => void (el as HTMLElement).click());
const reset = () => setPrefs({ tutorialProgress: undefined, tutorialBadges: true, tutorialSound: false });

beforeEach(() => {
  reset();
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
  act(() => dismissCheer());
  act(() => closeHelp());
  act(() => root.unmount());
  host.remove();
  reset();
});

describe('tutorials in the help', () => {
  it('puts a tick box on each numbered step and a progress strip under the title', () => {
    act(() => openHelp('tutorial-mcq'));
    expect(ticks().length).toBe(6);
    expect(ticks()[0].getAttribute('aria-label')).toBe('Step 1 done');
    expect(document.querySelector('.tutorial-bar')!.textContent).toContain('0 of 6 steps ticked');
  });

  it('ticking a step keeps it with the preferences and says so with a short line, not a badge', () => {
    act(() => openHelp('tutorial-mcq'));
    click(ticks()[1]);
    expect(prefs().tutorialProgress?.['tutorial-mcq']?.steps).toEqual([2]);
    expect(ticks()[1].checked).toBe(true);
    expect(document.querySelector('.cheer-line')!.textContent).toContain('Step 2 done. 5 to go.');
    expect(document.querySelector('.cheer-badge')).toBeNull();
    expect(document.querySelector('.tutorial-bar')!.textContent).toContain('1 of 6 steps ticked');
    click(ticks()[1]);
    expect(prefs().tutorialProgress).toEqual({});
  });

  it('the last tick finishes it: a badge card, the finished mark in the nav, and a set badge when that was the last of a set', () => {
    //finish the other five in the Questions set first, so this one completes it too
    const others = ['tutorial-drag-match', 'tutorial-blanks', 'tutorial-sort', 'tutorial-order', 'tutorial-label'];
    setPrefs({ tutorialProgress: Object.fromEntries(others.map((id) => [id, { done: 1 }])) });
    act(() => openHelp('tutorial-mcq'));
    for (const t of ticks()) click(t);
    const card = document.querySelector('.cheer-badge')!;
    expect(card.textContent).toContain('Tutorial done: A multiple choice question');
    expect(card.textContent).toContain('Badge for the whole set: Questions');
    expect(prefs().tutorialProgress?.['tutorial-mcq']?.done).toBeGreaterThan(0);
    expect(document.querySelector('.tutorial-bar')!.textContent).toContain('Finished. Badge earned');
    //Close puts the card away at once
    click(card.querySelector('button')!);
    expect(document.querySelector('.cheer-badge')).toBeNull();
  });

  it('I have done all of this counts every step, and Start again clears it', () => {
    act(() => openHelp('tutorial-brand'));
    click([...document.querySelectorAll<HTMLButtonElement>('.tutorial-foot button')][0]);
    expect(ticks().every((t) => t.checked)).toBe(true);
    expect(lastCheer()?.kind).toBe('badge');
    click([...document.querySelectorAll<HTMLButtonElement>('.tutorial-bar button')].find((b) => b.textContent === 'Start again')!);
    expect(prefs().tutorialProgress).toEqual({});
    expect(ticks().some((t) => t.checked)).toBe(false);
  });

  it('a concept is marked as read, not ticked step by step', () => {
    act(() => openHelp('concept-assets'));
    expect(ticks().length).toBe(0);
    click(document.querySelector('.tutorial-foot button')!);
    expect(prefs().tutorialProgress?.['concept-assets']?.done).toBeGreaterThan(0);
    expect(document.querySelector('.cheer-line')!.textContent).toContain('Marked as read');
  });

  it('shows the badge as a still card, with no confetti, when the system asks for less motion', () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
    try {
      act(() => openHelp('tutorial-brand'));
      click(document.querySelector('.tutorial-foot button')!);
      expect(document.querySelector('.cheer-badge.still')).not.toBeNull();
      expect(document.querySelector('.cheer-confetti')).toBeNull();
    } finally {
      window.matchMedia = was;
    }
  });

  it('shows confetti with the badge when motion is fine', () => {
    act(() => openHelp('tutorial-brand'));
    click(document.querySelector('.tutorial-foot button')!);
    expect(document.querySelector('.cheer-confetti')!.children.length).toBeGreaterThan(10);
  });

  it('with the badges switched off there are no ticks, strip, nav marks or cheers, and the progress is kept', () => {
    setPrefs({ tutorialProgress: { 'tutorial-mcq': { steps: [1], done: 5 } }, tutorialBadges: false });
    act(() => openHelp('tutorial-mcq'));
    expect(ticks().length).toBe(0);
    expect(document.querySelector('.tutorial-bar')).toBeNull();
    expect(document.querySelector('.nav-done')).toBeNull();
    expect(prefs().tutorialProgress?.['tutorial-mcq']?.done).toBe(5);
    act(() => setPrefs({ tutorialBadges: true }));
    expect(ticks()[0].checked).toBe(true);
  });

  it('the full help page marks the finished ones in its contents', () => {
    setPrefs({ tutorialProgress: { 'tutorial-mcq': { done: 5 } } });
    act(() => root.render(<HelpPage id="tutorial-mcq" />));
    const done = [...document.querySelectorAll('.help-nav a')].filter((a) => a.querySelector('.nav-done'));
    expect(done.map((a) => a.textContent)).toEqual(['A multiple choice question with scoring and feedback']);
  });

  it('other help pages have none of it', () => {
    act(() => openHelp('shapes'));
    expect(ticks().length).toBe(0);
    expect(document.querySelector('.tutorial-bar')).toBeNull();
  });
});
