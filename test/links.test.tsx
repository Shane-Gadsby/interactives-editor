import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DialogHost, dismissAllDialogs } from '../src/components/dialogs';
import { hashBytes } from '../src/lib/link-reconcile';
import * as db from '../src/lib/db';
import * as importers from '../src/lib/importers';
import { LinkChanges } from '../src/components/LinkChanges';
import { LinkManager, setLinkManager, captureDrop, handleOf, isDesignFile, loadLinkRecord, rememberHandle, sourcesFor, supportsLinking, type FileHandle } from '../src/lib/links';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  putAsset: vi.fn(async () => {}),
  deleteAsset: vi.fn(async () => {}),
  session: vi.fn(async () => ({ user: { username: 'sam', userID: 1, name: 'Sam' }, power: false })),
}));
// export.ts pulls in the built player bundle, which a test run doesn't need
vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));
const readAnimationFile = vi.fn<(f: File) => Promise<importers.AnimationImport>>();

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};

// ---------------------------------------------------------------- fakes

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const png = (s: string) => new TextEncoder().encode(s);
/** What the importer would return for a file with these layers (name -> picture content). */
function imported(layers: Record<string, string>): importers.AnimationImport {
  const assets = Object.entries(layers).map(([name, content], i) => ({ id: `as_${name}_${content}_${i}_${Math.random().toString(36).slice(2, 6)}`, name: `${name}.png`, mime: 'image/png', bytes: png(content) }));
  const children = assets.map((a, i) => createNode('image', { name: a.name.replace('.png', ''), assetId: a.id, x: i * 10, width: 10, height: 10 }));
  const artboard = createArtboard({ name: 'Poster', width: 100, height: 100, children });
  return { artboard, assets, warnings: [], source: 'Photoshop' };
}
const hashesOf = (imp: importers.AnimationImport) => Object.fromEntries(imp.assets.map((a) => [a.id, hashBytes(a.bytes)]));

function fileHandle(initial: { modified: number; content?: string }, perm: PermissionState = 'granted') {
  const state = { modified: initial.modified, content: initial.content ?? 'x', perm, gone: false };
  const handle: FileHandle = {
    kind: 'file',
    name: 'Poster.psd',
    getFile: async () => {
      if (state.gone) throw new DOMException('gone', 'NotFoundError');
      return new File([state.content], 'Poster.psd', { lastModified: state.modified });
    },
    queryPermission: async () => state.perm,
    requestPermission: async () => ((state.perm = 'granted'), 'granted' as const),
  };
  return { handle, state };
}

/** A store with one linked artboard, as if it had been imported with the link. */
async function linkedStore(layers: Record<string, string>, modified = 100) {
  const imp = imported(layers);
  const p: Project = createProject('T');
  const ab: Artboard = { ...imp.artboard, source: sourcesFor([imp.artboard], hashesOf(imp), { fileName: 'Poster.psd', linkId: 'lk1', lastModified: modified, by: 'sam' })[0] };
  p.artboards = [ab];
  p.assets = imp.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength }));
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, imp };
}

// IndexedDB clones what it stores; the fake handles hold functions, which a structured clone can't copy, so they go by reference
const cloneKeepingHandles = (v: unknown): unknown => {
  if (v && typeof v === 'object' && (v as { kind?: string }).kind === 'file') return v;
  if (Array.isArray(v)) return v.map(cloneKeepingHandles);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneKeepingHandles(x)]));
  return v;
};

beforeEach(() => {
  vi.stubGlobal('structuredClone', cloneKeepingHandles);
  readAnimationFile.mockReset();
  vi.mocked(db.putAsset).mockClear();
  vi.mocked(db.deleteAsset).mockClear();
});

// ---------------------------------------------------------------- the document side

