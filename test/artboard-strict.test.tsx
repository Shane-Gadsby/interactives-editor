import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/lib/image-export', () => ({ snapshotFromDom: async () => 'blob:still' }));

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function make(count: number): Project {
  const p = createProject('Strict');
  p.artboards[0].canvasX = 0;
  for (let i = 1; i < count; i++) p.artboards.push({ ...structuredClone(p.artboards[0]), id: 'ab' + i, name: 'AB' + i, canvasX: i * 2000, children: [] });
  p.artboards.forEach((ab, i) => {
    ab.children = [createNode('rect', { name: 'r' + i, x: 10, y: 10, width: 100, height: 80 }) as SceneNode];
  });
  setCurrentStore(new EditorStore(p));
  return p;
}

const wait = (ms = 80) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const nodesIn = (id: string) => host.querySelectorAll(`[data-artboard="${id}"] .ix-node`).length;

function views(p: Project, opts: { strict?: boolean; active?: string; deferred?: boolean; keyed?: string } = {}) {
  const active = opts.active ?? p.artboards[0].id;
  const body = (
    <>
      {p.artboards.map((ab) => (
        <ArtboardView
          key={ab.id + (opts.keyed ?? '')}
          artboard={ab}
          project={p}
          timeline={null}
          time={0}
          active={ab.id === active}
          live
          assetVersion={0}
          dataVersion={0}
          deferred={opts.deferred && ab.id !== active}
          rank={Number(ab.id.replace(/\D/g, '')) || 0}
        />
      ))}
    </>
  );
  act(() => root.render(opts.strict === false ? body : <StrictMode>{body}</StrictMode>));
}

describe('artboards in React StrictMode (effects run mount, unmount, mount)', () => {
  it('draws the active artboard', () => {
    const p = make(1);
    views(p);
    expect(nodesIn(p.artboards[0].id)).toBe(1);
  });

  it('draws deferred artboards once the scheduler runs', async () => {
    const p = make(4);
    views(p, { deferred: true });
    expect(nodesIn(p.artboards[0].id)).toBe(1);
    await wait(150);
    for (const ab of p.artboards) expect(nodesIn(ab.id), ab.id).toBe(1);
    expect(host.querySelectorAll('.artboard-pending').length).toBe(0);
  });

  it('draws again after a remount (a new key) and after toggling the view off and on', async () => {
    const p = make(3);
    views(p, { deferred: true });
    await wait(150);
    views(p, { deferred: true, keyed: 'x' });
    await wait(150);
    for (const ab of p.artboards) expect(nodesIn(ab.id), ab.id).toBe(1);
    act(() => root.render(<StrictMode>{null}</StrictMode>));
    views(p, { deferred: true });
    await wait(150);
    for (const ab of p.artboards) expect(nodesIn(ab.id), ab.id).toBe(1);
  });

  it('still redraws incrementally after the strict remount', async () => {
    const p = make(1);
    views(p);
    const ab = p.artboards[0];
    const next = structuredClone(p);
    next.artboards[0].children[0].x = 50;
    views(next);
    await wait(20);
    const el = host.querySelector(`[data-artboard="${ab.id}"] .ix-node`) as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.cssText).toContain('50');
  });
});
