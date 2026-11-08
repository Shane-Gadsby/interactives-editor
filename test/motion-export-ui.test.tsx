import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { MotionExportModal } from '../src/components/MotionExportModal';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(duration = 3000) {
  const p = createProject('Clip');
  p.artboards[0].timelines.push({ id: 'tl', name: 'Intro', duration, loop: 'once', autoplay: false, speed: 1, tracks: [], fps: 24 });
  const s = new EditorStore(p);
  s.set({ activeTimelineId: 'tl' });
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<MotionExportModal onClose={() => undefined} />));
}
const formats = () => Array.from(document.querySelectorAll<HTMLOptionElement>('select option')).map((o) => o.value);

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
});

describe('Export > Video, GIF or frames', () => {
  it('offers only GIF and PNG frames, with a reason, where there is no VideoEncoder', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    mount();
    await act(async () => void (await new Promise((r) => setTimeout(r, 200))));
    expect(formats()).toEqual(expect.arrayContaining(['gif', 'png']));
    expect(formats()).not.toContain('mp4');
    expect(formats()).not.toContain('webm');
    expect(document.body.textContent).toMatch(/cannot encode video/);
    // the timeline's own rate and the frame count are shown
    expect(document.body.textContent).toMatch(/72 frames/);
  });

  it('says audio is left out, and the help covers the same', () => {
    vi.stubGlobal('VideoEncoder', undefined);
    mount();
    expect(document.body.textContent).toMatch(/Audio is not included/);
    expect(topicBody(TOPICS.find((t) => t.id === 'export')!)).toMatch(/No audio yet/);
  });

  it('will not export a timeline with no length', () => {
    vi.stubGlobal('VideoEncoder', undefined);
    mount(0);
    expect(document.body.textContent).toMatch(/no length/);
    expect((Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Export') as HTMLButtonElement).disabled).toBe(true);
  });
});
