//Swap picture: an image layer's right-click menu asks where the new picture comes from, and the layer keeps everything else
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNode, createProject, type ImageNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  putAsset: async () => undefined,
}));
const picked: File[] = [];
vi.mock('../src/lib/insert', async (orig) => ({
  ...(await orig<typeof import('../src/lib/insert')>()),
  pickFiles: async () => picked.splice(0),
}));

import { ImageSwapHost, SWAP_CHOICES, setLayerPicture, swapPicture, swapToCataloguePhoto } from '../src/components/ImageSwap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let s: EditorStore;
const layer = () => s.get().project.artboards[0].children[0] as ImageNode;
beforeEach(() => {
  document.body.innerHTML = '';
  const p = createProject('T');
  p.assets.push({ id: 'a1', name: 'cat.png', mime: 'image/png', size: 10 }, { id: 'a2', name: 'dog.png', mime: 'image/png', size: 10 }, { id: 'a3', name: 'tune.mp3', mime: 'audio/mpeg', size: 10 });
  p.artboards[0].children.push(createNode('image', { id: 'pic', name: 'Hero', assetId: 'a1', x: 40, y: 50, width: 300, height: 200, cornerRadius: 12, ariaLabel: 'A cat', crop: { x: 0.1, y: 0.1, zoom: 2 } } as never));
  s = new EditorStore(p);
  setCurrentStore(s);
  URL.createObjectURL = vi.fn(() => 'blob:t');
  URL.revokeObjectURL = vi.fn();
});

describe('the menu', () => {
  it('asks the three ways: one in the project, the Media Catalogue, or a new upload', () => {
    expect(SWAP_CHOICES.map((c) => c.from)).toEqual(['project', 'catalogue', 'upload']);
    expect(SWAP_CHOICES.map((c) => c.label)).toEqual(['One already in this project…', 'From the Media Catalogue…', 'Upload a new one…']);
    //and it is on an image layer's right-click menu
    const canvas = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'canvas', 'Canvas.tsx'), 'utf8');
    expect(canvas).toMatch(/one\.type === 'image' \? \[\{ label: 'Swap picture', items: SWAP_CHOICES/);
  });
});

describe('swapping', () => {
  it('changes the picture and nothing else about the layer, drops the old crop, and one undo puts it back', () => {
    setLayerPicture('pic', 'a2');
    expect(layer()).toMatchObject({ assetId: 'a2', name: 'Hero', x: 40, y: 50, width: 300, height: 200, cornerRadius: 12 });
    expect(layer().crop).toBeUndefined();
    s.undo();
    expect(layer().assetId).toBe('a1');
    expect(layer().crop).toMatchObject({ zoom: 2 });
  });

  it('a new upload goes into Assets without making a second layer, and the layer shows it', async () => {
    picked.push(new File([new Uint8Array([137, 80, 78, 71])], 'new.png', { type: 'image/png' }));
    await swapPicture('pic', 'upload');
    const added = s.get().project.assets.find((a) => a.name === 'new.png')!;
    expect(added).toBeTruthy();
    expect(layer().assetId).toBe(added.id);
    expect(s.get().project.artboards[0].children).toHaveLength(1);
  });

  it('cancelling the file picker changes nothing, and a file that is not a picture is refused', async () => {
    await swapPicture('pic', 'upload');
    expect(layer().assetId).toBe('a1');
    const toast = vi.spyOn(s, 'toast');
    picked.push(new File([new Uint8Array([1])], 'tune.mp3', { type: 'audio/mpeg' }));
    await swapPicture('pic', 'upload');
    expect(layer().assetId).toBe('a1');
    expect(toast.mock.calls[0][0]).toMatch(/isn't a picture/);
  });

  it('a catalogue photo is linked, not copied, and one already linked is used again', () => {
    const pick = { src: 'https://example.com/storage/p.jpg', name: 'Campus', mime: 'image/jpeg', alt: 'The campus', catalogue: '{"id":1}' };
    swapToCataloguePhoto('pic', pick as never);
    const linked = s.get().project.assets.find((a) => a.src === pick.src)!;
    expect(linked).toMatchObject({ size: 0, catalogue: '{"id":1}' });
    expect(layer().assetId).toBe(linked.id);
    setLayerPicture('pic', 'a1');
    swapToCataloguePhoto('pic', pick as never);
    expect(s.get().project.assets.filter((a) => a.src === pick.src)).toHaveLength(1);
    expect(layer().assetId).toBe(linked.id);
  });
});

describe('picking one already in the project', () => {
  let root: Root;
  const mount = async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<ImageSwapHost />));
  };

  it('shows the project\'s pictures only, marks the one showing now, and a click swaps and closes', async () => {
    await mount();
    expect(document.querySelector('.swap-modal')).toBeNull();
    await act(async () => void swapPicture('pic', 'project'));
    const picks = [...document.querySelectorAll<HTMLButtonElement>('.swap-pick')];
    expect(picks.map((b) => b.querySelector('.swap-name')!.textContent)).toEqual(['cat.png', 'dog.png']);
    expect(picks[0].disabled).toBe(true);
    expect(picks[0].textContent).toContain('Showing now');
    await act(async () => picks[1].click());
    expect(layer().assetId).toBe('a2');
    expect(document.querySelector('.swap-modal')).toBeNull();
    await act(async () => root.unmount());
  });

  it('with no other picture it says so and offers the other two ways', async () => {
    s.update((p) => {
      p.assets = p.assets.filter((a) => a.id !== 'a2');
    });
    await mount();
    await act(async () => void swapPicture('pic', 'project'));
    expect(document.querySelector('.swap-grid')).toBeNull();
    expect(document.querySelector('.swap-modal')!.textContent).toContain('no other pictures yet');
    expect([...document.querySelectorAll('.swap-actions button')].map((b) => b.textContent)).toEqual(['From the Media Catalogue…', 'Upload a new one…', 'Cancel']);
    await act(async () => root.unmount());
  });
});
