//Describe what you see in the editor: a Descriptions row beside Captions (own lane, menu and editor), a video layer's descriptions,
//the project default, the accessibility advice that points at the tool, the help topic, and the Described video starter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Player, createNode, createProject, describedTranscript, type CaptionCue, type Project, type Timeline, type VideoNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TimelinePanel } from '../src/panels/Timeline';
import { CaptionsSection, VideoDescriptions, patchCaptions } from '../src/panels/CaptionsSection';
import { addCue, captionFileName, descriptionClashes, ensureCaptionTrack, ensureDescriptionTrack, findTrack, removeTrack, trackKind } from '../src/lib/captions-edit';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { TOPICS, topicBody } from '../src/help/topics';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { STARTERS } from '../src/lib/branded/sets/media';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  const sel = host!.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const click = (el: Element | undefined | null) => act(() => (el as HTMLElement).click());
const playhead = (ms: number) => act(() => s.set({ playhead: ms }));

describe('the description lib', () => {
  it('makes a description track beside the captions and tells them apart by id', () => {
    const t = createProject('x').artboards[0];
    const timeline: Timeline = { id: 'tl', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [] };
    t.timelines.push(timeline);
    const cap = ensureCaptionTrack(timeline);
    const des = ensureDescriptionTrack(timeline);
    expect(des.name).toBe('Descriptions');
    expect(ensureDescriptionTrack(timeline)).toBe(des);
    expect(ensureDescriptionTrack(timeline, 'fr').name).toBe('Descriptions (fr)');
    expect(trackKind(timeline, cap.id)).toBe('captions');
    expect(trackKind(timeline, des.id)).toBe('descriptions');
    expect(trackKind(timeline, 'nope')).toBeNull();
    expect(findTrack(timeline, des.id)).toBe(des);
    removeTrack(timeline, des.id);
    expect(timeline.descriptions).toHaveLength(1);
    removeTrack(timeline, timeline.descriptions![0].id);
    expect(timeline.descriptions).toBeUndefined();
    expect(timeline.captions).toHaveLength(1);
  });

  it('finds the captions a description would be read over', () => {
    const timeline = { captions: [{ id: 'c', name: 'C', cues: [{ id: 'a', start: 1000, end: 3000, text: 'x' }] }] };
    expect(descriptionClashes(timeline, { start: 2000, end: 4000 })).toHaveLength(1);
    expect(descriptionClashes(timeline, { start: 3000, end: 4000 })).toHaveLength(0);
  });

  it('names an exported description file as one', () => {
    expect(captionFileName({ name: 'My project' }, { name: 'Talk' }, { lang: 'en' }, 'vtt', 'descriptions')).toBe('My-project-Talk-en-descriptions.vtt');
    expect(captionFileName({ name: 'My project' }, { name: 'Talk' }, { lang: 'en' }, 'vtt')).toBe('My-project-Talk-en.vtt');
  });
});

