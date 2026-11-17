//Frameling animations in the editor: knowing the file, dropping it in (a layer at its size on its first clip), refusing
//a broken one, the inspector, what counts as using the asset, and live editing carrying the layer and its settings
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNode, createProject, forgetFrameling, peekFrameling, primeFrameling, readFramelingPackage, type AnimationNode, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { diff, apply } from '../shared/ops.mjs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  putAsset: async () => undefined,
}));

import { assetKind, assetUrls } from '../src/lib/assets';
import { insertFiles } from '../src/lib/insert';
import { framelingFileName, startSize, updateAnimationFile } from '../src/lib/frameling-import';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { NodeInspector } from '../src/panels/Inspector';
import { analyzeUsage, unusedAssetIds } from '../src/lib/dependencies';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'interactives-player', 'test', 'fixtures', 'frameling');
const bytes = (name: string) => new Uint8Array(readFileSync(path.join(fixtures, `${name}.flplay`)));
const fileOf = (name: string, data: Uint8Array, type = '') => new File([data as BlobPart], name, { type });

let s: EditorStore;
let n = 0;
beforeEach(() => {
  s = new EditorStore(createProject('T'));
  setCurrentStore(s);
  //jsdom has no object URLs: hand out made-up ones
  URL.createObjectURL = vi.fn(() => `blob:t${++n}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => forgetFrameling());

describe('a Frameling file', () => {
  it('is an animation asset by its extension or its type', () => {
    expect(assetKind('', 'hero.flplay')).toBe('animation');
    expect(assetKind('application/vnd.frameling.playable+zip', 'x')).toBe('animation');
    expect(assetKind('application/zip', 'hero.zip')).toBe('other');
  });

  it('dropped on the canvas becomes a layer at the size it was drawn, playing its first clip', async () => {
    const ab = s.get().project.artboards[0];
    const added = await insertFiles([fileOf('hero-sprite.flplay', bytes('hero-sprite'))], ab.id, { x: 300, y: 200 });
    expect(added).toHaveLength(1);
    expect(added[0].mime).toBe('application/vnd.frameling.playable+zip');
    const layer = s.get().project.artboards[0].children.find((c) => c.type === 'animation') as AnimationNode;
    expect(layer).toMatchObject({ name: 'hero-sprite', assetId: added[0].id, clipName: 'idle', playing: true, width: 256, height: 256, x: 172, y: 72 });
  });

  it('that is broken is refused with a message, and nothing is uploaded', async () => {
    const toast = vi.spyOn(s, 'toast');
    const ab = s.get().project.artboards[0];
    const added = await insertFiles([fileOf('broken.flplay', new TextEncoder().encode('not a zip'))], ab.id, { x: 0, y: 0 });
    expect(added).toEqual([]);
    expect(s.get().project.assets).toEqual([]);
    expect(toast.mock.calls[0][0]).toMatch(/broken\.flplay: .*not a Frameling animation package/);
    expect(toast.mock.calls[0][1]).toBe('error');
  });

  it('starts no bigger than 600 pixels, pixel art by a whole step', () => {
    const m = readFramelingPackage(bytes('hero-sprite')).manifest;
    expect(startSize({ ...m, width: 1280, height: 720, pixelArt: false })).toEqual({ width: 600, height: 338 });
    expect(startSize({ ...m, width: 1024, height: 1024, pixelArt: true })).toEqual({ width: 512, height: 512 });
  });

  it('counts as used by the layer that plays it', () => {
    const p = createProject('U');
    p.assets.push({ id: 'pkg', name: 'hero.flplay', mime: 'application/vnd.frameling.playable+zip', size: 1 });
    p.artboards[0].children.push(createNode('animation', { assetId: 'pkg' }));
    expect(unusedAssetIds(analyzeUsage(p))).toEqual([]);
    p.artboards[0].children = [];
    expect(unusedAssetIds(analyzeUsage(p))).toEqual(['pkg']);
  });
});

describe('the inspector', () => {
  let root: Root;
  let host: HTMLElement;
  const mount = (p: Project) => {
    s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ activeArtboardId: p.artboards[0].id });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      const node = useEditor((st) => st.project.artboards[0].children[0]);
      const ab = useEditor((st) => st.project.artboards[0]);
      const project = useEditor((st) => st.project);
      return <NodeInspector nodes={[node]} ab={ab} project={project} />;
    };
    act(() => root.render(<Harness />));
  };
  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
  });

  it('lists the clips of the file, and choosing one starts it from its first frame', async () => {
    const added = await insertFiles([fileOf('hero.flplay', bytes('hero-sprite'))], null, null);
    const p = structuredClone(s.get().project) as Project;
    expect(p.assets.map((a) => a.id)).toEqual([added[0].id]);
    p.artboards[0].children.push(createNode('animation', { id: 'h', assetId: added[0].id, clipName: 'idle', frame: 2 }));
    mount(p);
    const clip = [...host.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.value === 'run'))!;
    expect([...clip.options].map((o) => o.value)).toEqual(['', 'idle', 'run', 'jump', 'hurt', 'die']);
    expect(host.textContent).toContain('23 frames at 12 a second, pixel art');
    act(() => {
      clip.value = 'run';
      clip.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().project.artboards[0].children[0]).toMatchObject({ clipName: 'run', frame: 0 });
    //run has footsteps on its frames 0 and 3
    expect(host.textContent).toContain('footstep (frame 0), footstep (frame 3)');
  });

  it('without a file, asks for one and still offers the settings', () => {
    const p = createProject('I');
    p.artboards[0].children.push(createNode('animation', { id: 'h' }));
    mount(p);
    expect(host.textContent).toContain('Choose a .flplay file');
    expect(host.textContent).toContain('Speed');
  });

  it('a file primed from the canvas is not fetched again', () => {
    const p = createProject('I');
    p.assets.push({ id: 'pkg', name: 'ball.flplay', mime: 'application/vnd.frameling.playable+zip', size: 1, src: 'blob:ball' });
    p.artboards[0].children.push(createNode('animation', { id: 'h', assetId: 'pkg' }));
    primeFrameling('blob:ball', readFramelingPackage(bytes('bouncing-ball')));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    mount(p);
    vi.unstubAllGlobals();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

//The hero package as Frameling writes it with its drawing inside
const withSource = () => {
  const files = unzipSync(bytes('hero-sprite'));
  const manifest = { ...JSON.parse(strFromU8(files['manifest.json'])), source: 'source.frameling' };
  return zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify(manifest)), 'source.frameling': strToU8('{"drawing":true}') });
};

describe('Edit in Frameling', () => {
  let root: Root | null = null;
  let host: HTMLElement;
  const mount = () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      const node = useEditor((st) => st.project.artboards[0].children[0]);
      const ab = useEditor((st) => st.project.artboards[0]);
      const project = useEditor((st) => st.project);
      return <NodeInspector nodes={[node]} ab={ab} project={project} />;
    };
    act(() => root!.render(<Harness />));
  };
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    host?.remove();
    vi.unstubAllGlobals();
  });
  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  it('is offered only for a file with its drawing inside', async () => {
    const [plain] = await insertFiles([fileOf('hero.flplay', bytes('hero-sprite'))], null, null);
    const [editable] = await insertFiles([fileOf('hero-src.flplay', withSource())], null, null);
    s.update((d) => void d.artboards[0].children.push(createNode('animation', { id: 'h', assetId: plain.id })));
    mount();
    expect(button('Edit in Frameling')).toBeUndefined();
    expect(button('Replace file…')).toBeTruthy();
    expect(host.textContent).toContain('without its drawing');
    act(() => s.setProps(['h'], { assetId: editable.id }));
    expect(button('Edit in Frameling')).toBeTruthy();
    expect(host.textContent).not.toContain('without its drawing');
  });

  it('downloads the .flplay as it was imported, drawing and all, and says how to bring it back', async () => {
    const data = withSource();
    const [asset] = await insertFiles([fileOf('Hero walk.flplay', data)], null, null);
    s.update((d) => void d.artboards[0].children.push(createNode('animation', { id: 'h', assetId: asset.id })));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => data.slice().buffer })));
    const saved: { name: string; blob: Blob }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: null as unknown as Blob });
    });
    const made = vi.mocked(URL.createObjectURL);
    mount();
    await act(async () => button('Edit in Frameling')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('Hero walk.flplay is in your downloads'));
    expect(saved.map((x) => x.name)).toEqual(['Hero walk.flplay']);
    const blob = made.mock.calls.at(-1)![0] as Blob;
    const buf = await new Promise<ArrayBuffer>((done) => {
      const r = new FileReader();
      r.onload = () => done(r.result as ArrayBuffer);
      r.readAsArrayBuffer(blob);
    });
    const back = unzipSync(new Uint8Array(buf));
    expect(strFromU8(back['source.frameling'])).toBe('{"drawing":true}');
    expect(host.textContent).toContain('Drag the saved file onto this layer');
    click.mockRestore();
  });

  it('names the download so Frameling knows it', () => {
    expect(framelingFileName({ name: 'hero.flplay' })).toBe('hero.flplay');
    expect(framelingFileName({ name: 'hero.zip' })).toBe('hero.flplay');
    expect(framelingFileName({ name: 'hero' })).toBe('hero.flplay');
  });

  it('a saved file brought back replaces the old one everywhere, keeping every layer\'s settings, in one undo', async () => {
    const [asset] = await insertFiles([fileOf('hero.flplay', bytes('hero-sprite'))], null, null);
    s.update((d) => {
      d.artboards[0].children.push(createNode('animation', { id: 'h', assetId: asset.id, clipName: 'run', speed: 2, width: 90 }));
      d.artboards[0].children.push(createNode('animation', { id: 'h2', assetId: asset.id, clipName: 'idle' }));
    });
    s.commit();
    expect(await updateAnimationFile({ id: 'h', assetId: asset.id }, fileOf('hero.flplay', withSource()))).toBe(true);
    const [a, b] = s.get().project.artboards[0].children as AnimationNode[];
    expect(a.assetId).not.toBe(asset.id);
    expect(b.assetId).toBe(a.assetId);
    expect(a).toMatchObject({ clipName: 'run', speed: 2, width: 90 });
    //primed, so the canvas has the new one without fetching it
    expect(peekFrameling(assetUrls.resolve(a.assetId!)!)?.manifest.source).toBe('source.frameling');
    s.undo();
    expect((s.get().project.artboards[0].children[0] as AnimationNode).assetId).toBe(asset.id);
  });

  it('a broken file brought back is refused and the old one stays', async () => {
    const [asset] = await insertFiles([fileOf('hero.flplay', bytes('hero-sprite'))], null, null);
    s.update((d) => void d.artboards[0].children.push(createNode('animation', { id: 'h', assetId: asset.id })));
    const toast = vi.spyOn(s, 'toast');
    expect(await updateAnimationFile({ id: 'h', assetId: asset.id }, fileOf('hero.flplay', new TextEncoder().encode('nope')))).toBe(false);
    expect((s.get().project.artboards[0].children[0] as AnimationNode).assetId).toBe(asset.id);
    expect(s.get().project.assets).toHaveLength(1);
    expect(toast.mock.calls.at(-1)![1]).toBe('error');
  });

  it('a layer with no file yet takes the one dropped on it', async () => {
    s.update((d) => void d.artboards[0].children.push(createNode('animation', { id: 'h', clipName: 'run' })));
    expect(await updateAnimationFile({ id: 'h', assetId: null }, fileOf('hero.flplay', bytes('hero-sprite')))).toBe(true);
    const n = s.get().project.artboards[0].children[0] as AnimationNode;
    expect(n.assetId).toBe(s.get().project.assets[0].id);
    expect(n.clipName).toBe('run');
  });
});

describe('less motion and repeaters in the inspector', () => {
  let root: Root | null = null;
  let host: HTMLElement;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    host?.remove();
  });
  const mount = (p: Project) => {
    s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ activeArtboardId: p.artboards[0].id });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      const project = useEditor((st) => st.project);
      const ab = project.artboards[0];
      const node = (ab.children[0].type === 'frame' ? ab.children[0].children[0] : ab.children[0]) as AnimationNode;
      return <NodeInspector nodes={[node]} ab={ab} project={project} />;
    };
    act(() => root!.render(<Harness />));
  };

  it('offers Essential motion and a Still frame, which goes once it is essential', () => {
    const p = createProject('M');
    p.artboards[0].children.push(createNode('animation', { id: 'h' }));
    mount(p);
    expect(host.textContent).toContain('Still frame');
    expect(host.textContent).not.toContain('Copy offset');
    const box = [...host.querySelectorAll('label')].find((l) => l.textContent?.includes('Essential motion'))!.querySelector('input')!;
    act(() => box.click());
    expect((s.get().project.artboards[0].children[0] as AnimationNode).essential).toBe(true);
    expect(host.textContent).not.toContain('Still frame');
  });

  it('offers Copy offset in a repeater', () => {
    const p = createProject('R');
    p.artboards[0].children.push(createNode('frame', { id: 'list', repeat: { items: '[1,2,3]' }, children: [createNode('animation', { id: 'h' })] } as never));
    mount(p);
    expect(host.textContent).toContain('Copy offset');
  });
});

describe('live editing', () => {
  it('carries a new animation layer and its playback settings to the others in the room', () => {
    const a = createProject('L');
    const b = structuredClone(a);
    b.artboards[0].children.push(createNode('animation', { id: 'h', assetId: 'pkg', clipName: 'run' }));
    //what another person's tab holds, brought up to date by the ops alone
    const there = structuredClone(a);
    apply(there, diff(a, b));
    expect(there.artboards[0].children[0]).toEqual(b.artboards[0].children[0]);
    const c = structuredClone(b);
    Object.assign(c.artboards[0].children[0], { clipName: 'jump', playing: false, speed: 2, frame: 1 });
    apply(there, diff(b, c));
    expect(there.artboards[0].children[0]).toMatchObject({ clipName: 'jump', playing: false, speed: 2, frame: 1 });
  });
});
