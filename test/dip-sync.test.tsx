import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, sanitizeProject, type Project, type Timeline } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel, deleteSelectedKeys } from '../src/panels/Timeline';
import { addTextDip } from '../src/lib/swap-text';
import { DIP_SYNC_PREF, dipKeysOf, dipSyncOn, followText, hasDip, isDipKey, removeKeysAndDips, setDipSync } from '../src/lib/dip-sync';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
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

function project(): { p: Project; tl: Timeline } {
  const p = createProject('Sync');
  const t = createNode('text', { name: 'Title', text: 'hello', opacity: 1 });
  p.artboards[0].children.push(t);
  const tl: Timeline = {
    id: 'tl',
    name: 'T',
    duration: 3000,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [{ id: 'tx', nodeId: t.id, prop: 'text', keys: [{ id: 'a', t: 0, value: 'Hello', ease: 'easeInOut' }, { id: 'b', t: 1000, value: 'World', ease: 'easeInOut' }] }],
  };
  p.artboards[0].timelines.push(tl);
  return { p, tl };
}

const opacity = (tl: Timeline) => tl.tracks.find((t) => t.prop === 'opacity');
const times = (tl: Timeline, prop = 'opacity') => tl.tracks.find((t) => t.prop === prop)?.keys.map((k) => k.t);

describe('dips that stay with their text key (the keys)', () => {
  it('a linked dip tags each key with the text key and its offset, a plain one does not', () => {
    const { p, tl } = project();
    const node = p.artboards[0].children[0];
    addTextDip(tl, node, 'tx', 'b', 'both', 300, true);
    expect(opacity(tl)!.keys.map((k) => [k.dipOf, k.dipOff])).toEqual([['b', -300], ['b', 0], ['b', 300]]);
    expect(dipKeysOf(tl, 'b')).toHaveLength(6);
    expect(hasDip(tl, 'b')).toBe(true);
    const plain = project();
    addTextDip(plain.tl, plain.p.artboards[0].children[0], 'tx', 'b', 'fade', 300);
    expect(opacity(plain.tl)!.keys.some(isDipKey)).toBe(false);
    expect(hasDip(plain.tl, 'b')).toBe(false);
  });

  it('moving the text key moves the dip by the same amount, and stops at the ends of the timeline', () => {
    const { p, tl } = project();
    addTextDip(tl, p.artboards[0].children[0], 'tx', 'b', 'fade', 300, true);
    tl.tracks[0].keys[1].t = 1600;
    followText(tl, 'b', 1000, 1600);
    expect(times(tl)).toEqual([1300, 1600, 1900]);
    tl.tracks[0].keys[1].t = 3000;
    followText(tl, 'b', 1600, 3000);
    expect(times(tl)).toEqual([2700, 3000, 3000]);
  });

  it('running it again after a move replaces the dip where it now is', () => {
    const { p, tl } = project();
    const node = p.artboards[0].children[0];
    addTextDip(tl, node, 'tx', 'b', 'fade', 300, true);
    tl.tracks[0].keys[1].t = 1600;
    followText(tl, 'b', 1000, 1600);
    addTextDip(tl, node, 'tx', 'b', 'fade', 200, true);
    expect(times(tl)).toEqual([1400, 1600, 1800]);
  });

  it('deleting the text key takes its dip, and leaves other keys on the same layer alone', () => {
    const { p, tl } = project();
    const node = p.artboards[0].children[0];
    tl.tracks.push({ id: 'op', nodeId: node.id, prop: 'opacity', keys: [{ id: 'mine', t: 2500, value: 0.5, ease: 'linear' }] });
    addTextDip(tl, node, 'tx', 'b', 'fade', 300, true);
    const gone = removeKeysAndDips(tl, new Set(['tx:b']));
    expect(gone).toBe(3);
    expect(times(tl)).toEqual([2500]);
    expect(tl.tracks.find((t) => t.prop === 'text')!.keys.map((k) => k.id)).toEqual(['a']);
  });

  it('deleting just one dip key leaves the rest tied', () => {
    const { p, tl } = project();
    addTextDip(tl, p.artboards[0].children[0], 'tx', 'b', 'fade', 300, true);
    const op = opacity(tl)!;
    removeKeysAndDips(tl, new Set([`${op.id}:${op.keys[0].id}`]));
    expect(dipKeysOf(tl, 'b')).toHaveLength(2);
  });

  it('keeps its links through the project sanitiser', () => {
    const { p, tl } = project();
    addTextDip(tl, p.artboards[0].children[0], 'tx', 'b', 'fade', 300, true);
    const clean = sanitizeProject(JSON.parse(JSON.stringify(p)));
    expect(opacity(clean.artboards[0].timelines[0])!.keys.map((k) => k.dipOf)).toEqual(['b', 'b', 'b']);
  });

  it('the choice is per browser, on unless turned off', () => {
    expect(dipSyncOn()).toBe(true);
    setDipSync(false);
    expect(localStorage.getItem(DIP_SYNC_PREF)).toBe('0');
    expect(dipSyncOn()).toBe(false);
    setDipSync(true);
    expect(dipSyncOn()).toBe(true);
  });
});

