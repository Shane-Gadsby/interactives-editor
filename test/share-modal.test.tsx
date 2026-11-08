import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  getShare: vi.fn(async () => ({ token: 'tok_abc123', created: '2026-01-01T00:00:00Z', updated: '2026-01-02T00:00:00Z', remix: false, previous: { updated: '2026-01-01T00:00:00Z', by: null } })),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the Share dialog', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    const p = createProject('Fractions lab');
    p.artboards = [createArtboard({ id: 'p1', name: 'Welcome', width: 800, height: 500 })];
    p.artboards[0].children.push(createNode('button', { name: 'Go', label: 'Go', x: 10, y: 10, width: 100, height: 40 } as never));
    setCurrentStore(new EditorStore(p));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  it('opens with the question, the check line and the thing to copy, and keeps every older part under More ways', async () => {
    const { ShareModal } = await import('../src/components/ProjectModals');
    await act(async () => {
      root.render(<ShareModal onClose={() => undefined} />);
    });
    const body = document.querySelector('.share-body')!;
    expect(body.children[0].className).toContain('share-check-line');
    expect(body.children[1].querySelector('h3')!.textContent).toBe('Where will people use it?');
    expect(document.querySelector('textarea[aria-label="Embed code"]')).toBeTruthy();
    const more = document.querySelector<HTMLDetailsElement>('details.share-more')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('summary')!.textContent).toMatch(/More ways to share/);
    const inside = more.textContent ?? '';
    for (const part of ['Link for StudyDesk', 'Embed code', 'Allow remix', 'Update to the latest version', 'Revert to previous version', 'Turn off link', 'Results…']) expect(inside, part).toContain(part);
    expect(more.querySelector('input[aria-label="Link for StudyDesk"]')!.getAttribute('value') ?? (more.querySelector('input[aria-label="Link for StudyDesk"]') as HTMLInputElement).value).toMatch(/\/play\/tok_abc123$/);
  });

  it('the line at the top opens the Before you share list when something is wrong', async () => {
    const { ShareModal } = await import('../src/components/ProjectModals');
    await act(async () => {
      root.render(<ShareModal onClose={() => undefined} />);
    });
    const line = document.querySelector('.share-check-line')!;
    expect(line.textContent).toMatch(/1 thing to look at first/);
    act(() => void (line.querySelector('button') as HTMLButtonElement).click());
    expect(document.querySelector('.before-share-modal')).toBeTruthy();
    expect(document.querySelector('[data-check="dead-buttons"]')).toBeTruthy();
  });
});
