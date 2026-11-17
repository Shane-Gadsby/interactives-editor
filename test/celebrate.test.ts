import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cheerBadge, cheerLine, dismissCheer, lastCheer } from '../src/lib/celebrate';
import { setPrefs } from '../src/lib/prefs';

let made = 0;
beforeEach(() => {
  vi.useFakeTimers();
  made = 0;
  setPrefs({ tutorialBadges: true, tutorialSound: false });
  (globalThis as { AudioContext?: unknown }).AudioContext = class {
    currentTime = 0;
    destination = {};
    constructor() {
      made++;
    }
    createOscillator() {
      return { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
    }
  };
});
afterEach(() => {
  dismissCheer();
  vi.useRealTimers();
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
  setPrefs({ tutorialBadges: true, tutorialSound: false });
});

describe('cheers', () => {
  it('a line clears itself quickly and a badge card stays a few seconds, or goes when dismissed', () => {
    cheerLine('Step 1 done. 5 to go.');
    expect(lastCheer()).toMatchObject({ kind: 'step', text: 'Step 1 done. 5 to go.' });
    vi.advanceTimersByTime(2300);
    expect(lastCheer()).toBeNull();
    cheerBadge('Tutorial done: X', ['Badge for the whole set: Y']);
    expect(lastCheer()).toMatchObject({ kind: 'badge', title: 'Tutorial done: X' });
    vi.advanceTimersByTime(3000);
    expect(lastCheer()).not.toBeNull();
    dismissCheer();
    expect(lastCheer()).toBeNull();
  });

  it('shows nothing when the badges are off', () => {
    setPrefs({ tutorialBadges: false });
    cheerLine('x');
    cheerBadge('y');
    expect(lastCheer()).toBeNull();
  });

  it('makes no sound unless sounds were asked for', () => {
    cheerBadge('y');
    cheerLine('x');
    expect(made).toBe(0);
    setPrefs({ tutorialSound: true });
    cheerBadge('y');
    expect(made).toBe(1);
  });

  it('a badge card is still (no confetti) when the system asks for less motion', () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q })) as unknown as typeof window.matchMedia;
    try {
      cheerBadge('y');
      expect(lastCheer()).toMatchObject({ kind: 'badge', still: true });
    } finally {
      window.matchMedia = was;
    }
  });
});