describe('dips that stay with their text key (in the Timeline)', () => {
  const mount = () => {
    const { p, tl } = project();
    addTextDip(tl, p.artboards[0].children[0], 'tx', 'b', 'fade', 300, true);
    s = new EditorStore(p);
    s.set({ activeTimelineId: 'tl', bottomTab: 'timeline', playhead: 0 });
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<TimelinePanel />));
  };
  const tl = () => s.get().project.artboards[0].timelines[0];
  const drag = (el: HTMLElement, by: number) => {
    act(() => void el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 })));
    act(() => void el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: by, altKey: true })));
    act(() => void el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  };
  const textKeys = () => [...host!.querySelectorAll<HTMLElement>('.lane:not(.node-lane) .key.hold')];
  const laneKeys = () => [...host!.querySelectorAll<HTMLElement>('.lane:not(.node-lane):not(.hold-lane) .key')];

  it('dragging the text key drags its dip, and dragging a dip key alone lets that key go', () => {
    mount();
    expect(times(tl())).toEqual([700, 1000, 1300]);
    drag(textKeys()[1], 120);
    const moved = tl().tracks.find((t) => t.prop === 'text')!.keys[1].t - 1000;
    expect(moved).toBeGreaterThan(0);
    expect(times(tl())).toEqual([700 + moved, 1000 + moved, 1300 + moved]);
    expect(opacity(tl())!.keys.every(isDipKey)).toBe(true);
    // one dip key on its own: it moves, the others stay put, and only it is free
    const before = times(tl())!;
    drag(laneKeys()[2], 60);
    const after = times(tl())!;
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBeGreaterThan(before[2]);
    expect(opacity(tl())!.keys.map(isDipKey)).toEqual([true, true, false]);
    // only the keys still tied are drawn hollow
    expect(laneKeys().map((k) => k.classList.contains('tied'))).toEqual([true, true, false]);
    // and the text key still carries the two that remain tied
    const textT = tl().tracks.find((t) => t.prop === 'text')!.keys[1].t;
    drag(textKeys()[1], 80);
    const shift = tl().tracks.find((t) => t.prop === 'text')!.keys[1].t - textT;
    expect(times(tl())![0]).toBe(after[0] + shift);
    expect(times(tl())![2]).toBe(after[2]);
  });

  it('dragging the text key and its dip together does not move the dip twice', () => {
    mount();
    s.set({ selectedKeys: ['tx:b', ...opacity(tl())!.keys.map((k) => `${opacity(tl())!.id}:${k.id}`)] });
    drag(textKeys()[1], 120);
    const moved = tl().tracks.find((t) => t.prop === 'text')!.keys[1].t - 1000;
    expect(moved).toBeGreaterThan(0);
    expect(times(tl())).toEqual([700 + moved, 1000 + moved, 1300 + moved]);
  });

  it('typing a new time for the text key moves the dip, typing one for a dip key lets it go', () => {
    mount();
    const timeField = () => host!.querySelector<HTMLInputElement>('.key-editor input')!;
    const type = (v: string) => {
      act(() => timeField().focus());
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(timeField(), v);
        timeField().dispatchEvent(new Event('input', { bubbles: true }));
      });
      // the number commits when it loses focus
      act(() => void timeField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    };
    act(() => s.set({ selectedKeys: ['tx:b'], playhead: 1000 }));
    type('1600');
    expect(times(tl())).toEqual([1300, 1600, 1900]);
    const op = opacity(tl())!;
    act(() => s.set({ selectedKeys: [`${op.id}:${op.keys[2].id}`] }));
    type('2200');
    expect(times(tl())).toEqual([1300, 1600, 2200]);
    expect(opacity(tl())!.keys.map(isDipKey)).toEqual([true, true, false]);
  });

  it('the Delete shortcut on the text key takes the dip with it', () => {
    mount();
    act(() => s.set({ selectedKeys: ['tx:b'] }));
    act(() => void deleteSelectedKeys());
    expect(opacity(tl())).toBeUndefined();
    expect(tl().tracks.map((t) => t.prop)).toEqual(['text']);
  });
});

describe('the Keyframe panel choice', () => {
  it('with Keep the dip off, the dip is plain keys that do not follow', () => {
    setDipSync(false);
    const { p, tl } = project();
    s = new EditorStore(p);
    s.set({ activeTimelineId: 'tl', bottomTab: 'timeline', playhead: 1000, selectedKeys: ['tx:b'] });
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<TimelinePanel />));
    const group = host.querySelector('[aria-label="Swap text dip"]') as HTMLElement;
    const check = group.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(check.checked).toBe(false);
    act(() => void [...group.querySelectorAll('button')].find((b) => b.textContent === 'Add the dip')!.click());
    const now = s.get().project.artboards[0].timelines[0];
    expect(opacity(now)!.keys.some(isDipKey)).toBe(false);
    expect(tl.id).toBe('tl');
    // turn it on and add again: the keys are tied from then on
    act(() => void check.click());
    expect(dipSyncOn()).toBe(true);
    act(() => void [...group.querySelectorAll('button')].find((b) => b.textContent === 'Add the dip')!.click());
    expect(opacity(s.get().project.artboards[0].timelines[0])!.keys.every(isDipKey)).toBe(true);
    expect(group.textContent).toContain('moves with it');
  });
});