describe('re-importing a linked file', () => {
  it('merges the changes in one undo step, uploads new pictures, keeps the old ones for undo, and says what happened', async () => {
    const { s } = await linkedStore({ Bg: 'bg', Hero: 'hero v1' });
    const before = s.get().project;
    const heroOld = (before.artboards[0].children.find((c) => c.name === 'Hero') as Extract<SceneNode, { type: 'image' }>).assetId!;
    // the file now has a new hero picture and a new layer
    const next = imported({ Bg: 'bg', Hero: 'hero v2', Badge: 'badge' });
    readAnimationFile.mockResolvedValue(next);
    const { reimportLink } = await import('../src/lib/links');
    const r = await reimportLink(s, 'lk1', new File(['x'], 'Poster.psd', { lastModified: 200 }), readAnimationFile);
    const ab = s.get().project.artboards[0];
    expect(ab.children.map((c) => c.name)).toEqual(['Bg', 'Hero', 'Badge']);
    expect(ab.children[1].id).toBe(before.artboards[0].children[1].id);
    expect(ab.source!.lastModified).toBe(200);
    expect(r.message).toBe('Poster.psd updated: 1 layer changed, 1 added');
    // pictures: two uploads (the hero's new picture and the badge). The old hero is no longer used but is neither deleted
    // on the server nor dropped from the project, so undoing the re-import doesn't leave layers pointing at a missing file
    expect(db.putAsset).toHaveBeenCalledTimes(2);
    expect(db.deleteAsset).not.toHaveBeenCalled();
    const ids = s.get().project.assets.map((a) => a.id);
    expect(ids).toContain(heroOld);
    expect(ids).toHaveLength(4);
    // one undo step takes it all back
    s.undo();
    const heroLayer = s.get().project.artboards[0].children.find((c) => c.name === 'Hero') as Extract<SceneNode, { type: 'image' }>;
    expect(heroLayer.assetId).toBe(heroOld);
    expect(s.get().project.assets.some((a) => a.id === heroOld)).toBe(true);
    expect(s.get().project.artboards[0].children.map((c) => c.name)).toEqual(['Bg', 'Hero']);
    expect(s.get().project.artboards[0].source!.lastModified).toBe(100);
    expect(s.canUndo()).toBe(false);
  });

  it('an unchanged file makes no undo step and uploads nothing, but moves the file time on', async () => {
    const { s } = await linkedStore({ Bg: 'bg' });
    readAnimationFile.mockResolvedValue(imported({ Bg: 'bg' }));
    const { reimportLink } = await import('../src/lib/links');
    const r = await reimportLink(s, 'lk1', new File(['x'], 'Poster.psd', { lastModified: 300 }), readAnimationFile);
    expect(r.changed).toBe(false);
    expect(s.canUndo()).toBe(false);
    expect(s.get().project.artboards[0].source!.lastModified).toBe(300);
    expect(db.putAsset).not.toHaveBeenCalled();
    expect(db.deleteAsset).not.toHaveBeenCalled();
  });

  it('keeps the old picture while another layer still uses it', async () => {
    const { s } = await linkedStore({ Hero: 'hero v1' });
    const old = (s.get().project.artboards[0].children[0] as Extract<SceneNode, { type: 'image' }>).assetId!;
    s.update((d) => {
      d.artboards[0].children.push(createNode('image', { name: 'Mine', assetId: old }));
    });
    readAnimationFile.mockResolvedValue(imported({ Hero: 'hero v2' }));
    const { reimportLink } = await import('../src/lib/links');
    await reimportLink(s, 'lk1', new File(['x'], 'Poster.psd', { lastModified: 200 }), readAnimationFile);
    expect(db.deleteAsset).not.toHaveBeenCalled();
    expect(s.get().project.assets.some((a) => a.id === old)).toBe(true);
  });
});

