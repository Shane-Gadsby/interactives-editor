import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const db = vi.hoisted(() => ({
  list: [
    { id: 'a', name: 'In folder', folder: 'Maths', tags: [], updated: '2026-01-01T00:00:00Z', artboards: 1 },
    { id: 'b', name: 'Loose', folder: null, tags: [], updated: '2026-01-02T00:00:00Z', artboards: 1 },
  ] as Record<string, unknown>[],
  createProjectRecord: vi.fn(async () => undefined),
  setProjectMeta: vi.fn(async (_id: string, patch: { folder?: string | null }) => ({ tags: [], folder: patch.folder ?? null })),
  importPackage: vi.fn(async () => ({ id: 'imported' })),
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => db.list,
  session: async () => ({ user: { username: 'me' } }),
  createProjectRecord: db.createProjectRecord,
  setProjectMeta: db.setProjectMeta,
  importPackage: db.importPackage,
}));
// jsdom's File has no arrayBuffer(); the page only sniffs the first bytes
vi.mock('../src/lib/insert', () => ({ pickFiles: async () => [Object.assign(new File(['{}'], 'p.ixp'), { slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) })] }));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import { Home } from '../src/Home';
import { STARTER_TOKEN_DEFS, createNode, type Project } from 'interactives-player';
import { lookDefaults } from '../src/lib/themes';
import { loadCatalog } from '../src/lib/font-catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const opened: string[] = [];
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
//New project asks how to start first: the blank choice is the one that is open, so Create project makes it
const makeBlank = async () => {
  await click(host.querySelector('.new-thumb'));
  await flush();
  await click(host.querySelector('.np-buttons .btn.primary'));
  await flush();
};
const folderButton = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.folder-item')].find((b) => b.textContent?.includes(name));

beforeEach(async () => {
  //New project reads the default font's weights from the font list, which the page has loaded long before anyone clicks
  await loadCatalog();
  db.createProjectRecord.mockClear();
  db.setProjectMeta.mockClear();
  opened.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Home open={(id) => opened.push(id)} />));
  await flush();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('new projects and imports land in the selected folder', () => {
  it('create goes into the selected folder', async () => {
    await click(folderButton('Maths'));
    await makeBlank();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    expect(db.setProjectMeta).toHaveBeenCalledWith(opened[0], { folder: 'Maths' });
  });

  it('a blank new project starts with the starter themes and palette-linked tokens, on the Light background', async () => {
    await makeBlank();
    const p = (db.createProjectRecord.mock.calls[0] as unknown as [Project])[0];
    expect(p.themes!.list.map((t) => t.name)).toEqual(['Light', 'Dark', 'High contrast']);
    expect(p.themes!.tokens.length).toBe(STARTER_TOKEN_DEFS.length);
    expect(p.themes!.tokens.every((t) => Object.keys(t.palette ?? {}).length === 3)).toBe(true);
    const bg = p.themes!.tokens.find((t) => t.name === 'color/background')!;
    expect(p.artboards[0].background).toEqual({ type: 'solid', color: `token:${bg.id}` });
    // a layer added to it follows the tokens
    const button = createNode('button', lookDefaults(p, 'button') as never);
    expect(button.fill).toEqual({ type: 'solid', color: `token:${p.themes!.tokens.find((t) => t.name === 'color/button')!.id}` });
    expect(p.fonts.length).toBe(1);
  });

  it('create with All projects or No folder selected does not set a folder', async () => {
    await makeBlank();
    //opening the project leaves the page, so the next one starts from a fresh page
    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<Home open={(id) => opened.push(id)} />));
    await flush();
    await click(folderButton('No folder'));
    await makeBlank();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(2);
    expect(db.setProjectMeta).not.toHaveBeenCalled();
  });

  it('import goes into the selected folder', async () => {
    await click(folderButton('Maths'));
    await click(host.querySelector('.new-card .link-btn.inline'));
    await flush();
    expect(db.importPackage).toHaveBeenCalled();
    expect(db.setProjectMeta).toHaveBeenCalledWith('imported', { folder: 'Maths' });
    expect(opened).toEqual(['imported']);
  });

  it('a failure to set the folder still opens the new project', async () => {
    db.setProjectMeta.mockRejectedValueOnce(new Error('nope'));
    await click(folderButton('Maths'));
    await makeBlank();
    expect(opened).toHaveLength(1);
  });
});
