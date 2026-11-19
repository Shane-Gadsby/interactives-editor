//An artboard you aren't working on is shown as a still. A Media Catalogue picture is linked, not stored, and has to be put
//inside that still like any other, or the artboard loses its pictures the moment you click another one
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, type Project } from 'interactives-player';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  getAsset: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
}));

import { snapshotFromDom } from '../src/lib/image-export';

const LINK = 'https://example.test/storage/dev/media-catalogue/photo-1.jpg';
let made: Blob[] = [];
const svgOf = async (url: string) => {
  expect(url).toMatch(/^blob:/);
  //(jsdom's Blob has no text(): read it the long way)
  return await new Promise<string>((done) => {
    const r = new FileReader();
    r.onload = () => done(String(r.result));
    r.readAsText(made[made.length - 1]);
  });
};

function project(id: string): Project {
  const p = createProject('T');
  p.id = id;
  p.assets.push({ id: 'linked', name: 'Campus.jpg', mime: 'image/jpeg', size: 0, src: LINK, catalogue: '{}' }, { id: 'stored', name: 'logo.png', mime: 'image/png', size: 3 });
  return p;
}
const dom = () => {
  const root = document.createElement('div');
  root.innerHTML = `<img src="${LINK}"><img src="blob:stored-1">`;
  return root;
};
const resolve = (id: string) => (id === 'linked' ? LINK : id === 'stored' ? 'blob:stored-1' : undefined);

beforeEach(() => {
  made = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    made.push(b);
    return `blob:still-${made.length}`;
  }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe('a still of an artboard with a Media Catalogue picture', () => {
  it('has the picture inside it, fetched from where it lives, beside the stored ones', async () => {
    const fetched = vi.fn(async () => new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetched);
    const p = project('p-ok');
    const svg = await svgOf(await snapshotFromDom(p, p.artboards[0], dom(), resolve));
    expect(fetched).toHaveBeenCalledWith(LINK, expect.anything());
    //no address from outside is left for the image to (not) load
    expect(svg).not.toContain(LINK);
    expect(svg).not.toContain('blob:stored-1');
    expect(svg.match(/data:image\/jpeg;base64,/g)).toHaveLength(1);
    expect(svg.match(/data:image\/png;base64,/g)).toHaveLength(1);
  });

  it('is not made at all when the picture can\'t be fetched, so the artboard stays live rather than losing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const p = project('p-down');
    await expect(snapshotFromDom(p, p.artboards[0], dom(), resolve)).rejects.toThrow(/Campus\.jpg/);
    expect(made).toHaveLength(0);
  });

  it('a picture that couldn\'t be fetched is asked for again next time, not remembered as missing', async () => {
    const p = project('p-retry');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(snapshotFromDom(p, p.artboards[0], dom(), resolve)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'image/jpeg' } })));
    const svg = await svgOf(await snapshotFromDom(p, p.artboards[0], dom(), resolve));
    expect(svg).toContain('data:image/jpeg;base64,');
  });
});
