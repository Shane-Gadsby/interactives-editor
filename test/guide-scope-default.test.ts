import { describe, expect, it, vi } from 'vitest';

//The choice is read once and kept, so each case loads the module fresh
const fresh = async () => {
  vi.resetModules();
  return import('../src/lib/guides');
};

describe('what a new guide belongs to', () => {
  it('is this page only when nothing has been chosen, so a guide stays on the page it was dropped on', async () => {
    localStorage.removeItem('ix-guide-scope');
    expect((await fresh()).getGuideScope()).toBe('page');
  });

  it('is every page once that has been chosen in the guides menu', async () => {
    localStorage.setItem('ix-guide-scope', 'project');
    expect((await fresh()).getGuideScope()).toBe('project');
    localStorage.removeItem('ix-guide-scope');
  });
});
