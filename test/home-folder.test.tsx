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
import { loadCatalog } from '../src/lib/font-catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const opened: string[] = [];
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click());
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
    await click(host.querySelector('.new-thumb'));
    await flush();
    expect(db.createProjectRecord).toHaveBeenCalledTimes(1);
    expect(db.setProjectMeta).toHaveBeenCalledWith(opened[0], { folder: 'Maths' });
  });

  it('create with All projects or No folder selected does not set a folder', async () => {
    await click(host.querySelector('.new-thumb'));
    await flush();
    await click(folderButton('No folder'));
    await click(host.querySelector('.new-thumb'));
    await flush();
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
    await click(host.querySelector('.new-thumb'));
    await flush();
    expect(opened).toHaveLength(1);
  });
});
