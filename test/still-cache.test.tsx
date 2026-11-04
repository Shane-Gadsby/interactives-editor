import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { stillHash } from '../src/lib/still-cache';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cached = vi.fn((): string | null => null);
const snapshot = vi.fn(async () => 'blob:fresh');
vi.mock('../src/lib/image-export', () => ({ snapshotFromDom: (...a: unknown[]) => (snapshot as (...x: unknown[]) => Promise<string>)(...a) }));
vi.mock('../src/lib/still-cache', async (orig) => ({ ...(await orig<typeof import('../src/lib/still-cache')>()), cachedStill: () => cached(), saveStill: vi.fn() }));

function make(count: number): Project {
  const p = createProject('Stills');
  for (let i = 1; i < count; i++) p.artboards.push({ ...structuredClone(p.artboards[0]), id: 'ab' + i, name: 'AB' + i, canvasX: i * 2000, children: [] });
  p.artboards.forEach((ab, i) => {
    ab.children = [createNode('rect', { name: 'r' + i, x: 10, y: 10, width: 100, height: 80 }) as SceneNode];
  });
  return p;
}

describe('still hash', () => {
  it('is the same for the same artboard, and moves only with what the picture depends on', () => {
    const p = make(3);
    const h = p.artboards.map((a) => stillHash(p, a));
    expect(new Set(h).size).toBe(3);
    const copy = structuredClone(p);
    expect(copy.artboards.map((a) => stillHash(copy, a))).toEqual(h);
    // an edit to one artboard moves its hash and no one else's
    const edited = structuredClone(p);
    edited.artboards[1].children[0].x = 99;
    expect(stillHash(edited, edited.artboards[0])).toBe(h[0]);
    expect(stillHash(edited, edited.artboards[1])).not.toBe(h[1]);
    expect(stillHash(edited, edited.artboards[2])).toBe(h[2]);
    // project-wide things move all of them
    const vars = structuredClone(p);
    vars.variables = [...vars.variables, { id: 'v1', name: 'x', type: 'number', value: 1 } as never];
    expect(vars.artboards.map((a) => stillHash(vars, a)).every((x, i) => x !== h[i])).toBe(true);
  });

  it('follows the artboards an instance draws', () => {
    const p = make(2);
    const inst = createNode('instance', { name: 'in', x: 0, y: 0, width: 100, height: 100 }) as SceneNode & { artboardId: string };
    inst.artboardId = 'ab1';
    p.artboards[0].children.push(inst);
    const before = stillHash(p, p.artboards[0]);
    const edited = structuredClone(p);
    edited.artboards[1].children[0].x = 77;
    expect(stillHash(edited, edited.artboards[0])).not.toBe(before);
  });
});

describe('an artboard with a saved still', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    snapshot.mockClear();
    cached.mockReset();
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows it from the first render, with no empty background and no new still made', async () => {
    const { ArtboardView } = await import('../src/canvas/ArtboardView');
    const { EditorStore, setCurrentStore } = await import('../src/store/store');
    const p = make(2);
    setCurrentStore(new EditorStore(p));
    cached.mockImplementation(() => 'blob:saved');
    act(() =>
      root.render(
        <>
          {p.artboards.map((ab, i) => (
            <ArtboardView key={ab.id} artboard={ab} project={p} timeline={null} time={0} active={i === 0} live={i === 0} assetVersion={0} dataVersion={0} deferred={i > 0} rank={1} />
          ))}
        </>,
      ),
    );
    const view = host.querySelector('[data-artboard="ab1"]')!;
    const img = view.querySelector('img.artboard-still') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:saved');
    expect(img.className).toContain('shown');
    // the live DOM is built behind it, in the background, and no second picture is made
    await act(async () => void (await new Promise((r) => setTimeout(r, 300))));
    expect(view.querySelectorAll('.ix-node').length).toBe(1);
    expect(snapshot).not.toHaveBeenCalled();
    expect(view.querySelector('.artboard-pending')).toBeNull();
    // the active artboard is live, never pictured
    expect(host.querySelector('[data-artboard="ab0"] img.artboard-still')).toBeNull();
  });
});
