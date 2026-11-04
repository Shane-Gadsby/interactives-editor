// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installStaleBuildNotice, isChunkLoadError, noteIfStale } from '../src/lib/stale-build';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('stale build notice', () => {
  it('recognises the dynamic import failures of each browser', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/importers-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isChunkLoadError(new Error('Network down'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('shows one toast with a Reload button when a caller reports a failed chunk', () => {
    expect(noteIfStale(new Error('boom'))).toBe(false);
    expect(document.querySelector('.stale-toast')).toBeNull();
    expect(noteIfStale(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(true);
    noteIfStale(new TypeError('Failed to fetch dynamically imported module: y'));
    expect(document.querySelectorAll('.stale-toast')).toHaveLength(1);
    const buttons = [...document.querySelectorAll('.stale-toast button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Reload', 'Not now']);
  });

  it('Not now dismisses it, and it can come back for the next failure', () => {
    noteIfStale(new Error('Failed to fetch dynamically imported module: x'));
    (document.querySelectorAll('.stale-toast button')[1] as HTMLButtonElement).click();
    expect(document.querySelector('.stale-toast')).toBeNull();
    noteIfStale(new Error('Failed to fetch dynamically imported module: x'));
    expect(document.querySelector('.stale-toast')).not.toBeNull();
  });

  it('listens for vite:preloadError centrally', () => {
    installStaleBuildNotice();
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(document.querySelector('.stale-toast')).not.toBeNull();
  });
});
