import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../src/lib/db', async (orig) => {
  const { readFileSync } = await import('node:fs');
  return {
    ...(await orig<typeof import('../src/lib/db')>()),
    listProjects: async () => [],
    session: async () => ({ user: { username: 'me' } }),
    listTemplates: async () => [],
    listExamples: async () => JSON.parse(readFileSync('examples/index.json', 'utf8')),
  };
});
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import { Home } from '../src/Home';
import { closeHelp, helpHistory } from '../src/help/Help';
import { prefs, setPrefs } from '../src/lib/prefs';
import { tutorialCatalog } from '../src/help/lazy';
import { CONCEPTS } from '../src/help/concepts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeAll(() => tutorialCatalog.ensure());

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const modal = () => document.querySelector('.tutorials-modal');
const cards = () => [...document.querySelectorAll<HTMLElement>('.tutorials-modal .tut-card')];
const card = (title: string) => cards().find((c) => c.querySelector('h4')!.textContent!.includes(title))!;
const button = (el: Element, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;
const reset = () => setPrefs({ tutorialProgress: undefined, tutorialBadges: true });

beforeEach(async () => {
  localStorage.clear();
  reset();
  helpHistory.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Home open={() => undefined} />));
  await flush();
});
afterEach(() => {
  act(() => closeHelp());
  act(() => root.unmount());
  host.remove();
  reset();
});

const openTutorials = async () => {
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.home-head button')].find((b) => b.textContent?.includes('Tutorials'))!.click());
  await flush();
};

describe('the Tutorials button on the projects page', () => {
  it('opens every Getting started and Build it tutorial and every concept as cards, grouped like the help', async () => {
    expect(modal()).toBeNull();
    await openTutorials();
    expect(modal()).not.toBeNull();
    expect([...document.querySelectorAll('.tutorials-modal .tut-group > h3')].map((h) => h.textContent)).toEqual(['Getting started', 'Build it', 'Concepts']);
    expect(cards().length).toBe(5 + 33 + CONCEPTS.length);
    expect([...document.querySelectorAll('.tutorials-modal .tut-level')].map((h) => h.textContent)).toEqual(['Beginner', 'Intermediate', 'Advanced']);
  });

  it('a card has its picture, a line, the time, Start and the finished example', async () => {
    await openTutorials();
    const c = card('A multiple choice question');
    expect(c.querySelector('.tut-pic img')!.getAttribute('src')).toContain('examples/tut-mcq/thumbnail');
    expect(c.textContent).toContain('Beginner');
    expect(c.textContent).toContain('about 10 minutes');
    expect(c.textContent).toContain('One question with four options');
    expect(button(c, 'Start')).toBeTruthy();
    expect(button(c, 'Open the finished example')).toBeTruthy();
    //a concept has no example to open
    expect(button(card('Assets'), 'Open the finished example')).toBeUndefined();
  });

  it('Start closes the list and opens that tutorial in the help', async () => {
    await openTutorials();
    await act(async () => button(card('A multiple choice question'), 'Start').click());
    expect(modal()).toBeNull();
    expect(helpHistory.current?.id).toBe('tutorial-mcq');
  });

  it('Open the finished example plays it, with Make my copy beside it', async () => {
    await openTutorials();
    await act(async () => button(card('A multiple choice question'), 'Open the finished example').click());
    expect(document.querySelector('.example-play')).not.toBeNull();
    expect(button(document.querySelector('.example-play')!, 'Make my copy')).toBeTruthy();
    //Esc closes the example first and leaves the list
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.querySelector('.example-play')).toBeNull();
    expect(modal()).not.toBeNull();
  });

  it('searches the cards', async () => {
    await openTutorials();
    const box = document.querySelector<HTMLInputElement>('.tutorials-modal input[type=search]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, 'crossword');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(cards().map((c) => c.querySelector('h4')!.textContent)).toEqual([expect.stringContaining('Word search and crossword')]);
  });

  it('shows progress on the cards, the total and a badge for each set', async () => {
    setPrefs({ tutorialProgress: { 'tutorial-mcq': { steps: [1, 2], done: undefined }, 'tutorial-sort': { steps: [1], done: 9 }, 'concept-assets': { done: 9 } } });
    await openTutorials();
    expect(card('A multiple choice question').textContent).toContain('2 of 6 done');
    expect(button(card('A multiple choice question'), 'Carry on')).toBeTruthy();
    expect(card('Sort into groups').textContent).toContain('Finished');
    expect(button(card('Sort into groups'), 'Do it again')).toBeTruthy();
    expect(document.querySelector('.tut-total')!.textContent).toBe('1 of 38 tutorials finished');
    const sets = [...document.querySelectorAll('.tut-sets li')].map((li) => li.textContent);
    expect(sets.some((s) => s!.includes('Questions') && s!.includes('1/6'))).toBe(true);
    expect(document.querySelectorAll('.tut-sets li.earned').length).toBe(0);
  });

  it('with badges off it shows the cards but no progress, ticks or badges', async () => {
    setPrefs({ tutorialProgress: { 'tutorial-sort': { done: 9 } }, tutorialBadges: false });
    await openTutorials();
    expect(cards().length).toBe(5 + 33 + CONCEPTS.length);
    expect(document.querySelector('.tut-summary')).toBeNull();
    expect(card('Sort into groups').textContent).not.toContain('Finished');
    expect(prefs().tutorialProgress?.['tutorial-sort']?.done).toBe(9);
  });
});
