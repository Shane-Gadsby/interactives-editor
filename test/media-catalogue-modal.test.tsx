//The Media Catalogue window: opens the catalogue asking it to answer its parent, believes only that frame, puts a linked image layer on the artboard
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { MediaCatalogueModal } from '../src/components/MediaCatalogueModal';
import { assetUrls } from '../src/lib/assets';
import { catalogueUrl } from '../src/lib/media-catalogue';

vi.mock('../src/lib/assets', async (orig) => ({ ...(await orig<typeof import('../src/lib/assets')>()), imageSize: async () => ({ width: 1200, height: 800 }) }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origin = window.location.origin;
const state = encodeURIComponent(JSON.stringify({ v: 1, item: 'beach.jpg' }));
const img = (src: string) => ({ photographyGallery: true, code: `<img class="photography-catalogue-photo" src="${src}" alt="" data-media-catalogue="${state}">` });

let root: Root;
let host: HTMLElement;
let closed: number;
let store: EditorStore;

const open = () => {
  act(() => root.render(<MediaCatalogueModal onClose={() => closed++} />));
  return document.body.querySelector('iframe.catalogue-frame') as HTMLIFrameElement;
};
const say = async (frame: HTMLIFrameElement | null, data: unknown, from = origin) => {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: from, source: frame?.contentWindow ?? null }));
  });
};

beforeEach(() => {
  closed = 0;
  store = new EditorStore(createProject('Cat'));
  setCurrentStore(store);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the Media Catalogue window', () => {
  it('frames the catalogue asking it to answer its parent', () => {
    expect(open().getAttribute('src')).toBe(catalogueUrl(origin));
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Media Catalogue');
  });

  it('an insert puts a linked image layer on the artboard, keeps where it was found, and closes', async () => {
    const f = open();
    await say(f, img(`${origin}/media-catalogue/photos/Sunny%20beach.jpg`));
    const p = store.get().project;
    expect(p.assets).toHaveLength(1);
    expect(p.assets[0]).toMatchObject({ name: 'Sunny beach', mime: 'image/jpeg', src: `${origin}/media-catalogue/photos/Sunny%20beach.jpg`, catalogue: state });
    const node = p.artboards[0].children.at(-1)!;
    expect(node.type).toBe('image');
    expect(node).toMatchObject({ assetId: p.assets[0].id, width: 600, height: 400, name: 'Sunny beach' });
    expect(assetUrls.resolve(p.assets[0].id)).toBe(p.assets[0].src);
    expect(closed).toBe(1);
  });

  it('the same photo twice is one asset', async () => {
    const f = open();
    await say(f, img(`${origin}/media-catalogue/photos/a.jpg`));
    await say(f, img(`${origin}/media-catalogue/photos/a.jpg`));
    expect(store.get().project.assets).toHaveLength(1);
    expect(store.get().project.artboards[0].children.filter((n) => n.type === 'image')).toHaveLength(2);
  });

  it('code null closes without adding anything', async () => {
    await say(open(), { photographyGallery: true, code: null });
    expect(closed).toBe(1);
    expect(store.get().project.assets).toHaveLength(0);
  });

  it('ignores a message from another origin, from another window, or with an address elsewhere', async () => {
    const f = open();
    await say(f, img(`${origin}/media-catalogue/photos/a.jpg`), 'https://evil.example');
    await say(null, img(`${origin}/media-catalogue/photos/a.jpg`));
    await say(f, img('https://elsewhere.example/a.jpg'));
    await say(f, img('javascript:alert(1)'));
    expect(closed).toBe(0);
    expect(store.get().project.assets).toHaveLength(0);
  });
});
