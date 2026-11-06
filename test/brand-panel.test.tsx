import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

const kit = vi.hoisted(() => ({
  info: {
    id: 'prbrand02',
    name: 'UniSQ brand',
    owner: { username: 'ann', name: 'Ann' },
    version: 1,
    updated: '2026-01-01T00:00:00Z',
    note: '',
    mine: false,
    brand: true,
    components: [{ id: 'hdr', name: 'Header', width: 400, height: 60, hash: 'h', uses: [] }],
    internals: [],
    styles: { colors: [{ id: 'c1', name: 'Navy', color: '#112233' }], texts: [] },
    history: [],
  },
  own: null as null | Record<string, unknown>,
  who: { user: null, power: false, brand: false } as { user: null; power: boolean; brand: boolean },
  marked: [] as boolean[],
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listLibraries: async () => [kit.info],
  getOwnLibrary: async () => kit.own,
  session: async () => kit.who,
  markBrandKit: async (_id: string, brand: boolean) => (kit.marked.push(brand), { brand }),
}));

import { LibrariesPanel } from '../src/panels/LibrariesPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

async function mount(p: Project) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<LibrariesPanel />));
  await flush();
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
beforeEach(() => {
  kit.own = null;
  kit.who = { user: null, power: false, brand: false };
  kit.marked = [];
});

/** A project that uses the kit: its Header copy (locked), and a red rectangle of its own. */
function using(): Project {
  const p = createProject('Course');
  p.libraries = [{ id: kit.info.id, name: 'UniSQ brand', version: 1, brand: { colors: ['#112233'], fonts: ['inter'] } }];
  p.artboards.push({
    ...createProject('x').artboards[0],
    id: 'abh',
    name: 'Header',
    width: 400,
    height: 60,
    library: { libraryId: kit.info.id, componentId: 'hdr', version: 1, hash: 'h', brand: true },
  });
  p.artboards[0].children.push(createNode('rect', { name: 'Red', fill: { type: 'solid', color: '#ff0000' } }));
  return p;
}

describe('Libraries panel and brand kits', () => {
  it('marks a kit in the list and offers to add it with its starter items', async () => {
    await mount(createProject('New'));
    expect(host.textContent).toContain('Brand kit');
    expect(button('Add with starter items')).toBeTruthy();
    expect(button('Add')).toBeTruthy();
  });

  it('keeps Detach and Stop using disabled for a kit, until the override is on', async () => {
    await mount(using());
    expect(button('Detach')!.disabled).toBe(true);
    expect(button('Stop using this library')!.disabled).toBe(true);
    await act(async () => s.set({ brandOverride: true }));
    expect(button('Detach')!.disabled).toBe(false);
    expect(button('Stop using this library')!.disabled).toBe(false);
  });

  it('lists the colours and fonts the kit does not have, and says it blocks nothing', async () => {
    await mount(using());
    expect(host.textContent).toContain('nothing is blocked');
    await act(async () => button('Check against the brand kit')!.click());
    expect(host.textContent).toContain('Colours not in the kit');
    expect(host.textContent).toContain('#ff0000');
  });

  it('has no brand check in a project without a kit', async () => {
    const p = createProject('Plain');
    p.libraries = [{ id: kit.info.id, name: 'UniSQ brand', version: 1 }];
    await mount(p);
    expect(host.textContent).not.toContain('Brand check');
  });

  it('lets someone who looks after kits mark their published library as one, and nobody else', async () => {
    const own = createProject('My kit');
    own.settings.library = true;
    kit.own = { ...kit.info, mine: true, brand: false, shared: { everyone: false, users: [] } };
    await mount(own);
    expect(host.textContent).not.toContain('This is a brand kit');
    act(() => root.unmount());
    host.remove();

    kit.who = { user: null, power: true, brand: true };
    await mount(own);
    const box = Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.includes('This is a brand kit'))!.querySelector('input')!;
    await act(async () => box.click());
    await flush();
    expect(kit.marked).toEqual([true]);
  });
});
