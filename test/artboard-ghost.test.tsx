//The canvas draws the parts of layers past a clipping artboard's edge faintly (a second renderer for just those layers), and the
//Preferences switch turns it off. Selection is by geometry, so these only check what is drawn.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { inGhostExtent } from '../src/canvas/ghost';
import { setPrefs } from '../src/lib/prefs';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  setPrefs({ ghostOutside: true });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setPrefs({ ghostOutside: true });
});

function make(clip: boolean, out = true): Project {
  const p = createProject('G');
  const ab = p.artboards[0];
  ab.width = 200;
  ab.height = 200;
  ab.clip = clip;
  ab.children.push(createNode('rect', { name: 'in', x: 10, y: 10, width: 50, height: 50 }) as SceneNode);
  if (out) ab.children.push(createNode('rect', { name: 'out', x: 180, y: 20, width: 80, height: 50 }) as SceneNode);
  setCurrentStore(new EditorStore(p));
  return p;
}
const show = (p: Project, ab: Artboard = p.artboards[0]) =>
  act(() => root.render(<ArtboardView artboard={ab} project={p} timeline={null} time={0} active live assetVersion={0} dataVersion={0} />));
const ghostLayers = () => [...host.querySelectorAll('.artboard-ghost [data-ix-id]')].length;

describe('faint layers outside a clipping artboard', () => {
  it('draws only the layers that reach outside, and lets them be picked where they are', () => {
    const p = make(true);
    show(p);
    expect(ghostLayers()).toBe(1);
    expect(host.querySelector('.artboard-ghost')!.getAttribute('style')).toContain('clip-path');
    //the artboard itself still clips, and still draws everything
    expect(host.querySelector<HTMLElement>('.artboard-host .ix-artboard')!.style.overflow).toBe('hidden');
    expect(host.querySelectorAll('.artboard-host [data-ix-id]').length).toBe(2);
    expect(inGhostExtent(p.artboards[0].id, 250, 40)).toBe(true);
    expect(inGhostExtent(p.artboards[0].id, 250, 150)).toBe(false);
  });

  it('draws nothing for an artboard that does not clip, or when no layer reaches outside', () => {
    const open = make(false);
    show(open);
    expect(ghostLayers()).toBe(0);
    act(() => root.unmount());
    root = createRoot(host);
    const inside = make(true, false);
    show(inside);
    expect(ghostLayers()).toBe(0);
  });

  it('goes away with the preference and comes back', () => {
    const p = make(true);
    show(p);
    expect(ghostLayers()).toBe(1);
    act(() => setPrefs({ ghostOutside: false }));
    expect(ghostLayers()).toBe(0);
    expect(inGhostExtent(p.artboards[0].id, 250, 40)).toBe(false);
    act(() => setPrefs({ ghostOutside: true }));
    expect(ghostLayers()).toBe(1);
  });

  it('follows a layer as it is moved in and out', () => {
    const p = make(true);
    show(p);
    const moved = { ...p.artboards[0], children: p.artboards[0].children.map((n) => (n.name === 'out' ? { ...n, x: 20 } : n)) } as Artboard;
    show({ ...p, artboards: [moved] }, moved);
    expect(ghostLayers()).toBe(0);
    const back = { ...moved, children: moved.children.map((n) => (n.name === 'out' ? { ...n, x: 190 } : n)) } as Artboard;
    show({ ...p, artboards: [back] }, back);
    expect(ghostLayers()).toBe(1);
  });
});
