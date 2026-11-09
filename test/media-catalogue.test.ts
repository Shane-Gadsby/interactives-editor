import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, readPackage, type Asset, type Project } from 'interactives-player';
import { catalogueUrl, embedLinkedAssets, failureMessage, fetchLinkedBytes, imgAttributes, isLinkedAsset, parseCatalogueMessage, sisterOrigin, withFetched } from '../src/lib/media-catalogue';
import { downloadPackage, standaloneHtml } from '../src/lib/export';
import { exportPackage } from '../src/lib/db';

const readBlob = (b: Blob) =>
  new Promise<Uint8Array>((res) => {
    const r = new FileReader();
    r.onload = () => res(new Uint8Array(r.result as ArrayBuffer));
    r.readAsArrayBuffer(b);
  });
const ORIGIN = 'https://lti.example.edu';
const state = encodeURIComponent(JSON.stringify({ v: 1, item: 'beach.jpg', seed: 3, found: null }));
const code = (src: string, extra = '') => `<img class="photography-catalogue-photo atto_image_button_text-bottom" src="${src}" alt="" role="presentation" data-cdt-id="abc" data-media-catalogue="${state}"${extra}>`;
const insert = (c: unknown) => ({ photographyGallery: true, code: c });

describe('the catalogue address', () => {
  it('opens the catalogue answering the frame that opened it', () => {
    expect(catalogueUrl(ORIGIN)).toBe('https://lti.example.edu/media-catalogue?editor=interactives&mode=catalogue&target=parent');
  });
});

describe('reading the catalogue message', () => {
  it('turns an insert into the photo: address, name, type and where it was found', () => {
    const m = parseCatalogueMessage(insert(code(`${ORIGIN}/media-catalogue/photos/Sunny%20beach.JPG`)), ORIGIN, ORIGIN);
    expect(m).toEqual({ kind: 'insert', pick: { src: `${ORIGIN}/media-catalogue/photos/Sunny%20beach.JPG`, name: 'Sunny beach', mime: 'image/jpeg', alt: '', catalogue: state } });
  });
  it('knows the picture types by extension and falls back to jpeg', () => {
    const mime = (f: string) => (parseCatalogueMessage(insert(code(`${ORIGIN}/media-catalogue/photos/${f}`)), ORIGIN, ORIGIN) as { pick: { mime: string } }).pick.mime;
    expect(mime('a.png')).toBe('image/png');
    expect(mime('a.webp')).toBe('image/webp');
    expect(mime('a.svg')).toBe('image/svg+xml');
    expect(mime('a')).toBe('image/jpeg');
  });
  it('code null closes it', () => {
    expect(parseCatalogueMessage({ photographyGallery: true, code: null }, ORIGIN, ORIGIN)).toEqual({ kind: 'close' });
  });
  it('believes only the catalogue origin', () => {
    expect(parseCatalogueMessage(insert(code(`${ORIGIN}/media-catalogue/photos/a.jpg`)), 'https://evil.example', ORIGIN)).toBeNull();
    expect(parseCatalogueMessage({ photographyGallery: true, code: null }, 'https://evil.example', ORIGIN)).toBeNull();
  });
  it('ignores other messages and odd shapes', () => {
    for (const d of [null, 'x', 5, {}, { photographyGallery: false, code: null }, { code: null }, { photographyGallery: true }, insert(7), insert('<p>no picture</p>'), insert('<img alt="x">')]) {
      expect(parseCatalogueMessage(d, ORIGIN, ORIGIN), JSON.stringify(d)).toBeNull();
    }
    expect(parseCatalogueMessage(insert('<img src="' + ORIGIN + '/x.jpg">' + 'x'.repeat(20000)), ORIGIN, ORIGIN)).toBeNull();
  });
  it('refuses an address that is not http(s) on the catalogue origin', () => {
    for (const src of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://elsewhere.example/a.jpg', `http://lti.example.edu/a.jpg`, '//elsewhere.example/a.jpg', 'blob:https://lti.example.edu/1']) {
      expect(parseCatalogueMessage(insert(code(src)), ORIGIN, ORIGIN), src).toBeNull();
    }
  });
  it('takes the legacy gallery photo from the other university host, at the catalogue address', () => {
    const legacy = `<img class="photography-catalogue-photo atto_image_button_text-bottom" src="https://lti.unisq.edu.au/photography-gallery/photos/19533MEC2901_1220_AS_002.jpg" role="presentation" data-cdt-id="x" loading="lazy" decoding="async">`;
    const m = parseCatalogueMessage(insert(legacy), 'https://lti.usq.edu.au', 'https://lti.usq.edu.au');
    expect(m).toEqual({ kind: 'insert', pick: { src: 'https://lti.usq.edu.au/photography-gallery/photos/19533MEC2901_1220_AS_002.jpg', name: '19533MEC2901_1220_AS_002', mime: 'image/jpeg', alt: '', catalogue: undefined } });
    const back = parseCatalogueMessage(insert(code('https://lti.test.usq.edu.au/media-catalogue/photos/a.jpg')), 'https://lti.test.unisq.edu.au', 'https://lti.test.unisq.edu.au') as { pick: { src: string } };
    expect(back.pick.src).toBe('https://lti.test.unisq.edu.au/media-catalogue/photos/a.jpg');
    // only the matching sister: another usq host, http, or a lookalike is still refused
    for (const src of ['https://www.unisq.edu.au/a.jpg', 'http://lti.unisq.edu.au/a.jpg', 'https://lti.unisq.edu.au.evil.example/a.jpg', 'https://lti.unisq.edu.evil/a.jpg']) {
      expect(parseCatalogueMessage(insert(code(src)), 'https://lti.usq.edu.au', 'https://lti.usq.edu.au'), src).toBeNull();
    }
  });
  it('knows the sister host only for usq and unisq', () => {
    expect(sisterOrigin('https://lti.usq.edu.au')).toBe('https://lti.unisq.edu.au');
    expect(sisterOrigin('https://lti.test.unisq.edu.au')).toBe('https://lti.test.usq.edu.au');
    expect(sisterOrigin('http://127.0.0.1')).toBeNull();
    expect(sisterOrigin('https://usq.example.com')).toBeNull();
  });
  it('takes a path on the same origin and makes it whole', () => {
    const m = parseCatalogueMessage(insert(code('/media-catalogue/photos/a.jpg')), ORIGIN, ORIGIN) as { pick: { src: string } };
    expect(m.pick.src).toBe(`${ORIGIN}/media-catalogue/photos/a.jpg`);
  });
  it('reads attributes without building any markup: script, handlers and entities are only text', () => {
    const a = imgAttributes(`<img src="a.jpg" onerror="alert(1)" alt='say &quot;hi&quot; &amp; bye' data-x=y><script>boom()</script>`)!;
    expect(a.src).toBe('a.jpg');
    expect(a.alt).toBe('say "hi" & bye');
    expect(a['data-x']).toBe('y');
    expect(a.onerror).toBe('alert(1)');
    expect(imgAttributes('<IMG SRC="b.jpg">')?.src).toBe('b.jpg');
    expect(imgAttributes('nothing here')).toBeNull();
  });
  it('keeps the found-at text only when the catalogue could read it back', () => {
    const pick = (attr: string) => (parseCatalogueMessage(insert(`<img src="${ORIGIN}/media-catalogue/photos/a.jpg" data-media-catalogue="${attr}">`), ORIGIN, ORIGIN) as { pick: { catalogue?: string } }).pick.catalogue;
    expect(pick(state)).toBe(state);
    expect(pick('%7B%22item%22%3A%22a.jpg%22%7D')).toBe('%7B%22item%22%3A%22a.jpg%22%7D');
    expect(pick('not json')).toBeUndefined();
    expect(pick('%7B%22nothing%22%3A1%7D')).toBeUndefined();
    expect(pick('x'.repeat(9000))).toBeUndefined();
  });
});

