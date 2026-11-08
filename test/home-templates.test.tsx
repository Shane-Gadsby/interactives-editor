import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => [{ id: 'a', name: 'In folder', folder: 'Maths', tags: [], updated: '2026-01-01T00:00:00Z', artboards: 1 }],
  session: async () => ({ user: { username: 'me' } }),
  listTemplates: async () => [],
  listExamples: async () => [{ key: 'lamp', title: 'Lamp', description: 'A bulb', group: 'Getting started', tags: [], artboards: 1, preview: null }],
}));
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import { Home } from '../src/Home';
import { BRANDED_STARTERS, type BrandedStarter } from '../src/lib/branded';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const tab = (name: string) => [...host.querySelectorAll<HTMLElement>('.home-tabs [role=tab]')].find((t) => t.textContent === name)!;

//The branded packs have their own tests (branded-ui): these are about the plain built-in starters and templates
let realStarters: BrandedStarter[] = [];
beforeEach(async () => {
  realStarters = BRANDED_STARTERS.splice(0);
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Home open={() => undefined} />));
  await flush();
});
afterEach(() => {
  BRANDED_STARTERS.splice(0, BRANDED_STARTERS.length, ...realStarters);
  act(() => root.unmount());
  host.remove();
});

describe('Projects and Templates tabs on the projects page', () => {
  it('opens on Projects, switches to Templates and back, and remembers it', async () => {
    expect(tab('Projects').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.project-grid .project-card')).not.toBeNull();
    expect(host.querySelector('.templates-tab')).toBeNull();
    await act(async () => tab('Templates').click());
    await flush();
    expect(host.querySelector('.templates-tab')).not.toBeNull();
    expect(host.querySelector('.folder-side')).toBeNull();
    expect(localStorage.getItem('ix.home.tab')).toBe('templates');
    await act(async () => tab('Projects').click());
    expect(host.querySelector('.folder-side')).not.toBeNull();
    expect(host.querySelector('.templates-tab')).toBeNull();
  });

  it('a remembered Templates tab comes back, with the built-in starters showing when you have no templates', async () => {
    act(() => root.unmount());
    localStorage.setItem('ix.home.tab', 'templates');
    root = createRoot(host);
    await act(async () => root.render(<Home open={() => undefined} />));
    await flush();
    expect(host.querySelector('.templates-tab')).not.toBeNull();
    expect(host.querySelectorAll('.template-card')).toHaveLength(6);
  });
});