describe('linkable files', () => {
  it('knows design files by extension', () => {
    expect(isDesignFile({ name: 'a.PSD' })).toBe(true);
    expect(isDesignFile({ name: 'a.png' })).toBe(false);
  });

  it('captureDrop asks for the handles synchronously', async () => {
    const f = new File(['x'], 'a.psd');
    const { handle } = fileHandle({ modified: 1 });
    const item = { kind: 'file', getAsFile: () => f, getAsFileSystemHandle: vi.fn(async () => ({ ...handle })) };
    const files = captureDrop({ items: [item, { kind: 'string' }], files: [] } as unknown as DataTransfer);
    expect(files).toEqual([f]);
    expect(item.getAsFileSystemHandle).toHaveBeenCalledTimes(1); // before any await
    expect((await handleOf(f))?.name).toBe('Poster.psd');
  });

  it('captureDrop copes with a browser without handles', async () => {
    const f = new File(['x'], 'a.psd');
    const files = captureDrop({ items: [{ kind: 'file', getAsFile: () => f }], files: [f] } as unknown as DataTransfer);
    expect(files).toEqual([f]);
    expect(await handleOf(f)).toBeNull();
  });

  it('linking needs showOpenFilePicker', () => {
    expect(supportsLinking()).toBe(false);
    (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = () => {};
    expect(supportsLinking()).toBe(true);
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
});

// ---------------------------------------------------------------- watching

describe('LinkManager', () => {
  let m: LinkManager | null = null;
  afterEach(() => {
    m?.stop();
    m = null;
  });

  it('finds the saved handle, flags the file once it has settled, imports when asked, and does not repeat itself', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const { handle, state } = fileHandle({ modified: 100 });
    await rememberHandle(s.get().project.id, 'lk1', handle, 'psd');
    readAnimationFile.mockResolvedValue(imported({ Bg: 'bg', New: 'new' }));
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('connected'));
    await m.tick();
    expect(m.getSnapshot()[0].changed).toBeUndefined(); // same time as the document
    state.modified = 500;
    await m.tick(); // first look: wait for the save to finish
    expect(m.getSnapshot()[0].changed).toBeUndefined();
    await m.tick();
    expect(m.getSnapshot()[0].changed).toMatchObject({ lastModified: 500, dismissed: false });
    expect(readAnimationFile).not.toHaveBeenCalled(); // nothing is brought in until someone says so
    await m.applyChanges(['lk1']);
    expect(readAnimationFile).toHaveBeenCalledTimes(1);
    expect(s.get().project.artboards[0].children.map((c) => c.name)).toEqual(['Bg', 'New']);
    expect(s.get().toast?.text).toContain('Poster.psd updated');
    expect(m.getSnapshot()[0].changed).toBeUndefined();
    await m.tick();
    await m.tick();
    expect(readAnimationFile).toHaveBeenCalledTimes(1);
    expect(m.getSnapshot()[0].changed).toBeUndefined();
  });

  it('Not now leaves a change alone until the file is saved again', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const { handle, state } = fileHandle({ modified: 100 });
    await rememberHandle(s.get().project.id, 'lk1', handle, 'psd');
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('connected'));
    state.modified = 500;
    await m.tick();
    await m.tick();
    m.dismissChanges(['lk1']);
    expect(m.getSnapshot()[0].changed?.dismissed).toBe(true);
    await m.tick();
    await m.tick();
    expect(m.getSnapshot()[0].changed?.dismissed).toBe(true);
    state.modified = 700;
    state.content = 'xy';
    await m.tick();
    await m.tick();
    expect(m.getSnapshot()[0].changed).toMatchObject({ lastModified: 700, dismissed: false });
    expect(readAnimationFile).not.toHaveBeenCalled();
  });

  it('does not watch when switched off, and Re-import now still works', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const { handle, state } = fileHandle({ modified: 100 });
    await rememberHandle(s.get().project.id, 'lk1', handle, 'psd');
    readAnimationFile.mockClear();
    readAnimationFile.mockResolvedValue(imported({ Bg: 'bg', New: 'new' }));
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('connected'));
    await m.setWatch('lk1', false);
    expect((await loadLinkRecord(s.get().project.id, 'lk1'))?.watch).toBe(false);
    state.modified = 900;
    await m.tick();
    await m.tick();
    expect(readAnimationFile).not.toHaveBeenCalled();
    await m.reimportNow('lk1');
    expect(readAnimationFile).toHaveBeenCalledTimes(1);
  });

  it('asks to reconnect when permission is needed, then carries on', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const { handle, state } = fileHandle({ modified: 100 }, 'prompt');
    await rememberHandle(s.get().project.id, 'lk1', handle, 'psd');
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('needs-permission'));
    await m.reconnect();
    expect(state.perm).toBe('granted');
    expect(m.getSnapshot()[0].state).toBe('connected');
  });

  it('reports a link whose handle lives in someone else\'s browser', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('no-handle'));
    expect(m.getSnapshot()[0].by).toBe('sam');
  });

  it('notices a file that was moved', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const { handle, state } = fileHandle({ modified: 100 });
    await rememberHandle(s.get().project.id, 'lk1', handle, 'psd');
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('connected'));
    state.gone = true;
    await m.tick();
    expect(m.getSnapshot()[0].state).toBe('missing');
    state.gone = false;
    await m.tick();
    expect(m.getSnapshot()[0].state).toBe('connected');
  });

  it('unlinking keeps the layers, drops the link and the handle, in one undo step', async () => {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const { handle } = fileHandle({ modified: 100 });
    await rememberHandle(s.get().project.id, 'lk1', handle, 'psd');
    m = new LinkManager(s, readAnimationFile);
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot()[0]?.state).toBe('connected'));
    await m.unlink('lk1');
    expect(s.get().project.artboards[0].source).toBeUndefined();
    expect(s.get().project.artboards[0].children).toHaveLength(1);
    expect(m.getSnapshot()).toHaveLength(0);
    expect(await loadLinkRecord(s.get().project.id, 'lk1')).toBeUndefined();
    s.undo();
    expect(s.get().project.artboards[0].source?.linkId).toBe('lk1');
  });
});