const linked = (id: string, name = `${id}.jpg`): Asset => ({ id, name, mime: 'image/jpeg', size: 0, src: `${ORIGIN}/media-catalogue/photos/${name}`, catalogue: state });
const ok = (bytes: number[], type = 'image/jpeg') => ({ ok: true, status: 200, headers: new Headers({ 'content-type': type }), arrayBuffer: async () => new Uint8Array(bytes).buffer }) as unknown as Response;

function projectWith(...assets: Asset[]): Project {
  const p = createProject('Cat' + Math.random());
  p.assets = assets;
  p.artboards[0] = createArtboard({ name: 'A', width: 300, height: 200, children: assets.map((a) => createNode('image', { assetId: a.id, width: 100, height: 80 })) });
  return p;
}

describe('fetching linked pictures for an export', () => {
  it('knows a linked asset from one with its own file', () => {
    expect(isLinkedAsset(linked('a'))).toBe(true);
    expect(isLinkedAsset({ src: 'data:image/png;base64,AA==' })).toBe(false);
    expect(isLinkedAsset({})).toBe(false);
  });

  it('fetches the bytes and the type', async () => {
    const f = vi.fn(async () => ok([1, 2, 3], 'image/png; charset=binary'));
    const r = await fetchLinkedBytes(linked('a'), f as never);
    expect([...r.bytes]).toEqual([1, 2, 3]);
    expect(r.mime).toBe('image/png');
  });

  it.each([
    ['an error answer', async () => ({ ok: false, status: 404, headers: new Headers() }) as unknown as Response, /answered 404/],
    ['something that is not a picture', async () => ok([1], 'text/html'), /not a picture/],
    ['an empty answer', async () => ok([]), /sent nothing/],
    ['no network', async () => Promise.reject(new TypeError('Failed to fetch')), /couldn't be reached \(Failed to fetch\)/],
  ])('says why when it gets %s', async (_n, f, why) => {
    await expect(fetchLinkedBytes(linked('a'), f as never)).rejects.toThrow(why);
  });

  it('collects the pictures it got, drops the ones it did not, and asks each address once', async () => {
    const a = linked('a', 'one.jpg');
    const b = linked('b', 'two.jpg');
    const dup = { ...linked('c', 'one.jpg') };
    const own: Asset = { id: 'o', name: 'own.png', mime: 'image/png', size: 5 };
    const f = vi.fn(async (url: string) => (url.endsWith('two.jpg') ? ({ ok: false, status: 500, headers: new Headers() } as unknown as Response) : ok([9, 9])));
    const r = await embedLinkedAssets(projectWith(a, b, dup, own), f as never);
    expect(f).toHaveBeenCalledTimes(2);
    expect([...r.bytes.keys()].sort()).toEqual(['a', 'c']);
    expect(r.failed.map((x) => [x.asset.id, x.reason])).toEqual([['b', 'the catalogue answered 500']]);
    expect(r.project.assets.map((x) => x.id)).toEqual(['a', 'c', 'o']);
  });

  it('leaves a project with no linked pictures alone', async () => {
    const p = projectWith({ id: 'o', name: 'own.png', mime: 'image/png', size: 5 });
    const f = vi.fn();
    const r = await embedLinkedAssets(p, f as never);
    expect(r.project).toBe(p);
    expect(f).not.toHaveBeenCalled();
  });

  it('words the failure for the person', () => {
    const m = failureMessage([{ asset: linked('a', 'beach.jpg'), reason: 'the catalogue answered 404' }], 'page');
    expect(m.title).toBe("A Media Catalogue picture couldn't be added");
    expect(m.message).toContain('beach.jpg: the catalogue answered 404');
    expect(failureMessage([{ asset: linked('a'), reason: 'x' }, { asset: linked('b'), reason: 'y' }], 'package').title).toBe("2 Media Catalogue pictures couldn't be added");
  });

  it('withFetched prefers what was fetched, then the usual source', async () => {
    const f = withFetched(new Map([['a', new Uint8Array([1])]]), async () => new Uint8Array([2]));
    expect([...(await f({ id: 'a' } as Asset))!]).toEqual([1]);
    expect([...(await f({ id: 'z' } as Asset))!]).toEqual([2]);
  });
});

describe('what the exports carry', () => {
  const a = linked('a', 'beach.jpg');

  it('a normal page (preview, share, embed) keeps the link and fetches nothing', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const html = await standaloneHtml(projectWith(a));
    expect(f).not.toHaveBeenCalled();
    expect(html).toContain(`${ORIGIN}/media-catalogue/photos/beach.jpg`);
    vi.unstubAllGlobals();
  });

  it('a single-file page embeds the picture as data and carries neither the address nor where it was found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([104, 105])));
    const failed = vi.fn();
    const html = await standaloneHtml(projectWith(a), { embedLinked: true, onLinkedFailed: failed });
    expect(failed).not.toHaveBeenCalled();
    expect(html).toContain('data:image/jpeg;base64,aGk=');
    expect(html).not.toContain('/media-catalogue/photos/beach.jpg');
    expect(html).not.toContain(state);
    vi.unstubAllGlobals();
  });

  it('a single-file page says so when the fetch fails, and ships no link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, headers: new Headers() }) as unknown as Response));
    const failed = vi.fn();
    const html = await standaloneHtml(projectWith(a), { embedLinked: true, onLinkedFailed: failed });
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0][0][0].reason).toBe('the catalogue answered 502');
    expect(html).not.toContain('/media-catalogue/photos/beach.jpg');
    vi.unstubAllGlobals();
  });

  it('a package holds the fetched bytes under assets/, keeping where it was found', async () => {
    const p = projectWith(a);
    const e = await embedLinkedAssets(p, (async () => ok([7, 7, 7])) as never);
    const blob = await exportPackage(e.project, e.bytes);
    const out = readPackage(await readBlob(blob));
    const got = out.assets.get('a')!;
    expect([...got.bytes]).toEqual([7, 7, 7]);
    expect(got.asset.src).toMatch(/^assets\//);
    expect(got.asset.catalogue).toBe(state);
  });

  it('downloadPackage is the same path end to end (it fetches, warns on failure, still builds)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, headers: new Headers() }) as unknown as Response));
    const made: Blob[] = [];
    const url = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (made.push(b as Blob), 'blob:x'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await downloadPackage(projectWith(a));
    click.mockRestore();
    expect(made).toHaveLength(1);
    const out = readPackage(await readBlob(made[0]));
    expect(out.project.assets).toEqual([]);
    url.mockRestore();
    vi.unstubAllGlobals();
  });
});
