import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

//the fold memory is a module with state (who the prefs belong to, whether the server has answered), so each test gets a fresh one
async function fresh(opts: { user?: string; server?: Record<string, unknown> | 'down'; legacy?: Record<string, boolean> } = {}) {
  vi.resetModules();
  localStorage.clear();
  if (opts.legacy) localStorage.setItem('ix-section-folds', JSON.stringify(opts.legacy));
  const puts: Array<{ prefs: Record<string, unknown> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)));
        return new Response('{}');
      }
      if (opts.server === 'down') throw new Error('offline');
      return new Response(JSON.stringify({ user: opts.user ?? 'ann', prefs: opts.server ?? {} }));
    }),
  );
  const folds = await import('../src/lib/section-fold');
  const prefs = await import('../src/lib/prefs');
  return { ...folds, ...prefs, puts };
}
const legacy = () => JSON.parse(localStorage.getItem('ix-section-folds') ?? 'null');

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fold memory in preferences', () => {
  it('takes the folds from the preferences of a signed in person', async () => {
    const m = await fresh({ server: { sectionFolds: { Alpha: false } } });
    await m.loadUserPrefs();
    expect(m.isSectionOpen('Alpha', true)).toBe(false);
    expect(m.isSectionOpen('Beta', true)).toBe(true);
  });

  it('saves a fold into the preferences, debounced into one request, and not into localStorage', async () => {
    const m = await fresh({});
    await m.loadUserPrefs();
    m.setSectionOpen('Alpha', false, true);
    m.setSectionOpen('Beta', true, false);
    m.setSectionOpen('Gamma', false, true);
    expect(m.puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(m.puts).toHaveLength(1);
    expect(m.puts[0].prefs.sectionFolds).toEqual({ Alpha: false, Beta: true, Gamma: false });
    expect(legacy()).toBeNull();
    //putting one back to its default forgets it there too
    m.setSectionOpen('Gamma', true, true);
    await vi.advanceTimersByTimeAsync(500);
    expect(m.puts[1].prefs.sectionFolds).toEqual({ Alpha: false, Beta: true });
  });

  it('moves the old localStorage value into the preferences once, then clears it', async () => {
    const m = await fresh({ legacy: { Alpha: false, Beta: true } });
    await m.loadUserPrefs();
    expect(m.isSectionOpen('Alpha', true)).toBe(false);
    expect(m.isSectionOpen('Beta', false)).toBe(true);
    expect(legacy()).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(m.puts.at(-1)?.prefs.sectionFolds).toEqual({ Alpha: false, Beta: true });
  });

  it('lets what is on the server win over the old value, and keeps the keys only the old one had', async () => {
    const m = await fresh({ legacy: { Alpha: true, Beta: true }, server: { sectionFolds: { Alpha: false } } });
    await m.loadUserPrefs();
    expect(m.isSectionOpen('Alpha', true)).toBe(false);
    expect(m.isSectionOpen('Beta', false)).toBe(true);
    expect(legacy()).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(m.puts.at(-1)?.prefs.sectionFolds).toEqual({ Alpha: false, Beta: true });
  });

  it('keeps a guest on localStorage and never writes folds to the preferences', async () => {
    const m = await fresh({ user: 'guest', legacy: { Alpha: false } });
    await m.loadUserPrefs();
    expect(m.isSectionOpen('Alpha', true)).toBe(false);
    m.setSectionOpen('Beta', true, false);
    expect(legacy()).toEqual({ Alpha: false, Beta: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(m.puts.every((p) => !('sectionFolds' in p.prefs))).toBe(true);
  });

  it('keeps folds in localStorage until the server has answered, and moves them in when it does', async () => {
    const m = await fresh({});
    m.setSectionOpen('Alpha', false, true);
    expect(legacy()).toEqual({ Alpha: false });
    await m.loadUserPrefs();
    expect(m.isSectionOpen('Alpha', true)).toBe(false);
    expect(legacy()).toBeNull();
  });

  it('leaves the old value alone when the server cannot be reached', async () => {
    const m = await fresh({ server: 'down', legacy: { Alpha: false } });
    await m.loadUserPrefs();
    expect(m.isSectionOpen('Alpha', true)).toBe(false);
    expect(legacy()).toEqual({ Alpha: false });
  });

  it('forgets every fold in the preferences on reset', async () => {
    const m = await fresh({ server: { sectionFolds: { Alpha: false } } });
    await m.loadUserPrefs();
    m.resetSectionFolds();
    expect(m.isSectionOpen('Alpha', true)).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(m.puts.at(-1)?.prefs.sectionFolds).toEqual({});
  });
});
