import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { locate } from '../src/store/doc';
import { askAboutPictures, doneAsking, hintFromFileName, needsDescription, resetAltPrompt, waitingHint } from '../src/lib/alt-prompt';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  resetAltPrompt();
  setPrefs({ askPictureDescription: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function scene(extra: Record<string, unknown> = {}) {
  const p = createProject('T');
  const img = createNode('image', { name: 'Beach sunset', ...extra } as never) as SceneNode;
  const vid = createNode('video', { name: 'Clip' } as never) as SceneNode;
  const rect = createNode('rect', { name: 'box' } as never) as SceneNode;
  p.artboards[0].children.push(img, vid, rect);
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { s, p, img, vid, rect };
}
const render = () => act(() => root.render(<Inspector />));
const card = () => host.querySelector('.alt-prompt');
const input = () => host.querySelector<HTMLInputElement>('.alt-prompt-input')!;
const type = (v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), v);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
const key = (k: string) => act(() => void input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
const node = (x: ReturnType<typeof scene>, n: SceneNode) => locate(x.s.artboard()!, n.id)!.node as SceneNode;

describe('hints from a file name', () => {
  it('turns a file name into words, and leaves a camera number as nothing', () => {
    expect(hintFromFileName('beach_sunset.JPG')).toBe('Beach sunset');
    expect(hintFromFileName('IMG_2043-Beach-sunset.jpg')).toBe('Beach sunset');
    expect(hintFromFileName('lecture-theatre2.png')).toBe('Lecture theatre2');
    expect(hintFromFileName('classRoomPhoto.webp')).toBe('Class room');
    expect(hintFromFileName('IMG_2043.jpg')).toBe('');
    expect(hintFromFileName('DSC00123.JPG')).toBe('');
    expect(hintFromFileName('3f9a2b7c1d4e.png')).toBe('');
  });
});

describe('what gets asked about', () => {
  it('only a picture or video with nothing said about it', () => {
    const x = scene();
    expect(needsDescription(x.img)).toBe(true);
    expect(needsDescription(x.vid)).toBe(true);
    expect(needsDescription(x.rect)).toBe(false);
    expect(needsDescription({ ...x.img, ariaLabel: 'A beach' } as SceneNode)).toBe(false);
    expect(needsDescription({ ...x.img, decorative: true } as SceneNode)).toBe(false);
  });

  it('adding puts it on the list with its hint, and a described one stays off', () => {
    const x = scene();
    const done = createNode('image', { name: 'Logo', ariaLabel: 'The logo' } as never) as SceneNode;
    askAboutPictures(x.p.id, [{ node: x.img }, { node: done }, { node: x.rect }, { node: x.vid, hint: 'The catalogue says' }]);
    expect(waitingHint(x.p.id, x.img.id)).toBe('Beach sunset');
    expect(waitingHint(x.p.id, x.vid.id)).toBe('The catalogue says');
    expect(waitingHint(x.p.id, done.id)).toBeUndefined();
    expect(waitingHint(x.p.id, x.rect.id)).toBeUndefined();
  });

  it('is kept per project and survives a reload of the page', () => {
    const x = scene();
    askAboutPictures('project-a', [{ node: x.img }]);
    resetAltPrompt();
    expect(waitingHint('project-a', x.img.id)).toBe('Beach sunset');
    expect(waitingHint('project-b', x.img.id)).toBeUndefined();
    doneAsking('project-a', [x.img.id]);
    resetAltPrompt();
    expect(waitingHint('project-a', x.img.id)).toBeUndefined();
  });

  it('is not asked when the preference is off', () => {
    const x = scene();
    setPrefs({ askPictureDescription: false });
    askAboutPictures(x.p.id, [{ node: x.img }]);
    expect(waitingHint(x.p.id, x.img.id)).toBeUndefined();
  });

  it('does not fall over with no storage', () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('full');
    };
    try {
      const x = scene();
      expect(() => askAboutPictures(x.p.id, [{ node: x.img }])).not.toThrow();
      expect(waitingHint(x.p.id, x.img.id)).toBe('Beach sunset');
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});

describe('the box on the layer', () => {
  it('shows on a layer that was just added, with the hint as a placeholder and nothing typed', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.img }]);
    x.s.select([x.img.id]);
    render();
    expect(card()).toBeTruthy();
    expect(card()!.textContent).toContain('What is this a picture of?');
    expect(input().value).toBe('');
    expect(input().placeholder).toContain('Beach sunset');
    expect(host.querySelector('label[for]')!.getAttribute('for')).toBe(input().id);
    expect(node(x, x.img).ariaLabel).toBeUndefined();
  });

  it('says video for a video, and does not show on a layer nobody asked about', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.vid }]);
    x.s.select([x.vid.id]);
    render();
    expect(card()!.textContent).toContain('What is this a video of?');
    act(() => x.s.select([x.img.id]));
    expect(card()).toBeNull();
    act(() => x.s.select([x.rect.id]));
    expect(card()).toBeNull();
  });

  it('Save writes the text alternative and puts the box away', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.img }]);
    x.s.select([x.img.id]);
    render();
    const save = host.querySelector<HTMLButtonElement>('.alt-prompt-save')!;
    expect(save.disabled).toBe(true);
    type('  Waves on a beach at sunset ');
    expect(save.disabled).toBe(false);
    act(() => save.click());
    expect(node(x, x.img).ariaLabel).toBe('Waves on a beach at sunset');
    expect(card()).toBeNull();
    expect(waitingHint(x.p.id, x.img.id)).toBeUndefined();
  });

  it('Enter saves and Escape skips', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.img }, { node: x.vid }]);
    x.s.select([x.img.id]);
    render();
    type('A beach');
    key('Enter');
    expect(node(x, x.img).ariaLabel).toBe('A beach');
    act(() => x.s.select([x.vid.id]));
    type('half typed');
    key('Escape');
    expect(node(x, x.vid).ariaLabel).toBeUndefined();
    expect(card()).toBeNull();
    expect(waitingHint(x.p.id, x.vid.id)).toBeUndefined();
  });

  it('Decorative marks it decorative, Skip changes nothing in the document', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.img }, { node: x.vid }]);
    x.s.select([x.img.id]);
    render();
    const rev = x.s.revision;
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.alt-prompt-actions button')].find((b) => b.textContent === 'Decorative')!.click());
    expect(node(x, x.img).decorative).toBe(true);
    expect(node(x, x.img).ariaLabel).toBeUndefined();
    expect(card()).toBeNull();
    act(() => x.s.select([x.vid.id]));
    const after = x.s.revision;
    expect(after).toBeGreaterThan(rev);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.alt-prompt-actions button')].find((b) => b.textContent === 'Skip')!.click());
    expect(x.s.revision).toBe(after);
    expect(card()).toBeNull();
    expect(node(x, x.vid).ariaLabel).toBeUndefined();
  });

  it('goes away by itself when the layer is described another way, and a skipped one stays skipped', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.img }]);
    x.s.select([x.img.id]);
    render();
    act(() => x.s.setProps([x.img.id], { ariaLabel: 'Typed in the Accessibility section' }));
    expect(card()).toBeNull();
    expect(waitingHint(x.p.id, x.img.id)).toBeUndefined();
    act(() => x.s.setProps([x.img.id], { ariaLabel: undefined }));
    expect(card()).toBeNull();
  });

  it('never gets in the way: the layer stays selected and every other field is there', () => {
    const x = scene();
    askAboutPictures(x.p.id, [{ node: x.img }]);
    x.s.select([x.img.id]);
    render();
    expect(host.querySelector('[data-prop="opacity"]')).toBeTruthy();
    expect(x.s.get().selection).toEqual([x.img.id]);
  });
});
