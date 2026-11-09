import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project, type Timeline } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel } from '../src/panels/Timeline';
import { addTextDip } from '../src/lib/swap-text';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function project(): { p: Project; tl: Timeline; id: string } {
  const p = createProject('Swap');
  const t = createNode('text', { name: 'Title', text: 'hello', opacity: 1 });
  p.artboards[0].children.push(t);
  const tl: Timeline = {
    id: 'tl',
    name: 'T',
    duration: 2000,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [{ id: 'tx', nodeId: t.id, prop: 'text', keys: [{ id: 'a', t: 0, value: 'hello', ease: 'easeInOut' }, { id: 'b', t: 1000, value: 'world', ease: 'easeInOut' }] }],
  };
  p.artboards[0].timelines.push(tl);
  return { p, tl, id: t.id };
}

const track = (tl: Timeline, prop: string) => tl.tracks.find((t) => t.prop === prop);
const times = (tl: Timeline, prop: string) => track(tl, prop)?.keys.map((k) => [k.t, k.value]);

describe('Swap text dip (the keys)', () => {
  it('fades out and in around a text change: opacity back to normal either side, nothing on it', () => {
    const { p, tl, id } = project();
    const node = p.artboards[0].children[0];
    expect(addTextDip(tl, node, 'tx', 'b', 'fade', 300)).toBe(true);
    expect(times(tl, 'opacity')).toEqual([[700, 1], [1000, 0], [1300, 1]]);
    expect(track(tl, 'opacity')!.dip).toBe(true);
    expect(track(tl, 'opacity')!.nodeId).toBe(id);
    expect(track(tl, 'blur')).toBeUndefined();
  });

  it('blur and both styles key the blur too, and running it again replaces its own keys', () => {
    const { p, tl } = project();
    const node = p.artboards[0].children[0];
    addTextDip(tl, node, 'tx', 'b', 'both', 200);
    addTextDip(tl, node, 'tx', 'b', 'both', 300);
    expect(times(tl, 'opacity')).toEqual([[700, 1], [1000, 0], [1300, 1]]);
    expect(times(tl, 'blur')).toEqual([[700, 0], [1000, 8], [1300, 0]]);
  });

  it('is cut short to half the gap to the neighbouring text keys and the ends of the timeline', () => {
    const { p, tl } = project();
    const node = p.artboards[0].children[0];
    tl.tracks[0].keys.push({ id: 'c', t: 1200, value: 'again', ease: 'easeInOut' });
    addTextDip(tl, node, 'tx', 'b', 'fade', 600);
    // 500 back (half of 1000), 100 forward (half of 200)
    expect(times(tl, 'opacity')).toEqual([[500, 1], [1000, 0], [1100, 1]]);
    const { tl: tl2, p: p2 } = project();
    tl2.tracks[0].keys[1].t = 1950;
    addTextDip(tl2, p2.artboards[0].children[0], 'tx', 'b', 'fade', 600);
    expect(times(tl2, 'opacity')!.at(-1)).toEqual([2000, 1]);
  });

  it('starts from the opacity the layer already animates to, and keeps its other keys', () => {
    const { p, tl, id } = project();
    const node = p.artboards[0].children[0];
    tl.tracks.push({
      id: 'op',
      nodeId: id,
      prop: 'opacity',
      keys: [{ id: 'o0', t: 0, value: 0.4, ease: 'linear' }, { id: 'o1', t: 900, value: 0.4, ease: 'linear' }, { id: 'o2', t: 2000, value: 0.8, ease: 'linear' }],
    });
    addTextDip(tl, node, 'tx', 'b', 'fade', 300);
    // the key inside the dip window went; the ones outside stay; the track was the author's own so it is not marked
    expect(times(tl, 'opacity')).toEqual([[0, 0.4], [700, 0.4], [1000, 0], [1300, expect.closeTo(0.4 + (0.4 * 400) / 1100, 3)], [2000, 0.8]]);
    expect(track(tl, 'opacity')!.dip).toBeUndefined();
  });

  it('does nothing for the first text key (no change to soften) or a number track', () => {
    const { p, tl, id } = project();
    const node = p.artboards[0].children[0];
    expect(addTextDip(tl, node, 'tx', 'a', 'fade', 300)).toBe(false);
    tl.tracks.push({ id: 'xx', nodeId: id, prop: 'x', keys: [{ id: 'x0', t: 0, value: 0, ease: 'linear' }, { id: 'x1', t: 500, value: 9, ease: 'linear' }] });
    expect(addTextDip(tl, node, 'xx', 'x1', 'fade', 300)).toBe(false);
    expect(track(tl, 'opacity')).toBeUndefined();
  });
});

describe('Text keys in the Timeline', () => {
  const mount = () => {
    const { p } = project();
    s = new EditorStore(p);
    s.set({ activeTimelineId: 'tl', bottomTab: 'timeline', playhead: 0 });
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<TimelinePanel />));
  };

  it('draws text keys as hold keys with a flat hold bar, and number keys as ordinary keys', () => {
    mount();
    const keys = [...host!.querySelectorAll('.lane:not(.node-lane) .key')];
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.classList.contains('hold'))).toBe(true);
    expect(keys[1].getAttribute('aria-label')).toContain('hold key');
    expect(host!.querySelectorAll('.segment.hold')).toHaveLength(1);
    expect(host!.querySelectorAll('.segment:not(.hold)')).toHaveLength(0);
    act(() =>
      s.update((d) => {
        d.artboards[0].timelines[0].tracks.push({ id: 'nx', nodeId: d.artboards[0].children[0].id, prop: 'x', keys: [{ id: 'n0', t: 0, value: 0, ease: 'linear' }, { id: 'n1', t: 500, value: 9, ease: 'linear' }] });
      }),
    );
    const plain = [...host!.querySelectorAll('.lane:not(.node-lane):not(.hold-lane) .key')];
    expect(plain).toHaveLength(2);
    expect(plain.some((k) => k.classList.contains('hold'))).toBe(false);
  });

  it('a right-click on a text key offers the dips, and picking one keys it', () => {
    mount();
    const key = host!.querySelectorAll<HTMLElement>('.lane:not(.node-lane) .key')[1];
    act(() => void key.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const items = [...document.querySelectorAll<HTMLElement>('.ctx-menu button, .ctx-menu [role="menuitem"]')];
    const pick = items.find((i) => i.textContent?.includes('Fade out and in, Normal'));
    expect(pick).toBeTruthy();
    act(() => void pick!.click());
    const tl = s.get().project.artboards[0].timelines[0];
    expect(times(tl, 'opacity')).toEqual([[700, 1], [1000, 0], [1300, 1]]);
  });

  it('the Keyframe panel of a selected text key adds a dip of the chosen length', () => {
    mount();
    act(() => s.set({ selectedKeys: ['tx:b'], playhead: 1000 }));
    const group = host!.querySelector('[aria-label="Swap text dip"]') as HTMLElement;
    expect(group).toBeTruthy();
    expect(host!.textContent).toContain('This holds until the next key');
    act(() => void [...group.querySelectorAll('button')].find((b) => b.textContent === 'Add the dip')!.click());
    expect(times(s.get().project.artboards[0].timelines[0], 'opacity')).toEqual([[700, 1], [1000, 0], [1300, 1]]);
    // the first text key has no change to soften, so no panel for it
    act(() => s.set({ selectedKeys: ['tx:a'], playhead: 0 }));
    expect(host!.querySelector('[aria-label="Swap text dip"]')).toBeNull();
  });
});
