import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, uid } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount() {
  const p = createProject('Blends');
  const ab = p.artboards[0];
  const mk = (name: string) => ({ id: uid('tl'), name, duration: 1000, loop: 'loop' as const, autoplay: false, speed: 1, tracks: [] as never[] });
  ab.timelines.push(mk('A'), mk('B'));
  p.variables.push({ id: 'v', name: 'count', type: 'number', initial: 0 });
  ab.blends = [{ id: 'b', name: 'Mix', mode: '1d', variable: 'v', entries: [{ timeline: ab.timelines[0].id, value: 0 }, { timeline: ab.timelines[1].id, value: 1 }] }];
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: ab.id, selection: [] });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Inspector />));
}
const field = (label: string) => Array.from(host.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label));
const blend = () => s.get().project.artboards[0].blends![0];

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Blends in the artboard inspector', () => {
  it('sits above Joysticks', () => {
    mount();
    const titles = [...host.querySelectorAll('.section-title')].map((t) => t.textContent);
    expect(titles.indexOf('Blends')).toBeGreaterThan(-1);
    expect(titles.indexOf('Blends')).toBeLessThan(titles.indexOf('Joysticks'));
  });

  it('has a Transition time that is saved, and an easing once there is one', () => {
    mount();
    expect(field('Transition easing')).toBeUndefined();
    const input = field('Transition (ms)')!.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('0');
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '250');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    expect(blend().transition).toBe(250);
    const ease = field('Transition easing')!.querySelector('select') as HTMLSelectElement;
    expect(ease.value).toBe('linear');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(ease, 'easeOut');
      ease.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(blend().transitionEase).toBe('easeOut');
    // back to 0 takes the field away again and leaves the blend as it was
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    expect(blend().transition).toBeUndefined();
    expect(field('Transition easing')).toBeUndefined();
  });
});
