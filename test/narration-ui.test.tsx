import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel } from '../src/panels/Timeline';
import { CaptionsSection, VideoCaptions, patchCaptions } from '../src/panels/CaptionsSection';
import { addAudioTrack, addCue, ensureCaptionTrack } from '../src/lib/captions-edit';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//a browser in jsdom's place would read the length from the file
vi.mock('../src/lib/waveform', async (orig) => ({ ...(await orig<typeof import('../src/lib/waveform')>()), audioDuration: async () => 6000 }));

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
});

function mount(ui: () => React.ReactElement, build: (p: Project) => void = () => undefined): void {
  const p = createProject('Talk');
  p.assets.push({ id: 'as1', name: 'voice.mp3', mime: 'audio/mpeg', size: 10 });
  p.artboards[0].timelines.push({ id: 'tl', name: 'Talk', duration: 10000, loop: 'once', autoplay: false, speed: 1, tracks: [] });
  build(p);
  s = new EditorStore(p);
  s.set({ activeTimelineId: 'tl', bottomTab: 'timeline' });
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui()));
}
const tl = () => s.get().project.artboards[0].timelines[0];
const pick = (label: string, value: string) => {
  // a timeline with no sound or captions starts with that group folded: open it, like a person would
  const fold = host!.querySelector<HTMLElement>('.media-fold[aria-expanded="false"]');
  if (fold) act(() => fold.click());
  const sel = host!.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = (el: Element | undefined | null) => act(() => (el as HTMLElement).click());
/** The timeline's clips, cues and lanes react to the pointer going down, not to a click. */
const down = (el: Element | undefined | null) => act(() => void el!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
const playhead = (ms: number) => act(() => s.set({ playhead: ms }));

describe('the timeline\'s sound and caption rows', () => {
  it('shows a Sound and a Captions row, with a clip for each sound and a lane for each caption track', () => {
    mount(
      () => <TimelinePanel />,
      (p) => {
        const t = p.artboards[0].timelines[0];
        addAudioTrack(t, { id: 'as1', name: 'voice.mp3' }, 6000, 500);
        addCue(ensureCaptionTrack(t), 1000, 2000, 'Hello there');
      },
    );
    const text = host!.textContent!;
    expect(text).toContain('Sound');
    expect(text).toContain('Captions');
    expect(host!.querySelectorAll('.audio-clip')).toHaveLength(1);
    expect(host!.querySelector('.audio-clip')!.textContent).toContain('file missing');
    expect(host!.querySelectorAll('.cue')).toHaveLength(1);
    expect(host!.querySelector('.cue-text')!.textContent).toBe('Hello there');
  });

  it('adds a caption at the playhead from the Captions menu and selects it for editing', () => {
    mount(() => <TimelinePanel />);
    playhead(4000);
    pick('Captions actions', 'cue');
    expect(tl().captions).toHaveLength(1);
    expect(tl().captions![0].cues).toMatchObject([{ start: 4000, end: 6500 }]);
    expect(host!.querySelector('.cue.selected')).toBeTruthy();
    expect(host!.querySelector('.media-editor textarea')).toBeTruthy();
  });

  it('edits a caption\'s words and speaker from the panel', () => {
    mount(() => <TimelinePanel />);
    pick('Captions actions', 'cue');
    const area = host!.querySelector<HTMLTextAreaElement>('.media-editor textarea')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      set.call(area, 'Light bends in glass');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.dispatchEvent(new Event('focusout', { bubbles: true }));
    });
    expect(tl().captions![0].cues[0].text).toBe('Light bends in glass');
  });

  it('splits and merges captions at the playhead', () => {
    mount(
      () => <TimelinePanel />,
      (p) => void addCue(ensureCaptionTrack(p.artboards[0].timelines[0]), 0, 4000, 'one two three four five six seven eight'),
    );
    down(host!.querySelector('.cue'));
    playhead(2000);
    click(button('Split at playhead'));
    expect(tl().captions![0].cues.map((c) => c.text)).toEqual(['one two three four', 'five six seven eight']);
    down(host!.querySelector('.cue'));
    click(button('Merge with next'));
    expect(tl().captions![0].cues).toHaveLength(1);
  });

  it('pastes a transcript into timed captions across the narration', () => {
    mount(
      () => <TimelinePanel />,
      (p) => void addAudioTrack(p.artboards[0].timelines[0], { id: 'as1', name: 'voice.mp3' }, 8000, 1000),
    );
    pick('Captions actions', 'paste');
    const area = document.querySelector<HTMLTextAreaElement>('textarea.transcript-text')!;
    expect(area).toBeTruthy();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'Welcome to the course. Today we look at light. Questions?');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(button('Make captions'));
    const cues = tl().captions![0].cues;
    expect(cues.map((c) => c.text)).toEqual(['Welcome to the course.', 'Today we look at light.', 'Questions?']);
    expect(cues[0].start).toBe(1000);
    expect(cues[2].end).toBe(9000);
    expect(document.querySelector('textarea.transcript-text')).toBeNull();
  });

  it('explains when a transcript cannot be timed to markers that are not there', () => {
    mount(() => <TimelinePanel />);
    pick('Captions actions', 'paste');
    const area = document.querySelector<HTMLTextAreaElement>('textarea.transcript-text')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'One. Two.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const timing = Array.from(document.querySelectorAll<HTMLSelectElement>('.transcript-dialog select'))[0];
    act(() => {
      timing.value = 'markers';
      timing.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click(button('Make captions'));
    expect(document.querySelector('.transcript-dialog [role="alert"]')!.textContent).toMatch(/no markers/);
    expect(tl().captions?.[0].cues ?? []).toEqual([]);
  });

  it('shows a sound\'s settings when its row is picked, and changes them', () => {
    mount(
      () => <TimelinePanel />,
      (p) => void addAudioTrack(p.artboards[0].timelines[0], { id: 'as1', name: 'voice.mp3' }, 6000, 0),
    );
    click(host!.querySelector('.audio-label'));
    const editor = host!.querySelector('.media-editor')!;
    expect(editor.textContent).toContain('Sound: voice');
    const role = Array.from(editor.querySelectorAll<HTMLSelectElement>('select')).find((x) => Array.from(x.options).some((o) => o.value === 'music'))!;
    act(() => {
      role.value = 'music';
      role.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(tl().audio![0].role).toBe('music');
    click(button('Fade out'));
    expect(tl().audio![0].volumeKeys).toHaveLength(2);
    expect(tl().audio![0].volumeKeys![1]).toMatchObject({ t: 6000, value: 0 });
  });

  it('mutes and removes a sound from its row', () => {
    mount(
      () => <TimelinePanel />,
      (p) => void addAudioTrack(p.artboards[0].timelines[0], { id: 'as1', name: 'voice.mp3' }, 6000, 0),
    );
    click(host!.querySelector('button[aria-label="Mute voice"]'));
    expect(tl().audio![0].muted).toBe(true);
    click(host!.querySelector('button[aria-label="Remove voice"]'));
    expect(tl().audio).toBeUndefined();
  });

  it('puts a project sound on the timeline from the Sound menu, at the playhead', async () => {
    mount(() => <TimelinePanel />);
    playhead(2500);
    click(host!.querySelector('.media-fold'));
    expect(Array.from(host!.querySelectorAll<HTMLOptionElement>('select[aria-label="Add a sound to the timeline"] option')).map((o) => o.textContent)).toEqual(['+ Add sound…', 'voice.mp3', 'Upload audio…']);
    pick('Add a sound to the timeline', 'as1');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(tl().audio).toMatchObject([{ assetId: 'as1', offset: 2500, duration: 6000 }]);
    expect(host!.querySelectorAll('.audio-clip')).toHaveLength(1);
    expect(host!.querySelector('.audio-clip.selected')).toBeTruthy();
  });

  it('undoes a caption change in one step', () => {
    mount(() => <TimelinePanel />);
    pick('Captions actions', 'cue');
    expect(tl().captions![0].cues).toHaveLength(1);
    act(() => s.undo());
    expect(tl().captions?.[0]?.cues ?? []).toHaveLength(0);
  });
});

describe('project caption settings', () => {
  const Harness = () => <CaptionsSection project={s.get().project} />;
  it('keeps the document small: a setting back at its default is dropped', () => {
    const p = createProject('x');
    expect(patchCaptions(p, { position: 'bottom' })).toBeUndefined();
    p.settings.captions = { position: 'top', fontSize: 30 };
    expect(patchCaptions(p, { position: 'bottom' })).toEqual({ fontSize: 30 });
    expect(patchCaptions(p, { color: '#ff0', fontSize: 22 })).toEqual({ position: 'top', color: '#ff0' });
    expect(patchCaptions(p, { defaultOn: false })).toEqual({ position: 'top', fontSize: 30, defaultOn: false });
  });

  it('switches to a text layer of your own and adds the layer bound to a new variable', () => {
    mount(() => <Harness />);
    act(() => s.update((d) => void (d.settings.captions = { display: 'layer' })));
    act(() => root!.render(<Harness />));
    click(host!.querySelector('.section-title'));
    click(button('Add a caption layer'));
    const p = s.get().project;
    const v = p.variables.find((x) => x.id === p.settings.captions?.textVar)!;
    expect(v.type).toBe('string');
    const layer = p.artboards[0].children.find((n) => n.name === 'Caption')!;
    expect(layer.type === 'text' && layer.text).toBe(`{${v.name}}`);
  });
});

describe('captions for a video layer', () => {
  it('shows how many it has and clears them', () => {
    const node = createNode('video', { src: 'x.mp4', captions: [{ id: 'c', start: 0, end: 1000, text: 'Hi' }] });
    let patch: Record<string, unknown> | null = null;
    mount(() => <VideoCaptions node={node as never} set={(p) => (patch = p)} />);
    expect(host!.textContent).toContain('1 caption');
    click(button('Clear'));
    expect(patch).toEqual({ captions: undefined });
  });
});

describe('the help topic', () => {
  it('is there, in the Motion group, and says what the controls are called', () => {
    const t = TOPICS.find((x) => x.id === 'captions')!;
    expect(t.group).toBe('Motion');
    const body = topicBody(t);
    for (const word of ['Paste a transcript', 'Across the narration', 'volume keys', 'Sound is waiting', 'Read aloud (draft voice)', 'Worked example']) expect(body).toContain(word);
  });
});