// ---------------------------------------------------------------- choosing link or embed

describe('chooseLinking', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<DialogHost />));
    (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = () => {};
  });
  afterEach(() => {
    dismissAllDialogs();
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  const btn = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label)!;
  const click = (el: Element) => act(() => (el as HTMLElement).click());
  const dropped = (name: string, withHandle = true) => {
    const f = new File(['x'], name);
    const item = { kind: 'file', getAsFile: () => f, ...(withHandle ? { getAsFileSystemHandle: async () => ({ ...fileHandle({ modified: 1 }).handle, name }) } : {}) };
    return { f, item };
  };

  it('asks nothing when no dropped file can be linked', async () => {
    const f = new File(['x'], 'a.png');
    expect((await importers.chooseLinking([f]))?.size).toBe(0);
    expect(document.querySelector('.dialog')).toBeNull();
  });

  it('lists every file with Link / Embed per row, and Import uses the row choices', async () => {
    const a = dropped('a.psd');
    const b = dropped('b.psd');
    const c = dropped('c.png');
    const files = captureDrop({ items: [a.item, b.item, c.item], files: [] } as unknown as DataTransfer);
    const p = importers.chooseLinking(files);
    await flush();
    const rows = [...document.querySelectorAll('.link-row')];
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('a.psd');
    // the picture can't be linked
    expect(rows[2].textContent).toContain('Always embedded');
    expect((rows[2].querySelector('[role=radio]') as HTMLButtonElement).disabled).toBe(true);
    // link is the default; make b embedded
    expect(rows[0].querySelector('[aria-checked=true]')!.textContent).toBe('Link');
    click(rows[1].querySelectorAll('[role=radio]')[1]);
    click(btn('Import'));
    const out = (await p)!;
    expect([...out.keys()].map((f) => f.name)).toEqual(['a.psd']);
  });

  it('Link all and Embed all answer for every row at once', async () => {
    const a = dropped('a.psd');
    const b = dropped('b.psd');
    const files = captureDrop({ items: [a.item, b.item], files: [] } as unknown as DataTransfer);
    let p = importers.chooseLinking(files);
    await flush();
    click(btn('Embed all'));
    expect((await p)!.size).toBe(0);
    p = importers.chooseLinking(files);
    await flush();
    click(btn('Link all'));
    expect((await p)!.size).toBe(2);
  });

  it('Cancel (and Escape) cancels the whole import', async () => {
    const a = dropped('a.psd');
    const files = captureDrop({ items: [a.item], files: [] } as unknown as DataTransfer);
    const p = importers.chooseLinking(files);
    await flush();
    click(btn('Cancel'));
    expect(await p).toBeNull();
  });

  it('a file without a handle can only be embedded, with the reason', async () => {
    const a = dropped('a.psd', false);
    const files = captureDrop({ items: [a.item], files: [] } as unknown as DataTransfer);
    const p = importers.chooseLinking(files);
    await flush();
    expect(document.querySelector('.link-reason')!.textContent).toContain('no access');
    expect(document.body.textContent).not.toContain('Link all');
    click(btn('Import'));
    expect((await p)!.size).toBe(0);
  });

  it('without the File System Access API it offers embed only and says why', async () => {
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    const a = dropped('a.psd');
    const files = captureDrop({ items: [a.item], files: [] } as unknown as DataTransfer);
    const p = importers.chooseLinking(files);
    await flush();
    expect(document.querySelector('.dialog-message')!.textContent).toContain('File System Access');
    expect((document.querySelector('[role=radio]') as HTMLButtonElement).disabled).toBe(true);
    click(btn('Import'));
    expect((await p)!.size).toBe(0);
  });

  it('remembers the last choice as the default next time', async () => {
    const a = dropped('a.psd');
    const files = captureDrop({ items: [a.item], files: [] } as unknown as DataTransfer);
    let p = importers.chooseLinking(files);
    await flush();
    click(btn('Embed all'));
    await p;
    p = importers.chooseLinking(files);
    await flush();
    expect(document.querySelector('.link-row [aria-checked=true]')!.textContent).toBe('Embed');
    click(btn('Cancel'));
    await p;
    localStorage.removeItem('ix-link-default');
  });
});

