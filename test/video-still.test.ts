//A video in an artboard still is the frame it shows, not an empty player with its controls
import { describe, expect, it } from 'vitest';
import { snapshotFromDom, videosReady } from '../src/lib/image-export';
import { createProject } from 'interactives-player';

describe('video in artboard stills', () => {
  it('replaces a video with a dark box when it has no frame, so no player controls show', async () => {
    const root = document.createElement('div');
    const v = document.createElement('video');
    v.style.cssText = 'position:absolute;left:10px;top:20px;width:100px;height:50px';
    root.appendChild(v);
    const p = createProject();
    const url = await snapshotFromDom(p, p.artboards[0], root, () => undefined);
    expect(url).toMatch(/^blob:/);
    //the live tree is left alone
    expect(root.querySelector('video')).toBe(v);
  });
  it('does not wait when no video is loading', async () => {
    const root = document.createElement('div');
    root.appendChild(document.createElement('video'));
    await expect(videosReady(root, 50)).resolves.toBeUndefined();
  });
});