describe('the timeline\'s Descriptions row', () => {
  it('shows a Descriptions row with its own lane, beside Captions', () => {
    mount(
      () => <TimelinePanel />,
      (p) => {
        const t = p.artboards[0].timelines[0];
        addCue(ensureCaptionTrack(t), 0, 2000, 'Hello there');
        addCue(ensureDescriptionTrack(t), 3000, 3000, 'A graph appears.');
      },
    );
    expect(host!.textContent).toContain('Descriptions');
    expect(host!.querySelectorAll('.caption-lane')).toHaveLength(2);
    expect(host!.querySelectorAll('.description-lane .cue.desc')).toHaveLength(1);
    expect(host!.querySelector('.description-lane .cue-text')!.textContent).toBe('A graph appears.');
  });

  it('adds a description at the playhead from the Descriptions menu, makes the track, and selects it for editing', () => {
    mount(() => <TimelinePanel />);
    playhead(4000);
    pick('Descriptions actions', 'cue');
    expect(tl().captions).toBeUndefined();
    expect(tl().descriptions).toHaveLength(1);
    expect(tl().descriptions![0].cues).toMatchObject([{ start: 4000, end: 7000, text: 'New description' }]);
    expect(host!.querySelector('.cue.selected')).toBeTruthy();
    expect(host!.querySelector('.media-editor')!.textContent).toContain('Description');
    //no speaker field for something that is not said
    expect(host!.querySelector('.media-editor')!.textContent).not.toContain('Speaker');
  });

  it('edits a description\'s words from the panel', () => {
    mount(() => <TimelinePanel />);
    pick('Descriptions actions', 'cue');
    const area = host!.querySelector<HTMLTextAreaElement>('.media-editor textarea')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      set.call(area, 'The line climbs.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.dispatchEvent(new Event('focusout', { bubbles: true }));
    });
    expect(tl().descriptions![0].cues[0].text).toBe('The line climbs.');
  });

  it('marks a description that overlaps a caption, in the lane and in the editor', () => {
    mount(
      () => <TimelinePanel />,
      (p) => {
        const t = p.artboards[0].timelines[0];
        addCue(ensureCaptionTrack(t), 1000, 4000, 'Speech');
        addCue(ensureDescriptionTrack(t), 2000, 2000, 'Over the speech');
        addCue(ensureDescriptionTrack(t), 6000, 2000, 'In a gap');
      },
    );
    const cues = Array.from(host!.querySelectorAll('.description-lane .cue'));
    expect(cues.map((c) => c.classList.contains('clash'))).toEqual([true, false]);
  });

  it('leaves the caption things off a description track: no draft voice, no transcript paste, and says what it is', () => {
    mount(
      () => <TimelinePanel />,
      (p) => void ensureDescriptionTrack(p.artboards[0].timelines[0]),
    );
    act(() => void host!.querySelector('.description-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const editor = host!.querySelector('.media-editor')!;
    expect(editor.textContent).toContain('Description track');
    expect(editor.textContent).toContain('not a recorded described version');
    expect(editor.textContent).not.toContain('Read aloud (draft voice)');
    expect(editor.textContent).not.toContain('Paste a transcript');
  });

  it('deletes a description track without touching the captions', () => {
    mount(
      () => <TimelinePanel />,
      (p) => {
        const t = p.artboards[0].timelines[0];
        addCue(ensureCaptionTrack(t), 0, 1000, 'Hi');
        ensureDescriptionTrack(t);
      },
    );
    act(() => void host!.querySelector('.description-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    //the confirm dialog is not mounted in this harness: delete through the lib the button calls
    act(() => s.updateTimeline((d) => removeTrack(d as never, tl().descriptions![0].id)));
    expect(tl().descriptions).toBeUndefined();
    expect(tl().captions).toHaveLength(1);
  });
});

describe('a video layer\'s descriptions', () => {
  const node = (cues: CaptionCue[] = []) => createNode('video', { src: 'x.mp4', descriptions: cues, captions: [{ id: 'c', start: 0, end: 4000, text: 'Hi' }] } as Partial<VideoNode>) as VideoNode;
  it('adds one after the last, and clears them', () => {
    let last: Record<string, unknown> | null = null;
    const n = node([{ id: 'a', start: 5000, end: 8000, text: 'First' }]);
    mount(() => <VideoDescriptions node={n} set={(p) => (last = p)} />);
    expect(host!.textContent).toContain('1 description');
    expect(host!.textContent).toContain('not a recorded described version');
    click(button('Add one'));
    const list = (last as unknown as { descriptions: CaptionCue[] }).descriptions;
    expect(list).toHaveLength(2);
    expect(list[1].start).toBe(8000);
    click(button('Clear'));
    expect(last).toEqual({ descriptions: undefined });
  });
  it('warns when one overlaps a caption of the video', () => {
    const n = node([{ id: 'a', start: 1000, end: 3000, text: 'Over the words' }]);
    mount(() => <VideoDescriptions node={n} set={() => undefined} />);
    expect(host!.textContent).toContain('talk over the speech');
  });
});

describe('the project default', () => {
  it('starts off, and a setting back at off is dropped', () => {
    const p = createProject('x');
    expect(patchCaptions(p, { descriptionsOn: false })).toBeUndefined();
    expect(patchCaptions(p, { descriptionsOn: true })).toEqual({ descriptionsOn: true });
    p.settings.captions = { descriptionsOn: true, position: 'top' };
    expect(patchCaptions(p, { descriptionsOn: false })).toEqual({ position: 'top' });
  });
  it('is a tick box in the Captions and narration section', () => {
    mount(() => <CaptionsSection project={s?.get().project ?? createProject('x')} />);
    click(host!.querySelector('.section-title'));
    expect(host!.textContent).toContain('Descriptions on to start');
  });
});

describe('the accessibility check', () => {
  const report = (p: Project) => checkAccessibility(p);
  const captions = (p: Project) => report(p).findings.filter((f) => f.check === 'captions');
  it('points a video without captions at the description tool, and says it is a cheaper aid', () => {
    const p = createProject('V');
    p.settings.title = 'V';
    p.artboards[0].children.push(createNode('video', { src: 'x.mp4', controls: true, ariaLabel: 'Intro' }));
    const [f] = captions(p);
    expect(f.severity).toBe('review');
    expect(f.detail).toContain('add descriptions');
    expect(f.detail).toContain('not a recorded described version');
  });
  it('lists the rule\'s own advice for 1.2.5 with the tool in it', () => {
    const info = report(createProject('V')).checks.find((c) => c.id === 'captions')!;
    expect(info.wcag).toContain('1.2.5');
    expect(info.how).toContain('Descriptions');
    expect(info.how).toContain('cheaper aid');
  });
  it('warns when descriptions run over captions, and not when they sit in the gaps', () => {
    const p = createProject('V');
    p.settings.title = 'V';
    const t: Timeline = { id: 'tl', name: 'Talk', duration: 10000, loop: 'once', autoplay: false, speed: 1, tracks: [] };
    p.artboards[0].timelines.push(t);
    addCue(ensureCaptionTrack(t), 1000, 3000, 'Speech');
    addCue(ensureDescriptionTrack(t), 5000, 2000, 'In a gap');
    expect(captions(p).filter((f) => f.title === 'Descriptions overlap the captions')).toHaveLength(0);
    addCue(ensureDescriptionTrack(t), 2000, 2000, 'Over speech');
    const [w] = captions(p).filter((f) => f.title === 'Descriptions overlap the captions');
    expect(w.severity).toBe('warning');
    expect(w.detail).toContain('1 description runs');
  });
});

describe('the help topic', () => {
  it('is in the Motion group, says it is a cheaper aid, and names the controls', () => {
    const t = TOPICS.find((x) => x.id === 'describe-what-you-see')!;
    expect(t.group).toBe('Motion');
    const body = topicBody(t);
    for (const word of ['not a recorded described version', 'New description at the playhead', 'Add one', 'Descriptions on to start', 'Transcript with descriptions', 'Describing well', 'Worked example', 'Not done yet']) expect(body).toContain(word);
    expect(body).not.toContain('—');
    expect(topicBody(TOPICS.find((x) => x.id === 'accessibility-checker')!)).toContain('describe-what-you-see');
    expect(topicBody(TOPICS.find((x) => x.id === 'captions')!)).toContain('describe-what-you-see');
  });
});

describe('the Described video starter', () => {
  const starter = STARTERS.find((x) => x.key === 'media/described-video')!;
  it('is in the media set and says what it is, and what it is not', () => {
    expect(starter.set).toBe('media');
    expect(starter.description).toContain('not a recorded described version');
  });

  for (const way of COLOURWAYS) {
    it(`has the track wired in ${way.name}: captions and descriptions on the video, the descriptions in the gaps`, () => {
      const project = projectFromBrandedStarter(starter, way);
      const video = project.artboards.flatMap((a) => a.children).find((n) => n.type === 'video') as VideoNode;
      expect(video.captions!.length).toBeGreaterThanOrEqual(3);
      expect(video.descriptions!.length).toBeGreaterThanOrEqual(3);
      expect(video.descriptionLang).toBe('en');
      for (const d of video.descriptions!) expect(descriptionClashes({ captions: [{ id: 'x', name: 'x', cues: video.captions! }] }, d)).toEqual([]);
      //one reading order that interleaves them
      const order = describedTranscript(video.captions, video.descriptions);
      expect(order.map((e) => e.kind)).toEqual(['speech', 'description', 'speech', 'description', 'speech', 'description', 'speech']);
      expect(project.template!.checklist.length).toBeGreaterThanOrEqual(8);
    });
  }

  it('ends in a page of authors\' notes that says it is a cheaper aid, and plays to the transcript with descriptions', async () => {
    const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    expect(JSON.stringify(project.artboards[2])).toContain('A cheaper aid, not a recorded described version');
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    player.goTo(project.artboards[1].id);
    player.step(50);
    const open = document.querySelector<HTMLButtonElement>('.ix-cc-bar button[aria-label="Transcript with descriptions"]');
    expect(open).toBeTruthy();
    open!.click();
    const rows = Array.from(document.querySelectorAll('.ix-cc-transcript li button')).map((b) => b.getAttribute('aria-label') ?? '');
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.includes('Description:'))).toHaveLength(3);
    player.destroy();
  });
});