describe('the changes dialog', () => {
  let m: LinkManager | null = null;
  let root: Root;
  let host: HTMLElement;
  afterEach(() => {
    m?.stop();
    m = null;
    act(() => setLinkManager(null));
    act(() => root.unmount());
    host.remove();
  });
  const btn = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('.link-changes button')).find((b) => b.textContent === label);

  /** Two linked artboards (Poster.psd, Map.psd), both saved since they were imported, with the dialog mounted. */
  async function twoChanged() {
    const { s } = await linkedStore({ Bg: 'bg' }, 100);
    const imp = imported({ Sea: 'sea' });
    const map: Artboard = { ...imp.artboard, id: 'ab_map', name: 'Map', source: sourcesFor([imp.artboard], hashesOf(imp), { fileName: 'Map.psd', linkId: 'lk2', lastModified: 100, by: 'sam' })[0] };
    s.update((d) => void d.artboards.push(map as never));
    const a = fileHandle({ modified: 100 });
    const b = fileHandle({ modified: 100 });
    b.handle.name = 'Map.psd';
    await rememberHandle(s.get().project.id, 'lk1', a.handle, 'psd');
    await rememberHandle(s.get().project.id, 'lk2', b.handle, 'psd');
    readAnimationFile.mockImplementation(async () => imported({ Bg: 'bg', New: 'new' }));
    m = new LinkManager(s, readAnimationFile);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      setLinkManager(m);
      root.render(<LinkChanges />);
    });
    m.start();
    await vi.waitFor(() => expect(m!.getSnapshot().every((l) => l.state === 'connected')).toBe(true));
    a.state.modified = 500;
    b.state.modified = 600;
    await act(async () => {
      await m!.tick();
      await m!.tick();
    });
    return { s };
  }

  it('lists every changed file, all ticked, and re-imports only the ticked ones', async () => {
    await twoChanged();
    const rows = Array.from(document.querySelectorAll('.link-changes .link-row'));
    expect(rows.map((r) => r.querySelector('.link-name')?.textContent)).toEqual(['Poster.psd', 'Map.psd']);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('.link-changes input[type=checkbox]')).every((c) => c.checked)).toBe(true);
    expect(btn('Re-import all')).toBeTruthy();
    act(() => document.querySelectorAll<HTMLInputElement>('.link-changes input[type=checkbox]')[1].click());
    await act(async () => btn('Re-import')!.click());
    await vi.waitFor(() => expect(readAnimationFile).toHaveBeenCalledTimes(1));
    await flush();
    expect(m!.getSnapshot().find((l) => l.linkId === 'lk1')?.changed).toBeUndefined();
    expect(m!.getSnapshot().find((l) => l.linkId === 'lk2')?.changed?.dismissed).toBe(true);
    expect(document.querySelector('.link-changes')).toBeNull();
  });

  it('None unticks everything (nothing to re-import), All ticks them again', async () => {
    await twoChanged();
    act(() => btn('None')!.click());
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('.link-changes input[type=checkbox]')).some((c) => c.checked)).toBe(false);
    expect(Array.from(document.querySelectorAll<HTMLButtonElement>('.link-changes .primary'))[0].disabled).toBe(true);
    act(() => btn('All')!.click());
    expect(btn('Re-import all')?.disabled).toBe(false);
  });

  it('Esc is Not now for every file', async () => {
    await twoChanged();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await flush();
    expect(document.querySelector('.link-changes')).toBeNull();
    expect(m!.getSnapshot().every((l) => l.changed?.dismissed)).toBe(true);
    expect(readAnimationFile).not.toHaveBeenCalled();
  });
});
