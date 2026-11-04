//Turning recording on for the page: it asks the session who this is (utilities.js's fetchActivity) and gives
//reportAnalytics the person through the global `m` it reads, holds rows until it knows (a few seconds at most), counts
//active time only while the tab is showing and being used, and sends what it holds when the tab is hidden.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAnalytics, setSink, track, type Row } from '../src/lib/analytics';

let rows: Row[] = [];
let answer: ((err: unknown, data: unknown) => void) | null = null;
const w = window as unknown as Record<string, unknown>;

//one set of fake timers for the whole file: the page installs its timers once
beforeAll(() => {
  vi.useFakeTimers();
});
afterAll(() => {
  setSink(null);
  vi.useRealTimers();
});
beforeEach(() => {
  rows = [];
  setSink((app, feature, featureID, meta) => void rows.push({ app, feature, featureID, meta }));
  w.fetchActivity = (cb: (err: unknown, data: unknown) => void) => (answer = cb);
});

describe('installAnalytics', () => {
  it('waits for the person, hands them to reportAnalytics through m, then sends the visit start', () => {
    installAnalytics();
    installAnalytics();
    expect(w.m).toMatchObject({ app: 'Interactives Editor' });
    track('tool', 'use', { thing: 'pen' });
    vi.advanceTimersByTime(3000);
    expect(rows).toHaveLength(0);
    answer!(null, { user: { username: 'ann', userID: 3 }, activity: { courseLabel: 'X_2026' } });
    expect((w.m as { user: { username: string } }).user.username).toBe('ann');
    const sent = rows.map((r) => `${r.feature}/${r.featureID}`).sort();
    expect(sent).toEqual(['session/start', 'tool/use']);
    expect(rows.find((r) => r.featureID === 'start')!.meta.ev).toMatchObject({ detail: { browser: expect.any(String), os: expect.any(String), width: expect.any(String) } });
  });

  it('counts active time while the tab shows and is being used, and sends on the minute', () => {
    rows.length = 0;
    w.fetchActivity = undefined;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(60_000);
    const active = rows.filter((r) => r.feature === 'session' && r.featureID === 'active');
    expect(active).toHaveLength(1);
    const ms = (active[0].meta.ev as { ms: number }).ms;
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it('sends what it holds when the tab goes, and the length of the visit', () => {
    rows.length = 0;
    track('panel', 'open', { thing: 'logic' });
    window.dispatchEvent(new Event('pagehide'));
    expect(rows.some((r) => r.feature === 'panel')).toBe(true);
    expect(rows.find((r) => r.feature === 'session' && r.featureID === 'end')).toBeTruthy();
  });
});
