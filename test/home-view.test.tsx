import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => [
    { id: 'a', name: 'One', folder: null, tags: [], updated: '2026-01-01T00:00:00Z', artboards: 1 },
    { id: 'b', name: 'Two', folder: null, tags: [], updated: '2026-01-02T00:00:00Z', artboards: 1 },
  ],
  session: async () => ({ user: { username: 'me' } }),
}));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import { Home, HOME_SIZE_DEFAULT, HOME_SIZE_MAX, HOME_SIZE_MIN } from '../src/Home';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const mount = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Home open={() => undefined} />));
  await flush();
};
const viewButton = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.home-view .seg button')].find((b) => b.textContent === label)!;
const grid = () => host.querySelector<HTMLElement>('.project-grid')!;
const slider = () => host.querySelector<HTMLInputElement>('.home-view input[type=range]');
const setSlider = (v: string) =>
  act(async () => {
    const el = slider()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('projects page view', () => {
  it('starts as thumbnails at the default size, with a slider', async () => {
    await mount();
    expect(grid().classList.contains('as-list')).toBe(false);
    expect(grid().style.getPropertyValue('--card-size')).toBe(`${HOME_SIZE_DEFAULT}px`);
    expect(slider()).not.toBeNull();
    expect(viewButton('Thumbnails').classList.contains('on')).toBe(true);
  });

  it('the slider sets the card size and remembers it', async () => {
    await mount();
    await setSlider('300');
    expect(grid().style.getPropertyValue('--card-size')).toBe('300px');
    expect(localStorage.getItem('ix.home.size')).toBe('300');
    act(() => root.unmount());
    host.remove();
    await mount();
    expect(grid().style.getPropertyValue('--card-size')).toBe('300px');
  });

  it('a stored size outside the range is clamped', async () => {
    localStorage.setItem('ix.home.size', '9999');
    await mount();
    expect(grid().style.getPropertyValue('--card-size')).toBe(`${HOME_SIZE_MAX}px`);
    act(() => root.unmount());
    host.remove();
    localStorage.setItem('ix.home.size', '5');
    await mount();
    expect(grid().style.getPropertyValue('--card-size')).toBe(`${HOME_SIZE_MIN}px`);
  });

  it('Details switches to the list layout, hides the slider and is remembered', async () => {
    await mount();
    await act(async () => viewButton('Details').click());
    expect(grid().classList.contains('as-list')).toBe(true);
    expect(slider()).toBeNull();
    expect(localStorage.getItem('ix.home.view')).toBe('list');
    act(() => root.unmount());
    host.remove();
    await mount();
    expect(grid().classList.contains('as-list')).toBe(true);
    await act(async () => viewButton('Thumbnails').click());
    expect(grid().classList.contains('as-list')).toBe(false);
    expect(localStorage.getItem('ix.home.view')).toBe('grid');
  });
});
