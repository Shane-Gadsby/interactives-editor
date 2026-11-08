import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => [
    { id: 'pa', name: 'Older', folder: null, tags: [], updated: '2026-01-01T00:00:00Z', artboards: 1, thumb: null },
    { id: 'pnew', name: 'From a template', folder: null, tags: [], updated: '2026-01-02T00:00:00Z', artboards: 1, thumb: null },
  ],
  session: async () => ({ user: { username: 'me' } }),
  listTemplates: async () => [],
  listExamples: async () => [],
}));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));
vi.mock('../src/lib/image-export', () => ({ projectThumbnail: async () => null }));
//the editor itself is not under test: a stub with the same Home button
vi.mock('../src/Editor', () => ({
  Editor: ({ projectId, home }: { projectId: string; home: () => void }) => (
    <button id="stub-home" onClick={home}>
      editor {projectId}
    </button>
  ),
}));
vi.mock('../src/help/Help', () => ({ HelpHost: () => null, HelpPage: () => null }));
vi.mock('../src/components/dialogs', () => ({ DialogHost: () => null, confirmDialog: async () => true, promptDialog: async () => null }));

import { App } from '../src/App';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
const go = (hash: string) =>
  act(async () => {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise((r) => setTimeout(r, 10));
  });
const selected = () => host.querySelector('.home-tabs [aria-selected=true]')?.textContent?.trim();

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  location.hash = '#/';
  localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Home after a project', () => {
  it('opens Projects with the project just left in view, even when Templates was the last tab', async () => {
    localStorage.setItem('ix.home.tab', 'templates');
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    await flush();
    expect(selected()).toBe('Templates');
    //"Use template" lands in the new project...
    await go('#/p/pnew');
    expect(host.querySelector('#stub-home')?.textContent).toContain('pnew');
    //...and the editor's Home button goes back to the list
    await act(async () => void host.querySelector<HTMLElement>('#stub-home')!.click());
    await flush();
    expect(selected()).toBe('Projects');
    expect(host.querySelector('.project-card.just-left')?.getAttribute('data-project-id')).toBe('pnew');
    expect(host.querySelectorAll('.project-card.just-left').length).toBe(1);
  });

  it('does the same for the browser Back button', async () => {
    localStorage.setItem('ix.home.tab', 'templates');
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    await flush();
    await go('#/p/pnew');
    await go('#/');
    await flush();
    expect(selected()).toBe('Projects');
    expect(host.querySelector('.project-card.just-left')?.getAttribute('data-project-id')).toBe('pnew');
  });

  it('a fresh visit still opens the remembered tab, with nothing highlighted', async () => {
    localStorage.setItem('ix.home.tab', 'templates');
    await act(async () => root.render(<StrictMode><App /></StrictMode>));
    await flush();
    expect(selected()).toBe('Templates');
    expect(host.querySelector('.just-left')).toBeNull();
  });
});
